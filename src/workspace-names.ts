/** 工作区路径键、MCP 内部实例名与 Agent 公开工具名的纯函数契约。 */
import { createHash } from 'node:crypto';

/** 内部实例名前缀，用于识别本插件拥有的名称。 */
const INTERNAL_NAME_MARKER = 'bm_';

/** 内部名称中保留的配置名前缀长度。 */
const READABLE_PREFIX_LENGTH = 12;

/** 内部名称使用的 SHA-256 十六进制摘要长度。 */
const INTERNAL_HASH_LENGTH = 16;

/** 将宿主规范化路径转换为跨 Windows 与 POSIX 一致的稳定工作区键。 */
export function normalizeWorkspaceKey(workspacePath: string): string {
  const slashed = workspacePath.replace(/\\/g, '/');
  const driveNormalized = /^[a-z]:/.test(slashed)
    ? `${slashed.charAt(0).toUpperCase()}${slashed.slice(1)}`
    : slashed;
  const trimmed = driveNormalized.replace(/\/+$/, '');
  if (trimmed === '') return '/';
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}/`;
  return trimmed;
}

/** 为服务器配置与工作区键生成稳定、最长 32 字符的全局内部实例名。 */
export function workspaceInternalName(serverName: string, workspaceKey: string): string {
  const identity = `${serverName}\0${normalizeWorkspaceKey(workspaceKey)}`;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, INTERNAL_HASH_LENGTH);
  return `${INTERNAL_NAME_MARKER}${serverName.slice(0, READABLE_PREFIX_LENGTH)}_${hash}`;
}

/** 判断名称是否符合本插件工作区内部实例名的完整结构。 */
export function isWorkspaceInternalName(name: string): boolean {
  return /^bm_[A-Za-z0-9_-]{1,12}_[a-f0-9]{16}$/.test(name);
}

/** 返回内部实例注册到宿主系统提示中的 section 名。 */
export function workspaceSectionName(internalName: string): string {
  return `mcp:${internalName}`;
}

/** 返回内部实例全部工具共用的精确前缀。 */
export function internalToolPrefix(internalName: string): string {
  return `mcp__${internalName}__`;
}

/** 判断工具是否属于指定内部实例，要求分隔符后存在非空后缀。 */
export function isInternalToolName(toolName: string, internalName: string): boolean {
  const prefix = internalToolPrefix(internalName);
  return toolName.startsWith(prefix) && toolName.length > prefix.length;
}

/** 将目标内部工具名还原为公开配置名，并原样保留宿主规范化后缀。 */
export function workspacePublicToolName(
  serverName: string,
  internalName: string,
  internalToolName: string,
): string | undefined {
  if (!isInternalToolName(internalToolName, internalName)) return undefined;
  const suffix = internalToolName.slice(internalToolPrefix(internalName).length);
  return `mcp__${serverName}__${suffix}`;
}
