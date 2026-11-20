// 目录消息：完整目录、更新消息、转义与消息结构。
import { describe, expect, it } from 'vitest';

import { catalogMessage, renderCatalog, renderCatalogUpdate, sameEntries } from '../src/catalog.ts';
import type { WorkspaceNotice } from '../src/workspace-notices.ts';

const NOTICES: WorkspaceNotice[] = [
  {
    id: 4,
    kind: 'inactive',
    serverName: 'serena',
    workspace: 'D:/Git/Project',
    state: 'retained',
    detail: 'Other active Agents still occupy this folder. Do not delete it.',
  },
];

const ENTRIES = [
  { name: 'chrome', description: 'Control a <browser> & tabs', active: false },
  { name: 'figma', description: 'Read\n  designs', active: true },
];

describe('renderCatalog', () => {
  it('列出名称、可见性与一行简介，并说明 mcp_manage', () => {
    const text = renderCatalog(ENTRIES);
    expect(text.startsWith('<system-reminder>\n')).toBe(true);
    expect(text.endsWith('\n</system-reminder>')).toBe(true);
    expect(text).toContain('- `chrome` (inactive): Control a &lt;browser&gt; &amp; tabs');
    expect(text).toContain('- `figma` (active): Read designs');
    expect(text).toContain('mcp__<server>__<tool>');
    expect(text).toContain('`mcp_manage`');
  });

  it('把工作区提醒持久化在同一 system-reminder 消息中', () => {
    const text = renderCatalog(ENTRIES, NOTICES);
    expect(text).toContain("Workspace MCP 'serena' at 'D:/Git/Project' is retained.");
    expect(text).toContain('Other active Agents still occupy this folder. Do not delete it.');
  });
});

describe('renderCatalogUpdate', () => {
  it('列出变为可见与不可见的服务器及前缀', () => {
    const next = [
      { ...ENTRIES[0], active: true },
      { ...ENTRIES[1], active: false },
    ] as typeof ENTRIES;
    const text = renderCatalogUpdate(ENTRIES, next);
    expect(text).toContain(
      'Now active: `chrome`. Call its tools directly with the mcp__chrome__ prefix.',
    );
    expect(text).toContain('Now inactive: `figma`. Do not call mcp__figma__ tools.');
    expect(text).toContain('- `chrome` (active)');
  });

  it('只有目录内容变化时说明列表变化', () => {
    const next = [ENTRIES[0], { ...ENTRIES[1], description: 'New' }] as typeof ENTRIES;
    const text = renderCatalogUpdate(ENTRIES, next);
    expect(text).toContain('The MCP server list changed.');
    expect(text).not.toContain('Now active');
  });

  it('删除的可见服务器算作变为不可见', () => {
    expect(renderCatalogUpdate(ENTRIES, [ENTRIES[0]] as typeof ENTRIES)).toContain(
      'Now inactive: `figma`',
    );
  });

  it('目录为空时说明没有可用服务器', () => {
    const text = renderCatalogUpdate(ENTRIES, []);
    expect(text).toContain('(none)');
    expect(text).toContain('No MCP servers are available.');
  });

  it('entries 不变也渲染新的工作区提醒', () => {
    const text = renderCatalogUpdate(ENTRIES, ENTRIES, NOTICES);
    expect(text).toContain('The MCP server list changed.');
    expect(text).toContain("Workspace MCP 'serena'");
    expect(text).toContain('Do not delete it.');
  });
});

describe('catalogMessage', () => {
  it('构造冻结的 user 消息并记录目录与显式选择', () => {
    const message = catalogMessage('text', ENTRIES, { figma: true }, true);
    expect(message.role).toBe('user');
    expect(message.content).toEqual([{ type: 'text', text: 'text' }]);
    expect(message.source).toEqual({
      kind: 'better-mcp-catalog',
      form: 'catalog',
      update: true,
      entries: ENTRIES,
      overrides: { figma: true },
    });
    expect(Object.isFrozen(message.source)).toBe(true);
    expect(catalogMessage('t', [], {}, false).source).not.toHaveProperty('update');
  });

  it('记录随目录提交的工作区提醒并冻结其结构', () => {
    const message = catalogMessage('text', ENTRIES, { figma: true }, true, NOTICES);
    expect(message.source).toMatchObject({ notices: NOTICES });
    expect(Object.isFrozen((message.source as { notices: unknown[] }).notices)).toBe(true);
    expect(catalogMessage('text', ENTRIES, {}, false).source).not.toHaveProperty('notices');
  });

  it('sameEntries 比较完整目录', () => {
    expect(sameEntries(ENTRIES, [...ENTRIES])).toBe(true);
    expect(sameEntries(ENTRIES, [ENTRIES[0]] as typeof ENTRIES)).toBe(false);
  });
});
