// OAuth：挑战解析、发现、动态注册、授权地址与令牌流转。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Discovery, PendingAuthorization } from '../src/oauth.ts';
import {
  authorizationUrl,
  challengeParams,
  discover,
  exchangeCode,
  normalizeTokenResponse,
  probeAuthorization,
  refresh,
  registerClient,
} from '../src/oauth.ts';

/** 一次被捕获的 fetch 调用。 */
interface FetchCall {
  url: string;
  init: RequestInit;
}

/** 精确 URL 到响应工厂的映射。 */
type Routes = Record<string, () => Response>;

const MCP_URL = 'https://mcp.example/mcp';
const ORIGIN = 'https://mcp.example';
const RESOURCE_METADATA = `${ORIGIN}/.well-known/oauth-protected-resource`;
const AS = 'https://as.example';
const TOKEN_URL = `${AS}/token`;
const CHALLENGE = `Bearer resource_metadata="${RESOURCE_METADATA}"`;

/** 构造 JSON 响应。 */
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 用路由表替换全局 fetch，返回调用记录。 */
function stubFetch(routes: Routes): FetchCall[] {
  const calls: FetchCall[] = [];
  const fetchMock = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    calls.push({ url, init: init ?? {} });
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected fetch: ${url}`);
    return route();
  };
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** 构造发现结果。 */
function makeDiscovery(authorization: Record<string, unknown>): Discovery {
  return {
    resource: MCP_URL,
    authorizationServer: AS,
    authorization,
    scopes: [],
    challenge: {},
  };
}

/** 构造待完成授权。 */
function makePending(overrides: Partial<PendingAuthorization> = {}): PendingAuthorization {
  return {
    serverName: 'demo',
    verifier: 'verifier-value-'.padEnd(64, 'v'),
    redirectUri: 'http://127.0.0.1:3080/better-mcp/oauth/callback',
    clientId: 'client-1',
    resource: MCP_URL,
    authorization: { token_endpoint: TOKEN_URL },
    createdAt: 0,
    ...overrides,
  };
}

/** 读取请求头。 */
function headersOf(call: FetchCall | undefined): Record<string, string> {
  return (call?.init.headers ?? {}) as Record<string, string>;
}

/** 读取表单请求体。 */
function formOf(call: FetchCall | undefined): URLSearchParams {
  return new URLSearchParams(String(call?.init.body ?? ''));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('challengeParams', () => {
  it('null 头返回空对象', () => {
    expect(challengeParams(null)).toEqual({});
  });

  it('解析带引号的值', () => {
    expect(
      challengeParams('Bearer realm="mcp", resource_metadata="https://x.example/meta"'),
    ).toEqual({
      realm: 'mcp',
      resource_metadata: 'https://x.example/meta',
    });
  });

  it('解析不带引号的值', () => {
    expect(challengeParams('Bearer realm=mcp error=invalid_token')).toEqual({
      realm: 'mcp',
      error: 'invalid_token',
    });
  });

  it('多个参数、逗号分隔与键名小写', () => {
    const header = 'Bearer A="1", b=two, C="three four", error_description="token expired"';
    expect(challengeParams(header)).toEqual({
      a: '1',
      b: 'two',
      c: 'three four',
      error_description: 'token expired',
    });
  });
});

describe('probeAuthorization', () => {
  it('401 且带 www-authenticate 时未授权并返回挑战', async () => {
    const calls = stubFetch({
      [MCP_URL]: () =>
        new Response(null, {
          status: 401,
          headers: { 'www-authenticate': CHALLENGE },
        }),
    });
    const result = await probeAuthorization(MCP_URL);
    expect(result).toMatchObject({
      authorized: false,
      status: 401,
      challenge: { resource_metadata: RESOURCE_METADATA },
    });
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.url).toBe(MCP_URL);
  });

  it('非 401 视为已授权', async () => {
    stubFetch({ [MCP_URL]: () => json({ jsonrpc: '2.0', id: 1, result: {} }) });
    const result = await probeAuthorization(MCP_URL);
    expect(result.authorized).toBe(true);
    expect(result.status).toBe(200);
    expect(result.challenge).toEqual({});
  });
});

describe('discover', () => {
  it('完整流程：401 → 资源元数据 → 授权服务器元数据', async () => {
    const calls = stubFetch({
      [MCP_URL]: () =>
        new Response(null, { status: 401, headers: { 'www-authenticate': CHALLENGE } }),
      [RESOURCE_METADATA]: () =>
        json({
          resource: 'https://api.example/mcp',
          authorization_servers: [`${AS}/`],
          scopes_supported: ['mcp:tools', 42, 'mcp:read'],
        }),
      [`${AS}/.well-known/oauth-authorization-server`]: () =>
        json({
          issuer: AS,
          authorization_endpoint: `${AS}/authorize`,
          token_endpoint: TOKEN_URL,
        }),
    });

    const discovery = await discover(MCP_URL);

    expect(discovery).toMatchObject({
      resource: 'https://api.example/mcp',
      authorizationServer: AS,
      scopes: ['mcp:tools', 'mcp:read'],
      challenge: { resource_metadata: RESOURCE_METADATA },
    });
    expect(discovery.authorization).toMatchObject({ token_endpoint: TOKEN_URL });
    expect(calls.map((call) => call.url)).toEqual([
      MCP_URL,
      RESOURCE_METADATA,
      `${AS}/.well-known/oauth-authorization-server`,
    ]);
  });

  it('首个授权服务器元数据 404 时回退到 openid-configuration', async () => {
    const calls = stubFetch({
      [MCP_URL]: () =>
        new Response(null, { status: 401, headers: { 'www-authenticate': CHALLENGE } }),
      [RESOURCE_METADATA]: () => json({ authorization_servers: [AS] }),
      [`${AS}/.well-known/oauth-authorization-server`]: () => json({}, 404),
      [`${AS}/.well-known/openid-configuration`]: () =>
        json({ authorization_endpoint: `${AS}/authorize`, token_endpoint: TOKEN_URL }),
    });

    const discovery = await discover(MCP_URL);

    expect(discovery.authorization.token_endpoint).toBe(TOKEN_URL);
    expect(discovery.resource).toBe(MCP_URL);
    expect(calls.map((call) => call.url)).toEqual([
      MCP_URL,
      RESOURCE_METADATA,
      `${AS}/.well-known/oauth-authorization-server`,
      `${AS}/.well-known/openid-configuration`,
    ]);
  });

  it('探测返回非 401 时报错', async () => {
    stubFetch({ [MCP_URL]: () => json({ jsonrpc: '2.0', id: 1, result: {} }) });
    await expect(discover(MCP_URL)).rejects.toThrow(/did not answer 401 Unauthorized/);
  });

  it('没有资源元数据时报错', async () => {
    stubFetch({
      [MCP_URL]: () =>
        new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer realm="mcp"' } }),
      [RESOURCE_METADATA]: () => json({ error: 'not_found' }, 404),
    });
    await expect(discover(MCP_URL)).rejects.toThrow(
      `No protected-resource metadata at ${RESOURCE_METADATA}.`,
    );
  });

  it('没有授权服务器元数据时报错', async () => {
    stubFetch({
      [MCP_URL]: () =>
        new Response(null, { status: 401, headers: { 'www-authenticate': CHALLENGE } }),
      [RESOURCE_METADATA]: () => json({ authorization_servers: [AS] }),
      [`${AS}/.well-known/oauth-authorization-server`]: () => json({}, 404),
      [`${AS}/.well-known/openid-configuration`]: () => json({}, 404),
    });
    await expect(discover(MCP_URL)).rejects.toThrow(
      `No authorization-server metadata at ${AS}/.well-known/oauth-authorization-server or ${AS}/.well-known/openid-configuration.`,
    );
  });
});

describe('registerClient', () => {
  const REDIRECT_URI = 'http://127.0.0.1:3080/better-mcp/oauth/callback';

  it('成功注册：POST 带 redirect_uris 并返回 client_id/secret', async () => {
    const calls = stubFetch({
      [`${AS}/register`]: () => json({ client_id: 'cid', client_secret: 'csecret' }),
    });
    const result = await registerClient(
      makeDiscovery({ registration_endpoint: `${AS}/register` }),
      {
        clientName: 'better-mcp',
        redirectUri: REDIRECT_URI,
        scopes: ['mcp:tools', 'mcp:read'],
      },
    );

    expect(result).toEqual({ clientId: 'cid', clientSecret: 'csecret' });
    expect(calls[0]?.url).toBe(`${AS}/register`);
    expect(calls[0]?.init.method).toBe('POST');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.redirect_uris).toEqual([REDIRECT_URI]);
    expect(body.client_name).toBe('better-mcp');
    expect(body.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(body.response_types).toEqual(['code']);
    expect(body.token_endpoint_auth_method).toBe('client_secret_post');
    expect(body.scope).toBe('mcp:tools mcp:read');
  });

  it('没有 registration_endpoint 时报错', async () => {
    stubFetch({});
    await expect(
      registerClient(makeDiscovery({}), {
        clientName: 'better-mcp',
        redirectUri: REDIRECT_URI,
        scopes: [],
      }),
    ).rejects.toThrow(/does not advertise dynamic client registration/);
  });

  it('HTTP 失败时的错误包含状态码与响应正文', async () => {
    stubFetch({ [`${AS}/register`]: () => new Response('bad request', { status: 400 }) });
    await expect(
      registerClient(makeDiscovery({ registration_endpoint: `${AS}/register` }), {
        clientName: 'better-mcp',
        redirectUri: REDIRECT_URI,
        scopes: [],
      }),
    ).rejects.toThrow(/Client registration failed \(HTTP 400\): bad request/);
  });

  it('响应没有 client_id 时报错', async () => {
    stubFetch({ [`${AS}/register`]: () => json({ client_secret: 'csecret' }) });
    await expect(
      registerClient(makeDiscovery({ registration_endpoint: `${AS}/register` }), {
        clientName: 'better-mcp',
        redirectUri: REDIRECT_URI,
        scopes: [],
      }),
    ).rejects.toThrow('Client registration answered no client_id.');
  });
});

describe('authorizationUrl', () => {
  it('包含授权参数，verifier 是 64 位 base64url', () => {
    const discovery = makeDiscovery({ authorization_endpoint: `${AS}/authorize` });
    const result = authorizationUrl(discovery, {
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:3080/better-mcp/oauth/callback',
      scopes: ['mcp:tools', 'mcp:read'],
      resource: MCP_URL,
    });

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(`${AS}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:3080/better-mcp/oauth/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toBe(result.state);
    expect(url.searchParams.get('resource')).toBe(MCP_URL);
    expect(url.searchParams.get('scope')).toBe('mcp:tools mcp:read');
    expect(result.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(result.verifier).not.toContain('=');
    expect(result.state).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('没有 authorization_endpoint 时报错', () => {
    expect(() =>
      authorizationUrl(makeDiscovery({}), {
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:3080/better-mcp/oauth/callback',
        scopes: [],
        resource: MCP_URL,
      }),
    ).toThrow('The authorization-server metadata advertises no authorization_endpoint.');
  });
});

describe('exchangeCode', () => {
  it('提交表单并默认使用 client_secret_post；expires_in 规范化为 expiresAt', async () => {
    const calls = stubFetch({
      [TOKEN_URL]: () =>
        json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, token_type: 'Bearer' }),
    });
    const before = Date.now();
    const token = await exchangeCode(makePending({ clientSecret: 's3cret' }), 'the-code');
    const after = Date.now();

    expect(token).toMatchObject({ accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer' });
    expect(token.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(token.expiresAt).toBeLessThanOrEqual(after + 3_600_000);

    const call = calls[0];
    expect(call?.url).toBe(TOKEN_URL);
    expect(call?.init.method).toBe('POST');
    expect(headersOf(call)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(headersOf(call).authorization).toBeUndefined();
    const form = formOf(call);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('redirect_uri')).toBe('http://127.0.0.1:3080/better-mcp/oauth/callback');
    expect(form.get('code_verifier')).toBe(makePending().verifier);
    expect(form.get('resource')).toBe(MCP_URL);
    expect(form.get('client_id')).toBe('client-1');
    expect(form.get('client_secret')).toBe('s3cret');
  });

  it('元数据声明 client_secret_basic 时改用 Authorization 头', async () => {
    const calls = stubFetch({ [TOKEN_URL]: () => json({ access_token: 'at' }) });
    await exchangeCode(
      makePending({
        clientSecret: 's3cret',
        authorization: {
          token_endpoint: TOKEN_URL,
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
        },
      }),
      'the-code',
    );

    const expected = `Basic ${Buffer.from('client-1:s3cret').toString('base64')}`;
    expect(headersOf(calls[0]).authorization).toBe(expected);
    const form = formOf(calls[0]);
    expect(form.get('client_id')).toBeNull();
    expect(form.get('client_secret')).toBeNull();
    expect(form.get('code_verifier')).toBe(makePending().verifier);
  });

  it('HTTP 失败时错误包含状态码', async () => {
    stubFetch({ [TOKEN_URL]: () => new Response('invalid_grant', { status: 400 }) });
    await expect(exchangeCode(makePending(), 'bad-code')).rejects.toThrow(
      /Token exchange failed \(HTTP 400\): invalid_grant/,
    );
  });
});

describe('refresh', () => {
  it('提交刷新表单字段', async () => {
    const calls = stubFetch({ [TOKEN_URL]: () => json({ access_token: 'at2', expires_in: 60 }) });
    const token = await refresh({
      tokenEndpoint: TOKEN_URL,
      clientId: 'client-1',
      clientSecret: 's3cret',
      refreshToken: 'rt',
      resource: MCP_URL,
    });

    expect(token.accessToken).toBe('at2');
    const form = formOf(calls[0]);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('rt');
    expect(form.get('resource')).toBe(MCP_URL);
    expect(form.get('client_id')).toBe('client-1');
    expect(form.get('client_secret')).toBe('s3cret');
    expect(headersOf(calls[0])['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('HTTP 失败时错误包含状态码', async () => {
    stubFetch({ [TOKEN_URL]: () => new Response('expired', { status: 401 }) });
    await expect(
      refresh({
        tokenEndpoint: TOKEN_URL,
        clientId: 'client-1',
        refreshToken: 'rt',
      }),
    ).rejects.toThrow(/Token refresh failed \(HTTP 401\): expired/);
  });
});

describe('normalizeTokenResponse', () => {
  it('缺少 access_token 时报错', () => {
    expect(() => normalizeTokenResponse({})).toThrow(
      'The token endpoint answered no access_token.',
    );
    expect(() => normalizeTokenResponse({ access_token: '' })).toThrow(
      'The token endpoint answered no access_token.',
    );
  });

  it('默认令牌类型为 Bearer', () => {
    expect(normalizeTokenResponse({ access_token: 'at' })).toEqual({
      accessToken: 'at',
      tokenType: 'Bearer',
    });
  });

  it('透传 refresh_token 与 token_type，无 expires_in 时不给出 expiresAt', () => {
    const token = normalizeTokenResponse({
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'MAC',
    });
    expect(token).toEqual({ accessToken: 'at', refreshToken: 'rt', tokenType: 'MAC' });
    expect(token.expiresAt).toBeUndefined();
  });
});
