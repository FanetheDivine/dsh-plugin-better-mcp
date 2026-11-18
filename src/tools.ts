/**
 * 面向模型的两个工具：`mcp_servers` 查看状态，`mcp_call` 按需挂载并调用。
 * 导出 buildServerTool、buildCallTool 与参数解析函数。
 */

import type { PanelSnapshot, ServerManager } from './servers.ts';
import type { PluginLogger, SettingsReader, ToolDefinition, ToolRunContext } from './types.ts';
import { isRecord } from './utils.ts';

/** 一次 `mcp_call` 的已校验参数。 */
export interface CallArgs {
  /** 服务器名。 */
  server: string;
  /** 原始工具名。 */
  tool: string;
  /** 工具参数。 */
  arguments: Record<string, unknown>;
}

/** `mcp_call` 参数解析结果。 */
export type CallArgsResult = { ok: true; args: CallArgs } | { ok: false; error: string };

/** 校验 `mcp_call` 参数。 */
export function parseCallArgs(raw: unknown): CallArgsResult {
  if (!isRecord(raw)) return { ok: false, error: 'arguments must be an object' };
  const server = typeof raw.server === 'string' ? raw.server.trim() : '';
  const tool = typeof raw.tool === 'string' ? raw.tool.trim() : '';
  if (server === '') return { ok: false, error: 'server must not be empty' };
  if (tool === '') return { ok: false, error: 'tool must not be empty' };
  if (raw.arguments !== undefined && raw.arguments !== null && !isRecord(raw.arguments)) {
    return { ok: false, error: 'arguments must be an object' };
  }
  return {
    ok: true,
    args: { server, tool, arguments: isRecord(raw.arguments) ? raw.arguments : {} },
  };
}

/** 拼接内容中的文本块。 */
function textOf(content: ReadonlyArray<unknown>): string {
  return content
    .filter(
      (item): item is { type: 'text'; text: string } =>
        isRecord(item) && item.type === 'text' && typeof item.text === 'string',
    )
    .map((item) => item.text)
    .join('\n');
}

/** 构造 `mcp_servers` 工具。 */
export function buildServerTool(manager: ServerManager): ToolDefinition {
  return {
    name: 'mcp_servers',
    description:
      "List this profile's MCP servers with connection state, tool counts, lazy and authorization flags. Use it before mcp_call when a server may be lazy or need sign-in.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {},
      render: (_args, value) => {
        const snapshot = value as unknown as PanelSnapshot;
        const lines: string[] = [];
        for (const server of snapshot.servers) {
          const flags = [
            server.managed ? 'managed' : 'external',
            server.lazy ? 'lazy' : 'resident',
          ];
          if (server.auth === 'oauth') flags.push(server.authorized ? 'authorized' : 'needs-auth');
          const detail =
            server.state === 'connected'
              ? `${server.toolCount ?? 0} tool(s)`
              : (server.detail ?? '');
          lines.push(
            `${server.name} — ${server.state}${detail === '' ? '' : ` (${detail})`} [${flags.join(', ')}]`,
          );
        }
        if (snapshot.servers.length === 0) lines.push('(no MCP servers)');
        lines.push('', 'Aggregate endpoint:');
        for (const group of snapshot.expose.groups) lines.push(`  ${group.url} — ${group.title}`);
        return [{ type: 'text', text: lines.join('\n') }];
      },
    },
    async execute() {
      return manager.snapshot(false);
    },
  };
}

/** 构造 `mcp_call` 工具。 */
export function buildCallTool(
  manager: ServerManager,
  getSettings: SettingsReader,
  logger: PluginLogger,
): ToolDefinition {
  return {
    name: 'mcp_call',
    description:
      "Call one tool on an MCP server by name, mounting a lazy server on first use. Prefer the server's native mcp__<server>__<tool> tool when it is already connected; use this when the server is lazy, or to reach a server that is not currently mounted.",
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server name. mcp_servers lists them.' },
        tool: {
          type: 'string',
          description: 'Raw tool name on that server, without the mcp__<server>__ prefix.',
        },
        arguments: {
          type: 'object',
          description: 'Tool arguments as a JSON object. Defaults to an empty object.',
          additionalProperties: true,
        },
      },
      required: ['server', 'tool'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args, value) => {
        const outcome = value as unknown as {
          server: string;
          tool: string;
          isError: boolean;
          content: ReadonlyArray<unknown>;
        };
        return [
          {
            type: 'text',
            text: `${outcome.server}.${outcome.tool}: ${outcome.isError ? 'error' : 'ok'}\n${textOf(outcome.content)}`,
          },
        ];
      },
    },
    async execute(args: unknown, exec: ToolRunContext) {
      const parsed = parseCallArgs(args);
      if (!parsed.ok) throw new Error(parsed.error);
      const { server: serverName, tool, arguments: callArguments } = parsed.args;
      const settings = getSettings();
      if (settings.servers[serverName] === undefined) {
        const managed = manager.listManagedNames();
        throw new Error(
          `No configured MCP server named '${serverName}'. Configured: ${
            Object.keys(settings.servers).join(', ') || '(none)'
          }; managed: ${managed.join(', ') || '(none)'}`,
        );
      }
      await manager.mount(serverName);
      await manager.waitConnected(serverName, exec.signal);
      const publicName = manager.publicToolName(serverName, tool);
      logger.info(`better-mcp: calling '${publicName}'`);
      const outcome = await manager.execute(publicName, callArguments, exec.signal);
      return {
        server: serverName,
        tool,
        isError: outcome.isError,
        content: outcome.content,
      };
    },
  };
}
