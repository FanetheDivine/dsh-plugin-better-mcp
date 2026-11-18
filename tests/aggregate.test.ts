// 聚合端点：组选择与 JSON-RPC 处理器。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { type AggregateOptions, createGroupHandler, toolInGroup } from '../src/aggregate.ts';
import type { ToolGroup } from '../src/config.ts';
import { MAX_BATCH } from '../src/constants.ts';
import type { ToolSchemaView } from '../src/types.ts';

const TOKEN = 'secret-token';
const ENDPOINT = '/better-mcp/mcp/harness';

/** 一次回包的观测结果。 */
interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** 记录 statusCode、响应头与 body 的假响应。 */
function makeRes(): { res: ServerResponse; read: () => RecordedResponse } {
  const chunks: string[] = [];
  let status = 0;
  const headers: Record<string, string> = {};
  const res = {
    writeHead(nextStatus: number, nextHeaders?: Record<string, unknown>) {
      status = nextStatus;
      for (const [key, value] of Object.entries(nextHeaders ?? {})) {
        headers[key] = String(value);
      }
      return res;
    },
    end(chunk?: string) {
      if (chunk !== undefined) chunks.push(chunk);
    },
  } as unknown as ServerResponse;
  return { res, read: () => ({ status, headers: { ...headers }, body: chunks.join('') }) };
}

/** 把请求体放进可异步迭代的流，并附上 method、url 与 headers。 */
function makeReq(
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): IncomingMessage {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const stream = Readable.from([Buffer.from(text, 'utf8')]);
  return Object.assign(stream, { method, url, headers }) as unknown as IncomingMessage;
}

type Handler = ReturnType<typeof createGroupHandler>;

/** 执行一次请求并读回响应。 */
async function send(handler: Handler, req: IncomingMessage): Promise<RecordedResponse> {
  const { res, read } = makeRes();
  await handler(req, res);
  return read();
}

/** 以默认 Bearer 发起一次 POST。 */
async function post(
  handler: Handler,
  body: unknown,
  init: { url?: string; headers?: Record<string, string> } = {},
): Promise<RecordedResponse> {
  const headers = init.headers ?? { authorization: `Bearer ${TOKEN}` };
  return send(handler, makeReq('POST', init.url ?? ENDPOINT, body, headers));
}

const WORKSPACE_PARAMETERS = {
  type: 'object',
  properties: { path: { type: 'string' } },
};

/** 端点可见的全部工具。 */
function makeTools(): ToolSchemaView[] {
  return [
    { name: 'workspace_read', description: '读文件', parameters: WORKSPACE_PARAMETERS },
    { name: 'session_list', description: '列会话', parameters: { type: 'object', properties: {} } },
    { name: 'other_tool', description: '组外工具', parameters: { type: 'object' } },
    { name: 'mcp__figma__get_file', description: '外部 MCP 工具', parameters: { type: 'object' } },
  ];
}

/** 组定义与调用结果的默认值。 */
interface FixtureOptions {
  group?: string;
  groupDefinition?: () => Pick<ToolGroup, 'include' | 'exclude'>;
  token?: () => Promise<string | undefined>;
  tools?: ReadonlyArray<ToolSchemaView>;
  call?: AggregateOptions['call'];
}

/** 构造一组处理器依赖：默认组为 workspace_*、session_*。 */
function makeFixture(options: FixtureOptions = {}) {
  const tools = options.tools ?? makeTools();
  const groupDefinition =
    options.groupDefinition ?? (() => ({ include: ['workspace_*', 'session_*'], exclude: [] }));
  const call =
    options.call ??
    vi.fn(async (_name: string, _args: Record<string, unknown>, _signal: AbortSignal) => ({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    }));
  const logger = { info: vi.fn(), warn: vi.fn() };
  const handler = createGroupHandler({
    group: options.group ?? 'harness',
    groupDefinition,
    token: options.token ?? (async () => TOKEN),
    tools: () => tools,
    call,
    logger,
  });
  return { handler, tools, call, logger };
}

/** 解析回包 JSON。 */
function payloadOf(response: RecordedResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

describe('toolInGroup', () => {
  it('空 include 排除 mcp__ 前缀，其他工具保留', () => {
    const group: Pick<ToolGroup, 'include' | 'exclude'> = { include: [], exclude: [] };
    expect(toolInGroup('workspace_read', group)).toBe(true);
    expect(toolInGroup('other_tool', group)).toBe(true);
    expect(toolInGroup('mcp__figma__get_file', group)).toBe(false);
  });

  it('include 按通配符匹配组内工具', () => {
    const group: Pick<ToolGroup, 'include' | 'exclude'> = {
      include: ['workspace_*', 'session_*'],
      exclude: [],
    };
    expect(toolInGroup('workspace_read', group)).toBe(true);
    expect(toolInGroup('session_list', group)).toBe(true);
    expect(toolInGroup('workspace', group)).toBe(false);
    expect(toolInGroup('other_tool', group)).toBe(false);
  });

  it('exclude 命中优先于 include', () => {
    const group: Pick<ToolGroup, 'include' | 'exclude'> = {
      include: ['workspace_*'],
      exclude: ['workspace_delete*'],
    };
    expect(toolInGroup('workspace_read', group)).toBe(true);
    expect(toolInGroup('workspace_delete', group)).toBe(false);
    expect(toolInGroup('workspace_delete_file', group)).toBe(false);
  });

  it('非数组 include/exclude 按空处理', () => {
    const loose = {
      include: 'workspace_*',
      exclude: 'workspace_read',
    } as unknown as Pick<ToolGroup, 'include' | 'exclude'>;
    expect(toolInGroup('workspace_read', loose)).toBe(true);
    expect(toolInGroup('other_tool', loose)).toBe(true);
    expect(toolInGroup('mcp__figma__get_file', loose)).toBe(false);
  });
});

describe('HTTP 鉴权', () => {
  it('缺少或错误的 Bearer 返回 401、www-authenticate 与 -32001', async () => {
    const { handler } = makeFixture();
    const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };

    const missing = await post(handler, ping, { headers: {} });
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer realm="dsh-better-mcp"');
    expect(payloadOf(missing)).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001 },
    });

    const wrong = await post(handler, ping, { headers: { authorization: 'Bearer wrong' } });
    expect(wrong.status).toBe(401);
    expect(payloadOf(wrong)).toMatchObject({ error: { code: -32001 } });
  });

  it('接受 ?token= 查询参数', async () => {
    const { handler } = makeFixture();
    const reply = await post(
      handler,
      { jsonrpc: '2.0', id: 2, method: 'ping' },
      { url: `${ENDPOINT}?token=${TOKEN}`, headers: {} },
    );
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(payloadOf(reply)).toMatchObject({ id: 2, result: {} });
  });

  it('未配置令牌返回 500 与 -32603', async () => {
    for (const token of [async () => undefined, async () => '']) {
      const { handler } = makeFixture({ token });
      const reply = await post(handler, { jsonrpc: '2.0', id: 3, method: 'ping' });
      expect(reply.status).toBe(500);
      expect(payloadOf(reply)).toMatchObject({ error: { code: -32603 } });
    }
  });

  it('OPTIONS 返回 204 与 CORS 头', async () => {
    const { handler } = makeFixture();
    const reply = await send(handler, makeReq('OPTIONS', ENDPOINT, ''));
    expect(reply.status).toBe(204);
    expect(reply.body).toBe('');
    expect(reply.headers['access-control-allow-origin']).toBe('*');
    expect(reply.headers['access-control-allow-methods']).toBe('POST, GET, OPTIONS');
    expect(reply.headers['access-control-allow-headers']).toBe(
      'content-type, authorization, mcp-protocol-version, mcp-session-id',
    );
  });

  it('GET 返回 405 与 -32000', async () => {
    const { handler } = makeFixture();
    const reply = await send(handler, makeReq('GET', ENDPOINT, ''));
    expect(reply.status).toBe(405);
    expect(payloadOf(reply)).toMatchObject({ id: null, error: { code: -32000 } });
  });
});

describe('initialize', () => {
  it('回显客户端协议版本', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    expect(reply.status).toBe(200);
    const result = payloadOf(reply).result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2024-11-05');
  });

  it('缺省协议版本回退到 2025-06-18', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} });
    const result = payloadOf(reply).result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2025-06-18');
  });

  it('声明 tools.listChanged 与 dsh-<group> 服务器名', async () => {
    const { handler } = makeFixture({ group: 'figma' });
    const reply = await post(handler, { jsonrpc: '2.0', id: 3, method: 'initialize' });
    const result = payloadOf(reply).result as Record<string, unknown>;
    expect(result.capabilities).toEqual({ tools: { listChanged: true } });
    expect(result.serverInfo).toMatchObject({
      name: 'dsh-figma',
      title: 'DSH figma tools',
      version: '0.1.0',
    });
  });
});

describe('通知与 ping', () => {
  it('只有通知时返回 202 空响应', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(reply.status).toBe(202);
    expect(reply.body).toBe('');
  });

  it('多条通知批量也只有 202 空响应', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, [
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled' },
      { jsonrpc: '2.0', method: 'ping' },
    ]);
    expect(reply.status).toBe(202);
    expect(reply.body).toBe('');
  });

  it('ping 通知不回包，ping 请求回空结果', async () => {
    const { handler } = makeFixture();
    const notification = await post(handler, { jsonrpc: '2.0', method: 'ping' });
    expect(notification.status).toBe(202);

    const request = await post(handler, { jsonrpc: '2.0', id: 7, method: 'ping' });
    expect(request.status).toBe(200);
    expect(payloadOf(request)).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });
});

describe('tools/list', () => {
  it('只返回组内工具，并把 parameters 映射为 inputSchema', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(reply.status).toBe(200);
    const result = payloadOf(reply).result as { tools: Array<Record<string, unknown>> };
    expect(result.tools.map((tool) => tool.name)).toEqual(['workspace_read', 'session_list']);
    expect(result.tools[0]).toEqual({
      name: 'workspace_read',
      description: '读文件',
      inputSchema: WORKSPACE_PARAMETERS,
    });
    expect(result.tools[0]).not.toHaveProperty('parameters');
  });

  it('空 include 时暴露全部非 mcp__ 工具', async () => {
    const { handler } = makeFixture({ groupDefinition: () => ({ include: [], exclude: [] }) });
    const reply = await post(handler, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const result = payloadOf(reply).result as { tools: Array<Record<string, unknown>> };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'workspace_read',
      'session_list',
      'other_tool',
    ]);
  });
});

describe('tools/call', () => {
  it('映射文本块与非文本块，并把参数与信号传给 call', async () => {
    const call = vi.fn(
      async (_name: string, _args: Record<string, unknown>, _signal: AbortSignal) => ({
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', data: 'base64' },
          { text: 'no type' },
        ],
        isError: false,
      }),
    );
    const { handler } = makeFixture({ call });
    const reply = await post(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'workspace_read', arguments: { path: '/tmp/a' } },
    });
    expect(reply.status).toBe(200);
    expect(payloadOf(reply).result).toEqual({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'text', text: '[image content omitted]' },
        { type: 'text', text: '[unknown content omitted]' },
      ],
      isError: false,
    });
    expect(call).toHaveBeenCalledTimes(1);
    const [name, args, signal] = call.mock.calls[0] as [
      string,
      Record<string, unknown>,
      AbortSignal,
    ];
    expect(name).toBe('workspace_read');
    expect(args).toEqual({ path: '/tmp/a' });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('空内容返回 (no output)，isError 透传', async () => {
    const call = vi.fn(async () => ({ content: [], isError: true }));
    const { handler } = makeFixture({ call });
    const reply = await post(handler, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'session_list' },
    });
    expect(payloadOf(reply).result).toEqual({
      content: [{ type: 'text', text: '(no output)' }],
      isError: true,
    });
  });

  it('未知或组外工具返回 -32602 且不执行', async () => {
    const fixture = makeFixture();
    for (const name of ['missing_tool', 'other_tool']) {
      const reply = await post(fixture.handler, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name, arguments: {} },
      });
      expect(reply.status).toBe(200);
      expect(payloadOf(reply)).toMatchObject({
        id: 3,
        error: { code: -32602, message: `Tool '${name}' is not part of group 'harness'.` },
      });
    }
    expect(fixture.call).not.toHaveBeenCalled();
  });

  it('执行抛错时返回 isError 与 Error 前缀，并记录日志', async () => {
    const call = vi.fn(async () => {
      throw new Error('boom');
    });
    const { handler, logger } = makeFixture({ call });
    const reply = await post(handler, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'workspace_read', arguments: {} },
    });
    expect(payloadOf(reply).result).toEqual({
      content: [{ type: 'text', text: 'Error: boom' }],
      isError: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "better-mcp: aggregate tool 'workspace_read' failed: boom",
    );
  });
});

describe('JSON-RPC 错误与批量', () => {
  it('解析失败返回 400 与 -32700', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, '{');
    expect(reply.status).toBe(400);
    expect(payloadOf(reply)).toMatchObject({ id: null, error: { code: -32700 } });
  });

  it('无效请求对象返回 -32600', async () => {
    const { handler } = makeFixture();
    for (const message of [42, { id: 5 }, { jsonrpc: '1.0', id: 6, method: 'ping' }]) {
      const reply = await post(handler, message);
      expect(reply.status).toBe(200);
      expect(payloadOf(reply)).toMatchObject({ error: { code: -32600 } });
    }
  });

  it('未知方法返回 -32601', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, { jsonrpc: '2.0', id: 9, method: 'tools/unknown' });
    expect(payloadOf(reply)).toMatchObject({
      id: 9,
      error: { code: -32601, message: 'Method not found: tools/unknown' },
    });
  });

  it('批量最多处理 20 条，回包顺序与请求一致', async () => {
    const call = vi.fn(async () => ({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    }));
    const { handler } = makeFixture({ call });
    const requests = Array.from({ length: MAX_BATCH + 1 }, (_, index) => ({
      jsonrpc: '2.0',
      id: index + 1,
      method: 'tools/call',
      params: { name: 'workspace_read', arguments: { index } },
    }));
    const reply = await post(handler, requests);
    expect(reply.status).toBe(200);
    const replies = payloadOf(reply) as unknown as Array<{ id: number }>;
    expect(replies).toHaveLength(MAX_BATCH);
    expect(replies.map((item) => item.id)).toEqual(
      Array.from({ length: MAX_BATCH }, (_, index) => index + 1),
    );
    expect(call).toHaveBeenCalledTimes(MAX_BATCH);
  });

  it('批量混入通知时只为请求回包', async () => {
    const { handler } = makeFixture();
    const reply = await post(handler, [
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled' },
      { jsonrpc: '2.0', id: 'b', method: 'ping' },
    ]);
    expect(reply.status).toBe(200);
    const replies = payloadOf(reply) as unknown as Array<{ id: string }>;
    expect(replies).toHaveLength(2);
    expect(replies.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
