/** 共享常量：插件标识、路由、凭据引用与超时。 */

/** 插件名，与 cordis.patch.yml 的 name 一致。 */
export const PLUGIN_NAME = 'dsh-plugin-better-mcp';

/** 插件行 id，与 cordis.patch.yml 的 id 一致。 */
export const PLUGIN_ROW_ID = 'better-mcp';

/** 日志与错误消息使用的前缀。 */
export const PLUGIN_LABEL = 'better-mcp';

/** OAuth 回调路径。 */
export const CALLBACK_PATH = '/better-mcp/oauth/callback';

/** 聚合端点默认前缀。 */
export const ENDPOINT_DEFAULT = '/better-mcp/mcp';

/** 聚合端点令牌的凭据引用。 */
export const TOKEN_REF = 'BETTER_MCP_TOKEN';

/** 插件数据区内的目录名。 */
export const DATA_DIR = 'better-mcp';

/** 凭据记录的归属范围。 */
export const CREDENTIAL_SCOPE = 'better-mcp';

/** 懒加载状态文件名。 */
export const STATE_FILE = 'state.json';

/** 待处理授权的有效期。 */
export const PENDING_TTL_MS = 10 * 60 * 1000;

/** 按需挂载时等待连接的上限。 */
export const CONNECT_TIMEOUT_MS = 25_000;

/** 一次 JSON-RPC 批量最多处理的消息数。 */
export const MAX_BATCH = 20;

/** 聚合端点单次工具调用的超时。 */
export const AGGREGATE_CALL_TIMEOUT_MS = 120_000;

/** 默认工具组。 */
export const DEFAULT_GROUP = {
  title: 'DSH harness tools',
  include: ['workspace_*', 'session_*'],
  exclude: [] as string[],
};
