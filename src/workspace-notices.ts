/** 工作区生命周期提醒：结构化记录与 system-reminder 消息。 */
import { randomUUID } from 'node:crypto';

import type { UserMessage } from './types.ts';

/** 工作区提醒来源标识。 */
export const WORKSPACE_NOTICE_SOURCE = 'better-mcp-workspace';

/** 可供后续 CatalogSource 持久化扩展的工作区提醒。 */
export interface WorkspaceNotice {
  readonly id: number;
  readonly kind: 'active' | 'inactive' | 'workspace-cleanup' | 'workspace-missing';
  readonly serverName: string;
  readonly workspace: string;
  readonly state: 'connected' | 'retained' | 'closed' | 'failed' | 'cleanup-unknown';
  readonly detail?: string;
}

/** 工作区提醒消息来源。 */
export interface WorkspaceNoticeSource {
  readonly kind: typeof WORKSPACE_NOTICE_SOURCE;
  readonly form: 'workspace-notice';
  readonly notice: WorkspaceNotice;
}

/** 创建 active 删除警告。 */
export function createActiveWorkspaceNotice(
  serverName: string,
  workspace: string,
  id: number,
): WorkspaceNotice {
  return {
    id,
    kind: 'active',
    serverName,
    workspace,
    state: 'connected',
    detail:
      'On Windows, the running MCP process uses this workspace as its cwd and occupies the folder. ' +
      `Set '${serverName}' inactive before deleting the folder. ` +
      'Other active Agents sharing this workspace also occupy the folder.',
  };
}

/** 将结构化提醒渲染为 system-reminder。 */
export function renderWorkspaceNotice(notice: WorkspaceNotice): string {
  const detail = notice.detail === undefined ? '' : `\n${notice.detail}`;
  return `<system-reminder>\nWorkspace MCP '${notice.serverName}' at '${notice.workspace}' is ${notice.state}.${detail}\n</system-reminder>`;
}

/** 构造经 agent.inject() 写入下一步的提醒消息。 */
export function workspaceNoticeMessage(notice: WorkspaceNotice): UserMessage {
  const source: WorkspaceNoticeSource = {
    kind: WORKSPACE_NOTICE_SOURCE,
    form: 'workspace-notice',
    notice,
  };
  return {
    id: randomUUID(),
    role: 'user',
    source,
    content: [{ type: 'text', text: renderWorkspaceNotice(notice) }],
  } as unknown as UserMessage;
}
