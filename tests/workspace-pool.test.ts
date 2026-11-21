// 工作区实例池：并发注册、Agent 引用、配置换代与 Manager 清理屏障。
import { describe, expect, it, vi } from 'vitest';

import type { PluginConfig, ServerDefinition } from '../src/config.ts';
import { ServerManager } from '../src/servers.ts';
import { workspaceInternalName } from '../src/workspace-names.ts';
import { WorkspacePool } from '../src/workspace-pool.ts';
import { type FakeAgent, type MockCtxState, makeAgent, makeCtx } from './helpers.ts';

/** 构造一个工作区级 stdio 定义。 */
function definition(overrides: Partial<ServerDefinition> = {}): ServerDefinition {
  return {
    description: 'workspace server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    cwd: 'configured-cwd',
    auth: 'none',
    lazy: true,
    workspace: true,
    ...overrides,
  };
}

/** 构造配置。 */
function settings(server: ServerDefinition | undefined = definition()): PluginConfig {
  return { servers: server === undefined ? {} : { serena: server } };
}

/** 构造使用动态配置的实例池。 */
function makePool(ctx: MockCtxState, getConfig: () => PluginConfig, cleanupTimeoutMs = 100) {
  const manager = new ServerManager(ctx as never, getConfig, { info: vi.fn(), warn: vi.fn() });
  return {
    manager,
    pool: new WorkspacePool(ctx as never, manager, { cleanupTimeoutMs }),
  };
}

/** 把测试 Agent 传给宿主类型签名。 */
function asAgent(agent: FakeAgent): never {
  return agent as never;
}

describe('WorkspacePool acquire 与引用', () => {
  it('规范化实例键，并发 acquire 只注册一次且覆盖 cwd', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { manager, pool } = makePool(ctx, () => config);
    const entryOf = vi.spyOn(manager, 'entryOf');
    const first = asAgent(makeAgent('one'));
    const second = asAgent(makeAgent('two'));

    const [left, right] = await Promise.all([
      pool.acquireActive(first, 'serena', 'd:\\Git\\Project One\\'),
      pool.acquireActive(second, 'serena', 'D:/Git/Project One'),
    ]);

    const internalName = workspaceInternalName('serena', 'D:/Git/Project One');
    expect(entryOf).toHaveBeenCalledTimes(1);
    expect(ctx._managerRegistered.size).toBe(1);
    expect(ctx._managerRegistered.get(internalName)?.entry.cwd).toBe('D:/Git/Project One');
    expect(left.internalName).toBe(internalName);
    expect(right.generation).toBe(left.generation);
    expect(left.boundAgents.size).toBe(2);
    expect(left.activeAgents.size).toBe(2);

    await pool.acquireActive(first, 'serena', '/tmp/另一个项目');
    expect(ctx._managerRegistered.size).toBe(2);
    expect(pool.list()).toHaveLength(2);
  });

  it('active 前通过注入回调检查规范化工作区，缺失时不保留引用或实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const manager = new ServerManager(ctx as never, () => config, { info: vi.fn(), warn: vi.fn() });
    const workspaceExists = vi.fn(async (workspace: string) => workspace !== 'D:/Git/Missing');
    const pool = new WorkspacePool(ctx as never, manager, { workspaceExists });
    const agent = asAgent(makeAgent());

    await expect(pool.acquireActive(agent, 'serena', 'd:\\Git\\Missing\\')).rejects.toThrow(
      "Workspace 'D:/Git/Missing' does not exist",
    );
    expect(workspaceExists).toHaveBeenCalledWith('D:/Git/Missing');
    expect(ctx._managerRegistered.size).toBe(0);
    expect(pool.list()).toEqual([]);
    await expect(pool.releaseActive(agent, 'serena', 'D:/Git/Missing')).resolves.toMatchObject({
      state: 'idle',
    });
  });

  it('active 启动失败时回滚本次引用，允许后续重试', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { manager, pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    vi.spyOn(manager, 'entryOf').mockRejectedValueOnce(new Error('start failed'));

    await expect(pool.acquireActive(agent, 'serena', '/tmp/project')).rejects.toThrow(
      'start failed',
    );
    expect(pool.list()).toEqual([]);
    await expect(pool.releaseActive(agent, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'idle',
    });
    await expect(pool.acquireActive(agent, 'serena', '/tmp/project')).resolves.toMatchObject({
      serverName: 'serena',
    });
  });

  it('纯目录绑定不启动实例，并阻止 closeIfUnused 关闭共享实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());

    pool.bind(agent, 'serena', '/tmp/project');
    expect(pool.list()).toEqual([]);
    expect(ctx._managerRegistered.size).toBe(0);
    await expect(pool.closeIfUnused('serena', '/tmp/project')).resolves.toMatchObject({
      state: 'retained',
    });
    await expect(pool.releaseBinding(agent, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'idle',
    });
  });

  it('从未 active 的共享绑定释放后返回 idle，不误报进程保留', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const first = asAgent(makeAgent('one'));
    const second = asAgent(makeAgent('two'));
    pool.bind(first, 'serena', '/tmp/project');
    pool.bind(second, 'serena', '/tmp/project');

    await expect(pool.releaseBinding(first, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'idle',
    });
    expect(ctx._managerRegistered.size).toBe(0);
  });

  it('inactive 在共享引用存在时保留，最后引用释放后等待关闭', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const first = asAgent(makeAgent('one'));
    const second = asAgent(makeAgent('two'));
    const instance = await pool.acquireActive(first, 'serena', '/tmp/project');
    await pool.acquireActive(second, 'serena', '/tmp/project');

    await expect(pool.releaseActive(first, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'retained',
    });
    expect(ctx._managerRegistered.has(instance.internalName)).toBe(true);
    expect(pool.list()[0]?.activeAgents.size).toBe(1);

    await expect(pool.releaseActive(second, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'closed',
    });
    expect(ctx._managerRegistered.size).toBe(0);
    expect(pool.list()).toEqual([]);
    expect(ctx._managerWatcherCount()).toBe(0);
  });

  it('目录绑定按 boundAgents 保留，Agent 释放本身保留实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const first = asAgent(makeAgent('one'));
    const second = asAgent(makeAgent('two'));
    const instance = await pool.acquireActive(first, 'serena', '/tmp/project');
    await pool.acquireActive(second, 'serena', '/tmp/project');

    pool.releaseAgent(first);
    expect(pool.list()[0]?.boundAgents.size).toBe(1);
    expect(pool.list()[0]?.activeAgents.size).toBe(1);
    expect(ctx._managerRegistered.has(instance.internalName)).toBe(true);

    await expect(pool.releaseBinding(second, 'serena', '/tmp/project')).resolves.toMatchObject({
      state: 'closed',
    });
    expect(ctx._managerRegistered.size).toBe(0);

    const retained = await pool.acquireActive(first, 'serena', '/tmp/project');
    pool.releaseAgent(first);
    expect(pool.list()[0]?.activeAgents.size).toBe(0);
    expect(ctx._managerRegistered.has(retained.internalName)).toBe(true);
    await expect(pool.closeIfUnused('serena', '/tmp/project')).resolves.toMatchObject({
      state: 'closed',
    });
  });

  it('releaseAgent 清理无实例状态及其 generation，重开可从 1 开始', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const before = await pool.acquireActive(agent, 'serena', '/tmp/project');
    expect(before.generation).toBe(1);

    await pool.releaseActive(agent, 'serena', '/tmp/project');
    pool.releaseAgent(agent);
    expect(pool.isCurrent('serena', '/tmp/project', before.generation)).toBe(false);

    const reopened = await pool.acquireActive(agent, 'serena', '/tmp/project');
    expect(reopened.generation).toBe(1);
  });

  it('active 等待当前 generation 从 connecting 到 connected', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const instance = await pool.acquireActive(agent, 'serena', '/tmp/project');
    ctx._setStatus(instance.internalName, { state: 'connecting' });
    let settled = false;
    const waiting = pool
      .waitForConnected(agent, instance, new AbortController().signal)
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(ctx._managerWatcherCount()).toBe(1));
    expect(settled).toBe(false);
    ctx._setStatus(instance.internalName, {
      state: 'connected',
      toolCount: 1,
      connectedAt: Date.now(),
    });
    await waiting;
    expect(settled).toBe(true);
    expect(ctx._managerWatcherCount()).toBe(0);
  });

  it('最终连接失败、取消、实例消失与 generation 失效均拒绝等待', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const instance = await pool.acquireActive(agent, 'serena', '/tmp/project');
    ctx._setStatus(instance.internalName, { state: 'connecting' });
    const failed = pool.waitForConnected(agent, instance, new AbortController().signal);
    await vi.waitFor(() => expect(ctx._managerWatcherCount()).toBe(1));
    ctx._setStatus(instance.internalName, {
      state: 'failed',
      reason: 'gave-up',
      lastError: 'connection exploded',
    });
    await expect(failed).rejects.toThrow('connection exploded');

    ctx._setStatus(instance.internalName, { state: 'connecting' });
    const controller = new AbortController();
    const cancelled = pool.waitForConnected(agent, instance, controller.signal);
    await vi.waitFor(() => expect(ctx._managerWatcherCount()).toBe(1));
    controller.abort(new Error('cancelled by caller'));
    await expect(cancelled).rejects.toThrow('cancelled by caller');

    ctx._setStatus(instance.internalName, { state: 'connecting' });
    const disappeared = pool.waitForConnected(agent, instance, new AbortController().signal);
    await vi.waitFor(() => expect(ctx._managerWatcherCount()).toBe(1));
    ctx._dropManager(instance.internalName);
    await expect(disappeared).rejects.toThrow(/disappeared|no longer active/);

    await pool.acquireActive(agent, 'serena', '/tmp/project');
    ctx._setStatus(instance.internalName, { state: 'connecting' });
    const stale = pool.waitForConnected(agent, instance, new AbortController().signal);
    await vi.waitFor(() => expect(ctx._managerWatcherCount()).toBe(1));
    await pool.restart('serena', '/tmp/project');
    await expect(stale).rejects.toThrow(/stale|no longer active|disappeared/);
  });
});

describe('WorkspacePool 清理', () => {
  it('名称消失时返回 closed，configured:false 的 failed/cleanup 返回结构化失败', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const instance = await pool.acquireActive(agent, 'serena', '/tmp/project');
    ctx._failCleanup(instance.internalName, 'cleanup exploded');

    const result = await pool.releaseActive(agent, 'serena', '/tmp/project');
    expect(result).toEqual({
      serverName: 'serena',
      workspace: '/tmp/project',
      state: 'failed',
      error: 'cleanup exploded',
    });
    expect(pool.status('serena', '/tmp/project')).toMatchObject({
      state: 'failed',
      cleanup: 'failed',
      error: 'cleanup exploded',
    });
    await expect(pool.acquireActive(agent, 'serena', '/tmp/project')).rejects.toThrow(
      'cleanup exploded',
    );
    expect(ctx._managerRegistered.size).toBe(0);
    expect(ctx._managerWatcherCount()).toBe(0);
  });

  it('超时返回 cleanup-unknown，后台 watch 继续到名称消失', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config, 5);
    const agent = asAgent(makeAgent());
    await pool.acquireActive(agent, 'serena', '/tmp/project');
    const register = ctx.mcpManager.register.bind(ctx.mcpManager);
    let finishClose: (() => void) | undefined;
    vi.spyOn(ctx.mcpManager, 'register').mockImplementation((name, entry) => {
      const dispose = register(name, entry);
      return () => {
        finishClose = dispose;
      };
    });
    await pool.restart('serena', '/tmp/project');

    const closing = pool.closeWorkspace('/tmp/project');
    expect(pool.status('serena', '/tmp/project').state).toBe('closing');
    await expect(closing).resolves.toEqual([expect.objectContaining({ state: 'cleanup-unknown' })]);
    expect(pool.status('serena', '/tmp/project').state).toBe('cleanup-unknown');
    expect(ctx._managerWatcherCount()).toBe(1);

    finishClose?.();
    await vi.waitFor(() => expect(pool.list()).toEqual([]));
    expect(ctx._managerRegistered.size).toBe(0);
    expect(ctx._managerWatcherCount()).toBe(0);
  });

  it('closeWorkspace 清除失效引用并剪除状态，重复关闭与重开不复活旧 generation', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const before = await pool.acquireActive(agent, 'serena', '/tmp/project');

    await expect(pool.closeWorkspace('/tmp/project')).resolves.toEqual([
      expect.objectContaining({ state: 'closed' }),
    ]);
    expect(pool.isCurrent('serena', '/tmp/project', before.generation)).toBe(false);
    await expect(pool.closeWorkspace('/tmp/project')).resolves.toEqual([]);

    const reopened = await pool.acquireActive(agent, 'serena', '/tmp/project');
    expect(reopened.generation).toBe(1);
    expect(reopened.activeAgents).toEqual(new Set([agent]));
  });

  it('dispose 关闭全部工作区实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    await pool.acquireActive(agent, 'serena', '/tmp/one');
    await pool.acquireActive(agent, 'serena', '/tmp/two');

    await pool.dispose();
    expect(ctx._managerRegistered.size).toBe(0);
    expect(pool.snapshot()).toEqual([]);
    await expect(pool.acquireActive(agent, 'serena', '/tmp/three')).rejects.toThrow('disposed');
  });
});

describe('WorkspacePool generation、重启与状态', () => {
  it('restart 重建目标实例并保留引用，snapshot 提供路由身份', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const before = await pool.acquireActive(agent, 'serena', '/tmp/project');

    const restarted = await pool.restart('serena', '/tmp/project');
    expect(restarted.generation).toBeGreaterThan(before.generation);
    expect(restarted.workspace).toBe('/tmp/project');
    expect(restarted.state).toBe('connected');
    expect(restarted.activeAgents).toBe(1);
    expect(ctx._managerDisposals).toEqual([before.internalName]);
    expect(pool.snapshot('serena')).toEqual([restarted]);
    expect(pool.status('serena', '/tmp/missing').state).toBe('idle');
  });

  it('省略 workspace 时只重启该配置的全部现有实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const first = await pool.acquireActive(agent, 'serena', '/tmp/one');
    const second = await pool.acquireActive(agent, 'serena', '/tmp/two');

    const restarted = await pool.restart('serena');
    expect(restarted.map((item) => item.workspace)).toEqual(['/tmp/one', '/tmp/two']);
    expect(restarted[0]?.generation).toBeGreaterThan(first.generation);
    expect(restarted[1]?.generation).toBeGreaterThan(second.generation);
    expect(ctx._managerDisposals).toHaveLength(2);
    expect(ctx._managerRegistered.size).toBe(2);
    await expect(pool.restart('serena', '/tmp/missing')).rejects.toThrow(
      'No workspace MCP instance',
    );
  });

  it('简介变化保留 generation，连接字段变化重建，删除配置关闭实例', async () => {
    const ctx = makeCtx();
    let config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const before = await pool.acquireActive(agent, 'serena', '/tmp/project');

    const described = settings(definition({ description: 'new description' }));
    await pool.reconcile(config, described);
    config = described;
    expect(pool.list()[0]?.generation).toBe(before.generation);
    expect(ctx._managerDisposals).toEqual([]);

    const changed = settings(definition({ command: 'npx' }));
    const reconciling = pool.reconcile(described, changed);
    config = changed;
    await reconciling;
    const rebuilt = pool.list()[0];
    expect(rebuilt?.generation).toBeGreaterThan(before.generation);
    expect(ctx._managerRegistered.get(before.internalName)?.entry.command).toBe('npx');

    const removed: PluginConfig = { servers: {} };
    const removing = pool.reconcile(changed, removed);
    config = removed;
    await removing;
    expect(pool.list()).toEqual([]);
    expect(ctx._managerRegistered.size).toBe(0);
  });

  it('配置变化使等待中的 acquire 放弃旧 generation', async () => {
    const ctx = makeCtx();
    let config = settings();
    const { manager, pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent());
    const originalEntryOf = manager.entryOf.bind(manager);
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    vi.spyOn(manager, 'entryOf').mockImplementation(async (serverName, workspace) => {
      calls += 1;
      const entry = await originalEntryOf(serverName, workspace);
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return entry;
    });

    const acquiring = pool.acquireActive(agent, 'serena', '/tmp/project');
    await vi.waitFor(() => expect(calls).toBe(1));
    const changed = settings(definition({ command: 'npx' }));
    const reconciling = pool.reconcile(config, changed);
    config = changed;
    releaseFirst?.();
    const acquired = await acquiring;
    await reconciling;

    expect(calls).toBe(2);
    expect(acquired.generation).toBeGreaterThan(1);
    expect(ctx._managerRegistered.get(acquired.internalName)?.entry.command).toBe('npx');
    expect(ctx._managerRegistered.size).toBe(1);
  });

  it('close 等待期间的 acquire 排队创建新 generation，旧实例不会复活', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config, 5);
    const agent = asAgent(makeAgent());
    const before = await pool.acquireActive(agent, 'serena', '/tmp/project');
    const register = ctx.mcpManager.register.bind(ctx.mcpManager);
    let finishClose: (() => void) | undefined;
    vi.spyOn(ctx.mcpManager, 'register').mockImplementation((name, entry) => {
      const dispose = register(name, entry);
      return () => {
        finishClose = dispose;
      };
    });
    await pool.restart('serena', '/tmp/project');
    const closingGeneration = pool.list()[0]?.generation ?? 0;

    const closing = pool.closeWorkspace('/tmp/project');
    const acquiring = pool.acquireActive(agent, 'serena', '/tmp/project');
    await closing;
    expect(pool.list()[0]?.generation).toBe(closingGeneration);
    finishClose?.();
    const acquired = await acquiring;

    expect(acquired.generation).toBeGreaterThan(closingGeneration);
    expect(pool.list()).toHaveLength(1);
    expect(pool.list()[0]?.generation).toBe(acquired.generation);
    expect(ctx._managerRegistered.has(before.internalName)).toBe(true);
  });
});

describe('WorkspacePool 按 Agent 释放 active 引用', () => {
  it('释放该 Agent 的全部 active 引用并逐键返回清理结果，保留目录绑定', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent('one'));
    const other = asAgent(makeAgent('two'));
    await pool.acquireActive(agent, 'serena', '/tmp/one');
    await pool.acquireActive(agent, 'serena', '/tmp/two');
    await pool.acquireActive(other, 'serena', '/tmp/two');

    const results = await pool.releaseAgentActive(agent);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workspace: '/tmp/one', state: 'closed' }),
        expect.objectContaining({ workspace: '/tmp/two', state: 'retained' }),
      ]),
    );
    expect(results).toHaveLength(2);
    expect(ctx._managerRegistered.has(workspaceInternalName('serena', '/tmp/one'))).toBe(false);
    const shared = pool.list().find((instance) => instance.workspaceKey === '/tmp/two');
    expect(shared?.activeAgents).toEqual(new Set([other]));
    expect(shared?.boundAgents.has(agent)).toBe(true);
  });

  it('没有 active 引用时返回空数组且不关闭仅绑定的实例', async () => {
    const ctx = makeCtx();
    const config = settings();
    const { pool } = makePool(ctx, () => config);
    const agent = asAgent(makeAgent('one'));
    const other = asAgent(makeAgent('two'));
    pool.bind(agent, 'serena', '/tmp/project');
    await pool.acquireActive(other, 'serena', '/tmp/project');

    await expect(pool.releaseAgentActive(agent)).resolves.toEqual([]);
    expect(ctx._managerRegistered.size).toBe(1);
  });
});
