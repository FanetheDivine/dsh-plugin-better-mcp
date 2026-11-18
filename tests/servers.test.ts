// 服务器生命周期：挂载、卸载、等待连接、工具名解析与快照对账。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginConfig } from '../src/config.ts';
import { recordKey } from '../src/credentials.ts';
import { ServerManager, statusOf } from '../src/servers.ts';
import { setLazy } from '../src/state.ts';
import { grantId } from '../src/utils.ts';
import { type MockCtxState, makeCtx } from './helpers.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'better-mcp-servers-'));
  process.env.DSH_HOME = home;
});

afterEach(async () => {
  delete process.env.DSH_HOME;
  await rm(home, { recursive: true, force: true });
});

/** 配置。 */
function settings(servers: PluginConfig['servers']): PluginConfig {
  return {
    servers,
    expose: {
      enabled: true,
      endpoint: '/better-mcp/mcp',
      groups: { harness: { include: [], exclude: [] } },
    },
  };
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
    await ctx.credentials.set('BETTER_MCP_TOKEN', 'endpoint');
    await ctx.credentials.modifyRecord(recordKey(grantId('figma')), async () => ({
      kind: 'grant',
      payload: { accessToken: 'grant-token' },
    }));
    const manager = makeManager(
      ctx,
      settings({
        figma: {
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
    expect(entry).not.toHaveProperty('lazy');
    expect(entry).not.toHaveProperty('auth');
    expect(entry).not.toHaveProperty('oauth');
  });

  it('未授权时拒绝挂载 oauth 服务器', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        figma: { transport: 'streamable-http', url: 'https://x', auth: 'oauth', lazy: true },
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
      settings({ one: { transport: 'stdio', command: 'node', auth: 'none', lazy: false } }),
    );
    await manager.mount('one');
    await manager.unmount('one');
    await manager.unmount('one');
    expect(ctx._managerRegistered.size).toBe(0);
  });
});

describe('waitConnected', () => {
  it('连接成功返回工具数', async () => {
    const ctx = makeCtx({
      statuses: { one: { state: 'connected', toolCount: 3, connectedAt: Date.now() } },
    });
    const manager = makeManager(ctx, settings({}));
    expect(await manager.waitConnected('one')).toEqual({ toolCount: 3 });
  });

  it('失败、等待凭据与 401 都抛错', async () => {
    const ctx = makeCtx();
    const manager = makeManager(ctx, settings({}));
    ctx._setStatus('one', { state: 'failed', reason: 'gave-up', lastError: 'boom' });
    await expect(manager.waitConnected('one')).rejects.toThrow('boom');
    ctx._setStatus('one', { state: 'waiting-credentials', lastError: 'sign in' });
    await expect(manager.waitConnected('one')).rejects.toThrow('waiting for credentials');
    ctx._setStatus('one', {
      state: 'reconnecting',
      attempt: 1,
      maxAttempts: 3,
      nextRetryAtMs: Date.now(),
      lastError: 'HTTP 401 Unauthorized',
    });
    await expect(manager.waitConnected('one')).rejects.toThrow('401');
  });

  it('超时抛错', async () => {
    vi.useFakeTimers();
    try {
      const ctx = makeCtx();
      const manager = makeManager(ctx, settings({}));
      const pending = expect(manager.waitConnected('one')).rejects.toThrow('Timed out');
      await vi.advanceTimersByTimeAsync(26_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('工具名解析与执行', () => {
  it('解析注册名、摘要后缀与缺失工具', async () => {
    const ctx = makeCtx();
    ctx._registeredTools.push(
      {
        name: 'mcp__figma__get_file',
        description: '',
        parameters: {},
        output: { schema: {}, render: () => [] },
        execute: async () => undefined,
      },
      {
        name: 'mcp__figma__list_abc123abc123',
        description: '',
        parameters: {},
        output: { schema: {}, render: () => [] },
        execute: async () => undefined,
      },
    );
    const manager = makeManager(ctx, settings({}));
    expect(manager.publicToolName('figma', 'get_file')).toBe('mcp__figma__get_file');
    expect(manager.publicToolName('figma', 'list')).toBe('mcp__figma__list_abc123abc123');
    expect(() => manager.publicToolName('figma', 'missing')).toThrow(
      'Available: get_file, list_abc123abc123',
    );
  });

  it('执行结果映射为内容与错误标记', async () => {
    const ctx = makeCtx({
      executeResult: { content: [{ type: 'text', text: 'hi' }], isError: false },
    });
    const manager = makeManager(ctx, settings({}));
    const outcome = await manager.execute('mcp__x__y', { a: 1 }, new AbortController().signal);
    expect(outcome).toEqual({ content: [{ type: 'text', text: 'hi' }], isError: false });
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
      figma: { transport: 'streamable-http', url: 'https://x', auth: 'oauth', lazy: true },
    });
    const manager = makeManager(ctx, config);
    const snapshot = await manager.snapshot(false);
    expect(snapshot.servers.map((row) => row.name)).toEqual(['external-one', 'figma']);
    expect(snapshot.servers[0]).toMatchObject({ managed: false, lazy: false, mounted: false });
    expect(snapshot.servers[1]).toMatchObject({
      managed: true,
      lazy: true,
      authorized: true,
      auth: 'oauth',
    });
    expect(snapshot.expose.groups[0]).toMatchObject({
      name: 'harness',
      url: '/better-mcp/mcp/harness',
    });
  });

  it('状态文件覆盖配置默认值', async () => {
    const ctx = makeCtx();
    await setLazy('one', false);
    const manager = makeManager(
      ctx,
      settings({ one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true } }),
    );
    expect((await manager.snapshot(false)).servers[0]?.lazy).toBe(false);
  });

  it('带令牌快照包含脱敏定义', async () => {
    const ctx = makeCtx();
    const manager = makeManager(
      ctx,
      settings({
        one: {
          transport: 'streamable-http',
          url: 'https://x',
          auth: 'oauth',
          lazy: true,
          oauth: { scopes: [], clientSecret: 'hide-me' },
        },
      }),
    );
    const snapshot = await manager.snapshot(true, async () => 'token');
    expect(snapshot.expose.token).toBe('token');
    expect(snapshot.servers[0]?.definition).toMatchObject({ url: 'https://x' });
    expect(JSON.stringify(snapshot.servers[0]?.definition)).not.toContain('hide-me');
  });
});

describe('reconcile', () => {
  it('卸载移除、挂载新增、重建变更', async () => {
    const ctx = makeCtx();
    let config = settings({
      removed: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      kept: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const manager = new ServerManager(ctx as never, () => config, { info: vi.fn(), warn: vi.fn() });
    await manager.mount('removed');
    await manager.mount('kept');
    const previous = config;
    config = settings({
      kept: { transport: 'stdio', command: 'npx', auth: 'none', lazy: false },
      added: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    await manager.reconcile(previous, config);
    expect(ctx._managerRegistered.has('removed')).toBe(false);
    expect(ctx._managerRegistered.get('kept')?.entry.command).toBe('npx');
    expect(ctx._managerRegistered.has('added')).toBe(true);
  });

  it('懒加载新增只登记不挂载', async () => {
    const ctx = makeCtx();
    const previous = settings({});
    const next = settings({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const manager = makeManager(ctx, next);
    await manager.reconcile(previous, next);
    expect(ctx._managerRegistered.size).toBe(0);
  });
});

describe('statusOf', () => {
  it('压缩各状态', () => {
    expect(statusOf(undefined).state).toBe('idle');
    expect(statusOf({ state: 'connected', toolCount: 2, connectedAt: 0 })).toMatchObject({
      state: 'connected',
      toolCount: 2,
    });
    expect(statusOf({ state: 'failed', reason: 'cleanup' }).detail).toBe('cleanup did not finish');
    expect(statusOf({ state: 'closed', result: { closeConfirmed: true } }).state).toBe('closed');
  });
});
