// 面板路由与 OAuth 路由接线。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readConfig } from '../src/config.ts';
import { readClientSecret, readGrant, recordKey } from '../src/credentials.ts';
import { PluginRoutes } from '../src/routes.ts';
import { ServerManager } from '../src/servers.ts';
import { grantId } from '../src/utils.ts';
import { makeCtx, volatile } from './helpers.ts';

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Harness {
  ctx: ReturnType<typeof makeCtx>;
  routes: PluginRoutes;
  manager: ServerManager;
  current: () => ReturnType<typeof readConfig>;
  refs: { servers: ReturnType<typeof volatile> };
}

/** 组装路由。 */
function harness(
  initialServers: Record<string, unknown> = {},
  onAuthorizationChange: () => void = () => undefined,
): Harness {
  const refs = { servers: volatile(initialServers) };
  const ctx = makeCtx({ config: refs });
  let current = readConfig(refs);
  ctx.on('loader/volatile-update', () => {
    current = readConfig(refs);
  });
  ctx._configStore = structuredClone(current) as unknown as Record<string, unknown>;
  const logger = { info: vi.fn(), warn: vi.fn() };
  const manager = new ServerManager(ctx, () => current, logger);
  const routes = new PluginRoutes(
    ctx,
    () => current,
    manager,
    async () => undefined,
    onAuthorizationChange,
  );
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

/** 调用一条普通 Web 路由并读取状态、响应头与正文。 */
async function callWeb(
  ctx: ReturnType<typeof makeCtx>,
  path: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const route = webRoute(ctx, path);
  const { res, read } = makeRes();
  await (route.handler as (req: never, res: never) => Promise<void>)(
    makeReq('GET', url, undefined, headers),
    res,
  );
  return read();
}

/** 替换固定回环监听，避免单元测试占用真实端口。 */
function stubFixedListener(routes: PluginRoutes) {
  const listener = vi.fn(async (_redirectUri: string) => undefined);
  Object.assign(routes, { startLoopbackListener: listener });
  return listener;
}

/** 模拟 Figma 官方 MCP 的授权发现与动态注册。 */
function stubFigmaOAuth(registration: Array<Record<string, unknown>>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (init?.method === 'POST' && target === 'https://mcp.figma.com/mcp') {
        return new Response('', {
          status: 401,
          headers: {
            'www-authenticate':
              'Bearer resource_metadata="https://mcp.figma.com/.well-known/oauth-protected-resource"',
          },
        });
      }
      if (target === 'https://mcp.figma.com/.well-known/oauth-protected-resource') {
        return Response.json({
          resource: 'https://mcp.figma.com/mcp',
          authorization_servers: ['https://api.figma.com'],
          scopes_supported: ['mcp:connect'],
        });
      }
      if (target === 'https://api.figma.com/.well-known/oauth-authorization-server') {
        return Response.json({
          issuer: 'https://api.figma.com',
          authorization_endpoint: 'https://www.figma.com/oauth/mcp',
          token_endpoint: 'https://api.figma.com/v1/oauth/token',
          registration_endpoint: 'https://api.figma.com/v1/oauth/mcp/register',
        });
      }
      if (target === 'https://api.figma.com/v1/oauth/mcp/register') {
        registration.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return Response.json(
          { client_id: 'figma-dynamic-client', client_secret: 'figma-secret' },
          { status: 201 },
        );
      }
      if (target === 'https://api.figma.com/v1/oauth/token') {
        return Response.json({
          access_token: 'figma-access-token',
          refresh_token: 'figma-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      return new Response('unexpected', { status: 500 });
    }),
  );
}

describe('status 与懒加载', () => {
  it('返回服务器列表', async () => {
    const { ctx } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const { status, json } = await call(ctx, '/api/better-mcp/status');
    expect(status).toBe(200);
    const servers = json.servers as Array<Record<string, unknown>>;
    expect(servers[0]).toMatchObject({ name: 'one', lazy: true, auth: 'none' });
    expect(Object.keys(json)).toEqual(['servers']);
  });

  it('切换懒加载写回配置，连接保持', async () => {
    const { ctx, manager, refs } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    await manager.mount('one');
    const response = await call(ctx, '/api/better-mcp/lazy', { server: 'one', lazy: true });
    expect(response.status).toBe(200);
    expect((refs.servers.get() as Record<string, Record<string, unknown>>).one?.lazy).toBe(true);
    expect((response.json.servers as Array<Record<string, unknown>>)[0]?.lazy).toBe(true);
    expect(ctx._managerRegistered.has('one')).toBe(true);
  });

  it('未知服务器返回 400', async () => {
    const { ctx } = harness();
    expect((await call(ctx, '/api/better-mcp/lazy', { server: 'x', lazy: true })).status).toBe(400);
    expect((await call(ctx, '/api/better-mcp/restart', { server: 'x' })).status).toBe(400);
  });

  it('restart 重新挂载', async () => {
    const { ctx } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
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
      definition: { description: 'd', transport: 'stdio', command: 'node' },
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
    const missing = await call(ctx, '/api/better-mcp/servers', {
      server: 'one',
      definition: { transport: 'stdio', command: 'node' },
    });
    expect(missing.status).toBe(400);
    expect(String(missing.json.error)).toContain('description is required');
    expect(
      (
        await call(ctx, '/api/better-mcp/servers', {
          server: 'one',
          definition: { description: 'd', transport: 'stdio' },
        })
      ).status,
    ).toBe(400);
  });

  it('更新保留已有定义', async () => {
    const { ctx, refs } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    await call(ctx, '/api/better-mcp/servers', {
      server: 'two',
      definition: { description: 'd', transport: 'stdio', command: 'npx' },
    });
    const servers = refs.servers.get() as Record<string, unknown>;
    expect(Object.keys(servers)).toEqual(['one', 'two']);
    expect((servers.one as Record<string, unknown>).command).toBe('node');
  });

  it('删除同时清理授权与客户端密钥', async () => {
    const { ctx, refs } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    await ctx.credentials.modifyRecord(recordKey(grantId('one')), async () => ({
      kind: 'grant',
      payload: { accessToken: 't' },
    }));
    await ctx.credentials.modifyRecord(recordKey(`${grantId('one')}-client`), async () => ({
      kind: 'api-key',
      key: 's',
    }));
    const response = await call(ctx, '/api/better-mcp/servers/remove', { server: 'one' });
    expect(response.status).toBe(200);
    expect((refs.servers.get() as Record<string, unknown>).one).toBeUndefined();
    expect(await readGrant(ctx as never, 'one')).toBeUndefined();
    expect(await readClientSecret(ctx as never, 'one')).toBeUndefined();
  });
});

describe('OAuth 路由', () => {
  it('未知服务器与非 http 服务器返回 400', async () => {
    const { ctx } = harness({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    expect((await call(ctx, '/api/better-mcp/oauth/start?server=x')).status).toBe(400);
    expect((await call(ctx, '/api/better-mcp/oauth/start?server=one')).status).toBe(400);
  });

  it('发现失败返回 502', async () => {
    const { ctx } = harness({
      one: {
        description: 'd',
        transport: 'streamable-http',
        url: 'https://x',
        auth: 'oauth',
        lazy: true,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const response = await call(ctx, '/api/better-mcp/oauth/start?server=one');
    expect(response.status).toBe(502);
    expect(String(response.json.error)).toContain('401');
  });

  it('回调地址取自 Host 头，忽略占位来源', async () => {
    const { ctx } = harness({
      one: {
        description: 'd',
        transport: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        auth: 'oauth',
        lazy: true,
      },
    });
    const registration: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (init?.method === 'POST' && target === 'https://mcp.example.com/mcp') {
          return new Response('', {
            status: 401,
            headers: {
              'www-authenticate':
                'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
            },
          });
        }
        if (target === 'https://mcp.example.com/.well-known/oauth-protected-resource') {
          return Response.json({
            resource: 'https://mcp.example.com/mcp',
            authorization_servers: ['https://auth.example.com'],
            scopes_supported: ['read'],
          });
        }
        if (target === 'https://auth.example.com/.well-known/oauth-authorization-server') {
          return Response.json({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
          });
        }
        if (target === 'https://auth.example.com/register') {
          const body: unknown = JSON.parse(String(init?.body ?? '{}'));
          registration.push(body as Record<string, unknown>);
          return Response.json(
            { client_id: 'client-1', client_secret: 'secret-1' },
            { status: 201 },
          );
        }
        return new Response('unexpected', { status: 500 });
      }),
    );
    // Web 载体把 fetch 路由的请求 URL 解析到占位来源，真实来源只在 Host 头里。
    const request = new Request('http://x/api/better-mcp/oauth/start?server=one', {
      headers: { host: '127.0.0.1:3210' },
    });
    const response = await fetchRoute(ctx, '/api/better-mcp/oauth/start')(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.redirectUri).toBe('http://127.0.0.1:3210/better-mcp/oauth/callback');
    expect(registration[0]?.client_name).toBe('DeepSeek Harness (better-mcp)');
    expect(registration[0]?.redirect_uris).toEqual([
      'http://127.0.0.1:3210/better-mcp/oauth/callback',
    ]);
  });

  it('Figma 忽略 OpenAI 固定标识并用 Codex 动态注册', async () => {
    const { ctx, routes } = harness({
      figma: {
        description: 'Figma',
        transport: 'streamable-http',
        url: 'https://mcp.figma.com/mcp',
        auth: 'oauth',
        lazy: true,
        oauth: { scopes: [], clientId: 'app_EMoamEEZ73f0CkXaXp7hrann' },
      },
    });
    const listener = stubFixedListener(routes);
    const registration: Array<Record<string, unknown>> = [];
    stubFigmaOAuth(registration);

    const response = await call(ctx, '/api/better-mcp/oauth/start?server=figma');
    expect(response.status).toBe(200);
    expect(registration).toHaveLength(1);
    expect(registration[0]?.client_name).toBe('Codex');
    expect(registration[0]?.redirect_uris).toEqual(['http://127.0.0.1:19876/callback']);
    expect(listener).toHaveBeenCalledWith('http://127.0.0.1:19876/callback');
    const target = new URL(String(response.json.url));
    expect(target.origin + target.pathname).toBe('https://www.figma.com/oauth/mcp');
    expect(target.searchParams.get('client_id')).toBe('figma-dynamic-client');
    expect(target.searchParams.get('scope')).toBe('mcp:connect');
  });

  it('Figma 保留其他显式客户端标识', async () => {
    const { ctx, routes } = harness({
      figma: {
        description: 'Figma',
        transport: 'streamable-http',
        url: 'https://mcp.figma.com/mcp',
        auth: 'oauth',
        lazy: true,
        oauth: { scopes: ['mcp:connect'], clientId: 'custom-figma-client' },
      },
    });
    stubFixedListener(routes);
    const registration: Array<Record<string, unknown>> = [];
    stubFigmaOAuth(registration);

    const response = await call(ctx, '/api/better-mcp/oauth/start?server=figma');
    expect(response.status).toBe(200);
    expect(registration).toHaveLength(0);
    expect(new URL(String(response.json.url)).searchParams.get('client_id')).toBe(
      'custom-figma-client',
    );
  });

  it('授权启动 Web 路由直接 302 到授权服务器', async () => {
    const { ctx, routes } = harness({
      figma: {
        description: 'Figma',
        transport: 'streamable-http',
        url: 'https://mcp.figma.com/mcp',
        auth: 'oauth',
        lazy: true,
      },
    });
    const registration: Array<Record<string, unknown>> = [];
    stubFigmaOAuth(registration);
    stubFixedListener(routes);

    const response = await callWeb(
      ctx,
      '/better-mcp/oauth/start',
      '/better-mcp/oauth/start?server=figma',
      { host: '127.0.0.1:3210' },
    );
    expect(response.status).toBe(302);
    expect(response.headers['cache-control']).toBe('no-store');
    const target = new URL(response.headers.location ?? '');
    expect(target.origin + target.pathname).toBe('https://www.figma.com/oauth/mcp');
    expect(target.searchParams.get('client_id')).toBe('figma-dynamic-client');
    expect(target.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:19876/callback');
  });

  it('授权启动 Web 路由返回 400 与 502 HTML 错误页', async () => {
    const { ctx } = harness({
      one: {
        description: 'd',
        transport: 'streamable-http',
        url: 'https://x',
        auth: 'oauth',
        lazy: true,
      },
    });
    const missing = await callWeb(
      ctx,
      '/better-mcp/oauth/start',
      '/better-mcp/oauth/start?server=missing',
    );
    expect(missing.status).toBe(400);
    expect(missing.body).toContain('Authorization failed');
    expect(missing.body).toContain('Unknown server');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const failed = await callWeb(
      ctx,
      '/better-mcp/oauth/start',
      '/better-mcp/oauth/start?server=one',
    );
    expect(failed.status).toBe(502);
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(failed.body).toContain('401');
  });

  it('配置固定客户端：写入配置与凭据库', async () => {
    const { ctx, refs } = harness({
      one: {
        description: 'd',
        transport: 'streamable-http',
        url: 'https://x',
        auth: 'oauth',
        lazy: true,
      },
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

describe('OAuth 回调', () => {
  it('注册 OAuth 启动与回调 Web 路由', () => {
    const { ctx } = harness();
    expect(ctx._routes.map((route) => route.path)).toEqual([
      '/better-mcp/oauth/start',
      '/better-mcp/oauth/callback',
    ]);
  });

  it('成功回调写入授权并触发一次会话目录更新', async () => {
    const onAuthorizationChange = vi.fn();
    const { ctx, routes } = harness(
      {
        figma: {
          description: 'Figma',
          transport: 'streamable-http',
          url: 'https://mcp.figma.com/mcp',
          auth: 'oauth',
          lazy: true,
        },
      },
      onAuthorizationChange,
    );
    stubFigmaOAuth([]);
    stubFixedListener(routes);
    const started = await call(ctx, '/api/better-mcp/oauth/start?server=figma');
    const state = new URL(String(started.json.url)).searchParams.get('state');

    const callback = await callWeb(
      ctx,
      '/better-mcp/oauth/callback',
      `/better-mcp/oauth/callback?code=code-1&state=${encodeURIComponent(state ?? '')}`,
    );
    expect(callback.status).toBe(200);
    expect(callback.body).toContain('Authorization complete');
    expect(await readGrant(ctx as never, 'figma')).toMatchObject({
      accessToken: 'figma-access-token',
      clientId: 'figma-dynamic-client',
    });
    expect(onAuthorizationChange).toHaveBeenCalledTimes(1);
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
