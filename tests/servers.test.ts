// 服务器生命周期：挂载、卸载、快照与对账。
import { describe, expect, it, vi } from 'vitest';

import type { PluginConfig } from '../src/config.ts';
import { recordKey } from '../src/credentials.ts';
import { ServerManager, statusOf } from '../src/servers.ts';
import { grantId } from '../src/utils.ts';
import { WorkspacePool } from '../src/workspace-pool.ts';
import { type MockCtxState, makeAgent, makeCtx } from './helpers.ts';

/** 配置。 */
function settings(servers: PluginConfig['servers']): PluginConfig {
  return { servers };
}

/** 构造管理器。 */
function makeManager(ctx: MockCtxState, config: PluginConfig) {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  };
  return new ServerManager(ctx as never, () => config, logger);
}

describe('mount', () => {
  it('只注册一次，并剔除插件字段、注入 Bearer', async () => {
    const ctx = makeCtx();
    await ctx.credentials.modifyRecord(recordKey(grantId('figma')), async () => ({
      kind: 'grant',
      payload: { accessToken: 'grant-token' },
    }));
    const manager = makeManager(
      ctx,
      settings({
        figma: {
          description: 'd',
          transport: 'streamable-http',
          url: 'https://mcp.figma.com/mcp',
          auth: 'oauth',
          lazy: true,
          oauth: { scopes: ['x'] },
        },
      }),
    );
    await manager.mount('figma');
    await manager.mount('figma');
    expect(ctx._managerRegistered.size).toBe(1);
    const entry = ctx._managerRegistered.get('figma')?.entry;
    expect(entry).toMatchObject({
      transport: 'streamable-http',
      url: 'https://mcp.figma.com/mcp',
      headers: { Authorization: 'Bearer grant-token' },
    });
    expect(entry).not.toHaveProperty('description');
    expect(entry).not.toHaveProperty('lazy');
    expect(entry).not.toHaveProperty('auth');
    expect(entry).not.toHaveProperty('oauth');
  });

  it('未授权时拒绝挂载 oauth 服务器', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        figma: {
          description: 'd',
          transport: 'streamable-http',
          url: 'https://x',
          auth: 'oauth',
          lazy: true,
        },
      }),
    );
    await expect(manager.mount('figma')).rejects.toThrow('needs authorization');
  });

  it('未知服务器报错', async () => {
    const ctx = makeCtx();
    const manager = makeManager(ctx, settings({}));
    await expect(manager.mount('missing')).rejects.toThrow('No configured MCP server');
  });

  it('shared 定义沿用共享挂载，workspace 定义不自动注册', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        shared: {
          description: 'd',
          transport: 'stdio',
          command: 'node',
          auth: 'none',
          lazy: false,
          workspace: false,
        },
        scoped: {
          description: 'd',
          transport: 'stdio',
          command: 'node',
          auth: 'none',
          lazy: true,
          workspace: true,
        },
      }),
    );
    await manager.mountAll('in test');
    await manager.mount('scoped');
    await manager.restart('scoped');
    expect([...ctx._managerRegistered.keys()]).toEqual(['shared']);
    expect(ctx._managerRegistered.get('shared')?.entry).not.toHaveProperty('workspace');
  });

  it('为工作区实例构造连接参数并覆盖 cwd', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        scoped: {
          description: 'd',
          transport: 'stdio',
          command: 'node',
          cwd: 'configured-cwd',
          auth: 'none',
          lazy: true,
          workspace: true,
        },
      }),
    );
    const entry = await manager.entryOf('scoped', '/workspace/project');
    expect(entry).toMatchObject({ transport: 'stdio', command: 'node', cwd: '/workspace/project' });
    expect(entry).not.toHaveProperty('workspace');
    expect(entry).not.toHaveProperty('description');
    expect(entry).not.toHaveProperty('lazy');
  });
});

describe('unmount', () => {
  it('卸载并幂等', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      }),
    );
    await manager.mount('one');
    await manager.unmount('one');
    await manager.unmount('one');
    expect(ctx._managerRegistered.size).toBe(0);
  });
});

describe('snapshot', () => {
  it('只列出配置内服务器并保留其管理器状态', async () => {
    const ctx = makeCtx({ external: ['external-one'] });
    ctx._setStatus('external-one', { state: 'connected', toolCount: 1, connectedAt: 0 });
    ctx._setStatus('figma', { state: 'connected', toolCount: 2, connectedAt: 0 });
    await ctx.credentials.modifyRecord(recordKey(grantId('figma')), async () => ({
      kind: 'grant',
      payload: { accessToken: 't' },
    }));
    const config = settings({
      figma: {
        description: 'd',
        transport: 'streamable-http',
        url: 'https://x',
        auth: 'oauth',
        lazy: true,
      },
    });
    const manager = makeManager(ctx, config);
    const snapshot = await manager.snapshot();
    expect(snapshot.servers.map((row) => row.name)).toEqual(['figma']);
    expect(snapshot.servers[0]).toMatchObject({
      lazy: true,
      authorized: true,
      auth: 'oauth',
      state: 'connected',
      toolCount: 2,
    });
    expect(snapshot.servers[0]).not.toHaveProperty('managed');
  });

  it('快照包含脱敏定义', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        one: {
          description: 'd',
          transport: 'streamable-http',
          url: 'https://x',
          auth: 'oauth',
          lazy: true,
          oauth: { scopes: [], clientSecret: 'hide-me' },
        },
      }),
    );
    const snapshot = await manager.snapshot();
    expect(snapshot.servers[0]?.definition).toMatchObject({ url: 'https://x' });
    expect(JSON.stringify(snapshot.servers[0]?.definition)).not.toContain('hide-me');
  });

  it('快照标识 shared 与 workspace 定义', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        scoped: {
          description: 'd',
          transport: 'stdio',
          command: 'node',
          auth: 'none',
          lazy: false,
          workspace: true,
        },
        shared: {
          description: 'd',
          transport: 'stdio',
          command: 'node',
          auth: 'none',
          lazy: false,
        },
      }),
    );
    const snapshot = await manager.snapshot();
    expect(snapshot.servers).toEqual([
      expect.objectContaining({ name: 'scoped', workspace: true, lazy: true, mounted: false }),
      expect.objectContaining({ name: 'shared', workspace: false, lazy: false }),
    ]);
  });
});

describe('reconcile', () => {
  it('卸载移除、挂载新增、重建变更', async () => {
    const ctx = makeCtx();
    let config = settings({
      removed: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      kept: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const manager = new ServerManager(ctx as never, () => config, { info: vi.fn(), warn: vi.fn() });
    await manager.mount('removed');
    await manager.mount('kept');
    const previous = config;
    config = settings({
      kept: { description: 'd', transport: 'stdio', command: 'npx', auth: 'none', lazy: false },
      added: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    await manager.reconcile(previous, config);
    expect(ctx._managerRegistered.has('removed')).toBe(false);
    expect(ctx._managerRegistered.get('kept')?.entry.command).toBe('npx');
    expect(ctx._managerRegistered.has('added')).toBe(true);
  });

  it('懒加载新增也挂载', async () => {
    const ctx = makeCtx();
    const previous = settings({});
    const next = settings({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const manager = makeManager(ctx, next);
    await manager.reconcile(previous, next);
    expect(ctx._managerRegistered.size).toBe(1);
  });

  it('只改简介或懒加载时保留连接', async () => {
    const ctx = makeCtx();
    const previous = settings({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const manager = makeManager(ctx, previous);
    await manager.mount('one');
    const entry = ctx._managerRegistered.get('one');
    const next = settings({
      one: { description: 'new', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    await manager.reconcile(previous, next);
    expect(ctx._managerRegistered.get('one')).toBe(entry);
  });

  it('shared 与 workspace 互转只维护共享实例', async () => {
    const ctx = makeCtx();
    let config = settings({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const manager = new ServerManager(ctx as never, () => config, { info: vi.fn(), warn: vi.fn() });
    await manager.mount('one');
    expect(ctx._managerRegistered.has('one')).toBe(true);

    const shared = config;
    config = settings({
      one: {
        description: 'd',
        transport: 'stdio',
        command: 'node',
        auth: 'none',
        lazy: true,
        workspace: true,
      },
    });
    await manager.reconcile(shared, config);
    expect(ctx._managerRegistered.size).toBe(0);

    const scoped = config;
    config = settings({
      one: {
        description: 'd',
        transport: 'stdio',
        command: 'node',
        auth: 'none',
        lazy: false,
        workspace: false,
      },
    });
    await manager.reconcile(scoped, config);
    expect(ctx._managerRegistered.get('one')?.entry.command).toBe('node');
    expect(ctx._managerRegistered.get('one')?.entry).not.toHaveProperty('workspace');
  });
});

describe('statusOf', () => {
  it('输出结构化状态字段', () => {
    expect(statusOf(undefined)).toEqual({ state: 'idle' });
    expect(statusOf({ state: 'connected', toolCount: 2, connectedAt: 5 })).toEqual({
      state: 'connected',
      toolCount: 2,
      connectedAt: 5,
    });
    expect(
      statusOf({
        state: 'reconnecting',
        attempt: 1,
        maxAttempts: 3,
        nextRetryAtMs: 0,
        lastError: 'boom',
      }),
    ).toEqual({ state: 'reconnecting', attempt: 1, maxAttempts: 3, error: 'boom' });
    expect(statusOf({ state: 'failed', reason: 'cleanup' })).toEqual({
      state: 'failed',
      cleanup: 'failed',
    });
    expect(statusOf({ state: 'closed', result: { closeConfirmed: false } })).toEqual({
      state: 'closed',
      cleanup: 'unconfirmed',
    });
    expect(statusOf({ state: 'closed', result: { closeConfirmed: true } })).toEqual({
      state: 'closed',
    });
  });
});
