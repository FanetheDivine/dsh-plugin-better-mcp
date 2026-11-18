/** 零依赖工具函数与共享校验。 */
import { createHash } from 'node:crypto';

/** 判断值是否为普通对象。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取字符串字段。 */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 读取有限数字字段。 */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 判断是否为正整数。 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** JSON 响应头。 */
export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

/** 构造一个 JSON 响应。 */
export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

/** 管理器接受的服务器名格式。 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** 服务器名是否合法。 */
export function isValidServerName(name: string): boolean {
  return SERVER_NAME_PATTERN.test(name);
}

/** 把 `*` 通配符转为正则。 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

/** 稳定的凭据记录 id：小写连字符化，加服务器名摘要。 */
export function grantId(serverName: string): string {
  const base =
    serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'server';
  const digest = createHash('sha256').update(serverName).digest('hex').slice(0, 8);
  return `${base}-${digest}`;
}

/** HTML 转义，用于回调结果页。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
