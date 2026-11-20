// 工作区提醒：active 删除警告与可供后续持久化的数据结构。
import { describe, expect, it } from 'vitest';

import {
  createActiveWorkspaceNotice,
  createInactiveWorkspaceNotice,
  createWorkspaceCleanupNotice,
  renderWorkspaceNotice,
  workspaceNoticeMessage,
} from '../src/workspace-notices.ts';

describe('active 工作区提醒', () => {
  it('保留结构化身份并说明 Windows cwd 与共享 active 占用', () => {
    const notice = createActiveWorkspaceNotice('serena', 'D:/Git/Project One', 7);
    expect(notice).toMatchObject({
      id: 7,
      kind: 'active',
      serverName: 'serena',
      workspace: 'D:/Git/Project One',
      state: 'active',
    });

    const text = renderWorkspaceNotice(notice);
    expect(text).toContain('<system-reminder>');
    expect(text).toContain('D:/Git/Project One');
    expect(text).toContain('is active');
    expect(text).not.toContain('is connected');
    expect(text).not.toMatch(/the running MCP process/i);
    expect(text).toMatch(/Windows.*cwd/is);
    expect(text).toMatch(/inactive.*before deleting/is);
    expect(text).toMatch(/other active Agents.*occupy/is);

    const message = workspaceNoticeMessage(notice);
    expect(message.source).toMatchObject({
      kind: 'better-mcp-workspace',
      form: 'workspace-notice',
      notice,
    });
    expect(JSON.stringify(message.content)).toContain('<system-reminder>');
  });
});

describe('inactive 与清理提醒', () => {
  it('共享占用明确说明当前 Agent 已隐藏且其他 active Agent 仍占用', () => {
    const notice = createInactiveWorkspaceNotice({
      serverName: 'serena',
      workspace: 'D:/Git/Shared',
      state: 'retained',
    });
    expect(notice).toMatchObject({ kind: 'inactive', state: 'retained' });
    const text = renderWorkspaceNotice({ ...notice, id: 1 });
    expect(text).toMatch(/current Agent.*inactive/is);
    expect(text).toMatch(/other active Agents.*still occupy/is);
    expect(text).toMatch(/Do not delete/i);
  });

  it('关闭成功只授予插件直接子进程层面的删除许可', () => {
    const notice = createInactiveWorkspaceNotice({
      serverName: 'serena',
      workspace: 'D:/Git/Closed',
      state: 'closed',
    });
    const text = renderWorkspaceNotice({ ...notice, id: 2 });
    expect(text).toMatch(/direct stdio child process.*closed/is);
    expect(text).toMatch(/can now be deleted/i);
    expect(text).toMatch(/other processes.*occupy/is);
  });

  it.each(['failed', 'cleanup-unknown'] as const)('%s 明确禁止把结果当作删除许可', (state) => {
    const notice = createWorkspaceCleanupNotice({
      serverName: 'serena',
      workspace: 'D:/Git/Failed',
      state,
      error: 'cleanup exploded',
    });
    expect(notice.kind).toBe('workspace-cleanup');
    const text = renderWorkspaceNotice({ ...notice, id: 3 });
    expect(text).toContain('cleanup exploded');
    expect(text).toMatch(/Do not delete/i);
    expect(text).toMatch(/not confirm|failed/i);
  });

  it('目录缺失复用结构化清理结果', () => {
    expect(
      createWorkspaceCleanupNotice(
        { serverName: 'serena', workspace: 'D:/Git/Missing', state: 'closed' },
        'workspace-missing',
      ),
    ).toMatchObject({ kind: 'workspace-missing', state: 'closed' });
  });
});
