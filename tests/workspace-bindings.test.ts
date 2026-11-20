// Agent 工作区绑定：创建、目录切换清理屏障、缺失检测与释放。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { PluginConfig, ServerDefinition } from '../src/config.ts';
import { apply } from '../src/index.ts';
import { WorkspaceBindings } from '../src/workspace-bindings.ts';
import { workspaceInternalName } from '../src/workspace-names.ts';
import type { WorkspaceCleanupResult } from '../src/workspace-pool.ts';
import { type FakeAgent, makeAgent, makeCtx, volatile } from './helpers.ts';

/** 构造服务器定义。 */
function definition(workspace: boolean): ServerDefinition {
  return {
    description: workspace ? 'workspace server' : 'shared server',
    transport: 'stdio',
    command: 'node',
    auth: 'none',
    lazy: true,
    workspace,
  };
}

/** 构造两台工作区服务器与一台共享服务器。 */
function settings(): PluginConfig {
  return {
    servers: {
      alpha: definition(true),
      beta: definition(true),
      shared: definition(false),
    },
  };
}

/** 构造清理结果。 */
function cleanup(
  serverName: string,
  workspace: string,
  state: WorkspaceCleanupResult['state'] = 'closed',
  error?: string,
): WorkspaceCleanupResult {
  return {
    serverName,
    workspace,
    state,
    ...(error === undefined ? {} : { error }),
  };
}

/** 构造可编程实例池与绑定运行时。 */
function harness(agent: FakeAgent, workspaceExists: (workspace: string) => boolean = () => true) {
  const pool = {
    bind: vi.fn(),
    releaseBinding: vi.fn(async (_agent: FakeAgent, serverName: string, workspace: string) =>
      cleanup(serverName, workspace),
    ),
    releaseAgent: vi.fn(),
    closeWorkspace: vi.fn(async () => [] as WorkspaceCleanupResult[]),
  };
  const onDeactivate = vi.fn();
  const onCleanup = vi.fn();
  const onMissing = vi.fn();
  const bindings = new WorkspaceBindings({
    pool: pool as never,
    getSettings: settings,
    currentWorkspaceKey: (candidate) => candidate.cwd,
    workspaceExists,
    onDeactivate,
    onCleanup,
    onMissing,
  });
  bindings.created(agent);
  return { pool, bindings, onDeactivate, onCleanup, onMissing };
}

/** 把测试 Agent 传给宿主类型签名。 */
function asAgent(agent: FakeAgent): never {
  return agent as never;
}

/** 构造目录访问参数。 */
function request(agent: FakeAgent, path: string | null) {
  return {
    agent: asAgent(agent),
    path,
    signal: new AbortController().signal,
  };
}

describe('WorkspaceBindings 创建与释放', () => {
  it('创建时绑定全部工作区配置但不启动，释放时只释放 Agent 引用', () => {
    const agent = makeAgent('one', '/tmp/one');
    const { pool, bindings } = harness(agent);

    expect(pool.bind.mock.calls).toEqual([
      [agent, 'alpha', '/tmp/one'],
      [agent, 'beta', '/tmp/one'],
    ]);
    expect(pool.releaseBinding).not.toHaveBeenCalled();
    expect(pool.closeWorkspace).not.toHaveBeenCalled();

    bindings.disposed(asAgent(agent));
    expect(pool.releaseAgent).toHaveBeenCalledExactlyOnceWith(agent);
    expect(pool.releaseBinding).not.toHaveBeenCalled();
    expect(pool.closeWorkspace).not.toHaveBeenCalled();
  });

  it('支持创建后设置 T020 清理与缺失回调', async () => {
    const agent = makeAgent('one', '/tmp/old');
    const onDeactivate = vi.fn();
    const pool = {
      bind: vi.fn(),
      releaseBinding: vi.fn(async (_agent: FakeAgent, serverName: string) =>
        cleanup(serverName, '/tmp/old', 'closed'),
      ),
      releaseAgent: vi.fn(),
      closeWorkspace: vi.fn(async () => [cleanup('alpha', '/tmp/old')]),
    };
    const bindings = new WorkspaceBindings({
      pool: pool as never,
      getSettings: () => ({ servers: { alpha: definition(true) } }),
      currentWorkspaceKey: (candidate) => candidate.cwd,
      workspaceExists: () => false,
      onDeactivate,
    });
    const onCleanup = vi.fn();
    const onMissing = vi.fn();
    bindings.onCleanup = onCleanup;
    bindings.onMissing = onMissing;
    bindings.created(asAgent(agent));

    agent.cwd = '/tmp/new';
    await bindings.access(request(agent, '/tmp/new'), async () => '/tmp/new');
    expect(onCleanup).toHaveBeenCalledExactlyOnceWith(agent, '/tmp/old', '/tmp/new', [
      cleanup('alpha', '/tmp/old'),
    ]);

    await bindings.checkAgent(asAgent(agent));
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(agent, '/tmp/new', [
      cleanup('alpha', '/tmp/old'),
    ]);
  });
});

describe('WorkspaceBindings 目录切换', () => {
  it('next 提交后停用旧代理，等待旧目录清理并绑定新目录', async () => {
    const agent = makeAgent('one', '/tmp/old');
    const { pool, bindings, onDeactivate, onCleanup } = harness(agent);
    let finishAlpha: ((result: WorkspaceCleanupResult) => void) | undefined;
    pool.releaseBinding.mockImplementation(
      (_agent: FakeAgent, serverName: string, workspace: string) =>
        new Promise<WorkspaceCleanupResult>((resolve) => {
          if (serverName === 'alpha') finishAlpha = resolve;
          else resolve(cleanup(serverName, workspace));
        }),
    );
    const order: string[] = [];
    onDeactivate.mockImplementation(() => order.push(`deactivate:${agent.cwd}`));
    pool.bind.mockImplementation(() => order.push(`bind:${agent.cwd}`));
    const next = vi.fn(async () => {
      order.push('next');
      agent.cwd = '/tmp/new';
      return '/tmp/new';
    });

    let settled = false;
    const accessing = bindings.access(request(agent, '/tmp/new'), next).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(pool.releaseBinding).toHaveBeenCalledTimes(2));

    expect(agent.cwd).toBe('/tmp/new');
    expect(order[0]).toBe('next');
    expect(order).toContain('deactivate:/tmp/new');
    expect(onDeactivate.mock.calls).toEqual([
      [agent, 'alpha'],
      [agent, 'beta'],
    ]);
    expect(pool.releaseBinding.mock.calls).toEqual([
      [agent, 'alpha', '/tmp/old'],
      [agent, 'beta', '/tmp/old'],
    ]);
    expect(pool.bind.mock.calls.slice(2)).toEqual([
      [agent, 'alpha', '/tmp/new'],
      [agent, 'beta', '/tmp/new'],
    ]);
    expect(settled).toBe(false);

    finishAlpha?.(cleanup('alpha', '/tmp/old'));
    await expect(accessing).resolves.toBe('/tmp/new');
    expect(onCleanup).toHaveBeenCalledExactlyOnceWith(agent, '/tmp/old', '/tmp/new', [
      cleanup('alpha', '/tmp/old'),
      cleanup('beta', '/tmp/old'),
    ]);
  });

  it('共享旧绑定时保留实例，当前 Agent 仍切换并停用旧代理', async () => {
    const agent = makeAgent('one', '/tmp/old');
    const { pool, bindings, onCleanup, onDeactivate } = harness(agent);
    pool.releaseBinding.mockImplementation(
      async (_agent: FakeAgent, serverName: string, workspace: string) =>
        cleanup(serverName, workspace, 'retained'),
    );

    const result = await bindings.access(request(agent, '/tmp/new'), async () => {
      agent.cwd = '/tmp/new';
      return '/tmp/new';
    });

    expect(result).toBe('/tmp/new');
    expect(onDeactivate).toHaveBeenCalledTimes(2);
    expect(onCleanup).toHaveBeenCalledWith(agent, '/tmp/old', '/tmp/new', [
      cleanup('alpha', '/tmp/old', 'retained'),
      cleanup('beta', '/tmp/old', 'retained'),
    ]);
    expect(pool.closeWorkspace).not.toHaveBeenCalled();
  });

  it('清理失败、超时或拒绝均保留新 cwd 并返回结构化结果', async () => {
    const agent = makeAgent('one', '/tmp/old');
    const { pool, bindings, onCleanup } = harness(agent);
    pool.releaseBinding.mockImplementation(
      async (_agent: FakeAgent, serverName: string, workspace: string) => {
        if (serverName === 'alpha') {
          return cleanup(serverName, workspace, 'cleanup-unknown', 'cleanup timed out');
        }
        throw new Error('cleanup exploded');
      },
    );

    const result = await bindings.access(request(agent, '/tmp/new'), async () => {
      agent.cwd = '/tmp/new';
      return '/tmp/new';
    });

    expect(result).toBe('/tmp/new');
    expect(agent.cwd).toBe('/tmp/new');
    expect(onCleanup).toHaveBeenCalledExactlyOnceWith(agent, '/tmp/old', '/tmp/new', [
      cleanup('alpha', '/tmp/old', 'cleanup-unknown', 'cleanup timed out'),
      cleanup('beta', '/tmp/old', 'failed', 'cleanup exploded'),
    ]);
    expect(pool.bind).toHaveBeenCalledWith(agent, 'alpha', '/tmp/new');
    expect(pool.bind).toHaveBeenCalledWith(agent, 'beta', '/tmp/new');
  });

  it('next 拒绝时不改绑定也不清理', async () => {
    const agent = makeAgent('one', '/tmp/old');
    const { pool, bindings, onDeactivate, onCleanup } = harness(agent);

    await expect(
      bindings.access(request(agent, '/tmp/new'), async () => {
        throw new Error('invalid target');
      }),
    ).rejects.toThrow('invalid target');
    expect(agent.cwd).toBe('/tmp/old');
    expect(pool.bind).toHaveBeenCalledTimes(2);
    expect(pool.releaseBinding).not.toHaveBeenCalled();
    expect(onDeactivate).not.toHaveBeenCalled();
    expect(onCleanup).not.toHaveBeenCalled();
  });
});

describe('WorkspaceBindings 缺失检测', () => {
  it('目录存在时不关闭也不提醒', async () => {
    const agent = makeAgent('one', '/tmp/project');
    const { pool, bindings, onDeactivate, onMissing } = harness(agent);

    await expect(bindings.checkAgent(asAgent(agent))).resolves.toBeUndefined();
    expect(pool.closeWorkspace).not.toHaveBeenCalled();
    expect(onDeactivate).not.toHaveBeenCalled();
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('目录缺失时关闭全部实例、停用代理并暴露关闭结果', async () => {
    const agent = makeAgent('one', '/tmp/missing');
    const results = [
      cleanup('alpha', '/tmp/missing'),
      cleanup('beta', '/tmp/missing', 'failed', 'still occupied'),
    ];
    const { pool, bindings, onDeactivate, onMissing } = harness(agent, () => false);
    pool.closeWorkspace.mockResolvedValue(results);

    await expect(bindings.checkAgent(asAgent(agent))).resolves.toEqual(results);
    expect(pool.closeWorkspace).toHaveBeenCalledExactlyOnceWith('/tmp/missing');
    expect(onDeactivate.mock.calls).toEqual([
      [agent, 'alpha'],
      [agent, 'beta'],
    ]);
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(agent, '/tmp/missing', results);
  });
});

describe('WorkspaceBindings 入口接线', () => {
  it('workingDirectory.set 提交后关闭旧实例并将当前服务器设为 inactive', async () => {
    const config = {
      servers: volatile({ serena: definition(true) }),
    };
    const oldWorkspace = process.cwd();
    const newWorkspace = join(oldWorkspace, 'tests');
    const agent = makeAgent('one', oldWorkspace);
    const ctx = makeCtx({ config });
    ctx._agents.push(agent);
    apply(ctx, config);
    await vi.waitFor(() =>
      expect(ctx._registeredTools.some((tool) => tool.name === 'mcp_manage')).toBe(true),
    );
    const manage = ctx._registeredTools.find((tool) => tool.name === 'mcp_manage');
    await manage?.execute({ server: 'serena', command: 'active' }, {
      agent,
      signal: new AbortController().signal,
    } as never);
    const oldInternalName = workspaceInternalName('serena', oldWorkspace);
    expect(ctx._managerRegistered.has(oldInternalName)).toBe(true);

    await expect(ctx.workingDirectory.set(asAgent(agent), newWorkspace)).resolves.toBe(
      newWorkspace,
    );
    expect(agent.cwd).toBe(newWorkspace);
    expect(ctx._managerRegistered.size).toBe(0);
    const catalog = agent.inbox.nextStep.findLast(
      (message) => (message.source as { kind?: unknown }).kind === 'better-mcp-catalog',
    );
    const source = catalog?.source as
      | {
          entries?: Array<{ name: string; active: boolean }>;
          notices?: Array<{ kind: string; state: string }>;
        }
      | undefined;
    expect(source?.entries).toContainEqual(
      expect.objectContaining({ name: 'serena', active: false }),
    );
    expect(source?.notices).toContainEqual(
      expect.objectContaining({ kind: 'workspace-cleanup', state: 'closed' }),
    );
    expect(JSON.stringify(catalog?.content)).toContain('The working directory changed from');
    expect(JSON.stringify(catalog?.content)).toContain('direct stdio child process has closed');
    ctx._dispose();
  });

  it('agent/pre-step 检测缺失目录并关闭实例', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'better-mcp-bindings-'));
    const config = {
      servers: volatile({ serena: definition(true) }),
    };
    const agent = makeAgent('one', workspace);
    const ctx = makeCtx({ config });
    ctx._agents.push(agent);
    try {
      apply(ctx, config);
      await vi.waitFor(() =>
        expect(ctx._registeredTools.some((tool) => tool.name === 'mcp_manage')).toBe(true),
      );
      const manage = ctx._registeredTools.find((tool) => tool.name === 'mcp_manage');
      await manage?.execute({ server: 'serena', command: 'active' }, {
        agent,
        signal: new AbortController().signal,
      } as never);
      expect(ctx._managerRegistered.size).toBe(1);
      rmSync(workspace, { recursive: true });

      const decision = (await ctx._waterfall(
        'agent/pre-step',
        { agent, messages: [] },
        { kind: 'enter', messages: [] },
      )) as { messages: Array<{ source: unknown }> };
      expect(ctx._managerRegistered.size).toBe(0);
      const catalog = decision.messages.find(
        (message) => (message.source as { kind?: unknown }).kind === 'better-mcp-catalog',
      );
      const source = catalog?.source as
        | {
            entries?: Array<{ name: string; active: boolean }>;
            notices?: Array<{ kind: string; state: string }>;
          }
        | undefined;
      expect(source?.entries).toContainEqual(
        expect.objectContaining({ name: 'serena', active: false }),
      );
      expect(source?.notices).toContainEqual(
        expect.objectContaining({ kind: 'workspace-missing', state: 'closed' }),
      );
      expect(JSON.stringify(catalog?.content)).toContain('is missing');
    } finally {
      ctx._dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
