/** 面板调用的插件路由。 */

/** 一台服务器的面板数据。 */
export interface ServerRow {
  name: string;
  description?: string;
  transport?: string;
  url?: string;
  auth?: string;
  lazy: boolean;
  authorized: boolean;
  mounted: boolean;
  /** 连接状态名。 */
  state: string;
  toolCount?: number;
  connectedAt?: number;
  attempt?: number;
  maxAttempts?: number;
  /** 宿主返回的原始错误文本。 */
  error?: string;
  cleanup?: 'failed' | 'unconfirmed';
  definition?: Record<string, unknown>;
}

/** 面板快照。 */
export interface PanelSnapshot {
  servers: ServerRow[];
}

/** 服务器定义（面板提交的结构）。 */
export type ServerDefinition = Record<string, unknown>;

/** 生成可直接导航的授权启动地址。 */
export function oauthStartUrl(server: string): string {
  return `/better-mcp/oauth/start?server=${encodeURIComponent(server)}`;
}

/** 发起一个路由请求并解析 JSON。 */
async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  let value: unknown;
  try {
    value = text === '' ? {} : JSON.parse(text);
  } catch {
    throw new Error(`${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error =
      value !== null && typeof value === 'object' && 'error' in value
        ? (value as { error?: unknown }).error
        : undefined;
    throw new Error(typeof error === 'string' ? error : `HTTP ${response.status}`);
  }
  return value as T;
}

/** 读取状态。 */
export function fetchStatus(): Promise<PanelSnapshot> {
  return call('/api/better-mcp/status');
}

/** 切换懒加载。 */
export function setLazy(server: string, lazy: boolean): Promise<PanelSnapshot> {
  return call('/api/better-mcp/lazy', { method: 'POST', body: { server, lazy } });
}

/** 重连。 */
export function restart(server: string): Promise<PanelSnapshot> {
  return call('/api/better-mcp/restart', { method: 'POST', body: { server } });
}

/** 新增或更新服务器。 */
export function upsertServer(server: string, definition: ServerDefinition): Promise<PanelSnapshot> {
  return call('/api/better-mcp/servers', { method: 'POST', body: { server, definition } });
}

/** 删除服务器。 */
export function removeServer(server: string): Promise<PanelSnapshot> {
  return call('/api/better-mcp/servers/remove', { method: 'POST', body: { server } });
}

/** 退出登录。 */
export function signOut(server: string): Promise<PanelSnapshot> {
  return call('/api/better-mcp/oauth/signout', { method: 'POST', body: { server } });
}

/** 配置固定客户端。 */
export function configureClient(input: {
  server: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}): Promise<PanelSnapshot> {
  return call('/api/better-mcp/oauth/client', { method: 'POST', body: input });
}
