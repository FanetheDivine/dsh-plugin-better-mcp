/** 共享常量：插件标识、路由、凭据范围、会话目录与超时。 */

import packageJson from '../package.json' with { type: 'json' };

/** 插件名，与 cordis.patch.yml 的 name 一致。 */
export const PLUGIN_NAME = 'dsh-plugin-better-mcp';

/** 插件版本，取自 package.json。 */
export const PLUGIN_VERSION: string = packageJson.version;

/** 插件行 id，与 cordis.patch.yml 的 id 一致。 */
export const PLUGIN_ROW_ID = 'better-mcp';

/** 日志与错误消息使用的前缀。 */
export const PLUGIN_LABEL = 'better-mcp';

/** OAuth 启动路径，浏览器访问后重定向到授权服务器。 */
export const OAUTH_START_PATH = '/better-mcp/oauth/start';

/** OAuth 回调路径。 */
export const CALLBACK_PATH = '/better-mcp/oauth/callback';

/** 凭据记录的归属范围。 */
export const CREDENTIAL_SCOPE = 'better-mcp';

/** 待处理授权的有效期。 */
export const PENDING_TTL_MS = 10 * 60 * 1000;

/** MCP 工具名前缀。 */
export const MCP_TOOL_PREFIX = 'mcp__';

/** 目录消息的来源标识，也是会话投影的键。 */
export const CATALOG_SOURCE = 'better-mcp-catalog';
