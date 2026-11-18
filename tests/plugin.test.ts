// 插件入口接线：导出契约、启动挂载、热更新对账、工具与路由、卸载清理。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../src/config.ts';
import { apply, inject, name } from '../src/index.ts';
import { makeCtx, volatile } from './helpers.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'better-mcp-plugin-'));
  process.env.DSH_HOME = home;
});

afterEach(async () => {
  delete process.env.DSH_HOME;
  await rm(home, { recursive: true, force: true });
});

/** 等待一轮微任务。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 标准配置引用。 */
function refs(servers: Record<string, unknown> = {}) {
  return {
    servers: volatile(servers),
    expose: volatile({
      enabled: true,
      endpoint: '/better-mcp/mcp',
      groups: { harness: { title: 'Harness', include: ['workspace_*'], exclude: [] } },
    }),
  };
}

describe('模块契约', () => {
  it('导出 name / inject / apply / Config', () => {
    expect(name).toBe('better-mcp');
    expect(inject).toEqual(['tools', 'mcpManager', 'credentials']);
    expect(typeof apply).toBe('function');
    expect(typeof Config).toBe('function');
  });
});

describe('apply 接线', () => {
  it('注册两个工具与面板、回调、聚合路由', async () => {
    const config = refs();
    const ctx = makeCtx({ config });
    apply(ctx, config);
    expect(ctx._registeredTools.map((tool) => tool.name).sort()).toEqual([
      'mcp_call',
      'mcp_servers',
    ]);
    expect(ctx._fetchRoutes.map((route) => route.path).sort()).toEqual([
      '/api/better-mcp/endpoint/rotate',
      '/api/better-mcp/lazy',
      '/api/better-mcp/oauth/client',
      '/api/better-mcp/oauth/signout',
      '/api/better-mcp/oauth/start',
      '/api/better-mcp/restart',
      '/api/better-mcp/servers',
      '/api/better-mcp/servers/remove',
      '/api/better-mcp/status',
    ]);
    expect(ctx._routes.map((route) => route.path).sort()).toEqual([
      '/better-mcp/mcp',
      '/better-mcp/oauth/callback',
    ]);
    await flush();
  });

  it('启动只挂载常驻服务器', async () => {
    const config = refs({
      resident: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      lazy: { transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() => expect([...ctx._managerRegistered.keys()]).toEqual(['resident']));
  });

  it('volatile 更新后挂载新增、卸载移除、重建变更', async () => {
    const config = refs({
      removed: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      kept: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() => expect(ctx._managerRegistered.has('kept')).toBe(true));
    config.servers.set({
      kept: { transport: 'stdio', command: 'npx', auth: 'none', lazy: false },
      added: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => {
      expect(ctx._managerRegistered.has('removed')).toBe(false);
      expect(ctx._managerRegistered.get('kept')?.entry.command).toBe('npx');
      expect(ctx._managerRegistered.has('added')).toBe(true);
    });
  });

  it('未知配置键让加载失败', () => {
    const config = { servers: volatile({}), expose: volatile(undefined), bogus: volatile(1) };
    const ctx = makeCtx({ config: config as never });
    expect(() => apply(ctx, config)).toThrow('unknown config key "bogus"');
  });

  it('缺少 Web 服务时仍注册工具', async () => {
    const config = refs();
    const ctx = makeCtx({ config, noConnection: true, noWebServer: true });
    apply(ctx, config);
    expect(ctx._registeredTools).toHaveLength(2);
    expect(ctx._routes).toHaveLength(0);
    await flush();
  });

  it('卸载时释放工具、路由与挂载', async () => {
    const config = refs({
      one: { transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() => expect(ctx._managerRegistered.size).toBe(1));
    ctx._dispose();
    expect(ctx._registeredTools).toHaveLength(0);
    expect(ctx._managerRegistered.size).toBe(0);
    expect(ctx._routes).toHaveLength(0);
    expect(ctx._fetchRoutes).toHaveLength(0);
  });
});
