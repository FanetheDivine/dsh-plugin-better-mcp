/**
 * 会话 MCP 目录消息：渲染完整目录与更新消息，并构造写入会话的 user 消息。
 * 导出 renderCatalog、renderCatalogUpdate、sameEntries 与 catalogMessage。
 */
import { randomUUID } from 'node:crypto';

import { CATALOG_SOURCE } from './constants.ts';
import type { UserMessage } from './types.ts';
import type { CatalogEntry, CatalogSource } from './visibility.ts';

/** 转义简介中的尖括号与 &，避免破坏消息结构。 */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 把简介压成一行。 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** 目录列表块。 */
function renderList(entries: readonly CatalogEntry[]): string[] {
  const lines =
    entries.length === 0
      ? ['(none)']
      : entries.map(
          (entry) =>
            `- \`${entry.name}\` (${entry.active ? 'active' : 'inactive'}): ${escapeText(oneLine(entry.description))}`,
        );
  return ['<mcp_servers>', ...lines, '</mcp_servers>'];
}

/** 用法说明。 */
const USAGE =
  'Call `mcp_manage` with `{ "server": "<name>", "command": "active" }` before you need an inactive server\'s tools, and with `"inactive"` when you no longer need them. This list replaces earlier MCP server lists in this session.';

/** 渲染完整目录。 */
export function renderCatalog(entries: readonly CatalogEntry[]): string {
  return [
    '<system-reminder>',
    "The following MCP servers are configured for this session. Each server's tools are named mcp__<server>__<tool>; only active servers' tools are in your tool list.",
    '',
    ...renderList(entries),
    '',
    USAGE,
    '</system-reminder>',
  ].join('\n');
}

/** 渲染更新消息：列出可见性变化，并附完整目录。 */
export function renderCatalogUpdate(
  previous: readonly CatalogEntry[],
  entries: readonly CatalogEntry[],
): string {
  const before = new Map(previous.map((entry) => [entry.name, entry.active]));
  const activated = entries.filter((entry) => entry.active && before.get(entry.name) !== true);
  const now = new Map(entries.map((entry) => [entry.name, entry.active]));
  const deactivated = previous
    .filter((entry) => entry.active && now.get(entry.name) !== true)
    .map((entry) => entry.name);
  const lines: string[] = [];
  if (activated.length === 0 && deactivated.length === 0) {
    lines.push('The MCP server list changed.');
  } else {
    lines.push('MCP server visibility changed in this session.');
    for (const entry of activated) {
      lines.push(
        `Now active: \`${entry.name}\`. Call its tools directly with the mcp__${entry.name}__ prefix.`,
      );
    }
    for (const name of deactivated) {
      lines.push(`Now inactive: \`${name}\`. Do not call mcp__${name}__ tools.`);
    }
  }
  const tail =
    entries.length === 0
      ? 'No MCP servers are available. Do not call mcp__ tools from earlier lists.'
      : 'Call `mcp_manage` to change visibility. This list replaces earlier MCP server lists in this session.';
  return [
    '<system-reminder>',
    ...lines,
    '',
    ...renderList(entries),
    '',
    tail,
    '</system-reminder>',
  ].join('\n');
}

/** 两份目录是否相同。 */
export function sameEntries(a: readonly CatalogEntry[], b: readonly CatalogEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 构造写入会话的目录消息。
 * @param text - 渲染好的消息正文。
 * @param entries - 消息记录的目录。
 * @param overrides - 写入时的显式选择。
 * @param update - 是否为更新消息。
 * @returns 冻结的 user 角色消息。
 */
export function catalogMessage(
  text: string,
  entries: readonly CatalogEntry[],
  overrides: Readonly<Record<string, boolean>>,
  update: boolean,
): UserMessage {
  const source: CatalogSource = {
    kind: CATALOG_SOURCE,
    form: 'catalog',
    ...(update ? { update: true as const } : {}),
    entries: entries.map((entry) => ({ ...entry })),
    overrides: { ...overrides },
  };
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source,
  }) as unknown as UserMessage;
}

/** 递归冻结。 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
