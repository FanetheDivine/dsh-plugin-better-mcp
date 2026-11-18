/**
 * 会话可见性：每个 Agent 对本插件服务器的 active / inactive 选择，以及据此维护的工具限制。
 * 导出 VisibilityRuntime、CatalogEntry、CatalogSource、CatalogState 与工具名归属函数。
 */
import { CATALOG_SOURCE, MCP_TOOL_PREFIX } from './constants.ts';
import type {
  Agent,
  Context,
  PluginLogger,
  ProjectionDefinition,
  ProjectionHandle,
  SessionEvent,
  SettingsReader,
} from './types.ts';
import { isRecord } from './utils.ts';

/** 目录中的一台服务器。 */
export interface CatalogEntry {
  /** 服务器名。 */
  readonly name: string;
  /** 简介。 */
  readonly description: string;
  /** 在本会话是否可见。 */
  readonly active: boolean;
}

/** 目录消息的来源记录。 */
export interface CatalogSource {
  /** 来源标识。 */
  readonly kind: typeof CATALOG_SOURCE;
  /** 宿主上下文形态。 */
  readonly form: 'catalog';
  /** 更新消息为 true。 */
  readonly update?: true;
  /** 完整目录，按名称排序。 */
  readonly entries: readonly CatalogEntry[];
  /** 写入时本会话的显式选择。 */
  readonly overrides: Readonly<Record<string, boolean>>;
}

/** 会话投影：最近一条目录消息。 */
export interface CatalogState {
  /** 消息所在 seq；没有时为 null。 */
  readonly seq: number | null;
  /** 消息记录的目录。 */
  readonly entries: readonly CatalogEntry[];
  /** 消息记录的显式选择。 */
  readonly overrides: Readonly<Record<string, boolean>>;
}

/** 空投影状态。 */
const EMPTY_STATE: CatalogState = Object.freeze({
  seq: null,
  entries: Object.freeze([]),
  overrides: Object.freeze({}),
});

/** 读取一份目录条目数组；格式不符时返回 undefined。 */
function readEntries(value: unknown): CatalogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: CatalogEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const { name, description, active } = item;
    if (typeof name !== 'string' || typeof description !== 'string') return undefined;
    if (typeof active !== 'boolean') return undefined;
    entries.push({ name, description, active });
  }
  return entries;
}

/** 读取显式选择；格式不符的项忽略。 */
function readOverrides(value: unknown): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  if (!isRecord(value)) return overrides;
  for (const [name, active] of Object.entries(value)) {
    if (typeof active === 'boolean') overrides[name] = active;
  }
  return overrides;
}

/** 校验持久化的投影状态。 */
export function parseCatalogState(value: unknown): CatalogState {
  if (!isRecord(value)) throw new Error('better-mcp catalog state must be an object');
  const seq = value.seq;
  if (seq !== null && (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0)) {
    throw new Error('better-mcp catalog state seq must be a non-negative integer or null');
  }
  const entries = readEntries(value.entries);
  if (entries === undefined) throw new Error('better-mcp catalog state entries are invalid');
  return { seq, entries, overrides: readOverrides(value.overrides) };
}

/** 折叠一条会话事件：只关心本插件的目录消息。 */
export function applyCatalogEvent(state: CatalogState, event: SessionEvent): CatalogState {
  if (event.type !== 'user/message') return state;
  const source = (event.data as { source?: unknown }).source;
  if (!isRecord(source) || source.kind !== CATALOG_SOURCE) return state;
  const entries = readEntries(source.entries);
  if (entries === undefined) return state;
  return { seq: event.seq, entries, overrides: readOverrides(source.overrides) };
}

/** 目录投影定义：宿主私有，不进入客户端快照。 */
export const catalogProjection = {
  key: CATALOG_SOURCE,
  stateSchema: { parse: parseCatalogState } as unknown as ProjectionDefinition<
    typeof CATALOG_SOURCE,
    CatalogState
  >['stateSchema'],
  stateVersion: 1,
  init: () => EMPTY_STATE,
  apply: applyCatalogEvent,
} satisfies Omit<ProjectionDefinition<typeof CATALOG_SOURCE, CatalogState>, 'wire'>;

/**
 * 工具名归属的服务器：取能匹配 `mcp__<server>__` 前缀的最长服务器名。
 * @param toolName - 宿主注册的工具名。
 * @param serverNames - 本插件配置的服务器名。
 * @returns 服务器名；不属于任何服务器时为 undefined。
 */
export function serverOfTool(toolName: string, serverNames: readonly string[]): string | undefined {
  let match: string | undefined;
  for (const serverName of serverNames) {
    if (!toolName.startsWith(`${MCP_TOOL_PREFIX}${serverName}__`)) continue;
    if (match === undefined || serverName.length > match.length) match = serverName;
  }
  return match;
}

/** 一个 Agent 当前生效的工具限制。 */
interface Restriction {
  /** deny 列表的规范键。 */
  readonly key: string;
  /** 解除限制。 */
  readonly dispose: (() => void) | undefined;
}

/** 按会话维护服务器可见性与工具限制。 */
export class VisibilityRuntime {
  /** 每个 Agent 尚未落入目录消息的显式选择。 */
  private readonly pending = new WeakMap<Agent, Record<string, boolean>>();
  /** 每个 Agent 当前的工具限制。 */
  private readonly restrictions = new Map<Agent, Restriction>();
  /** 目录投影句柄。 */
  private projection: ProjectionHandle<CatalogState> | undefined;
  /** 已排队的全量同步。 */
  private syncQueued = false;
  /** 已释放。 */
  private disposed = false;

  constructor(
    private readonly ctx: Context,
    private readonly getSettings: SettingsReader,
    private readonly logger: PluginLogger,
  ) {}

  /** 注册目录投影。 */
  async start(): Promise<void> {
    this.projection = await this.ctx.sessionProjections.register(catalogProjection);
  }

  /** 读取 Agent 会话的目录投影；读取失败时返回空状态。 */
  catalogState(agent: Agent): CatalogState {
    if (this.projection === undefined) return EMPTY_STATE;
    try {
      return this.projection.stateOf(agent.session);
    } catch (error) {
      this.logger.warn(`better-mcp: could not read the MCP catalog state: ${String(error)}`);
      return EMPTY_STATE;
    }
  }

  /** 本会话的显式选择：投影记录与待定选择合并，只保留已配置的服务器。 */
  overridesOf(agent: Agent): Record<string, boolean> {
    const servers = this.getSettings().servers;
    const recorded = this.catalogState(agent).overrides;
    const pending = this.pending.get(agent);
    if (pending !== undefined) {
      for (const [name, active] of Object.entries(pending)) {
        if (recorded[name] === active) delete pending[name];
      }
    }
    const merged: Record<string, boolean> = {};
    for (const [name, active] of Object.entries({ ...recorded, ...pending })) {
      if (servers[name] !== undefined) merged[name] = active;
    }
    return merged;
  }

  /** 一台服务器在本会话是否可见。 */
  isActive(agent: Agent, serverName: string): boolean {
    const definition = this.getSettings().servers[serverName];
    if (definition === undefined) return false;
    return this.overridesOf(agent)[serverName] ?? definition.lazy === false;
  }

  /** 本会话的完整目录，按名称排序。 */
  entriesOf(agent: Agent): CatalogEntry[] {
    const servers = this.getSettings().servers;
    const overrides = this.overridesOf(agent);
    return Object.keys(servers)
      .sort()
      .map((name) => {
        const definition = servers[name];
        return {
          name,
          description: definition?.description ?? '',
          active: overrides[name] ?? definition?.lazy === false,
        };
      });
  }

  /** 记录一次显式选择并立即更新工具限制。 */
  setActive(agent: Agent, serverName: string, active: boolean): void {
    const pending = this.pending.get(agent) ?? {};
    pending[serverName] = active;
    this.pending.set(agent, pending);
    this.sync(agent);
  }

  /** 按当前可见性重算一个 Agent 的工具限制。 */
  sync(agent: Agent): void {
    if (this.disposed) return;
    const serverNames = Object.keys(this.getSettings().servers);
    const hidden = new Set(serverNames.filter((name) => !this.isActive(agent, name)));
    const deny = this.ctx.tools
      .schemas()
      .map((schema) => schema.name)
      .filter((name) => {
        const owner = serverOfTool(name, serverNames);
        return owner !== undefined && hidden.has(owner);
      })
      .sort();
    const key = deny.join('\n');
    const current = this.restrictions.get(agent);
    if (current?.key === key) return;
    // 先登记新键：restrict 触发的 tools/change 不会再次进入这里。
    this.restrictions.set(agent, { key, dispose: undefined });
    release(current?.dispose);
    if (deny.length === 0) return;
    try {
      const dispose = agent.ctx.tools.restrict({ deny });
      this.restrictions.set(agent, { key, dispose });
    } catch (error) {
      this.restrictions.delete(agent);
      this.logger.warn(`better-mcp: could not restrict MCP tools: ${String(error)}`);
    }
  }

  /** 重算全部在线 Agent 的工具限制。 */
  syncAll(): void {
    if (this.disposed) return;
    const live = new Set(this.ctx.agents.list());
    for (const [agent, restriction] of this.restrictions) {
      if (live.has(agent)) continue;
      this.restrictions.delete(agent);
      release(restriction.dispose);
    }
    for (const agent of live) this.sync(agent);
  }

  /** 在下一个微任务合并执行一次全量同步。 */
  scheduleSyncAll(): void {
    if (this.syncQueued || this.disposed) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.syncAll();
    });
  }

  /** Agent 释放后丢弃其记录。 */
  forget(agent: Agent): void {
    this.restrictions.delete(agent);
    this.pending.delete(agent);
  }

  /** 解除全部限制。 */
  dispose(): void {
    this.disposed = true;
    for (const restriction of this.restrictions.values()) release(restriction.dispose);
    this.restrictions.clear();
  }
}

/** 调用一个 disposer；Agent 已释放时宿主可能抛错，忽略即可。 */
function release(dispose: (() => void) | undefined): void {
  try {
    dispose?.();
  } catch {
    // Agent 作用域已经随会话释放。
  }
}
