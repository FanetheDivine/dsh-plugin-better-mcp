// 插件入口接线：导出契约、启动挂载、热更新对账、路由、卸载清理。
import { describe, expect, it, vi } from 'vitest';

import { Config } from '../src/config.ts';
import { apply, inject, name } from '../src/index.ts';
import { normalizeWorkspaceKey, workspaceInternalName } from '../src/workspace-names.ts';
import { makeAgent, makeCtx, volatile } from './helpers.ts';

/** 等待一轮微任务。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 标准配置引用。 */
function refs(servers: Record<string, unknown> = {}) {
  return { servers: volatile(servers) };
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
  it('注册面板路由与 OAuth 回调路由', async () => {
    const config = refs();
    const ctx = makeCtx({ config });
    apply(ctx, config);
    expect(ctx._fetchRoutes.map((route) => route.path).sort()).toEqual([
      '/api/better-mcp/lazy',
      '/api/better-mcp/oauth/client',
      '/api/better-mcp/oauth/signout',
      '/api/better-mcp/oauth/start',
      '/api/better-mcp/restart',
      '/api/better-mcp/servers',
      '/api/better-mcp/servers/remove',
      '/api/better-mcp/status',
    ]);
    expect(ctx._routes.map((route) => route.path)).toEqual([
      '/better-mcp/oauth/start',
      '/better-mcp/oauth/callback',
    ]);
    await flush();
  });

  it('启动时挂载全部服务器', async () => {
    const config = refs({
      resident: {
        description: 'd',
        transport: 'stdio',
        command: 'node',
        auth: 'none',
        lazy: false,
      },
      lazy: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: true },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() =>
      expect([...ctx._managerRegistered.keys()].sort()).toEqual(['lazy', 'resident']),
    );
  });

  it('volatile 更新后挂载新增、卸载移除、重建变更', async () => {
    const config = refs({
      removed: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
      kept: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() => expect(ctx._managerRegistered.has('kept')).toBe(true));
    config.servers.set({
      kept: { description: 'd', transport: 'stdio', command: 'npx', auth: 'none', lazy: false },
      added: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => {
      expect(ctx._managerRegistered.has('removed')).toBe(false);
      expect(ctx._managerRegistered.get('kept')?.entry.command).toBe('npx');
      expect(ctx._managerRegistered.has('added')).toBe(true);
    });
  });

  it('工作区服务器 active 时才挂载并接入公开代理、资源与删除提醒', async () => {
    const config = refs({
      serena: {
        description: 'project tools',
        transport: 'stdio',
        command: 'node',
        workspace: true,
        lazy: false,
      },
    });
    const agent = makeAgent('workspace-agent', process.cwd());
    const ctx = makeCtx({ config });
    ctx._agents.push(agent);
    const internalName = workspaceInternalName('serena', process.cwd());
    const internalTool = `mcp__${internalName}__read`;
    ctx._registeredTools.push({
      name: internalTool,
      description: 'read project',
      parameters: {},
      output: { schema: {}, render: () => [] },
      execute: async () => 'ok',
    });
    apply(ctx, config);
    await vi.waitFor(() =>
      expect(ctx._registeredTools.some((tool) => tool.name === 'mcp_manage')).toBe(true),
    );
    expect(ctx._managerRegistered.size).toBe(0);

    const manage = ctx._registeredTools.find((tool) => tool.name === 'mcp_manage');
    const result = await manage?.execute({ server: 'serena', command: 'active' }, {
      agent,
      signal: new AbortController().signal,
    } as never);
    expect(result).toMatchObject({ server: 'serena', active: true, state: 'connected' });
    expect(ctx._managerRegistered.get(internalName)?.entry.cwd).toBe(
      normalizeWorkspaceKey(process.cwd()),
    );
    expect(agent.ctx.tools.get('mcp__serena__read')).toBeDefined();
    expect(agent._deny()).toContain(internalTool);
    expect(agent._resourceProviders.some((provider) => provider.server === 'serena')).toBe(true);
    expect(JSON.stringify(agent.inbox.nextStep)).toContain('before deleting the folder');

    await manage?.execute({ server: 'serena', command: 'inactive' }, {
      agent,
      signal: new AbortController().signal,
    } as never);
    expect(agent.ctx.tools.get('mcp__serena__read')).toBeUndefined();
    expect(agent._resourceProviders.some((provider) => provider.server === 'serena')).toBe(false);
    expect(ctx._managerRegistered.size).toBe(0);
  });

  it('未知配置键让加载失败', () => {
    const config = { servers: volatile({}), expose: volatile({ enabled: true }) };
    const ctx = makeCtx({ config: config as never });
    expect(() => apply(ctx, config as never)).toThrow('unknown config key "expose"');
  });

  it('缺少 Web 服务时仍挂载服务器', async () => {
    const config = refs({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const ctx = makeCtx({ config, noConnection: true, noWebServer: true });
    apply(ctx, config);
    expect(ctx._routes).toHaveLength(0);
    await vi.waitFor(() => expect(ctx._managerRegistered.has('one')).toBe(true));
  });

  it('卸载时释放路由与挂载', async () => {
    const config = refs({
      one: { description: 'd', transport: 'stdio', command: 'node', auth: 'none', lazy: false },
    });
    const ctx = makeCtx({ config });
    apply(ctx, config);
    await vi.waitFor(() => expect(ctx._managerRegistered.size).toBe(1));
    ctx._dispose();
    expect(ctx._managerRegistered.size).toBe(0);
    expect(ctx._routes).toHaveLength(0);
    expect(ctx._fetchRoutes).toHaveLength(0);
  });
});
