/** 工作区生命周期提醒：结构化记录与 system-reminder 消息。 */
import { randomUUID } from 'node:crypto';

import type { UserMessage } from './types.ts';
import type { WorkspaceCleanupResult } from './workspace-pool.ts';

/** 工作区提醒来源标识。 */
export const WORKSPACE_NOTICE_SOURCE = 'better-mcp-workspace';

/** 可供后续 CatalogSource 持久化扩展的工作区提醒。 */
export interface WorkspaceNotice {
  readonly id: number;
  readonly kind: 'active' | 'inactive' | 'workspace-cleanup' | 'workspace-missing';
  readonly serverName: string;
  readonly workspace: string;
  readonly state: 'active' | 'connected' | 'retained' | 'closed' | 'failed' | 'cleanup-unknown';
  readonly detail?: string;
}

/** 由 VisibilityRuntime 分配 id 的提醒草稿。 */
export type WorkspaceNoticeDraft = Omit<WorkspaceNotice, 'id'>;

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
    state: 'active',
    detail:
      'When this MCP server runs on Windows, its process uses this workspace as its cwd and can occupy the folder. ' +
      `Set '${serverName}' inactive before deleting the folder. ` +
      'Other active Agents sharing this workspace may also occupy the folder.',
  };
}

/** 创建目录切换或缺失时的清理提醒，供 bindings 排队。 */
export function createWorkspaceCleanupNotice(
  result: WorkspaceCleanupResult,
  kind: 'workspace-cleanup' | 'workspace-missing' = 'workspace-cleanup',
): WorkspaceNoticeDraft {
  return {
    kind,
    serverName: result.serverName,
    workspace: result.workspace,
    state: result.state === 'idle' ? 'closed' : result.state,
    detail: workspaceCleanupDetail(result, true),
  };
}

/**
 * 清理结果说明，供切换与缺失提醒以及 inactive 工具结果复用。
 * 关闭结果只说明插件直接子进程，不担保其他进程已经释放目录。
 */
export function workspaceCleanupDetail(result: WorkspaceCleanupResult, binding = false): string {
  if (result.state === 'retained') {
    if (binding) {
      return (
        'Other Agents remain bound to this workspace, so its MCP instance still occupies the folder. ' +
        'Do not delete the folder until those bindings are released and cleanup is confirmed.'
      );
    }
    return (
      'The current Agent is inactive and its tools are hidden, but other active Agents still occupy this folder. ' +
      'Do not delete the folder until every sharing Agent is inactive and cleanup is confirmed.'
    );
  }
  if (result.state === 'failed') {
    return `MCP cleanup failed: ${result.error ?? 'unknown error'}. Do not delete the folder; this result is not deletion permission.`;
  }
  if (result.state === 'cleanup-unknown') {
    return `MCP cleanup did not confirm process closure: ${result.error ?? 'confirmation is still pending'}. Do not delete the folder; this result is not deletion permission.`;
  }
  return (
    "The plugin-owned MCP server's direct stdio child process has closed. " +
    'The folder can now be deleted if no other processes occupy it.'
  );
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
