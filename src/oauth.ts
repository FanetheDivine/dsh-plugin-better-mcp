/**
 * MCP 授权（OAuth 2.1 + PKCE）。
 *
 * 流程：探测 401 取资源元数据 → 读授权服务器元数据 → 可选动态注册 → 浏览器授权
 * （S256 PKCE 与 resource 参数）→ 回调换码 → 过期前刷新。这里只做 HTTP 调用，
 * 授权结果的持久化由调用方负责。
 */
import { createHash, randomBytes } from 'node:crypto';

import type { PluginLogger } from './types.ts';
import { asString, isRecord } from './utils.ts';

/** 发现与令牌请求的超时。 */
const REQUEST_TIMEOUT_MS = 20_000;

/** 用于触发鉴权挑战的最小 JSON-RPC 请求。 */
const PROBE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-plugin-better-mcp', version: '0.1.0' },
  },
};

/** 发现结果。 */
export interface Discovery {
  /** 资源标识。 */
  resource: string;
  /** 授权服务器地址。 */
  authorizationServer: string;
  /** 授权服务器元数据。 */
  authorization: Record<string, unknown>;
  /** 可用 scope。 */
  scopes: string[];
  /** 401 挑战参数。 */
  challenge: Record<string, string>;
}

/** 一次待完成授权。 */
export interface PendingAuthorization {
  /** 服务器名。 */
  serverName: string;
  /** PKCE verifier。 */
  verifier: string;
  /** 回调地址。 */
  redirectUri: string;
  /** 客户端标识。 */
  clientId: string;
  /** 客户端密钥。 */
  clientSecret?: string;
  /** 资源标识。 */
  resource: string;
  /** 授权服务器元数据。 */
  authorization: Record<string, unknown>;
  /** 创建时间。 */
  createdAt: number;
}

/** 规范化后的令牌响应。 */
export interface TokenResponse {
  /** 访问令牌。 */
  accessToken: string;
  /** 刷新令牌。 */
  refreshToken?: string;
  /** 过期时间戳。 */
  expiresAt?: number;
  /** 令牌类型。 */
  tokenType: string;
}

/** base64url，无填充。 */
function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** 带超时的请求。 */
async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 解析 `key="value"` 形式的挑战参数。 */
export function challengeParams(header: string | null): Record<string, string> {
  if (header === null) return {};
  const params: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null = pattern.exec(header);
  while (match !== null) {
    params[(match[1] ?? '').toLowerCase()] = match[2] ?? match[3] ?? '';
    match = pattern.exec(header);
  }
  return params;
}

/** 探测 MCP 端点是否要求交互授权。 */
export async function probeAuthorization(
  url: string,
  signal?: AbortSignal,
): Promise<{ authorized: boolean; challenge: Record<string, string>; status: number }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(PROBE_BODY),
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const challenge = challengeParams(response.headers.get('www-authenticate'));
  await response.body?.cancel().catch(() => undefined);
  return { authorized: response.status !== 401, challenge, status: response.status };
}

/** 读取并解析一份元数据文档。 */
async function metadata(url: string): Promise<Record<string, unknown> | undefined> {
  const response = await request(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return undefined;
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** 发现授权服务器。 */
export async function discover(serverUrl: string, signal?: AbortSignal): Promise<Discovery> {
  const probe = await probeAuthorization(serverUrl, signal);
  if (probe.authorized) {
    throw new Error(
      'The server did not answer 401 Unauthorized, so it does not advertise an interactive authorization flow.',
    );
  }
  const origin = new URL(serverUrl).origin;
  const resourceMetadataUrl =
    probe.challenge.resource_metadata !== undefined
      ? new URL(probe.challenge.resource_metadata, serverUrl).href
      : `${origin}/.well-known/oauth-protected-resource`;
  const resource = await metadata(resourceMetadataUrl);
  if (resource === undefined) {
    throw new Error(`No protected-resource metadata at ${resourceMetadataUrl}.`);
  }
  const authorizationServers = Array.isArray(resource.authorization_servers)
    ? resource.authorization_servers
    : [];
  const authorizationServer =
    typeof authorizationServers[0] === 'string'
      ? authorizationServers[0].replace(/\/+$/, '')
      : probe.challenge.authorization_uri !== undefined
        ? new URL(probe.challenge.authorization_uri).origin
        : origin;
  const candidates = [
    `${authorizationServer}/.well-known/oauth-authorization-server`,
    `${authorizationServer}/.well-known/openid-configuration`,
  ];
  let authorization: Record<string, unknown> | undefined;
  for (const candidate of candidates) {
    authorization = await metadata(candidate);
    if (authorization !== undefined) break;
  }
  if (authorization === undefined) {
    throw new Error(`No authorization-server metadata at ${candidates.join(' or ')}.`);
  }
  const scopes = Array.isArray(resource.scopes_supported)
    ? resource.scopes_supported.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    resource: typeof resource.resource === 'string' ? resource.resource : serverUrl,
    authorizationServer,
    authorization,
    scopes,
    challenge: probe.challenge,
  };
}

/** 注册一个动态客户端。 */
export async function registerClient(
  discovery: Discovery,
  options: { clientName: string; redirectUri: string; scopes: string[] },
): Promise<{ clientId: string; clientSecret?: string }> {
  const endpoint = asString(discovery.authorization.registration_endpoint);
  if (endpoint === undefined) {
    throw new Error(
      'The authorization server does not advertise dynamic client registration; configure oauth.clientId and oauth.clientSecret instead.',
    );
  }
  const response = await request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: options.clientName,
      redirect_uris: [options.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      ...(options.scopes.length === 0 ? {} : { scope: options.scopes.join(' ') }),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Client registration failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  const registered: unknown = JSON.parse(text);
  const clientId = isRecord(registered) ? asString(registered.client_id) : undefined;
  if (clientId === undefined || clientId === '') {
    throw new Error('Client registration answered no client_id.');
  }
  return {
    clientId,
    ...(isRecord(registered) && typeof registered.client_secret === 'string'
      ? { clientSecret: registered.client_secret }
      : {}),
  };
}

/** 构造浏览器授权地址与 PKCE 值。 */
export function authorizationUrl(
  discovery: Discovery,
  options: { clientId: string; redirectUri: string; scopes: string[]; resource: string },
): { url: string; verifier: string; state: string } {
  const endpoint = asString(discovery.authorization.authorization_endpoint);
  if (endpoint === undefined) {
    throw new Error('The authorization-server metadata advertises no authorization_endpoint.');
  }
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(24));
  const url = new URL(endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('resource', options.resource);
  if (options.scopes.length > 0) url.searchParams.set('scope', options.scopes.join(' '));
  return { url: url.href, verifier, state };
}

/** 按授权服务器声明选择客户端认证方式。 */
function authenticateClient(
  form: URLSearchParams,
  clientId: string,
  clientSecret: string | undefined,
  authorization: Record<string, unknown>,
): { headers: Record<string, string>; form: URLSearchParams } {
  const declared = Array.isArray(authorization.token_endpoint_auth_methods_supported)
    ? authorization.token_endpoint_auth_methods_supported
    : ['client_secret_post'];
  const methods = declared.filter((value): value is string => typeof value === 'string');
  if (clientSecret !== undefined && methods.includes('client_secret_basic')) {
    const basic = Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
    ).toString('base64');
    return { headers: { authorization: `Basic ${basic}` }, form };
  }
  form.set('client_id', clientId);
  if (clientSecret !== undefined) form.set('client_secret', clientSecret);
  return { headers: {}, form };
}

/** 用授权码换取令牌。 */
export async function exchangeCode(
  pending: PendingAuthorization,
  code: string,
): Promise<TokenResponse> {
  const endpoint = asString(pending.authorization.token_endpoint);
  if (endpoint === undefined) {
    throw new Error('The authorization-server metadata advertises no token_endpoint.');
  }
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
    resource: pending.resource,
  });
  const authenticated = authenticateClient(
    form,
    pending.clientId,
    pending.clientSecret,
    pending.authorization,
  );
  const response = await request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...authenticated.headers,
    },
    body: authenticated.form.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token exchange failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return normalizeTokenResponse(JSON.parse(text));
}

/** 用刷新令牌换新令牌。 */
export async function refresh(grant: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  resource?: string;
  authorization?: Record<string, unknown>;
}): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: grant.refreshToken,
  });
  if (grant.resource !== undefined) form.set('resource', grant.resource);
  const authenticated = authenticateClient(
    form,
    grant.clientId,
    grant.clientSecret,
    grant.authorization ?? {},
  );
  const response = await request(grant.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...authenticated.headers,
    },
    body: authenticated.form.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token refresh failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return normalizeTokenResponse(JSON.parse(text));
}

/** 规范化 RFC 6749 令牌响应。 */
export function normalizeTokenResponse(value: unknown): TokenResponse {
  const raw = isRecord(value) ? value : {};
  const accessToken = asString(raw.access_token);
  if (accessToken === undefined || accessToken === '') {
    throw new Error('The token endpoint answered no access_token.');
  }
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : undefined;
  return {
    accessToken,
    ...(typeof raw.refresh_token === 'string' ? { refreshToken: raw.refresh_token } : {}),
    ...(expiresIn === undefined ? {} : { expiresAt: Date.now() + expiresIn * 1000 }),
    tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
  };
}

/** 日志接口，供调用方注入。 */
export type OAuthLogger = PluginLogger;
