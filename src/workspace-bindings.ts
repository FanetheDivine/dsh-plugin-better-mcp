/** Agent 工作区绑定、目录切换关闭屏障与缺失检测。 */
import type { Agent, SettingsReader } from './types.ts';
import { normalizeWorkspaceKey } from './workspace-names.ts';
import type { WorkspaceCleanupResult, WorkspacePool } from './workspace-pool.ts';

/** 绑定运行时使用的实例池接口。 */
export type WorkspaceBindingPool = Pick<
  WorkspacePool,
  'bind' | 'releaseBinding' | 'releaseAgent' | 'closeWorkspace'
>;

/** 目录切换完成后的清理结果回调。 */
export type WorkspaceCleanupCallback = (
  agent: Agent,
  oldWorkspace: string,
  newWorkspace: string,
  results: WorkspaceCleanupResult[],
) => void;

/** 当前工作区缺失后的清理结果回调。 */
export type WorkspaceMissingCallback = (
  agent: Agent,
  workspace: string,
  results: WorkspaceCleanupResult[],
) => void;

/** 工作区绑定运行时选项。 */
export interface WorkspaceBindingsOptions {
  readonly pool: WorkspaceBindingPool;
  readonly getSettings: SettingsReader;
  readonly currentWorkspaceKey: (agent: Agent) => string | undefined;
  readonly workspaceExists?: (workspaceKey: string) => boolean;
  readonly onDeactivate: (agent: Agent, serverName: string) => void;
  readonly onCleanup?: WorkspaceCleanupCallback;
  readonly onMissing?: WorkspaceMissingCallback;
}

/** 维护 Agent 的目录引用，并在切换或缺失时使旧代理失效。 */
export class WorkspaceBindings {
  private readonly bound = new WeakMap<Agent, string>();
  /** 已完成的缺失目录清理，目录恢复或切换后允许再次检测。 */
  private readonly missing = new WeakMap<Agent, string>();
  private readonly pool: WorkspaceBindingPool;
  private readonly getSettings: SettingsReader;
  private readonly currentWorkspaceKey: (agent: Agent) => string | undefined;
  private readonly workspaceExists: (workspaceKey: string) => boolean;
  private readonly onDeactivate: (agent: Agent, serverName: string) => void;

  /** T020 可接入目录切换提醒。 */
  public onCleanup: WorkspaceCleanupCallback | undefined;
  /** T020 可接入目录缺失提醒。 */
  public onMissing: WorkspaceMissingCallback | undefined;

  constructor(options: WorkspaceBindingsOptions) {
    this.pool = options.pool;
    this.getSettings = options.getSettings;
    this.currentWorkspaceKey = options.currentWorkspaceKey;
    this.workspaceExists = options.workspaceExists ?? (() => true);
    this.onDeactivate = options.onDeactivate;
    this.onCleanup = options.onCleanup;
    this.onMissing = options.onMissing;
  }

  /** 建立当前目录的全部配置绑定，不创建 MCP 实例。 */
  created(agent: Agent): void {
    this.missing.delete(agent);
    const workspace = this.workspaceOf(agent);
    if (workspace === undefined) return;
    this.bound.set(agent, workspace);
    this.bindAll(agent, workspace);
  }

  /** Agent 释放只移除其引用，保留工作区实例。 */
  disposed(agent: Agent): void {
    this.bound.delete(agent);
    this.missing.delete(agent);
    this.pool.releaseAgent(agent);
  }

  /** 先提交目录访问，再释放旧绑定、绑定新目录并等待旧实例清理结果。 */
  async access(
    request: { agent: Agent; path: string | null; signal: AbortSignal },
    next: () => Promise<string>,
  ): Promise<string> {
    const { agent } = request;
    const knownWorkspace = this.bound.get(agent);
    const oldWorkspace = knownWorkspace ?? this.workspaceOf(agent);
    const committed = await next();
    const newWorkspace = normalizeWorkspaceKey(this.currentWorkspaceKey(agent) ?? committed);
    this.missing.delete(agent);

    if (oldWorkspace === newWorkspace) {
      if (knownWorkspace === undefined) {
        this.bound.set(agent, newWorkspace);
        this.bindAll(agent, newWorkspace);
      }
      return committed;
    }

    this.bound.set(agent, newWorkspace);
    const serverNames = this.workspaceServerNames();
    this.deactivateAll(agent, serverNames);
    const cleaning =
      oldWorkspace === undefined
        ? Promise.resolve([])
        : Promise.all(
            serverNames.map(async (serverName): Promise<WorkspaceCleanupResult> => {
              try {
                return await this.pool.releaseBinding(agent, serverName, oldWorkspace);
              } catch (error) {
                return {
                  serverName,
                  workspace: oldWorkspace,
                  state: 'failed',
                  error: errorMessage(error),
                };
              }
            }),
          );
    this.bindAll(agent, newWorkspace);
    const results = await cleaning;
    if (oldWorkspace !== undefined) {
      this.report(() => this.onCleanup?.(agent, oldWorkspace, newWorkspace, results));
    }
    return committed;
  }

  /** 在下一步前检查目录；缺失时关闭实例并释放当前 Agent 的可见性。 */
  async checkAgent(agent: Agent): Promise<WorkspaceCleanupResult[] | undefined> {
    const workspace = this.workspaceOf(agent);
    if (workspace === undefined) return undefined;
    if (this.workspaceExists(workspace)) {
      this.missing.delete(agent);
      return undefined;
    }
    if (this.missing.get(agent) === workspace) return undefined;
    this.missing.set(agent, workspace);

    const serverNames = this.workspaceServerNames();
    this.deactivateAll(agent, serverNames);
    let results: WorkspaceCleanupResult[];
    try {
      results = await this.pool.closeWorkspace(workspace);
    } catch (error) {
      results = serverNames.map((serverName) => ({
        serverName,
        workspace,
        state: 'failed',
        error: errorMessage(error),
      }));
    }
    this.report(() => this.onMissing?.(agent, workspace, results));
    return results;
  }

  /** 读取并规范化 Agent 当前工作区。 */
  private workspaceOf(agent: Agent): string | undefined {
    const workspace = this.bound.get(agent) ?? this.currentWorkspaceKey(agent);
    return workspace === undefined ? undefined : normalizeWorkspaceKey(workspace);
  }

  /** 当前全部工作区级配置名，保持配置声明顺序。 */
  private workspaceServerNames(): string[] {
    return Object.entries(this.getSettings().servers)
      .filter(([, definition]) => definition.workspace === true)
      .map(([serverName]) => serverName);
  }

  /** 绑定全部工作区配置；实例仍由 active 获取。 */
  private bindAll(agent: Agent, workspace: string): void {
    for (const serverName of this.workspaceServerNames()) {
      this.pool.bind(agent, serverName, workspace);
    }
  }

  /** 立即停用全部旧工作区代理。 */
  private deactivateAll(agent: Agent, serverNames: readonly string[]): void {
    for (const serverName of serverNames) {
      this.report(() => this.onDeactivate(agent, serverName));
    }
  }

  /** 结果回调属于提交后的通知，异常不改变目录访问结果。 */
  private report(callback: () => void): void {
    try {
      callback();
    } catch {
      // 调用方回调不得回滚已提交目录或阻止清理。
    }
  }
}

/** 提取清理异常文本。 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
