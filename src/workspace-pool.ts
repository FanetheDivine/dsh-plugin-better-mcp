/**
 * 工作区 MCP 实例池：按配置与规范化工作区共享实例，串行管理引用、换代和关闭。
 * 导出 WorkspacePool、实例路由视图与结构化清理结果。
 */
import { isDeepStrictEqual } from 'node:util';

import type { PluginConfig, ServerDefinition } from './config.ts';
import { type ServerManager, type StatusView, statusOf } from './servers.ts';
import type { Agent, Context, McpManagedServerView } from './types.ts';
import { normalizeWorkspaceKey, workspaceInternalName } from './workspace-names.ts';

/** 一个可供路由与代理捕获的实例身份。 */
export interface WorkspaceInstance {
  readonly serverName: string;
  readonly workspaceKey: string;
  readonly internalName: string;
  readonly generation: number;
  readonly boundAgents: ReadonlySet<Agent>;
  readonly activeAgents: ReadonlySet<Agent>;
}

/** 面板与状态路由使用的实例快照。 */
export interface WorkspaceInstanceSnapshot extends StatusView {
  readonly serverName: string;
  readonly workspace: string;
  readonly workspaceKey: string;
  readonly internalName: string;
  readonly generation: number;
  readonly boundAgents: number;
  readonly activeAgents: number;
}

/** 一次释放或关闭的结果。 */
export interface WorkspaceCleanupResult {
  readonly serverName: string;
  readonly workspace: string;
  readonly state: 'idle' | 'retained' | 'closed' | 'failed' | 'cleanup-unknown';
  readonly error?: string;
}

/** 实例池选项。 */
export interface WorkspacePoolOptions {
  /** 单次调用的关闭等待预算；超时后后台 watch 仍继续。 */
  cleanupTimeoutMs?: number;
  /** active 前检查规范化工作区是否仍存在。 */
  workspaceExists?: (workspaceKey: string) => boolean | Promise<boolean>;
}

/** 一个已注册实例的私有生命周期状态。 */
interface RegisteredInstance {
  readonly generation: number;
  readonly dispose: () => void;
  closing: boolean;
  cleanupUnknown: boolean;
  closeTask?: Promise<WorkspaceCleanupResult>;
  closeResult?: WorkspaceCleanupResult;
}

/** 一个实例键的引用与当前注册。 */
interface KeyState {
  readonly key: string;
  readonly serverName: string;
  readonly workspaceKey: string;
  readonly internalName: string;
  readonly boundAgents: Set<Agent>;
  readonly activeAgents: Set<Agent>;
  instance?: RegisteredInstance;
}

/** 工作区实例池。 */
export class WorkspacePool {
  private readonly states = new Map<string, KeyState>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();
  private readonly cleanupTimeoutMs: number;
  private readonly workspaceExists: WorkspacePoolOptions['workspaceExists'];
  private disposed = false;

  constructor(
    private readonly ctx: Context,
    private readonly manager: ServerManager,
    options: WorkspacePoolOptions = {},
  ) {
    this.cleanupTimeoutMs = options.cleanupTimeoutMs ?? 10_000;
    this.workspaceExists = options.workspaceExists;
  }

  /** 按实例键串行执行操作，并保留后续操作需要的拒绝恢复链。 */
  private serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.chains.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  /** 读取或建立只含引用的键状态，不注册 MCP 实例。 */
  private stateOf(serverName: string, workspace: string, create: boolean): KeyState | undefined {
    const workspaceKey = normalizeWorkspaceKey(workspace);
    const key = `${serverName}\0${workspaceKey}`;
    let state = this.states.get(key);
    if (state === undefined && create) {
      if (this.disposed) throw new Error('Workspace pool is disposed.');
      state = {
        key,
        serverName,
        workspaceKey,
        internalName: workspaceInternalName(serverName, workspaceKey),
        boundAgents: new Set(),
        activeAgents: new Set(),
      };
      this.states.set(key, state);
    }
    return state;
  }

  /** 返回当前换代值。 */
  private generationOf(key: string): number {
    return this.generations.get(key) ?? 0;
  }

  /** 立即使旧实例身份失效；新注册在旧清理完成后获得更新换代。 */
  private invalidate(state: KeyState): void {
    this.generations.set(state.key, this.generationOf(state.key) + 1);
  }

  /** 为一次新注册分配永不复用的换代值。 */
  private nextGeneration(state: KeyState): number {
    const generation = this.generationOf(state.key) + 1;
    this.generations.set(state.key, generation);
    return generation;
  }

  /** 删除没有引用和注册的空状态。 */
  private prune(state: KeyState): void {
    if (
      state.instance === undefined &&
      state.boundAgents.size === 0 &&
      state.activeAgents.size === 0 &&
      this.states.get(state.key) === state
    ) {
      this.states.delete(state.key);
    }
  }

  /** 将私有状态转换为稳定的路由身份快照。 */
  private publicInstance(state: KeyState, instance: RegisteredInstance): WorkspaceInstance {
    return {
      serverName: state.serverName,
      workspaceKey: state.workspaceKey,
      internalName: state.internalName,
      generation: instance.generation,
      boundAgents: new Set(state.boundAgents),
      activeAgents: new Set(state.activeAgents),
    };
  }

  /** 在当前串行操作中复用或注册实例。 */
  private async acquireInChain(state: KeyState): Promise<WorkspaceInstance> {
    while (true) {
      if (this.disposed) throw new Error('Workspace pool is disposed.');
      const current = state.instance;
      if (current?.closeResult !== undefined) {
        throw new Error(
          current.closeResult.error ?? `MCP cleanup for '${state.internalName}' did not complete.`,
        );
      }
      if (
        current !== undefined &&
        !current.closing &&
        current.generation === this.generationOf(state.key)
      ) {
        return this.publicInstance(state, current);
      }
      if (current !== undefined) {
        const result = await this.closeInChain(state);
        if (result.state !== 'closed') {
          throw new Error(
            result.error ?? `MCP cleanup for '${state.internalName}' did not complete.`,
          );
        }
        continue;
      }

      const generation = this.nextGeneration(state);
      const entry = await this.manager.entryOf(state.serverName, state.workspaceKey);
      if (this.disposed) throw new Error('Workspace pool is disposed.');
      if (generation !== this.generationOf(state.key)) continue;
      const dispose = this.ctx.mcpManager.register(
        state.internalName,
        entry as unknown as Parameters<Context['mcpManager']['register']>[1],
      );
      state.instance = { generation, dispose, closing: false, cleanupUnknown: false };
      return this.publicInstance(state, state.instance);
    }
  }

  /** active 获取共享实例；并发调用经同一实例键串行创建。 */
  async acquireActive(
    agent: Agent,
    serverName: string,
    workspace: string,
  ): Promise<WorkspaceInstance> {
    const workspaceKey = normalizeWorkspaceKey(workspace);
    if (this.workspaceExists !== undefined && !(await this.workspaceExists(workspaceKey))) {
      throw new Error(`Workspace '${workspaceKey}' does not exist.`);
    }
    const state = this.stateOf(serverName, workspaceKey, true);
    if (state === undefined) throw new Error('Workspace pool is disposed.');
    state.boundAgents.add(agent);
    state.activeAgents.add(agent);
    try {
      return await this.serialized(state.key, async () => {
        if (this.workspaceExists !== undefined && !(await this.workspaceExists(workspaceKey))) {
          throw new Error(`Workspace '${workspaceKey}' does not exist.`);
        }
        return this.acquireInChain(state);
      });
    } catch (error) {
      state.boundAgents.delete(agent);
      state.activeAgents.delete(agent);
      this.prune(state);
      throw error;
    }
  }

  /** 返回 Agent 当前 active 且可路由的实例；未激活或正在关闭时为 undefined。 */
  activeInstance(
    agent: Agent,
    serverName: string,
    workspace: string,
  ): WorkspaceInstance | undefined {
    const state = this.stateOf(serverName, workspace, false);
    const instance = state?.instance;
    if (
      state === undefined ||
      instance === undefined ||
      instance.closing ||
      instance.closeResult !== undefined ||
      !state.activeAgents.has(agent) ||
      instance.generation !== this.generationOf(state.key)
    ) {
      return undefined;
    }
    return this.publicInstance(state, instance);
  }

  /** 校验代理捕获的实例 generation 仍是当前有效注册。 */
  isCurrent(serverName: string, workspace: string, generation: number): boolean {
    const state = this.stateOf(serverName, workspace, false);
    const instance = state?.instance;
    return (
      instance !== undefined &&
      !instance.closing &&
      instance.closeResult === undefined &&
      instance.generation === generation &&
      this.generationOf(state?.key ?? '') === generation
    );
  }

  /** 只建立目录绑定，不启动实例。 */
  bind(agent: Agent, serverName: string, workspace: string): void {
    const state = this.stateOf(serverName, workspace, true);
    state?.boundAgents.add(agent);
  }

  /** 在当前串行操作中启动并等待一次 Manager 清理。 */
  private async closeInChain(state: KeyState): Promise<WorkspaceCleanupResult> {
    const instance = state.instance;
    if (instance === undefined) {
      this.prune(state);
      return { serverName: state.serverName, workspace: state.workspaceKey, state: 'idle' };
    }
    if (instance.closeResult !== undefined) return instance.closeResult;
    if (instance.closeTask === undefined) {
      instance.closing = true;
      instance.closeTask = this.watchCleanup(state, instance);
    }
    const result = await instance.closeTask;
    instance.closing = false;
    instance.cleanupUnknown = result.state === 'cleanup-unknown';
    if (result.state === 'closed') {
      if (state.instance === instance) delete state.instance;
      this.prune(state);
    } else {
      instance.closeResult = result;
    }
    return result;
  }

  /** 调用 disposer 并消费 Manager watch，直到名称消失或出现结构化清理失败。 */
  private async watchCleanup(
    state: KeyState,
    instance: RegisteredInstance,
  ): Promise<WorkspaceCleanupResult> {
    try {
      instance.dispose();
    } catch (error) {
      return this.cleanupResult(state, 'failed', errorMessage(error));
    }
    const immediate = cleanupOutcome(this.ctx.mcpManager.list(), state);
    if (immediate !== undefined) return immediate;
    const controller = new AbortController();
    try {
      for await (const views of this.ctx.mcpManager.watch(controller.signal)) {
        const outcome = cleanupOutcome(views, state);
        if (outcome !== undefined) return outcome;
      }
      return this.cleanupResult(
        state,
        'cleanup-unknown',
        `MCP cleanup watch for '${state.internalName}' ended before confirmation.`,
      );
    } catch (error) {
      return this.cleanupResult(state, 'failed', errorMessage(error));
    } finally {
      controller.abort();
    }
  }

  /** 构造带实例身份的清理结果。 */
  private cleanupResult(
    state: KeyState,
    stateName: WorkspaceCleanupResult['state'],
    error?: string,
  ): WorkspaceCleanupResult {
    return {
      serverName: state.serverName,
      workspace: state.workspaceKey,
      state: stateName,
      ...(error === undefined ? {} : { error }),
    };
  }

  /** 限制调用方等待时间，超时不取消串行操作或后台 watch。 */
  private async awaitCleanup(
    task: Promise<WorkspaceCleanupResult>,
    state: KeyState,
  ): Promise<WorkspaceCleanupResult> {
    if (!Number.isFinite(this.cleanupTimeoutMs)) return task;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<WorkspaceCleanupResult>((resolve) => {
      timer = setTimeout(() => {
        const instance = state.instance;
        if (instance?.closing === true) instance.cleanupUnknown = true;
        resolve(
          this.cleanupResult(
            state,
            'cleanup-unknown',
            `MCP cleanup for '${state.internalName}' was not confirmed within ${this.cleanupTimeoutMs} ms.`,
          ),
        );
      }, this.cleanupTimeoutMs);
    });
    try {
      return await Promise.race([task, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** 请求关闭一个键；调用方可选地跳过已由 restart/reconcile 完成的换代。 */
  private closeState(state: KeyState, invalidate = true): Promise<WorkspaceCleanupResult> {
    if (invalidate) this.invalidate(state);
    if (state.instance !== undefined && state.instance.closeResult === undefined) {
      state.instance.closing = true;
    }
    const task = this.serialized(state.key, () => this.closeInChain(state));
    return this.awaitCleanup(task, state);
  }

  /** 释放一个 active 引用；仍有共享 active 时保留，否则关闭。 */
  async releaseActive(
    agent: Agent,
    serverName: string,
    workspace: string,
  ): Promise<WorkspaceCleanupResult> {
    const state = this.stateOf(serverName, workspace, false);
    if (state === undefined) {
      return {
        serverName,
        workspace: normalizeWorkspaceKey(workspace),
        state: 'idle',
      };
    }
    state.activeAgents.delete(agent);
    if (state.activeAgents.size > 0) return this.cleanupResult(state, 'retained');
    return this.closeState(state);
  }

  /** 释放目录绑定及其 active 引用；仍有其他绑定 Agent 时保留。 */
  async releaseBinding(
    agent: Agent,
    serverName: string,
    workspace: string,
  ): Promise<WorkspaceCleanupResult> {
    const state = this.stateOf(serverName, workspace, false);
    if (state === undefined) {
      return {
        serverName,
        workspace: normalizeWorkspaceKey(workspace),
        state: 'idle',
      };
    }
    state.boundAgents.delete(agent);
    state.activeAgents.delete(agent);
    return this.closeIfUnused(state.serverName, state.workspaceKey);
  }

  /** 释放 Agent 的全部引用并保留实例，供后续 Agent 复用。 */
  releaseAgent(agent: Agent): void {
    for (const state of this.states.values()) {
      state.boundAgents.delete(agent);
      state.activeAgents.delete(agent);
    }
  }

  /** 仅在没有任何目录绑定引用时关闭。 */
  async closeIfUnused(serverName: string, workspace: string): Promise<WorkspaceCleanupResult> {
    const state = this.stateOf(serverName, workspace, false);
    if (state === undefined) {
      return {
        serverName,
        workspace: normalizeWorkspaceKey(workspace),
        state: 'idle',
      };
    }
    if (state.boundAgents.size > 0) return this.cleanupResult(state, 'retained');
    return this.closeState(state);
  }

  /** 强制关闭一个规范化工作区中的全部实例。 */
  async closeWorkspace(workspace: string): Promise<WorkspaceCleanupResult[]> {
    const workspaceKey = normalizeWorkspaceKey(workspace);
    const states = [...this.states.values()].filter(
      (state) =>
        state.workspaceKey === workspaceKey &&
        (state.instance !== undefined || state.activeAgents.size > 0),
    );
    return Promise.all(states.map((state) => this.closeState(state)));
  }

  /** 重建一个已有实例，保留其 Agent 引用并分配新 generation。 */
  private async restartState(
    state: KeyState,
    alreadyInvalidated = false,
  ): Promise<WorkspaceInstanceSnapshot> {
    if (!alreadyInvalidated) this.invalidate(state);
    if (state.instance !== undefined && state.instance.closeResult === undefined) {
      state.instance.closing = true;
    }
    const operation = this.serialized(state.key, async () => {
      const result = await this.closeInChain(state);
      if (result.state !== 'closed' && result.state !== 'idle') return result;
      return this.acquireInChain(state);
    });
    if (!Number.isFinite(this.cleanupTimeoutMs)) {
      await operation;
      return this.snapshotOf(state);
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.cleanupTimeoutMs);
    });
    try {
      const completed = await Promise.race([operation.then(() => true), timeout.then(() => false)]);
      if (!completed) {
        const instance = state.instance;
        if (instance?.closing === true) instance.cleanupUnknown = true;
      }
      return this.snapshotOf(state);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** 重连一个工作区，或省略工作区以重连该配置的全部现有实例。 */
  async restart(serverName: string): Promise<WorkspaceInstanceSnapshot[]>;
  async restart(serverName: string, workspace: string): Promise<WorkspaceInstanceSnapshot>;
  async restart(
    serverName: string,
    workspace?: string,
  ): Promise<WorkspaceInstanceSnapshot | WorkspaceInstanceSnapshot[]> {
    if (workspace !== undefined) {
      const state = this.stateOf(serverName, workspace, false);
      if (state?.instance === undefined) {
        throw new Error(`No workspace MCP instance named '${serverName}' at '${workspace}'.`);
      }
      return this.restartState(state);
    }
    const states = [...this.states.values()].filter(
      (state) => state.serverName === serverName && state.instance !== undefined,
    );
    return Promise.all(states.map((state) => this.restartState(state)));
  }

  /** 按连接配置对账；简介与 lazy 变化保留实例，其它变化换代并重建。 */
  async reconcile(previous: Readonly<PluginConfig>, next: Readonly<PluginConfig>): Promise<void> {
    const names = new Set([...Object.keys(previous.servers), ...Object.keys(next.servers)]);
    for (const serverName of names) {
      const before = previous.servers[serverName];
      const after = next.servers[serverName];
      if (before?.workspace !== true && after?.workspace !== true) continue;
      const states = [...this.states.values()].filter((state) => state.serverName === serverName);
      if (after?.workspace !== true) {
        await Promise.all(states.map((state) => this.closeState(state)));
        continue;
      }
      if (
        before?.workspace !== true ||
        isDeepStrictEqual(connectionOf(before), connectionOf(after))
      ) {
        continue;
      }
      for (const state of states) {
        this.invalidate(state);
        if (state.instance !== undefined) await this.restartState(state, true);
      }
    }
  }

  /** 列出当前已注册或正在清理的实例身份。 */
  list(serverName?: string): WorkspaceInstance[] {
    const result: WorkspaceInstance[] = [];
    for (const state of this.states.values()) {
      if (
        state.instance === undefined ||
        (serverName !== undefined && state.serverName !== serverName)
      ) {
        continue;
      }
      result.push(this.publicInstance(state, state.instance));
    }
    return result.sort((left, right) =>
      left.serverName === right.serverName
        ? left.workspaceKey.localeCompare(right.workspaceKey)
        : left.serverName.localeCompare(right.serverName),
    );
  }

  /** 读取单个工作区状态，包括插件侧 closing 与 cleanup-unknown。 */
  status(serverName: string, workspace: string): StatusView {
    const state = this.stateOf(serverName, workspace, false);
    const instance = state?.instance;
    if (state === undefined || instance === undefined) return { state: 'idle' };
    if (instance.closing) {
      return {
        state: instance.cleanupUnknown ? 'cleanup-unknown' : 'closing',
        ...(instance.cleanupUnknown
          ? { error: `MCP cleanup for '${state.internalName}' is still unconfirmed.` }
          : {}),
      };
    }
    const managed = this.ctx.mcpManager
      .list()
      .find((candidate) => candidate.name === state.internalName);
    const status = statusOf(managed?.status);
    if (instance.closeResult?.error !== undefined) status.error = instance.closeResult.error;
    if (instance.closeResult?.state === 'cleanup-unknown') {
      return {
        state: 'cleanup-unknown',
        ...(instance.closeResult.error === undefined ? {} : { error: instance.closeResult.error }),
      };
    }
    return status;
  }

  /** 生成一个状态的完整实例快照。 */
  private snapshotOf(state: KeyState): WorkspaceInstanceSnapshot {
    const instance = state.instance;
    if (instance === undefined) {
      return {
        serverName: state.serverName,
        workspace: state.workspaceKey,
        workspaceKey: state.workspaceKey,
        internalName: state.internalName,
        generation: this.generationOf(state.key),
        boundAgents: state.boundAgents.size,
        activeAgents: state.activeAgents.size,
        state: 'idle',
      };
    }
    return {
      serverName: state.serverName,
      workspace: state.workspaceKey,
      workspaceKey: state.workspaceKey,
      internalName: state.internalName,
      generation: instance.generation,
      boundAgents: state.boundAgents.size,
      activeAgents: state.activeAgents.size,
      ...this.status(state.serverName, state.workspaceKey),
    };
  }

  /** 构造供面板与路由使用的排序快照。 */
  snapshot(serverName?: string): WorkspaceInstanceSnapshot[] {
    const states = [...this.states.values()].filter(
      (state) =>
        state.instance !== undefined &&
        (serverName === undefined || state.serverName === serverName),
    );
    return states
      .map((state) => this.snapshotOf(state))
      .sort((left, right) =>
        left.serverName === right.serverName
          ? left.workspace.localeCompare(right.workspace)
          : left.serverName.localeCompare(right.serverName),
      );
  }

  /** 关闭全部实例并拒绝后续获取；超时清理仍由后台 watch 收尾。 */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const states = [...this.states.values()];
    await Promise.all(states.map((state) => this.closeState(state)));
    this.states.clear();
  }
}

/** 从 Manager 完整列表判定一次清理是否已有终态。 */
function cleanupOutcome(
  views: McpManagedServerView[],
  state: KeyState,
): WorkspaceCleanupResult | undefined {
  const view = views.find((candidate) => candidate.name === state.internalName);
  if (view === undefined) {
    return { serverName: state.serverName, workspace: state.workspaceKey, state: 'closed' };
  }
  if (!view.configured && view.status.state === 'failed' && view.status.reason === 'cleanup') {
    const result = view.status.result;
    const error =
      result.cleanupError ??
      (result.closeConfirmed === false
        ? `MCP cleanup for '${state.internalName}' could not confirm child process closure.`
        : `MCP cleanup for '${state.internalName}' failed.`);
    return { serverName: state.serverName, workspace: state.workspaceKey, state: 'failed', error };
  }
  return undefined;
}

/** 提取清理异常文本。 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 定义中影响工作区实例连接的部分。 */
function connectionOf(definition: ServerDefinition): Record<string, unknown> {
  const { description: _description, lazy: _lazy, ...rest } = definition;
  return rest;
}
