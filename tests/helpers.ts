// 测试设施：可编程 ctx 模拟，覆盖工具、MCP 管理器、凭据、配置编辑器与 Web 路由，
// 以及前端字典/槽位注册。测试目标是 src 的纯函数与 apply 接线。

import type { CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { McpManagedServerStatus, McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager';
import type { McpResourceProvider, McpResourceRequest } from '@deepseek-ai/dsh-mcp-resources';
import type {
  AssembleContext,
  AssembledSection,
  PromptPresentation,
} from '@deepseek-ai/dsh-system-prompt';
import type { ToolDefinition, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools';

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

/** 一条完整工具注册记录。 */
export type RegisteredTool = ToolDefinition;

/** MCP 清理失败结果。 */
export type FakeCleanupResult = Extract<
  McpManagedServerStatus,
  { state: 'failed'; reason: 'cleanup' }
>['result'];

/** 一条 MCP resource provider 注册记录。 */
export interface FakeMcpResourceRegistration {
  server: string;
  provider: McpResourceProvider;
  agent?: FakeAgent;
}

/** Agent-local 工具服务。 */
export interface FakeAgentTools {
  register(definition: RegisteredTool): () => void;
  definitions(): readonly RegisteredTool[];
  get(name: string): RegisteredTool | undefined;
  schemas(): Array<Record<string, unknown>>;
  restrict(filter: { allow?: string[]; deny?: string[] }): () => void;
}

/** Agent 构造选项。 */
export interface FakeAgentOptions {
  /** 当前有效工作目录。 */
  cwd?: string;
}

/** 资源工具参数结构。 */
const RESOURCE_LIST_PARAMETERS = {
  server: { type: 'string', required: true, description: 'Configured MCP server name.' },
  cursor: { type: 'string', description: 'Continuation cursor returned by this server.' },
} as const;

/** 投影工具的模型可见 schema。 */
function toolSchemas(definitions: readonly RegisteredTool[]): Array<Record<string, unknown>> {
  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    ...(tool.deferLoading === true ? { deferLoading: true } : {}),
  }));
}

/** 注册一个 resource provider。 */
function registerResourceProvider(
  registrations: FakeMcpResourceRegistration[],
  server: string,
  provider: McpResourceProvider,
  agent?: FakeAgent,
): () => void {
  if (registrations.some((registration) => registration.server === server)) {
    throw new Error(`MCP resource server "${server}" is already registered in this scope`);
  }
  const registration = { server, provider, ...(agent === undefined ? {} : { agent }) };
  registrations.push(registration);
  return () => {
    const index = registrations.indexOf(registration);
    if (index >= 0) registrations.splice(index, 1);
  };
}

/** 宿主 mocked 服务选项。 */
export interface MockCtxOptions {
  /** 传给 apply 的 volatile 配置引用。 */
  config?: { servers: FakeVolatile<unknown> };
  /** 初始管理器状态。 */
  statuses?: Record<string, McpManagedServerStatus>;
  /** 指定名称下一次 disposer 产生的清理失败。 */
  cleanupFailures?: Record<string, FakeCleanupResult | string>;
  /** system-prompt/assemble 的默认 sections。 */
  promptSections?: AssembledSection[];
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

/** 模拟会话消息。 */
export interface FakeMessage {
  source: unknown;
  content?: unknown;
}

/** 可编程 Agent 模拟。 */
export interface FakeAgent {
  id: string;
  /** 当前有效工作目录，可直接赋值以准备测试状态。 */
  cwd: string;
  session: {
    id: string;
    header: { cwd: string };
    events: FakeEvent[];
    surface: { nodes: number[] };
    readonly seq: number;
    append(type: string, data: Record<string, unknown>): FakeEvent;
  };
  ctx: {
    tools: FakeAgentTools;
    mcpResources: {
      register(server: string, provider: McpResourceProvider): () => void;
    };
  };
  /** 等待后续步骤准入的消息。 */
  inbox: { nextStep: FakeMessage[]; nextTurn: FakeMessage[] };
  /** Agent-local 工具注册记录。 */
  _registeredTools: RegisteredTool[];
  /** Agent-local resource provider 注册记录。 */
  _resourceProviders: FakeMcpResourceRegistration[];
  /** 把上下文写入下一步队列，不唤醒 Agent。 */
  inject(message: FakeMessage): void;
  /** 当前生效的 deny 列表。 */
  _deny(): string[];
  /** 当前生效的限制数。 */
  _restrictionCount(): number;
  /** 把消息写入会话日志并放进可见区。 */
  _commit(message: FakeMessage): number;
  /** 取走下一步队列中的全部消息。 */
  _claim(): FakeMessage[];
  /** 模拟压缩：清空可见区。 */
  _compact(): void;
}

/** Agent 与根 ctx 的动态绑定。 */
interface FakeAgentRoot {
  definitions(): readonly RegisteredTool[];
  emit(type: string, ...args: unknown[]): void;
}

const agentRoots = new WeakMap<FakeAgent, FakeAgentRoot>();
const sessionOwners = new WeakMap<FakeAgent['session'], FakeAgent>();

/** 构造一个模拟 Agent。第二个参数可直接传 cwd。 */
export function makeAgent(id = 'agent-1', cwdOrOptions: string | FakeAgentOptions = {}): FakeAgent {
  const initialCwd =
    typeof cwdOrOptions === 'string' ? cwdOrOptions : (cwdOrOptions.cwd ?? process.cwd());
  let currentCwd = initialCwd;
  const restrictions = new Set<{ allow?: string[]; deny?: string[] }>();
  const events: FakeEvent[] = [];
  const nextStep: FakeMessage[] = [];
  const localTools: RegisteredTool[] = [];
  const resourceProviders: FakeMcpResourceRegistration[] = [];
  const session: FakeAgent['session'] = {
    id,
    header: { cwd: initialCwd },
    events,
    surface: { nodes: [] },
    get seq() {
      return events.length;
    },
    append(type, data) {
      const event = { seq: events.length, type, data };
      events.push(event);
      return event;
    },
  };
  let agent: FakeAgent;
  const definitions = (): readonly RegisteredTool[] => {
    const globals = (agentRoots.get(agent)?.definitions() ?? []).filter((tool) =>
      [...restrictions].every(
        (filter) =>
          (filter.allow === undefined || filter.allow.includes(tool.name)) &&
          !filter.deny?.includes(tool.name),
      ),
    );
    const visible = new Map(globals.map((tool) => [tool.name, tool]));
    for (const tool of localTools) visible.set(tool.name, tool);
    return [...visible.values()];
  };
  const changed = () => agentRoots.get(agent)?.emit('tools/change');
  agent = {
    id,
    get cwd() {
      return currentCwd;
    },
    set cwd(value) {
      currentCwd = value;
    },
    session,
    ctx: {
      tools: {
        register(definition) {
          localTools.push(definition);
          changed();
          return () => {
            const index = localTools.indexOf(definition);
            if (index < 0) return;
            localTools.splice(index, 1);
            changed();
          };
        },
        definitions,
        get: (name) => definitions().find((tool) => tool.name === name),
        schemas: () => toolSchemas(definitions()),
        restrict(filter) {
          restrictions.add(filter);
          changed();
          return () => {
            if (!restrictions.delete(filter)) return;
            changed();
          };
        },
      },
      mcpResources: {
        register: (server, provider) =>
          registerResourceProvider(resourceProviders, server, provider, agent),
      },
    },
    inbox: { nextStep, nextTurn: [] },
    _registeredTools: localTools,
    _resourceProviders: resourceProviders,
    inject(message) {
      nextStep.push(message);
    },
    _deny: () => [...restrictions].flatMap((filter) => filter.deny ?? []).sort(),
    _restrictionCount: () => restrictions.size,
    _commit(message) {
      const event = session.append('user/message', { role: 'user', ...message });
      session.surface.nodes.push(event.seq);
      return event.seq;
    },
    _claim() {
      return nextStep.splice(0);
    },
    _compact() {
      session.surface.nodes = [];
    },
  };
  sessionOwners.set(session, agent);
  return agent;
}

/** 构造三个与 rc.5 同名的全局 resource 工具。 */
function createResourceTools(
  resolve: (
    server: string,
    request: McpResourceRequest,
    exec: ToolExecution,
  ) => ReturnType<McpResourceProvider['request']>,
): RegisteredTool[] {
  const make = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    request: (args: { server: string; cursor?: string; uri?: string }) => McpResourceRequest,
  ): RegisteredTool => ({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) ?? '' }],
    },
    isConcurrencySafe: () => true,
    execute: (raw, exec: ToolRunContext) => {
      const args = raw as { server: string; cursor?: string; uri?: string };
      return resolve(args.server, request(args), exec);
    },
  });
  return [
    make(
      'list_mcp_resources',
      'List resources available from an MCP server.',
      RESOURCE_LIST_PARAMETERS,
      (args) => ({
        method: 'resources/list',
        ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      }),
    ),
    make(
      'list_mcp_resource_templates',
      'List parameterized resource URI templates from an MCP server.',
      RESOURCE_LIST_PARAMETERS,
      (args) => ({
        method: 'resources/templates/list',
        ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      }),
    ),
    make(
      'read_mcp_resource',
      'Read an MCP resource by URI from the named server.',
      {
        server: RESOURCE_LIST_PARAMETERS.server,
        uri: { type: 'string', required: true, description: 'Resource URI to read.' },
      },
      (args) => ({ method: 'resources/read', uri: args.uri ?? '' }),
    ),
  ];
}

/** 可编程宿主 ctx 模拟的观测字段。 */
export interface MockCtxState {
  _registeredTools: RegisteredTool[];
  /** 三个全局 MCP resource 工具，不计入旧工具注册数组。 */
  _resourceTools: RegisteredTool[];
  _resourceProviders: FakeMcpResourceRegistration[];
  _agents: FakeAgent[];
  _effects: string[];
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
  _routes: Array<Record<string, unknown>>;
  _fetchRoutes: Array<Record<string, unknown>>;
  _managerRegistered: Map<string, { entry: Record<string, unknown> }>;
  _managerStatuses: Map<string, McpManagedServerStatus>;
  _managerDisposals: string[];
  _managerCleanupFailures: Map<string, FakeCleanupResult>;
  _workingDirectoryAccesses: Array<{
    agent: FakeAgent;
    path: string | null;
    signal: AbortSignal;
  }>;
  _promptSections: AssembledSection[];
  _credentials: Map<string, CredentialRecord>;
  _configStore: Record<string, unknown>;
  _configEdits: Array<Record<string, unknown>>;
  _injections: string[];
  _loggerCalls: Array<{ level: string; args: unknown[] }>;
  _setStatus(name: string, status: McpManagedServerStatus): void;
  /** 让指定名称的下一次 Manager disposer 留下 configured:false 清理失败。 */
  _failCleanup(name: string, result?: FakeCleanupResult | string): void;
  _managerWatcherCount(): number;
  _setExecuteResult(result: { content: unknown[]; isError: boolean }): void;
  /** 直接提交目录并发布 working-directory/change session/event。 */
  _setWorkingDirectory(agent: FakeAgent, cwd: string): FakeEvent | undefined;
  /** 提交并发布一个 Turn 结束事件。 */
  _endTurn(agent: FakeAgent, kind?: 'completed' | 'error' | 'aborted'): void;
  _emit(type: string, ...args: unknown[]): void;
  /** 依注册顺序执行一个 waterfall 事件，额外参数位于 next 之前。 */
  _waterfall(type: string, payload: unknown, base: unknown, ...args: unknown[]): Promise<unknown>;
  /** 构造并执行 system-prompt/assemble waterfall。 */
  _assembleSystemPrompt(
    input?: AssembledSection[] | PromptPresentation,
    context?: AssembleContext,
  ): Promise<PromptPresentation>;
  _dispose(): void;
}

/** 构造宿主 ctx 模拟。 */
export function makeCtx(options: MockCtxOptions = {}): Context & MockCtxState {
  const normalizeCleanup = (value: FakeCleanupResult | string): FakeCleanupResult =>
    typeof value === 'string' ? { closeConfirmed: false, cleanupError: value } : value;
  const state = {
    _registeredTools: [] as RegisteredTool[],
    _resourceTools: [] as RegisteredTool[],
    _resourceProviders: [] as FakeMcpResourceRegistration[],
    _agents: [] as FakeAgent[],
    _effects: [] as string[],
    _listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    _routes: [] as Array<Record<string, unknown>>,
    _fetchRoutes: [] as Array<Record<string, unknown>>,
    _managerRegistered: new Map<string, { entry: Record<string, unknown> }>(),
    _managerStatuses: new Map<string, McpManagedServerStatus>(
      Object.entries(options.statuses ?? {}),
    ),
    _managerDisposals: [] as string[],
    _managerCleanupFailures: new Map<string, FakeCleanupResult>(),
    _workingDirectoryAccesses: [] as Array<{
      agent: FakeAgent;
      path: string | null;
      signal: AbortSignal;
    }>,
    _promptSections: [...(options.promptSections ?? [])],
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
  const programmedCleanupFailures = new Map<string, FakeCleanupResult>(
    Object.entries(options.cleanupFailures ?? {}).map(([name, result]) => [
      name,
      normalizeCleanup(result),
    ]),
  );
  const managerWatchers = new Set<() => void>();
  const managerLifetime = new AbortController();

  const emit = (type: string, ...args: unknown[]): void => {
    if (type === 'agent/created') {
      const payload = args[0] as { agent?: FakeAgent };
      if (payload.agent !== undefined) bindAgent(payload.agent);
    }
    for (const listener of state._listeners.get(type) ?? []) listener(...args);
  };
  const rawDefinitions = (): readonly RegisteredTool[] => [
    ...state._registeredTools,
    ...state._resourceTools,
  ];
  const bindAgent = (agent: FakeAgent): void => {
    agentRoots.set(agent, { definitions: rawDefinitions, emit });
  };
  const notifyManager = (): void => {
    for (const notify of [...managerWatchers]) notify();
  };
  const managerList = (): McpManagedServerView[] => {
    const names = new Set([
      ...state._managerRegistered.keys(),
      ...external,
      ...state._managerStatuses.keys(),
    ]);
    return [...names].map((name) => ({
      name,
      configured: !state._managerCleanupFailures.has(name),
      status: state._managerStatuses.get(name) ?? {
        state: 'closed',
        result: { closeConfirmed: true },
      },
    })) as McpManagedServerView[];
  };
  const resolveResource = (
    server: string,
    request: McpResourceRequest,
    exec: ToolExecution,
  ): ReturnType<McpResourceProvider['request']> => {
    const agent = exec.agent as FakeAgent | undefined;
    const registration =
      agent?._resourceProviders.find((candidate) => candidate.server === server) ??
      state._resourceProviders.find((candidate) => candidate.server === server);
    if (registration === undefined) {
      throw new Error(`MCP resource server "${server}" is unavailable in this agent's scope`);
    }
    return registration.provider.request(request, exec);
  };
  state._resourceTools.push(...createResourceTools(resolveResource));

  const runWaterfall = async (
    type: string,
    payload: unknown,
    base: unknown,
    ...args: unknown[]
  ): Promise<unknown> => {
    const listeners = state._listeners.get(type) ?? [];
    const run = async (index: number): Promise<unknown> => {
      const listener = listeners[index];
      if (listener === undefined) {
        return typeof base === 'function' ? (base as () => unknown)() : base;
      }
      return listener(payload, ...args, () => run(index + 1));
    };
    return run(0);
  };
  const commitWorkingDirectory = (agent: FakeAgent, cwd: string): FakeEvent | undefined => {
    const previous = agent.cwd;
    if (previous === cwd) return undefined;
    agent.cwd = cwd;
    const event = agent.session.append('working-directory/change', { cwd });
    emit('session/event', agent.session, event);
    agent.inject({
      source: { kind: 'working-directory' },
      content: [
        {
          type: 'text',
          text: `The working directory changed from ${JSON.stringify(previous)} to ${JSON.stringify(cwd)}.`,
        },
      ],
    });
    return event;
  };
  const accessWorkingDirectory = async (
    agent: FakeAgent,
    path: string | null,
    signal: AbortSignal | undefined,
    commit: () => string,
  ): Promise<string> => {
    const control = signal ?? new AbortController().signal;
    control.throwIfAborted();
    const request = { agent, path, signal: control };
    state._workingDirectoryAccesses.push(request);
    return (await runWaterfall('working-directory/access', request, () => {
      control.throwIfAborted();
      return commit();
    })) as string;
  };
  const assembleSystemPrompt = async (
    input: AssembledSection[] | PromptPresentation = state._promptSections,
    context: AssembleContext = {},
  ): Promise<PromptPresentation> => {
    const presentation: PromptPresentation = Array.isArray(input)
      ? { sections: input, contexts: [], variables: {} }
      : input;
    return (await runWaterfall(
      'system-prompt/assemble',
      presentation,
      presentation,
      context,
    )) as PromptPresentation;
  };

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
        emit('tools/change');
        return () => {
          const index = state._registeredTools.indexOf(definition);
          if (index < 0) return;
          state._registeredTools.splice(index, 1);
          emit('tools/change');
        };
      },
      definitions(scope?: FakeAgent) {
        return scope === undefined ? rawDefinitions() : scope.ctx.tools.definitions();
      },
      get(name: string, scope?: FakeAgent) {
        return scope === undefined
          ? rawDefinitions().find((tool) => tool.name === name)
          : scope.ctx.tools.get(name);
      },
      schemas(scope?: FakeAgent) {
        return toolSchemas(scope === undefined ? rawDefinitions() : scope.ctx.tools.definitions());
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
    workingDirectory: {
      defaultDirectory: process.cwd(),
      get(session: FakeAgent['session']) {
        return (
          (sessionOwners.get(session) ?? state._agents.find((agent) => agent.session === session))
            ?.cwd ?? process.cwd()
        );
      },
      ensure(agent: FakeAgent, signal?: AbortSignal) {
        return accessWorkingDirectory(agent, null, signal, () => agent.cwd);
      },
      set(agent: FakeAgent, path: string, signal?: AbortSignal) {
        return accessWorkingDirectory(agent, path, signal, () => {
          commitWorkingDirectory(agent, path);
          return path;
        });
      },
    },
    systemPrompt: {
      async assemble(context: AssembleContext = {}) {
        const presentation = await assembleSystemPrompt(undefined, context);
        const agent = context.agent as FakeAgent | undefined;
        return {
          ...presentation,
          tools: toolSchemas(agent?.ctx.tools.definitions() ?? rawDefinitions()),
        };
      },
    },
    mcpResources: {
      register(server: string, provider: McpResourceProvider) {
        return registerResourceProvider(state._resourceProviders, server, provider);
      },
    },
    mcpManager: {
      register(name: string, entry: Record<string, unknown>) {
        state._managerRegistered.set(name, { entry });
        state._managerCleanupFailures.delete(name);
        if (!state._managerStatuses.has(name)) {
          state._managerStatuses.set(name, {
            state: 'connected',
            toolCount: 2,
            connectedAt: Date.now(),
          });
        }
        notifyManager();
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          state._managerDisposals.push(name);
          state._managerRegistered.delete(name);
          const failure = programmedCleanupFailures.get(name);
          programmedCleanupFailures.delete(name);
          if (failure === undefined) {
            state._managerStatuses.delete(name);
            state._managerCleanupFailures.delete(name);
          } else {
            state._managerCleanupFailures.set(name, failure);
            state._managerStatuses.set(name, {
              state: 'failed',
              reason: 'cleanup',
              result: failure,
            });
          }
          notifyManager();
        };
      },
      list: managerList,
      async *watch(signal: AbortSignal): AsyncIterable<McpManagedServerView[]> {
        const ended = AbortSignal.any([signal, managerLifetime.signal]);
        let wake = Promise.withResolvers<void>();
        let dirty = true;
        const notify = (): void => {
          dirty = true;
          wake.resolve();
        };
        managerWatchers.add(notify);
        ended.addEventListener('abort', notify, { once: true });
        try {
          while (!ended.aborted) {
            if (!dirty) await wake.promise;
            if (ended.aborted) break;
            dirty = false;
            wake = Promise.withResolvers<void>();
            yield managerList();
          }
        } finally {
          managerWatchers.delete(notify);
          ended.removeEventListener('abort', notify);
        }
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
          emit('loader/volatile-update', [['servers']]);
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
      get: (id: string) => {
        const agent = state._agents.find((candidate) => candidate.id === id);
        if (agent !== undefined) bindAgent(agent);
        return agent;
      },
      list: () => {
        for (const agent of state._agents) bindAgent(agent);
        return [...state._agents];
      },
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
    plugin() {
      const fiberCtx = {
        extend(values: Record<PropertyKey, unknown>) {
          const agent = Reflect.ownKeys(values)
            .map((key) => values[key])
            .find((value): value is FakeAgent => state._agents.includes(value as FakeAgent));
          return agent?.ctx ?? ctx;
        },
      };
      return {
        ctx: fiberCtx,
        dispose: () => undefined,
        inertia: undefined,
      };
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
      notifyManager();
    },
    _failCleanup(name: string, result: FakeCleanupResult | string = 'simulated cleanup failure') {
      programmedCleanupFailures.set(name, normalizeCleanup(result));
    },
    _managerWatcherCount: () => managerWatchers.size,
    _setExecuteResult(result: { content: unknown[]; isError: boolean }) {
      (
        ctx as unknown as { executeResult: { content: unknown[]; isError: boolean } }
      ).executeResult = result;
    },
    _setWorkingDirectory: commitWorkingDirectory,
    _endTurn(agent: FakeAgent, kind = 'completed') {
      const turn = agent.session.events.filter((event) => event.type === 'turn/end').length + 1;
      const event = agent.session.append('turn/end', { turn, reason: { kind } });
      emit('session/event', agent.session, event);
    },
    _emit: emit,
    _waterfall: runWaterfall,
    _assembleSystemPrompt: assembleSystemPrompt,
    _dispose() {
      managerLifetime.abort();
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
