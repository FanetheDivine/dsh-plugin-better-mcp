// 面板路由、OAuth 路由与聚合端点接线。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readConfig } from '../src/config.ts';
import { ensureEndpointToken, readClientSecret, readGrant, recordKey } from '../src/credentials.ts';
import { PluginRoutes } from '../src/routes.ts';
import { ServerManager } from '../src/servers.ts';
import { readState, setLazy } from '../src/state.ts';
import { grantId } from '../src/utils.ts';
import { makeCtx, volatile } from './helpers.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'better-mcp-routes-'));
  process.env.DSH_HOME = home;
  vi.unstubAllGlobals();
});

afterEach(async () => {
  delete process.env.DSH_HOME;
  vi.unstubAllGlobals();
  await rm(home, { recursive: true, force: true });
});

interface Harness {
  ctx: ReturnType<typeof makeCtx>;
  routes: PluginRoutes;
  manager: ServerManager;
  current: () => ReturnType<typeof readConfig>;
  refs: { servers: ReturnType<typeof volatile>; expose: ReturnType<typeof volatile> };
}

/** 组装路由。 */
function harness(initialServers: Record<string, unknown> = {}): Harness {
  const refs = {
    servers: volatile(initialServers),
    expose: volatile({
      enabled: true,
      endpoint: '/better-mcp/mcp',
      groups: { harness: { title: 'Harness', include: ['workspace_*'], exclude: [] } },
    }),
  };
  const ctx = makeCtx({ config: refs });
  let current = readConfig(refs);
  ctx.on('loader/volatile-update', () => {
    current = readConfig(refs);
  });
  ctx._configStore = structuredClone(current) as unknown as Record<string, unknown>;
  const logger = { info: vi.fn(), warn: vi.fn() };
  const manager = new ServerManager(ctx, () => current, logger);
  const routes = new PluginRoutes(ctx, () => current, manager, logger);
  routes.registerApi();
  routes.registerWeb();
  return { ctx, routes, manager, current: () => current, refs };
}

/** 取得一条 fetch 路由。 */
function fetchRoute(
  ctx: ReturnType<typeof makeCtx>,
  path: string,
): (request: Request) => Promise<Response> {
  const route = ctx._fetchRoutes.find(
    (candidate) => candidate.path === (path.split('?')[0] ?? path),
  );
  if (route === undefined) throw new Error(`missing route ${path}`);
  return (route.fetch as (request: Request) => Promise<Response>).bind(route);
}

/** 调用一条 fetch 路由。 */
async function call(
  ctx: ReturnType<typeof makeCtx>,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const request = new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const response = await fetchRoute(ctx, path)(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** 假请求。 */
function makeReq(method: string, url: string, body?: string, headers: Record<string, string> = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(body, 'utf8')];
  return Object.assign(
    (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    { method, url, headers },
  ) as never;
}

/** 假响应。 */
function makeRes() {
  const chunks: string[] = [];
  let status = 0;
  const headers: Record<string, string> = {};
  const res = {
    writeHead(value: number, values: Record<string, string> = {}) {
      status = value;
      Object.assign(headers, values);
      return this;
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') chunks.push(chunk);
    },
  };
  return { res: res as never, read: () => ({ status, headers, body: chunks.join('') }) };
}

/** 取 Web 路由。 */
function webRoute(ctx: ReturnType<typeof makeCtx>, path: string): Record<string, unknown> {
  const route = ctx._routes.find((candidate) => candidate.path === path);
  if (route === undefined) throw new Error(`missing web route ${path}`);
  return route;
}

describe('status 与懒加载', () => {
  it('返回令牌、服务器与组地址', async () => {
    const { ctx } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const { status, json } = await call(ctx, '/api/better-mcp/status');
    expect(status).toBe(200);
    const servers = json.servers as Array<Record<string, unknown>>;
    expect(servers[0]).toMatchObject({ name: 'one', managed: true, lazy: true, auth: 'none' });
    const expose = json.expose as Record<string, unknown>;
    expect(typeof expose.token).toBe('string');
    expect((expose.groups as Array<Record<string, unknown>>)[0]?.url).toBe(
      '/better-mcp/mcp/harness',
    );
  });

  it('切换懒加载：打开卸载，关闭挂载', async () => {
    const { ctx, manager } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    await manager.mount('one');
    await call(ctx, '/api/better-mcp/lazy', { server: 'one', lazy: true });
    expect(ctx._managerRegistered.has('one')).toBe(false);
    expect((await readState()).lazy.one).toBe(true);
    await call(ctx, '/api/better-mcp/lazy', { server: 'one', lazy: false });
    expect(ctx._managerRegistered.has('one')).toBe(true);
  });

  it('未知服务器返回 400', async () => {
    const { ctx } = harness();
    expect((await call(ctx, '/api/better-mcp/lazy', { server: 'x', lazy: true })).status).toBe(400);
    expect((await call(ctx, '/api/better-mcp/restart', { server: 'x' })).status).toBe(400);
  });

  it('restart 重新挂载', async () => {
    const { ctx } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const response = await call(ctx, '/api/better-mcp/restart', { server: 'one' });
    expect(response.status).toBe(200);
    expect(ctx._managerRegistered.has('one')).toBe(true);
  });
});

describe('服务器增删改', () => {
  it('upsert 写入配置并返回新服务器', async () => {
    const { ctx, refs } = harness();
    const response = await call(ctx, '/api/better-mcp/servers', {
      server: 'one',
      definition: { transport: 'stdio', command: 'node' },
    });
    expect(response.status).toBe(200);
    expect((response.json.servers as Array<Record<string, unknown>>)[0]?.name).toBe('one');
    expect(ctx._configEdits).toHaveLength(1);
    expect((refs.servers.get() as Record<string, unknown>).one).toBeDefined();
    expect((refs.servers.get() as Record<string, Record<string, unknown>>).one?.auth).toBe('none');
  });

  it('非法定义返回 400', async () => {
    const { ctx } = harness();
    expect(
      (await call(ctx, '/api/better-mcp/servers', { server: 'bad name', definition: {} })).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, '/api/better-mcp/servers', {
          server: 'one',
          definition: { transport: 'stdio' },
        })
      ).status,
    ).toBe(400);
  });

  it('更新保留已有定义', async () => {
    const { ctx, refs } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    await call(ctx, '/api/better-mcp/servers', {
      server: 'two',
      definition: { transport: 'stdio', command: 'npx' },
    });
    const servers = refs.servers.get() as Record<string, unknown>;
    expect(Object.keys(servers)).toEqual(['one', 'two']);
    expect((servers.one as Record<string, unknown>).command).toBe('node');
  });

  it('删除同时清理授权、客户端密钥与懒加载状态', async () => {
    const { ctx, refs } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    await ctx.credentials.modifyRecord(recordKey(grantId('one')), async () => ({
      kind: 'grant',
      payload: { accessToken: 't' },
    }));
    await ctx.credentials.modifyRecord(recordKey(`${grantId('one')}-client`), async () => ({
      kind: 'api-key',
      key: 's',
    }));
    await setLazy('one', true);
    const response = await call(ctx, '/api/better-mcp/servers/remove', { server: 'one' });
    expect(response.status).toBe(200);
    expect((refs.servers.get() as Record<string, unknown>).one).toBeUndefined();
    expect(await readGrant(ctx as never, 'one')).toBeUndefined();
    expect(await readClientSecret(ctx as never, 'one')).toBeUndefined();
    expect(await readState()).toEqual({ lazy: {} });
  });
});

describe('OAuth 路由', () => {
  it('未知服务器与非 http 服务器返回 400', async () => {
    const { ctx } = harness({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    expect((await call(ctx, '/api/better-mcp/oauth/start?server=x')).status).toBe(400);
    expect((await call(ctx, '/api/better-mcp/oauth/start?server=one')).status).toBe(400);
  });

  it('发现失败返回 502', async () => {
    const { ctx } = harness({
      one: { transport: 'streamable-http', url: 'https://x', auth: 'oauth', lazy: true },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const response = await call(ctx, '/api/better-mcp/oauth/start?server=one');
    expect(response.status).toBe(502);
    expect(String(response.json.error)).toContain('401');
  });

  it('配置固定客户端：写入配置与凭据库', async () => {
    const { ctx, refs } = harness({
      one: { transport: 'streamable-http', url: 'https://x', auth: 'oauth', lazy: true },
    });
    const response = await call(ctx, '/api/better-mcp/oauth/client', {
      server: 'one',
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'http://127.0.0.1:19876/callback',
    });
    if (response.status !== 200) console.log('DEBUGCLIENT', response.json);
    expect(response.status).toBe(200);
    const oauth = (refs.servers.get() as Record<string, Record<string, Record<string, unknown>>>)
      .one?.oauth;
    expect(oauth).toMatchObject({
      clientId: 'client',
      redirectUri: 'http://127.0.0.1:19876/callback',
    });
    expect(await readClientSecret(ctx as never, 'one')).toBe('secret');
    await call(ctx, '/api/better-mcp/oauth/client', { server: 'one', clientSecret: '' });
    expect(await readClientSecret(ctx as never, 'one')).toBeUndefined();
    expect(
      (await call(ctx, '/api/better-mcp/oauth/client', { server: 'one', redirectUri: 'https://x' }))
        .status,
    ).toBe(400);
  });

  it('退出登录删除授权', async () => {
    const { ctx } = harness();
    await ctx.credentials.modifyRecord(recordKey(grantId('one')), async () => ({
      kind: 'grant',
      payload: { accessToken: 't' },
    }));
    expect((await call(ctx, '/api/better-mcp/oauth/signout', { server: 'one' })).status).toBe(200);
    expect(await readGrant(ctx as never, 'one')).toBeUndefined();
  });
});

describe('聚合端点与回调', () => {
  it('轮换令牌后旧值失效', async () => {
    const { ctx } = harness();
    const first = await ensureEndpointToken(ctx as never);
    const response = await call(ctx, '/api/better-mcp/endpoint/rotate');
    expect(response.status).toBe(200);
    const token = String(response.json.token);
    expect(token).not.toBe(first);
    expect(await ensureEndpointToken(ctx as never)).toBe(token);
  });

  it('前缀路由按组返回工具清单', async () => {
    const { ctx } = harness();
    ctx._registeredTools.push({
      name: 'workspace_list',
      description: 'list workspaces',
      parameters: { type: 'object', properties: {} },
      output: { schema: {}, render: () => [] },
      execute: async () => undefined,
    });
    const token = await ensureEndpointToken(ctx as never);
    const route = webRoute(ctx, '/better-mcp/mcp');
    const { res, read } = makeRes();
    await (route.handler as (req: never, res: never) => Promise<void>)(
      makeReq(
        'POST',
        '/better-mcp/mcp/harness',
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        {
          authorization: `Bearer ${token}`,
        },
      ),
      res,
    );
    const result = read();
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual(['workspace_list']);
  });

  it('未知组返回 404', async () => {
    const { ctx } = harness();
    const { res, read } = makeRes();
    await (webRoute(ctx, '/better-mcp/mcp').handler as (req: never, res: never) => Promise<void>)(
      makeReq('POST', '/better-mcp/mcp/nope', '{}'),
      res,
    );
    expect(read().status).toBe(404);
  });

  it('回调未知 state 返回失败页', async () => {
    const { ctx } = harness();
    const { res, read } = makeRes();
    await (
      webRoute(ctx, '/better-mcp/oauth/callback').handler as (
        req: never,
        res: never,
      ) => Promise<void>
    )(makeReq('GET', '/better-mcp/oauth/callback?state=missing&code=x'), res);
    const result = read();
    expect(result.status).toBe(400);
    expect(result.body).toContain('Authorization failed');
  });

  it('回调携带 error 时返回失败页', async () => {
    const { ctx } = harness();
    const { res, read } = makeRes();
    await (
      webRoute(ctx, '/better-mcp/oauth/callback').handler as (
        req: never,
        res: never,
      ) => Promise<void>
    )(makeReq('GET', '/better-mcp/oauth/callback?error=access_denied'), res);
    expect(read().body).toContain('access_denied');
  });
});
