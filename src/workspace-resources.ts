/** Agent-local MCP resource provider 转发与内部服务器直接调用守卫。 */
import type { McpResourceProvider, McpResourceRequest } from '@deepseek-ai/dsh-mcp-resources';
import { createScope, type Scope } from '@deepseek-ai/dsh-scope';
import type { PreToolDecision, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { Agent, Context, ToolDefinition } from './types.ts';
import { isWorkspaceInternalName } from './workspace-names.ts';
import type { WorkspaceProxyCallbacks, WorkspaceProxyRoute } from './workspace-proxy.ts';

/** 资源 provider 与代理共用完整路由身份。 */
export type WorkspaceResourceRoute = WorkspaceProxyRoute;

/** 资源 provider 的执行保护回调。 */
export type WorkspaceResourceCallbacks = WorkspaceProxyCallbacks;

/** rc.5 三个全局资源工具名。 */
const RESOURCE_TOOL_NAMES = [
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
] as const;

type ResourceToolName = (typeof RESOURCE_TOOL_NAMES)[number];
type ResourceTargets = Record<ResourceToolName, ToolDefinition>;

/** 一条 Agent-local provider 注册及其捕获的执行目标。 */
interface ResourceRecord {
  readonly route: WorkspaceResourceRoute;
  readonly targets: ResourceTargets;
  readonly dispose: () => void;
}

/** 一个 Agent 的插件自有 scope 与其 provider 集合。 */
interface AgentResourceState {
  readonly scope: Pick<Scope, 'ctx' | 'dispose'>;
  readonly records: Map<string, ResourceRecord>;
}

/** 创建继承插件 inject 权限的 Agent scope。 */
export type WorkspaceResourceScopeFactory = (agent: Agent) => Pick<Scope, 'ctx' | 'dispose'>;

/** 捕获根资源工具，以公开配置名同步 Agent-local provider。 */
export class WorkspaceResourceRuntime {
  private readonly records = new Map<Agent, AgentResourceState>();
  private disposed = false;

  constructor(
    private readonly ctx: Context,
    private readonly callbacks: WorkspaceResourceCallbacks,
    private readonly scopeFactory: WorkspaceResourceScopeFactory = (agent) =>
      createScope(ctx, agent),
  ) {}

  /** 同步一个服务器的 provider；传 undefined 释放该 Agent 的全部 provider。 */
  sync(agent: Agent, route: WorkspaceResourceRoute | undefined): void {
    if (this.disposed) return;
    if (route === undefined) {
      this.disposeAgent(agent);
      return;
    }
    const targets = captureResourceTargets(this.ctx);
    let state = this.records.get(agent);
    if (state === undefined) {
      state = { scope: this.scopeFactory(agent), records: new Map<string, ResourceRecord>() };
      this.records.set(agent, state);
    }
    const current = state.records;
    const previous = current.get(route.serverName);
    if (previous !== undefined && sameRecord(previous, route, targets)) return;
    if (previous !== undefined) {
      current.delete(route.serverName);
      release(previous.dispose);
    }

    const snapshot = { ...route };
    const provider: McpResourceProvider = {
      request: (request, exec) => this.forward(agent, snapshot, targets, request, exec),
    };
    const dispose = state.scope.ctx.mcpResources.register(route.serverName, provider);
    current.set(route.serverName, { route: snapshot, targets, dispose });
  }

  /** 释放一个 Agent 对指定公开服务器名的 provider。 */
  release(agent: Agent, serverName: string): void {
    const state = this.records.get(agent);
    const record = state?.records.get(serverName);
    if (state === undefined || record === undefined) return;
    state.records.delete(serverName);
    release(record.dispose);
    if (state.records.size === 0) {
      this.records.delete(agent);
      void state.scope.dispose();
    }
  }

  /** 释放一个 Agent 的全部 provider。 */
  disposeAgent(agent: Agent): void {
    const state = this.records.get(agent);
    if (state === undefined) return;
    this.records.delete(agent);
    for (const record of state.records.values()) release(record.dispose);
    void state.scope.dispose();
  }

  /** 释放全部 provider，并忽略后续同步。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const agent of [...this.records.keys()]) this.disposeAgent(agent);
  }

  /** tools/pre-execute 监听器；内部名拒绝，其余调用交给下游。 */
  async preExecute(
    exec: ToolExecution,
    next: () => Promise<PreToolDecision>,
  ): Promise<PreToolDecision> {
    const internalNames = this.ctx.mcpManager
      .list()
      .filter((view) => view.configured)
      .map((view) => view.name);
    return guardWorkspaceResourceCall(exec, internalNames) ?? next();
  }

  /** 校验捕获身份，再通过根执行视图调用对应资源工具。 */
  private async forward(
    agent: Agent,
    route: WorkspaceResourceRoute,
    targets: ResourceTargets,
    request: McpResourceRequest,
    exec: ToolExecution,
  ): ReturnType<McpResourceProvider['request']> {
    const valid =
      !this.disposed &&
      exec.agent === agent &&
      this.callbacks.currentWorkspaceKey(agent) === route.workspaceKey &&
      this.callbacks.isActive(agent, route) &&
      (this.callbacks.workspaceExists?.(route.workspaceKey) ?? true) &&
      this.callbacks.isGenerationCurrent(route) &&
      RESOURCE_TOOL_NAMES.every((name) => this.ctx.tools.get(name) === targets[name]);
    if (!valid) throw new Error(`Stale workspace resource provider '${route.serverName}'`);

    const targetName = resourceToolName(request);
    const args = resourceArguments(route.internalName, request);
    const rootExec = { ...exec, agent: undefined } as unknown as ToolRunContext;
    return targets[targetName].execute(args, rootExec) as ReturnType<
      McpResourceProvider['request']
    >;
  }
}

/** 拒绝三个全局资源工具直接访问本插件内部名。 */
export function guardWorkspaceResourceCall(
  exec: Readonly<ToolExecution>,
  internalNames?: Iterable<string>,
): PreToolDecision | undefined {
  if (!RESOURCE_TOOL_NAMES.includes(exec.name as ResourceToolName)) return undefined;
  if (typeof exec.arguments !== 'object' || exec.arguments === null) return undefined;
  const server = (exec.arguments as { server?: unknown }).server;
  if (typeof server !== 'string' || !isWorkspaceInternalName(server)) return undefined;
  if (internalNames !== undefined && ![...internalNames].includes(server)) return undefined;
  return {
    kind: 'deny',
    reason: 'Direct access to workspace-internal MCP resource servers is not allowed.',
  };
}

/** 一次性捕获全部根资源工具，缺失时拒绝建立不完整的 provider。 */
function captureResourceTargets(ctx: Context): ResourceTargets {
  const entries = RESOURCE_TOOL_NAMES.map((name) => [name, ctx.tools.get(name)] as const);
  const missing = entries.filter(([, target]) => target === undefined).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Workspace resource tools are unavailable: ${missing.join(', ')}`);
  }
  return Object.fromEntries(entries) as ResourceTargets;
}

/** 判断路由与三个捕获目标均未变化。 */
function sameRecord(
  record: ResourceRecord,
  route: WorkspaceResourceRoute,
  targets: ResourceTargets,
): boolean {
  return (
    record.route.serverName === route.serverName &&
    record.route.internalName === route.internalName &&
    record.route.workspaceKey === route.workspaceKey &&
    record.route.generation === route.generation &&
    RESOURCE_TOOL_NAMES.every((name) => record.targets[name] === targets[name])
  );
}

/** 将协议方法映射到 rc.5 全局资源工具。 */
function resourceToolName(request: McpResourceRequest): ResourceToolName {
  switch (request.method) {
    case 'resources/list':
      return 'list_mcp_resources';
    case 'resources/templates/list':
      return 'list_mcp_resource_templates';
    case 'resources/read':
      return 'read_mcp_resource';
  }
}

/** 仅把公开 server 参数替换为捕获路由的内部名。 */
function resourceArguments(
  internalName: string,
  request: McpResourceRequest,
): Record<string, unknown> {
  if (request.method === 'resources/read') return { server: internalName, uri: request.uri };
  return {
    server: internalName,
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
  };
}

/** Agent 作用域可能已由宿主释放。 */
function release(dispose: () => void): void {
  try {
    dispose();
  } catch {
    // 清理已释放的 Agent 作用域。
  }
}
