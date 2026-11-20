/** 工作区工具代理：发现根内部工具、同步 Agent-local 公开代理并阻止过期调用。 */
import type { Agent, Context, ToolDefinition, ToolRunContext } from './types.ts';
import {
  isInternalToolName,
  isWorkspaceInternalName,
  workspacePublicToolName,
} from './workspace-names.ts';

/** 一个工作区实例的代理路由身份。 */
export interface WorkspaceProxyRoute {
  readonly serverName: string;
  readonly internalName: string;
  readonly workspaceKey: string;
  readonly generation: number;
}

/** 代理执行所需的外部状态；由绑定与实例池装配层注入。 */
export interface WorkspaceProxyCallbacks {
  /** 返回 Agent 当前绑定的工作区键。 */
  currentWorkspaceKey(agent: Agent): string | undefined;
  /** 返回 Agent 对该路由是否仍为 active。 */
  isActive(agent: Agent, route: WorkspaceProxyRoute): boolean;
  /** 返回捕获的配置 generation 是否仍有效。 */
  isGenerationCurrent(route: WorkspaceProxyRoute): boolean;
  /** 返回工作区是否仍存在；未注入时由绑定层负责此项检查。 */
  workspaceExists?(workspaceKey: string): boolean;
}

/** 一条 Agent-local 代理注册。 */
interface ProxyRecord {
  readonly route: WorkspaceProxyRoute;
  readonly target: ToolDefinition;
  readonly workspaceKey: string;
  readonly dispose: () => void;
}

/** 从根注册表发现指定内部实例的完整工具定义，键为公开工具名。 */
export function discoverWorkspaceToolTargets(
  ctx: Context,
  serverName: string,
  internalName: string,
): Map<string, ToolDefinition> {
  const targets = new Map<string, ToolDefinition>();
  for (const target of ctx.tools.definitions()) {
    const publicName = workspacePublicToolName(serverName, internalName, target.name);
    if (publicName !== undefined) targets.set(publicName, target);
  }
  return targets;
}

/** 收集指定内部实例的全部根工具名，供 Agent visibility deny 使用。 */
export function collectWorkspaceInternalToolNames(
  ctx: Context,
  internalNames?: Iterable<string>,
): string[] {
  const names = internalNames === undefined ? undefined : [...new Set(internalNames)];
  const configuredNames =
    names === undefined
      ? ctx.mcpManager
          .list()
          .filter((view) => view.configured)
          .map((view) => view.name)
      : undefined;
  return ctx.tools
    .definitions()
    .map((tool) => tool.name)
    .filter((toolName) => {
      if (names !== undefined) {
        return names.some((internalName) => isInternalToolName(toolName, internalName));
      }
      return configuredNames?.some(
        (internalName) =>
          isWorkspaceInternalName(internalName) && isInternalToolName(toolName, internalName),
      );
    })
    .sort();
}

/** 按 Agent 维护公开工具代理，并在执行时验证捕获身份。 */
export class WorkspaceProxyRuntime {
  /** 每个 Agent 的公开名到注册记录映射。 */
  private readonly records = new Map<Agent, Map<string, ProxyRecord>>();
  /** 全部代理是否已释放。 */
  private disposed = false;

  constructor(
    private readonly ctx: Context,
    private readonly callbacks: WorkspaceProxyCallbacks,
  ) {}

  /** 同步一个服务器的公开代理；route 为 undefined 时仅释放指定服务器，省略服务器则释放全部。 */
  sync(agent: Agent, route: WorkspaceProxyRoute | undefined, serverName?: string): void {
    if (this.disposed) return;
    if (route === undefined) {
      if (serverName === undefined) {
        this.disposeAgent(agent);
        return;
      }
      const current = this.records.get(agent);
      if (current === undefined) return;
      for (const [publicName, record] of current) {
        if (record.route.serverName !== serverName) continue;
        current.delete(publicName);
        release(record.dispose);
      }
      if (current.size === 0) this.records.delete(agent);
      return;
    }
    const current = this.records.get(agent) ?? new Map<string, ProxyRecord>();
    if (!this.records.has(agent)) this.records.set(agent, current);
    const targets = discoverWorkspaceToolTargets(this.ctx, route.serverName, route.internalName);

    // 先释放消失与换代记录，避免 Agent-local 同名注册冲突。
    for (const [publicName, record] of current) {
      if (record.route.serverName !== route.serverName) continue;
      if (sameRecord(record, targets.get(publicName), route)) continue;
      current.delete(publicName);
      release(record.dispose);
    }
    for (const [publicName, target] of targets) {
      if (current.has(publicName)) continue;
      const snapshot = { ...route };
      const definition = this.createProxy(agent, publicName, target, snapshot);
      const dispose = agent.ctx.tools.register(definition);
      current.set(publicName, {
        route: snapshot,
        target,
        workspaceKey: snapshot.workspaceKey,
        dispose,
      });
    }
    if (current.size === 0) this.records.delete(agent);
  }

  /** 释放一个 Agent 的全部代理并丢弃其同步记录。 */
  disposeAgent(agent: Agent): void {
    const current = this.records.get(agent);
    if (current === undefined) return;
    this.records.delete(agent);
    for (const record of current.values()) release(record.dispose);
  }

  /** 释放全部 Agent-local 代理；运行时释放后忽略后续同步。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const agent of [...this.records.keys()]) this.disposeAgent(agent);
  }

  /** 创建捕获 target 的公开代理，并显式转发两个内容投影回调。 */
  private createProxy(
    agent: Agent,
    publicName: string,
    target: ToolDefinition,
    route: WorkspaceProxyRoute,
  ): ToolDefinition {
    const assertCurrent = (exec: ToolRunContext): void => {
      const valid =
        exec.agent === agent &&
        this.callbacks.currentWorkspaceKey(agent) === route.workspaceKey &&
        this.callbacks.isActive(agent, route) &&
        (this.callbacks.workspaceExists?.(route.workspaceKey) ?? true) &&
        this.ctx.tools.get(target.name) === target &&
        this.callbacks.isGenerationCurrent(route);
      if (!valid) throw new Error(`Stale workspace tool proxy '${publicName}'`);
    };
    return {
      ...target,
      name: publicName,
      execute: async (args, exec) => {
        assertCurrent(exec);
        return target.execute(args, exec);
      },
      ...(target.projectContent === undefined
        ? {}
        : {
            projectContent: (
              exec: Parameters<NonNullable<ToolDefinition['projectContent']>>[0],
              result: Parameters<NonNullable<ToolDefinition['projectContent']>>[1],
            ) => target.projectContent?.(exec, result),
          }),
      ...(target.finalizeContent === undefined
        ? {}
        : {
            finalizeContent: (
              exec: Parameters<NonNullable<ToolDefinition['finalizeContent']>>[0],
              result: Parameters<NonNullable<ToolDefinition['finalizeContent']>>[1],
            ) => target.finalizeContent?.(exec, result),
          }),
    };
  }
}

/** 判断目标身份和完整路由是否均未变化。 */
function sameRecord(
  record: ProxyRecord,
  target: ToolDefinition | undefined,
  route: WorkspaceProxyRoute,
): boolean {
  return (
    record.target === target &&
    record.route.serverName === route.serverName &&
    record.route.internalName === route.internalName &&
    record.route.workspaceKey === route.workspaceKey &&
    record.route.generation === route.generation
  );
}

/** 调用 Agent-local disposer；宿主已释放作用域时忽略清理异常。 */
function release(dispose: () => void): void {
  try {
    dispose();
  } catch {
    // Agent 作用域可能已由宿主释放。
  }
}
