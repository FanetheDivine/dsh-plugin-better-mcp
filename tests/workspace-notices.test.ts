// 工作区提醒：active 删除警告与可供后续持久化的数据结构。
import { describe, expect, it } from 'vitest';

import {
  createActiveWorkspaceNotice,
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
      state: 'connected',
    });

    const text = renderWorkspaceNotice(notice);
    expect(text).toContain('<system-reminder>');
    expect(text).toContain('D:/Git/Project One');
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
