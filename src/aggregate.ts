/**
 * 无状态 MCP Streamable HTTP 服务。
 *
 * 把宿主 `ctx.tools` 里已注册的工具按组暴露给外部 MCP 客户端。每个请求自带
 * Bearer 令牌，回包为普通 JSON；不保存会话，工具表每次实时读取。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ToolGroup } from './config.ts';
import { MAX_BATCH } from './constants.ts';
import type { ToolOutcome } from './servers.ts';
import type { PluginLogger, ToolSchemaView } from './types.ts';
import { globToRegExp, isRecord } from './utils.ts';

/** 客户端未提出协议版本时使用的修订号。 */
const FALLBACK_PROTOCOL_VERSION = '2025-06-18';

/** 所有回包共用的响应头。 */
const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers':
    'content-type, authorization, mcp-protocol-version, mcp-session-id',
} as const;

/** 一键 JSON-RPC 错误。 */
function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** 判断工具是否属于组。 */
export function toolInGroup(name: string, group: Pick<ToolGroup, 'include' | 'exclude'>): boolean {
  const include = Array.isArray(group.include) ? group.include : [];
  const exclude = Array.isArray(group.exclude) ? group.exclude : [];
  if (exclude.some((pattern) => typeof pattern === 'string' && globToRegExp(pattern).test(name))) {
    return false;
  }
  if (include.length === 0) return !name.startsWith('mcp__');
  return include.some((pattern) => typeof pattern === 'string' && globToRegExp(pattern).test(name));
}

/** 回一个 JSON 文档。 */
function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { ...BASE_HEADERS, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/** 读取请求体。 */
async function readBody(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 把宿主内容块映射为 MCP 内容项。 */
function mcpContent(content: ReadonlyArray<unknown>): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      items.push({ type: 'text', text: block.text });
    } else {
      const type = isRecord(block) && typeof block.type === 'string' ? block.type : 'unknown';
      items.push({ type: 'text', text: `[${type} content omitted]` });
    }
  }
  if (items.length === 0) items.push({ type: 'text', text: '(no output)' });
  return items;
}

/** 处理器依赖。 */
export interface AggregateOptions {
  /** 组名。 */
  group: string;
  /** 当前组定义。 */
  groupDefinition: () => Pick<ToolGroup, 'include' | 'exclude'>;
  /** 当前访问令牌。 */
  token: () => Promise<string | undefined>;
  /** 当前工具 schema。 */
  tools: () => ReadonlyArray<ToolSchemaView>;
  /** 执行一个工具。 */
  call: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<ToolOutcome>;
  /** 诊断日志。 */
  logger: PluginLogger;
}

/** 构造一个组的 HTTP 处理器。 */
export function createGroupHandler(
  options: AggregateOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { group, groupDefinition, token, tools, call, logger } = options;

  /** 处理一条 JSON-RPC 消息。 */
  async function dispatch(message: unknown): Promise<unknown | undefined> {
    if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return rpcError(isRecord(message) ? message.id : undefined, -32600, 'Invalid Request');
    }
    const id = message.id;
    const isNotification = id === undefined || id === null;
    const params = isRecord(message.params) ? message.params : {};
    try {
      switch (message.method) {
        case 'initialize': {
          if (isNotification) return undefined;
          const requested =
            typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined;
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: requested ?? FALLBACK_PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: `dsh-${group}`, title: `DSH ${group} tools`, version: '0.1.0' },
              instructions:
                'Tools collected from this DeepSeek Harness. Calls run without an agent session; tools that need one report an error.',
            },
          };
        }
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return undefined;
        case 'ping':
          return isNotification ? undefined : { jsonrpc: '2.0', id, result: {} };
        case 'tools/list': {
          if (isNotification) return undefined;
          const visible = tools().filter((schema) => toolInGroup(schema.name, groupDefinition()));
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: visible.map((schema) => ({
                name: schema.name,
                description: schema.description,
                inputSchema: schema.parameters,
              })),
            },
          };
        }
        case 'tools/call': {
          if (isNotification) return undefined;
          const name = typeof params.name === 'string' ? params.name : '';
          const args = isRecord(params.arguments) ? params.arguments : {};
          if (name === '') return rpcError(id, -32602, 'tools/call requires a name');
          const known = tools().some((schema) => schema.name === name);
          if (!known || !toolInGroup(name, groupDefinition())) {
            return rpcError(id, -32602, `Tool '${name}' is not part of group '${group}'.`);
          }
          try {
            const outcome = await call(name, args, AbortSignal.timeout(120_000));
            return {
              jsonrpc: '2.0',
              id,
              result: { content: mcpContent(outcome.content), isError: outcome.isError === true },
            };
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            logger.warn(`better-mcp: aggregate tool '${name}' failed: ${detail}`);
            return {
              jsonrpc: '2.0',
              id,
              result: { content: [{ type: 'text', text: `Error: ${detail}` }], isError: true },
            };
          }
        }
        default:
          return isNotification
            ? undefined
            : rpcError(id, -32601, `Method not found: ${String(message.method)}`);
      }
    } catch (error) {
      return rpcError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }

  return async function handle(req, res): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, BASE_HEADERS);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, rpcError(null, -32000, 'This stateless MCP endpoint accepts POST only.'));
      return;
    }
    const expected = await token();
    if (expected === undefined || expected === '') {
      sendJson(res, 500, rpcError(null, -32603, 'No endpoint token is configured.'));
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ')
      ? header.slice(7)
      : (url.searchParams.get('token') ?? '');
    if (presented !== expected) {
      res.writeHead(401, { ...BASE_HEADERS, 'www-authenticate': 'Bearer realm="dsh-better-mcp"' });
      res.end(JSON.stringify(rpcError(null, -32001, 'Unauthorized')));
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (error) {
      sendJson(
        res,
        400,
        rpcError(
          null,
          -32700,
          `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }
    const messages = Array.isArray(payload) ? payload.slice(0, MAX_BATCH) : [payload];
    const replies: unknown[] = [];
    for (const message of messages) {
      const reply = await dispatch(message);
      if (reply !== undefined) replies.push(reply);
    }
    if (replies.length === 0) {
      res.writeHead(202, BASE_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 200, Array.isArray(payload) ? replies : replies[0]);
  };
}
