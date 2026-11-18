// 测试设施：可编程 ctx 模拟，覆盖工具、MCP 管理器、凭据、配置编辑器与 Web 路由，
// 以及前端字典/槽位注册。测试目标是 src 的纯函数与 apply 接线。

import type { CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { McpManagedServerStatus, McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager';

import type { Context } from '../src/types.ts';

/** 热重载引用。 */
export interface FakeVolatile<T> {
  get(): T;
  set(value: T): void;
}

/** 构造一个热重载引用。 */
export function volatile<T>(initial: T): FakeVolatile<T> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

/** 一条工具注册记录。 */
export interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown>;
  output: { schema: unknown; render(args: unknown, value: unknown): unknown[] };
}

/** 宿主 mocked 服务选项。 */
export interface MockCtxOptions {
  /** 传给 apply 的 volatile 配置引用。 */
  config?: { servers: FakeVolatile<unknown> };
  /** 初始管理器状态。 */
  statuses?: Record<string, McpManagedServerStatus>;
  /** 外部插件管理的服务器。 */
  external?: string[];
  /** 不提供 connection 服务。 */
  noConnection?: boolean;
  /** 不提供 webServer 服务。 */
  noWebServer?: boolean;
  /** 不提供 configEditor 服务。 */
  noConfigEditor?: boolean;
  /** 工具执行结果。 */
  executeResult?: { content: unknown[]; isError: boolean };
  /** 不提供 agents 与 sessionProjections 服务。 */
  noAgents?: boolean;
}

/** 一条模拟会话事件。 */
export interface FakeEvent {
  seq: number;
  type: string;
  data: Record<string, unknown>;
}

/** 可编程 Agent 模拟。 */
export interface FakeAgent {
  id: string;
  session: { events: FakeEvent[]; surface: { nodes: number[] }; readonly seq: number };
  ctx: { tools: { restrict(filter: { allow?: string[]; deny?: string[] }): () => void } };
  /** 当前生效的 deny 列表。 */
  _deny(): string[];
  /** 当前生效的限制数。 */
  _restrictionCount(): number;
  /** 把消息写入会话日志并放进可见区。 */
  _commit(message: { source: unknown; content?: unknown }): number;
  /** 模拟压缩：清空可见区。 */
  _compact(): void;
}

/** 构造一个模拟 Agent。 */
export function makeAgent(id = 'agent-1'): FakeAgent {
  const restrictions = new Set<{ deny?: string[] }>();
  const events: FakeEvent[] = [];
  const session = {
    events,
    surface: { nodes: [] as number[] },
    get seq() {
      return events.length;
    },
  };
  return {
    id,
    session,
    ctx: {
      tools: {
        restrict(filter) {
          restrictions.add(filter);
          return () => {
            restrictions.delete(filter);
          };
        },
      },
    },
    _deny: () => [...restrictions].flatMap((filter) => filter.deny ?? []).sort(),
    _restrictionCount: () => restrictions.size,
    _commit(message) {
      const seq = events.length;
      events.push({ seq, type: 'user/message', data: { role: 'user', ...message } });
      session.surface.nodes.push(seq);
      return seq;
    },
    _compact() {
      session.surface.nodes = [];
    },
  };
}

/** 可编程宿主 ctx 模拟的观测字段。 */
export interface MockCtxState {
  _registeredTools: RegisteredTool[];
  _agents: FakeAgent[];
  _effects: string[];
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
  _routes: Array<Record<string, unknown>>;
  _fetchRoutes: Array<Record<string, unknown>>;
  _managerRegistered: Map<string, { entry: Record<string, unknown> }>;
  _managerStatuses: Map<string, McpManagedServerStatus>;
  _credentials: Map<string, CredentialRecord>;
  _configStore: Record<string, unknown>;
  _configEdits: Array<Record<string, unknown>>;
  _injections: string[];
  _loggerCalls: Array<{ level: string; args: unknown[] }>;
  _setStatus(name: string, status: McpManagedServerStatus): void;
  _setExecuteResult(result: { content: unknown[]; isError: boolean }): void;
  _emit(type: string, ...args: unknown[]): void;
  /** 依注册顺序执行一个 waterfall 事件。 */
  _waterfall(type: string, payload: unknown, base: unknown): Promise<unknown>;
  _dispose(): void;
}

/** 构造宿主 ctx 模拟。 */
export function makeCtx(options: MockCtxOptions = {}): Context & MockCtxState {
  const state = {
    _registeredTools: [] as RegisteredTool[],
    _agents: [] as FakeAgent[],
    _effects: [] as string[],
    _listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    _routes: [] as Array<Record<string, unknown>>,
    _fetchRoutes: [] as Array<Record<string, unknown>>,
    _managerRegistered: new Map<string, { entry: Record<string, unknown> }>(),
    _managerStatuses: new Map<string, McpManagedServerStatus>(
      Object.entries(options.statuses ?? {}),
    ),
    _credentials: new Map<string, CredentialRecord>(),
    _configStore: {} as Record<string, unknown>,
    _configEdits: [] as Array<Record<string, unknown>>,
    _injections: [] as string[],
    _loggerCalls: [] as Array<{ level: string; args: unknown[] }>,
    executeResult: options.executeResult ?? {
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    },
  };
  const effectDisposers: Array<() => void> = [];
  const external = [...(options.external ?? [])];

  const logger = {
    debug: (...args: unknown[]) => state._loggerCalls.push({ level: 'debug', args }),
    info: (...args: unknown[]) => state._loggerCalls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => state._loggerCalls.push({ level: 'warn', args }),
  };

  const ctx = {
    logger,
    fiber: { entry: { id: 'better-mcp', options: {} } },
    get(name: string) {
      return (ctx as Record<string, unknown>)[name];
    },
    tools: {
      register(definition: RegisteredTool) {
        state._registeredTools.push(definition);
        return () => {
          const index = state._registeredTools.indexOf(definition);
          if (index >= 0) state._registeredTools.splice(index, 1);
        };
      },
      schemas() {
        return state._registeredTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }));
      },
      async execute(input: { calls: Array<{ name: string; arguments: string }> }) {
        const call = input.calls[0];
        return {
          results: [
            {
              callId: call?.name ?? 'call',
              result: {
                content: (
                  ctx as unknown as MockCtxState & {
                    executeResult: { content: unknown[]; isError: boolean };
                  }
                ).executeResult.content,
                isError: (
                  ctx as unknown as MockCtxState & {
                    executeResult: { content: unknown[]; isError: boolean };
                  }
                ).executeResult.isError,
              },
            },
          ],
        };
      },
    },
    mcpManager: {
      register(name: string, entry: Record<string, unknown>) {
        state._managerRegistered.set(name, { entry });
        if (!state._managerStatuses.has(name)) {
          state._managerStatuses.set(name, {
            state: 'connected',
            toolCount: 2,
            connectedAt: Date.now(),
          });
        }
        return () => {
          state._managerRegistered.delete(name);
          state._managerStatuses.delete(name);
        };
      },
      list(): McpManagedServerView[] {
        const names = new Set([
          ...state._managerRegistered.keys(),
          ...external,
          ...state._managerStatuses.keys(),
        ]);
        const views: McpManagedServerView[] = [];
        for (const name of names) {
          views.push({
            name,
            configured: true,
            status: state._managerStatuses.get(name) ?? {
              state: 'closed',
              result: { closeConfirmed: true },
            },
          } as McpManagedServerView);
        }
        return views;
      },
    },
    credentials: {
      async resolve(ref: unknown) {
        const record = state._credentials.get(String(ref));
        if (record === undefined) return undefined;
        return {
          value: record.kind === 'api-key' ? record.key : record.payload.accessToken,
        };
      },
      async set(ref: unknown, value: string) {
        state._credentials.set(String(ref), { kind: 'api-key', key: value });
      },
      async readRecord(key: unknown) {
        return state._credentials.get(String(key));
      },
      async modifyRecord(
        key: unknown,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ) {
        const next = await mutate(state._credentials.get(String(key)));
        if (next === undefined) state._credentials.delete(String(key));
        else state._credentials.set(String(key), next);
        return next;
      },
      async deleteRecord(key: unknown) {
        state._credentials.delete(String(key));
      },
      async listRecords() {
        return [...state._credentials.keys()].map((key) => ({ key }));
      },
    },
    configEditor: {
      async edit(
        _entry: unknown,
        change: (current: Record<string, unknown>) => Record<string, unknown>,
      ) {
        const next = change(structuredClone((ctx as unknown as MockCtxState)._configStore));
        (ctx as unknown as MockCtxState)._configStore = structuredClone(next);
        (ctx as unknown as MockCtxState)._configEdits.push(structuredClone(next));
        if (options.config !== undefined) {
          options.config.servers.set(next.servers);
          (ctx as unknown as MockCtxState)._emit('loader/volatile-update', [['servers']]);
        }
      },
    },
    connection: {
      fetch: {
        register(route: Record<string, unknown>) {
          state._fetchRoutes.push(route);
          return async () => {
            const index = state._fetchRoutes.indexOf(route);
            if (index >= 0) state._fetchRoutes.splice(index, 1);
          };
        },
      },
    },
    webServer: {
      getOrigin: () => 'http://127.0.0.1:3080',
      register(route: Record<string, unknown>) {
        state._routes.push(route);
        return () => {
          const index = state._routes.indexOf(route);
          if (index >= 0) state._routes.splice(index, 1);
        };
      },
    },
    agents: {
      list: () => [...state._agents],
    },
    sessionProjections: {
      async register(definition: {
        init(): unknown;
        apply(state: unknown, event: FakeEvent): unknown;
      }) {
        return {
          stateOf(session: { events: FakeEvent[] }) {
            let current = definition.init();
            for (const event of session.events) current = definition.apply(current, event);
            return current;
          },
          readerFor: () => () => undefined,
          dispose: async () => undefined,
        };
      },
    },
    effect(fn: () => unknown, label?: string) {
      state._effects.push(label ?? '');
      const disposer = fn();
      if (typeof disposer === 'function') effectDisposers.push(disposer as () => void);
      return () => true;
    },
    on(type: string, fn: (...args: unknown[]) => void) {
      const list = state._listeners.get(type) ?? [];
      list.push(fn);
      state._listeners.set(type, list);
      return () => true;
    },
    inject(names: string[], callback: (scoped: unknown) => unknown) {
      state._injections.push(...names);
      const available = names.every((name) => (ctx as Record<string, unknown>)[name] !== undefined);
      if (available) callback(ctx);
      return () => true;
    },
  };

  if (options.noConnection === true) delete (ctx as Record<string, unknown>).connection;
  if (options.noWebServer === true) delete (ctx as Record<string, unknown>).webServer;
  if (options.noConfigEditor === true) delete (ctx as Record<string, unknown>).configEditor;
  if (options.noAgents === true) {
    delete (ctx as Record<string, unknown>).agents;
    delete (ctx as Record<string, unknown>).sessionProjections;
  }

  return Object.assign(ctx, state, {
    _setStatus(name: string, status: McpManagedServerStatus) {
      state._managerStatuses.set(name, status);
    },
    _setExecuteResult(result: { content: unknown[]; isError: boolean }) {
      (
        ctx as unknown as { executeResult: { content: unknown[]; isError: boolean } }
      ).executeResult = result;
    },
    _emit(type: string, ...args: unknown[]) {
      for (const listener of state._listeners.get(type) ?? []) listener(...args);
    },
    async _waterfall(type: string, payload: unknown, base: unknown): Promise<unknown> {
      const listeners = state._listeners.get(type) ?? [];
      const run = async (index: number): Promise<unknown> => {
        const listener = listeners[index];
        if (listener === undefined) return base;
        return (listener as (payload: unknown, next: () => Promise<unknown>) => unknown)(
          payload,
          () => run(index + 1),
        );
      };
      return run(0);
    },
    _dispose() {
      for (const disposer of effectDisposers.splice(0)) disposer();
    },
  }) as unknown as Context & MockCtxState;
}

/** 一条客户端字典注册记录。 */
export interface ClientLocaleRegistration {
  ns: string;
  dicts: Record<string, Record<string, string>>;
}

/** 一条客户端槽位注册记录。 */
export interface ClientSlotRegistration {
  options: Record<string, unknown>;
  component: unknown;
}

/** 客户端 ctx 模拟的观测字段。 */
export interface MockClientState {
  _localeRegistrations: ClientLocaleRegistration[];
  _slotInjections: string[];
  _slotRegistrations: ClientSlotRegistration[];
  _effects: string[];
  _dispose(): void;
}

/** 构造客户端 ctx 模拟。 */
export function makeClientCtx(): Context & MockClientState {
  const state = {
    _localeRegistrations: [] as ClientLocaleRegistration[],
    _slotInjections: [] as string[],
    _slotRegistrations: [] as ClientSlotRegistration[],
    _effects: [] as string[],
  };
  const effectDisposers: Array<() => void> = [];
  const noop = () => true;
  const ctx = {
    effect(fn: () => unknown, label?: string) {
      state._effects.push(label ?? '');
      const disposer = fn();
      if (typeof disposer === 'function') effectDisposers.push(disposer as () => void);
      return typeof disposer === 'function' ? disposer : noop;
    },
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>) {
        state._localeRegistrations.push({ ns, dicts });
        return noop;
      },
    },
    slots: {
      inject(name: string, fn: () => unknown) {
        state._slotInjections.push(name);
        const disposer = fn();
        return typeof disposer === 'function' ? disposer : noop;
      },
      register(options: Record<string, unknown>, component: unknown) {
        state._slotRegistrations.push({ options, component });
        return noop;
      },
    },
  };
  return Object.assign(ctx, state, {
    _dispose() {
      for (const disposer of effectDisposers.splice(0)) disposer();
    },
  }) as unknown as Context & MockClientState;
}

/** 用字典与 `{name}` 模板参数构造翻译函数。 */
export function translate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, unknown>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) =>
      String(params?.[name] ?? ''),
    );
}

/** 兼容旧测试的文本内容块。 */
export function textBlock(text: string) {
  return { type: 'text', text };
}
