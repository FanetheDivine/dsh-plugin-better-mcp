// 服务器生命周期：挂载、卸载、快照与对账。
import { describe, expect, it, vi } from 'vitest';

import type { PluginConfig } from '../src/config.ts';
import { recordKey } from '../src/credentials.ts';
import { ServerManager, statusOf } from '../src/servers.ts';
import { grantId } from '../src/utils.ts';
import { type MockCtxState, makeCtx } from './helpers.ts';

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
  it('合并配置与管理器，按名称排序', async () => {
    const ctx = makeCtx({ external: ['external-one'] });
    ctx._setStatus('external-one', { state: 'connected', toolCount: 1, connectedAt: 0 });
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
    expect(snapshot.servers.map((row) => row.name)).toEqual(['external-one', 'figma']);
    expect(snapshot.servers[0]).toMatchObject({ managed: false, lazy: false, mounted: false });
    expect(snapshot.servers[1]).toMatchObject({
      managed: true,
      lazy: true,
      authorized: true,
      auth: 'oauth',
    });
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
