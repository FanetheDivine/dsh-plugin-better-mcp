/**
 * 服务器生命周期：按需挂载、卸载、重连、连接等待与面板快照。
 *
 * 挂载通过 `ctx.mcpManager.register()` 完成，连接、重连、工具发现与拆除仍由管理器负责。
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { CONNECT_TIMEOUT_MS } from './constants.ts';
import { readGrant, writeGrant } from './credentials.ts';
import { refresh } from './oauth.ts';
import { readState } from './state.ts';
import type {
  Context,
  McpManagedServerStatus,
  PluginConfig,
  PluginLogger,
  SettingsReader,
  ToolSchemaView,
} from './types.ts';
import { isRecord } from './utils.ts';

/** 面板里的一台服务器。 */
export interface ServerRow {
  /** 服务器名。 */
  name: string;
  /** 是否由本插件配置。 */
  managed: boolean;
  /** 传输方式。 */
  transport?: string;
  /** 端点地址。 */
  url?: string;
  /** 认证方式。 */
  auth?: string;
  /** 是否懒加载。 */
  lazy: boolean;
  /** 是否已有授权。 */
  authorized: boolean;
  /** 是否已由本插件挂载。 */
  mounted: boolean;
  /** 运行时状态。 */
  state: string;
  /** 状态说明。 */
  detail?: string;
  /** 已连接时的工具数。 */
  toolCount?: number;
  /** 已脱敏的定义，只随面板快照返回。 */
  definition?: Record<string, unknown>;
}

/** 一个聚合端点组。 */
export interface GroupView {
  /** 组名。 */
  name: string;
  /** 显示标题。 */
  title: string;
  /** 组地址。 */
  url: string;
  /** 包含通配符。 */
  include: string[];
  /** 排除通配符。 */
  exclude: string[];
}

/** 面板快照。 */
export interface PanelSnapshot {
  /** 服务器行。 */
  servers: ServerRow[];
  /** 聚合端点。 */
  expose: {
    /** 是否启用。 */
    enabled: boolean;
    /** 端点前缀。 */
    endpoint: string;
    /** 组视图。 */
    groups: GroupView[];
  };
}

/** 带令牌的完整快照，只用于同源面板路由。 */
export interface PanelSnapshotWithToken extends PanelSnapshot {
  /** 聚合端点信息与令牌。 */
  expose: PanelSnapshot['expose'] & { token: string };
}

/** 一次工具调用的结果。 */
export interface ToolOutcome {
  /** 内容块。 */
  content: ReadonlyArray<unknown>;
  /** 是否被工具标记为错误。 */
  isError: boolean;
}

/** 连接状态压缩视图。 */
export interface StatusView {
  /** 状态名。 */
  state: string;
  /** 说明文本。 */
  detail?: string;
  /** 工具数。 */
  toolCount?: number;
}

/** 服务器管理。 */
export class ServerManager {
  /** 服务器名到当前挂载 disposer。 */
  private readonly mounts = new Map<string, () => void>();
  /** 每台服务器的挂载/卸载串行链。 */
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly ctx: Context,
    private readonly getSettings: SettingsReader,
    private readonly logger: PluginLogger,
  ) {}

  /** 串行执行一台服务器的操作。 */
  private serialized(serverName: string, operation: () => Promise<unknown>): Promise<unknown> {
    const previous = this.chains.get(serverName) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.chains.set(
      serverName,
      next.catch(() => undefined),
    );
    return next;
  }

  /** 服务器当前的懒加载值：运行时状态优先，配置默认兜底。 */
  async isLazy(
    serverName: string,
    definition = this.getSettings().servers[serverName],
  ): Promise<boolean> {
    const state = await readState();
    const stored = state.lazy[serverName];
    if (typeof stored === 'boolean') return stored;
    return definition?.lazy !== false;
  }

  /** 读取可用访问令牌，临近过期时刷新。 */
  async accessTokenOf(serverName: string): Promise<string | undefined> {
    const grant = await readGrant(this.ctx, serverName);
    if (grant === undefined) return undefined;
    const expiresAt = typeof grant.expiresAt === 'number' ? grant.expiresAt : undefined;
    if (expiresAt === undefined || expiresAt > Date.now() + 30_000) return grant.accessToken;
    const refreshToken = grant.refreshToken;
    if (refreshToken === undefined || refreshToken === '') return grant.accessToken;
    try {
      const refreshed = await refresh({
        tokenEndpoint: grant.tokenEndpoint ?? '',
        clientId: grant.clientId ?? '',
        ...(grant.clientSecret === undefined ? {} : { clientSecret: grant.clientSecret }),
        refreshToken,
        ...(grant.resource === undefined ? {} : { resource: grant.resource }),
        ...(grant.authorization === undefined ? {} : { authorization: grant.authorization }),
      });
      const next = {
        ...grant,
        accessToken: refreshed.accessToken,
        ...(refreshed.refreshToken === undefined ? {} : { refreshToken: refreshed.refreshToken }),
        ...(refreshed.expiresAt === undefined ? {} : { expiresAt: refreshed.expiresAt }),
      };
      await writeGrant(this.ctx, serverName, next);
      return next.accessToken;
    } catch (error) {
      this.logger.warn(
        `better-mcp: refresh for '${serverName}' failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return grant.accessToken;
    }
  }

  /** 构造交给管理器的条目。 */
  private async entryOf(serverName: string): Promise<Record<string, unknown>> {
    const definition = this.getSettings().servers[serverName];
    if (definition === undefined) {
      throw new Error(`No configured MCP server named '${serverName}'.`);
    }
    const { lazy: _lazy, auth, oauth: _oauth, ...rest } = definition;
    const entry: Record<string, unknown> = { ...rest };
    if (auth === 'oauth' || auth === undefined) {
      const token = await this.accessTokenOf(serverName);
      if (token !== undefined) {
        const headers = isRecord(entry.headers) ? { ...entry.headers } : {};
        if (headers.Authorization === undefined && headers.authorization === undefined) {
          headers.Authorization = `Bearer ${token}`;
        }
        entry.headers = headers;
      } else if (auth === 'oauth') {
        throw new Error(
          `MCP server '${serverName}' needs authorization. Open the MCP panel and sign in.`,
        );
      }
    }
    return entry;
  }

  /** 挂载一台服务器；已挂载时跳过。 */
  async mount(serverName: string): Promise<void> {
    await this.serialized(serverName, async () => {
      if (this.mounts.has(serverName)) return;
      if (this.getSettings().servers[serverName] === undefined) {
        throw new Error(`No configured MCP server named '${serverName}'.`);
      }
      const entry = await this.entryOf(serverName);
      const dispose = this.ctx.mcpManager.register(
        serverName,
        entry as unknown as Parameters<Context['mcpManager']['register']>[1],
      );
      this.mounts.set(serverName, dispose);
      this.logger.info(`better-mcp: mounted '${serverName}'`);
    });
  }

  /** 卸载一台本插件挂载的服务器。 */
  async unmount(serverName: string): Promise<void> {
    await this.serialized(serverName, async () => {
      const dispose = this.mounts.get(serverName);
      if (dispose === undefined) return;
      this.mounts.delete(serverName);
      try {
        dispose();
      } catch (error) {
        this.logger.warn(
          `better-mcp: unmounting '${serverName}' failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.logger.info(`better-mcp: unmounted '${serverName}'`);
    });
  }

  /** 重连一台服务器。 */
  async restart(serverName: string): Promise<void> {
    await this.unmount(serverName);
    if (!(await this.isLazy(serverName))) await this.mount(serverName);
  }

  /** 等待一台已挂载服务器进入已连接状态。 */
  async waitConnected(serverName: string, signal?: AbortSignal): Promise<{ toolCount: number }> {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted === true) throw new Error('cancelled');
      const view = this.ctx.mcpManager.list().find((candidate) => candidate.name === serverName);
      const status = view?.status;
      if (status?.state === 'connected') return { toolCount: status.toolCount };
      if (status?.state === 'failed') {
        throw new Error(
          `MCP server '${serverName}' failed: ${statusDetail(status) || String(status.reason)}`,
        );
      }
      if (status?.state === 'waiting-credentials') {
        throw new Error(
          `MCP server '${serverName}' is waiting for credentials: ${status.lastError}`,
        );
      }
      if (status?.state === 'reconnecting' && /401|unauthorized/i.test(status.lastError ?? '')) {
        throw new Error(
          `MCP server '${serverName}' rejected the token (401). Open the MCP panel and sign in.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for MCP server '${serverName}' to connect.`);
  }

  /** 管理器当前管理的服务器名。 */
  listManagedNames(): string[] {
    return this.ctx.mcpManager.list().map((view) => view.name);
  }

  /** 把服务器发布的工具名解析为注册名。 */
  publicToolName(serverName: string, rawName: string): string {
    const prefix = `mcp__${serverName}__`;
    const schemas = this.ctx.tools.schemas() as unknown as ReadonlyArray<ToolSchemaView>;
    const candidates = schemas
      .map((schema) => schema.name)
      .filter((name) => name.startsWith(prefix));
    if (candidates.includes(`${prefix}${rawName}`)) return `${prefix}${rawName}`;
    const normalized = candidates.find(
      (name) => name.slice(prefix.length).replace(/_[0-9a-f]{12}$/, '') === rawName,
    );
    if (normalized !== undefined) return normalized;
    const available = candidates.map((name) => name.slice(prefix.length)).join(', ') || '(none)';
    throw new Error(
      `Server '${serverName}' has no tool named '${rawName}'. Available: ${available}`,
    );
  }

  /** 执行一个注册工具并返回规范化结果。 */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<ToolOutcome> {
    const batch = await this.ctx.tools.execute({
      calls: [
        {
          type: 'tool-call',
          id: `better-mcp-${randomUUID()}`,
          name: toolName,
          arguments: JSON.stringify(args ?? {}),
        },
      ] as never,
      signal,
    });
    const result = batch.results[0]?.result;
    if (result === undefined) throw new Error(`Tool '${toolName}' produced no result.`);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content, isError: false };
  }

  /** 构造面板快照。 */
  async snapshot(includeToken: false): Promise<PanelSnapshot>;
  async snapshot(includeToken: true, token: () => Promise<string>): Promise<PanelSnapshotWithToken>;
  async snapshot(
    includeToken: boolean,
    token?: () => Promise<string>,
  ): Promise<PanelSnapshot | PanelSnapshotWithToken> {
    const settings = this.getSettings();
    const state = await readState();
    const managed = new Map(this.ctx.mcpManager.list().map((view) => [view.name, view]));
    const names = new Set([...Object.keys(settings.servers), ...managed.keys()]);
    const rows: ServerRow[] = [];
    for (const serverName of [...names].sort()) {
      const definition = settings.servers[serverName];
      const mine = definition !== undefined;
      const view = managed.get(serverName);
      const grant = mine ? await readGrant(this.ctx, serverName) : undefined;
      const lazy = mine
        ? typeof state.lazy[serverName] === 'boolean'
          ? state.lazy[serverName]
          : definition.lazy !== false
        : false;
      const status = view === undefined ? { state: 'idle' } : statusOf(view.status);
      rows.push({
        name: serverName,
        managed: mine,
        ...(includeToken && definition !== undefined
          ? { definition: publicDefinition(definition) }
          : {}),
        ...(typeof definition?.transport === 'string' ? { transport: definition.transport } : {}),
        ...(typeof definition?.url === 'string' ? { url: definition.url } : {}),
        ...(typeof definition?.auth === 'string'
          ? { auth: definition.auth }
          : mine
            ? { auth: 'oauth' }
            : {}),
        lazy,
        authorized: grant !== undefined,
        mounted: this.mounts.has(serverName),
        ...status,
      });
    }
    const expose = {
      enabled: settings.expose.enabled,
      endpoint: settings.expose.endpoint,
      groups: Object.entries(settings.expose.groups).map(([groupName, group]) => ({
        name: groupName,
        title: group.title ?? groupName,
        url: `${settings.expose.endpoint}/${groupName}`,
        include: group.include,
        exclude: group.exclude,
      })),
    };
    if (includeToken && token !== undefined) {
      return { servers: rows, expose: { ...expose, token: await token() } };
    }
    return { servers: rows, expose };
  }

  /** 按新旧配置对账：卸载移除项，挂载新增项，重建变更项。 */
  async reconcile(previous: Readonly<PluginConfig>, next: Readonly<PluginConfig>): Promise<void> {
    const names = new Set([...Object.keys(previous.servers), ...Object.keys(next.servers)]);
    for (const serverName of names) {
      const before = previous.servers[serverName];
      const after = next.servers[serverName];
      if (after === undefined) {
        await this.unmount(serverName);
        continue;
      }
      if (before !== undefined && isDeepStrictEqual(before, after)) continue;
      if (before !== undefined) await this.unmount(serverName);
      if (await this.isLazy(serverName, after)) continue;
      try {
        await this.mount(serverName);
      } catch (error) {
        this.logger.warn(
          `better-mcp: could not mount '${serverName}' after a config change: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** 释放全部挂载。 */
  dispose(): void {
    for (const dispose of this.mounts.values()) {
      try {
        dispose();
      } catch {
        // 卸载失败只记录，插件仍继续释放其它服务器。
      }
    }
    this.mounts.clear();
    this.chains.clear();
  }
}

/** 去掉定义中的客户端密钥，供面板回填表单。 */
function publicDefinition(
  definition: NonNullable<PluginConfig['servers'][string]>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...definition };
  if (isRecord(copy.oauth)) {
    const { clientSecret: _secret, ...oauth } = copy.oauth;
    copy.oauth = oauth;
  }
  return copy;
}

/** 把管理器状态压缩为面板视图。 */
export function statusOf(status: McpManagedServerStatus | undefined): StatusView {
  if (status === undefined) return { state: 'idle' };
  switch (status.state) {
    case 'connected':
      return {
        state: 'connected',
        toolCount: status.toolCount,
        detail: `connected at ${new Date(status.connectedAt).toISOString()}`,
      };
    case 'connecting':
      return {
        state: 'connecting',
        ...(status.attempt > 0 ? { detail: `attempt ${status.attempt}` } : {}),
      };
    case 'reconnecting':
      return {
        state: 'reconnecting',
        detail: `${status.attempt}/${status.maxAttempts} · ${status.lastError}`,
      };
    case 'waiting-credentials':
      return { state: 'waiting-credentials', detail: status.lastError };
    case 'failed':
      return {
        state: 'failed',
        detail:
          status.reason === 'cleanup'
            ? 'cleanup did not finish'
            : typeof status.lastError === 'string'
              ? status.lastError
              : status.reason,
      };
    case 'disabled':
      return { state: 'disabled' };
    case 'closed': {
      const detail =
        status.result.cleanupError ??
        (status.result.closeConfirmed === false ? 'close unconfirmed' : undefined);
      return detail === undefined ? { state: 'closed' } : { state: 'closed', detail };
    }
    default:
      return { state: String((status as { state?: string }).state) };
  }
}

/** 失败状态的说明文本。 */
function statusDetail(status: McpManagedServerStatus): string | undefined {
  return statusOf(status).detail;
}
