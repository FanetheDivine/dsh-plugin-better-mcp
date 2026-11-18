/**
 * 前端字典与命名空间。
 * 导出 NS、McpKey、zh、en；中文字典是键集事实源。
 */

/** 前端使用的字典命名空间，与包名一致。 */
export const NS = 'dsh-plugin-better-mcp';

/** 中文字典。 */
export const zh = {
  title: 'MCP 连接',
  empty: '还没有 MCP 服务器。',
  lazy: '懒加载',
  resident: '常驻',
  restart: '重连',
  authorize: '授权',
  reauthorize: '重新授权',
  signout: '退出登录',
  copied: '已复制',
  copy: '复制',
  reveal: '显示',
  hide: '隐藏',
  aggregate: '聚合 MCP 端点',
  token: '访问令牌',
  rotate: '换一个',
  close: '关闭',
  loading: '读取中…',
  failedLoad: '读取状态失败',
  managed: '本插件',
  external: '外部',
  retry: '重试',
  authorized: '已授权',
  needsAuth: '待授权',
  add: '新增服务器',
  edit: '编辑',
  delete: '删除',
  save: '保存',
  cancel: '取消',
  name: '名称',
  transport: '传输方式',
  address: '地址',
  headers: '请求头',
  command: '命令',
  args: '参数',
  auth: '认证',
  oauthClient: 'OAuth 客户端标识',
  clientSecret: '客户端密钥',
  redirectUri: '回调地址',
  scopes: 'Scopes',
  deleteConfirm: '删除服务器「{name}」并清除其授权？',
  createTitle: '新增 MCP 服务器',
  editTitle: '编辑 MCP 服务器',
  summary: 'MCP 服务器的连接状态、懒加载与授权，以及聚合端点的地址和令牌',
  nameInvalid: '名称只能包含字母、数字、下划线与连字符，长度 1–32。',
  urlInvalid: '地址必须是绝对 URL。',
  commandRequired: 'stdio 服务器需要填写命令。',
  headersInvalid: '请求头每行写成「名称: 值」。',
  redirectInvalid: '回调地址必须是 127.0.0.1 或 localhost 的回环 http 地址。',
  secretPlaceholder: '留空保持不变',
  unnamed: '未命名',
} as const;

/** 英文字典，键集与中文一致。 */
export const en: Record<McpKey, string> = {
  title: 'MCP connections',
  empty: 'No MCP servers yet.',
  lazy: 'lazy',
  resident: 'resident',
  restart: 'Reconnect',
  authorize: 'Sign in',
  reauthorize: 'Sign in again',
  signout: 'Sign out',
  copied: 'Copied',
  copy: 'Copy',
  reveal: 'Show',
  hide: 'Hide',
  aggregate: 'Aggregate MCP endpoints',
  token: 'Access token',
  rotate: 'Rotate',
  close: 'Close',
  loading: 'Loading…',
  failedLoad: 'Could not load status',
  managed: 'plugin',
  external: 'external',
  retry: 'Retry',
  authorized: 'authorized',
  needsAuth: 'needs sign-in',
  add: 'Add server',
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  name: 'Name',
  transport: 'Transport',
  address: 'Address',
  headers: 'Headers',
  command: 'Command',
  args: 'Arguments',
  auth: 'Authentication',
  oauthClient: 'OAuth client id',
  clientSecret: 'Client secret',
  redirectUri: 'Redirect URI',
  scopes: 'Scopes',
  deleteConfirm: 'Delete server "{name}" and clear its authorization?',
  createTitle: 'Add an MCP server',
  editTitle: 'Edit MCP server',
  summary:
    'MCP server connection state, lazy mounting and authorization, plus aggregate endpoint URLs and token',
  nameInvalid: 'Use letters, digits, underscores and hyphens, 1–32 characters.',
  urlInvalid: 'The address must be an absolute URL.',
  commandRequired: 'A stdio server needs a command.',
  headersInvalid: 'Write one header per line as "Name: Value".',
  redirectInvalid: 'The redirect must be a loopback http address on 127.0.0.1 or localhost.',
  secretPlaceholder: 'Leave blank to keep the current secret',
  unnamed: 'Unnamed',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件前端文案，键集取自中文字典。 */
    'dsh-plugin-better-mcp': McpKey;
  }
}

/** 本插件前端可用的字典键。 */
export type McpKey = keyof typeof zh;
