/**
 * 服务器生命周期：挂载、卸载、重连与面板快照。
 *
 * 挂载通过 `ctx.mcpManager.register()` 完成，连接、重连、工具发现与拆除仍由管理器负责。
 */
import { isDeepStrictEqual } from 'node:util';

import type { ServerDefinition } from './config.ts';
import { readGrant, writeGrant } from './credentials.ts';
import { refresh } from './oauth.ts';
import type {
  Context,
  McpManagedServerStatus,
  PluginConfig,
  PluginLogger,
  SettingsReader,
} from './types.ts';
import { isRecord } from './utils.ts';

/** 面板里的一台服务器。 */
export interface ServerRow extends StatusView {
  /** 服务器名。 */
  name: string;
  /** 是否由本插件配置。 */
  managed: boolean;
  /** 本插件服务器的简介。 */
  description?: string;
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
  /** 已脱敏的定义，只随面板快照返回。 */
  definition?: Record<string, unknown>;
}

/** 面板快照。 */
export interface PanelSnapshot {
  /** 服务器行。 */
  servers: ServerRow[];
}

/** 连接状态的结构化视图，由面板按字典格式化。 */
export interface StatusView {
  /** 状态名。 */
  state: string;
  /** 已连接时的工具数。 */
  toolCount?: number;
  /** 已连接时的时间戳。 */
  connectedAt?: number;
  /** 连接或重连次数。 */
  attempt?: number;
  /** 重连上限。 */
  maxAttempts?: number;
  /** 宿主返回的原始错误文本。 */
  error?: string;
  /** 清理异常。 */
  cleanup?: 'failed' | 'unconfirmed';
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
    const { description: _description, lazy: _lazy, auth, oauth: _oauth, ...rest } = definition;
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

  /** 重连一台服务器：卸载后重新挂载。 */
  async restart(serverName: string): Promise<void> {
    await this.unmount(serverName);
    await this.mount(serverName);
  }

  /** 挂载全部已配置的服务器；单台失败只记录告警。 */
  async mountAll(reason: string): Promise<void> {
    for (const serverName of Object.keys(this.getSettings().servers)) {
      await this.tryMount(serverName, reason);
    }
  }

  /** 挂载一台服务器；失败只记录告警。 */
  private async tryMount(serverName: string, reason: string): Promise<void> {
    try {
      await this.mount(serverName);
    } catch (error) {
      this.logger.warn(
        `better-mcp: could not mount '${serverName}' ${reason}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** 一台服务器当前的连接状态。 */
  statusOf(serverName: string): StatusView {
    const view = this.ctx.mcpManager.list().find((candidate) => candidate.name === serverName);
    return view === undefined ? { state: 'idle' } : statusOf(view.status);
  }

  /** 管理器当前管理的服务器名。 */
  listManagedNames(): string[] {
    return this.ctx.mcpManager.list().map((view) => view.name);
  }

  /** 构造面板快照。 */
  async snapshot(): Promise<PanelSnapshot> {
    const settings = this.getSettings();
    const managed = new Map(this.ctx.mcpManager.list().map((view) => [view.name, view]));
    const names = new Set([...Object.keys(settings.servers), ...managed.keys()]);
    const rows: ServerRow[] = [];
    for (const serverName of [...names].sort()) {
      const definition = settings.servers[serverName];
      const mine = definition !== undefined;
      const view = managed.get(serverName);
      const grant = mine ? await readGrant(this.ctx, serverName) : undefined;
      const lazy = mine ? definition.lazy !== false : false;
      const status = view === undefined ? { state: 'idle' } : statusOf(view.status);
      rows.push({
        name: serverName,
        managed: mine,
        ...(definition === undefined ? {} : { description: definition.description }),
        ...(definition === undefined ? {} : { definition: publicDefinition(definition) }),
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
    return { servers: rows };
  }

  /** 按新旧配置对账：卸载移除项，挂载新增项，重建变更项。只改简介或懒加载时保留连接。 */
  async reconcile(previous: Readonly<PluginConfig>, next: Readonly<PluginConfig>): Promise<void> {
    const names = new Set([...Object.keys(previous.servers), ...Object.keys(next.servers)]);
    for (const serverName of names) {
      const before = previous.servers[serverName];
      const after = next.servers[serverName];
      if (after === undefined) {
        await this.unmount(serverName);
        continue;
      }
      if (before !== undefined && isDeepStrictEqual(connectionOf(before), connectionOf(after))) {
        continue;
      }
      if (before !== undefined) await this.unmount(serverName);
      await this.tryMount(serverName, 'after a config change');
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

/** 定义中影响连接的部分：去掉简介与懒加载。 */
function connectionOf(definition: ServerDefinition): Record<string, unknown> {
  const { description: _description, lazy: _lazy, ...rest } = definition;
  return rest;
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
      return { state: 'connected', toolCount: status.toolCount, connectedAt: status.connectedAt };
    case 'connecting':
      return { state: 'connecting', ...(status.attempt > 0 ? { attempt: status.attempt } : {}) };
    case 'reconnecting':
      return {
        state: 'reconnecting',
        attempt: status.attempt,
        maxAttempts: status.maxAttempts,
        error: status.lastError,
      };
    case 'waiting-credentials':
      return { state: 'waiting-credentials', error: status.lastError };
    case 'failed':
      if (status.reason === 'cleanup') return { state: 'failed', cleanup: 'failed' };
      return {
        state: 'failed',
        error: typeof status.lastError === 'string' ? status.lastError : status.reason,
      };
    case 'disabled':
      return { state: 'disabled' };
    case 'closed':
      if (status.result.cleanupError !== undefined) {
        return { state: 'closed', cleanup: 'failed', error: status.result.cleanupError };
      }
      return status.result.closeConfirmed === false
        ? { state: 'closed', cleanup: 'unconfirmed' }
        : { state: 'closed' };
    default:
      return { state: String((status as { state?: string }).state) };
  }
}
