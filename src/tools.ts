/**
 * 面向模型的唯一工具 `mcp_manage`：切换本会话中一台 MCP 服务器的可见性。
 * 导出 buildManageTool 与参数解析函数 parseManageArgs。
 */

import type { ServerManager } from './servers.ts';
import type { SettingsReader, ToolDefinition, ToolRunContext } from './types.ts';
import { isRecord } from './utils.ts';
import type { VisibilityRuntime } from './visibility.ts';

/** 一次 `mcp_manage` 的已校验参数。 */
export interface ManageArgs {
  /** 服务器名。 */
  server: string;
  /** 设为可见或不可见。 */
  command: 'active' | 'inactive';
}

/** `mcp_manage` 的返回值。 */
export interface ManageResult {
  /** 服务器名。 */
  server: string;
  /** 本会话的新可见性。 */
  active: boolean;
  /** 连接状态。 */
  state: string;
  /** 已连接时的工具数。 */
  toolCount?: number;
  /** 未连接时的原因。 */
  detail?: string;
}

/** 校验 `mcp_manage` 参数；不合法时抛错。 */
export function parseManageArgs(raw: unknown, available: readonly string[]): ManageArgs {
  const args = isRecord(raw) ? raw : {};
  const server = typeof args.server === 'string' ? args.server.trim() : '';
  if (!available.includes(server)) {
    throw new Error(
      `No MCP server named '${server}'. Available: ${available.join(', ') || '(none)'}`,
    );
  }
  if (args.command !== 'active' && args.command !== 'inactive') {
    throw new Error('command must be active or inactive.');
  }
  return { server, command: args.command };
}

/** 把返回值渲染为给模型的一行说明。 */
export function renderManageResult(result: ManageResult): string {
  const { server } = result;
  if (!result.active) return `${server} is now inactive. Do not call mcp__${server}__ tools.`;
  if (result.state === 'connected') {
    return `${server} is now active. Its ${result.toolCount ?? 0} tools are available as mcp__${server}__<tool> from the next step.`;
  }
  const reason = result.detail === undefined ? '' : `: ${result.detail}`;
  return `${server} is now active, but it is ${result.state}${reason}. Its tools appear once it connects.`;
}

/** 构造 `mcp_manage` 工具。 */
export function buildManageTool(
  manager: ServerManager,
  visibility: VisibilityRuntime,
  getSettings: SettingsReader,
): ToolDefinition {
  return {
    name: 'mcp_manage',
    description:
      "Show or hide one MCP server's tools in this session. Active servers expose their tools as mcp__<server>__<tool> from the next step; inactive servers' tools are removed. The session's MCP catalog lists the servers.",
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server name from the MCP catalog.' },
        command: {
          type: 'string',
          enum: ['active', 'inactive'],
          description: 'active shows the server tools; inactive hides them.',
        },
      },
      required: ['server', 'command'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args: unknown, value: unknown) => [
        { type: 'text', text: renderManageResult(value as unknown as ManageResult) },
      ],
    },
    async execute(args: unknown, exec: ToolRunContext) {
      const agent = exec.agent;
      if (agent === undefined) throw new Error('mcp_manage needs an agent session.');
      const parsed = parseManageArgs(args, Object.keys(getSettings().servers).sort());
      const active = parsed.command === 'active';
      visibility.setActive(agent, parsed.server, active);
      const status = manager.statusOf(parsed.server);
      const result: ManageResult = {
        server: parsed.server,
        active,
        state: status.state,
        ...(status.toolCount === undefined ? {} : { toolCount: status.toolCount }),
        ...(status.error === undefined ? {} : { detail: status.error }),
      };
      return result as never;
    },
  } as unknown as ToolDefinition;
}
