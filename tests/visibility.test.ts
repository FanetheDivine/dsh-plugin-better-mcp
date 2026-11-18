// 会话可见性：默认值、mcp_manage 切换、会话隔离与工具限制。
import { describe, expect, it, vi } from 'vitest';

import { apply } from '../src/index.ts';
import { serverOfTool } from '../src/visibility.ts';
import { type FakeAgent, makeAgent, makeCtx, type RegisteredTool, volatile } from './helpers.ts';

/** 两台服务器：lazy 默认不可见，eager 默认可见。 */
const SERVERS = {
  lazy: { description: 'Lazy tools', transport: 'stdio', command: 'node', lazy: true },
  eager: { description: 'Eager tools', transport: 'stdio', command: 'node', lazy: false },
};

/** 一个 MCP 工具注册记录。 */
function mcpTool(name: string): RegisteredTool {
  return {
    name,
    description: '',
    parameters: {},
    output: { schema: {}, render: () => [] },
    execute: async () => undefined,
  };
}

/** 启用插件并等待会话可见性就绪。 */
async function setup(agents: FakeAgent[] = [makeAgent()]) {
  const config = { servers: volatile<unknown>(SERVERS) };
  const ctx = makeCtx({ config });
  ctx._registeredTools.push(
    mcpTool('mcp__lazy__search'),
    mcpTool('mcp__lazy__fetch'),
    mcpTool('mcp__eager__run'),
    mcpTool('workspace_list'),
  );
  ctx._agents.push(...agents);
  apply(ctx, config);
  await vi.waitFor(() =>
    expect(ctx._registeredTools.some((tool) => tool.name === 'mcp_manage')).toBe(true),
  );
  const tool = ctx._registeredTools.find((candidate) => candidate.name === 'mcp_manage');
  if (tool === undefined) throw new Error('mcp_manage missing');
  const manage = (agent: FakeAgent, args: unknown) =>
    tool.execute(args, { agent, signal: new AbortController().signal } as never);
  return { ctx, config, manage, tool };
}

describe('serverOfTool', () => {
  it('取最长匹配的服务器名', () => {
    expect(serverOfTool('mcp__a__x', ['a', 'a__b'])).toBe('a');
    expect(serverOfTool('mcp__a__b__x', ['a', 'a__b'])).toBe('a__b');
    expect(serverOfTool('workspace_list', ['a'])).toBeUndefined();
  });
});

describe('默认可见性', () => {
  it('启动时挂载全部服务器，与懒加载无关', async () => {
    const { ctx } = await setup();
    await vi.waitFor(() =>
      expect([...ctx._managerRegistered.keys()].sort()).toEqual(['eager', 'lazy']),
    );
  });

  it('懒加载服务器的工具对已有会话隐藏', async () => {
    const [agent] = [makeAgent()];
    await setup([agent]);
    expect(agent._deny()).toEqual(['mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('新建会话在 agent/created 时得到限制', async () => {
    const { ctx } = await setup([]);
    const agent = makeAgent('late');
    ctx._agents.push(agent);
    ctx._emit('agent/created', { agent, source: 'startup' });
    expect(agent._deny()).toEqual(['mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('只注册 mcp_manage 一个工具', async () => {
    const { ctx } = await setup();
    const own = ctx._registeredTools.filter((tool) => !tool.name.startsWith('mcp__'));
    expect(own.map((tool) => tool.name).sort()).toEqual(['mcp_manage', 'workspace_list']);
  });
});

describe('mcp_manage', () => {
  it('active 让本会话看到该服务器的工具', async () => {
    const agent = makeAgent();
    const { manage } = await setup([agent]);
    const result = await manage(agent, { server: 'lazy', command: 'active' });
    expect(result).toMatchObject({ server: 'lazy', active: true, state: 'connected' });
    expect(agent._deny()).toEqual([]);
  });

  it('inactive 隐藏非懒加载服务器的工具', async () => {
    const agent = makeAgent();
    const { manage } = await setup([agent]);
    await manage(agent, { server: 'eager', command: 'inactive' });
    expect(agent._deny()).toEqual(['mcp__eager__run', 'mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('只影响调用方会话', async () => {
    const first = makeAgent('one');
    const second = makeAgent('two');
    const { manage } = await setup([first, second]);
    await manage(first, { server: 'lazy', command: 'active' });
    expect(first._deny()).toEqual([]);
    expect(second._deny()).toEqual(['mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('拒绝未知服务器与非法 command，并列出可用服务器', async () => {
    const agent = makeAgent();
    const { manage } = await setup([agent]);
    await expect(manage(agent, { server: 'nope', command: 'active' })).rejects.toThrow(
      "No MCP server named 'nope'. Available: eager, lazy",
    );
    await expect(manage(agent, { server: 'lazy', command: 'on' })).rejects.toThrow(
      'command must be active or inactive',
    );
    expect(agent._deny()).toEqual(['mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('没有会话时报错', async () => {
    const { tool } = await setup();
    await expect(
      tool.execute({ server: 'lazy', command: 'active' }, {
        signal: new AbortController().signal,
      } as never),
    ).rejects.toThrow('needs an agent session');
  });

  it('渲染说明工具前缀', async () => {
    const agent = makeAgent();
    const { manage, tool } = await setup([agent]);
    const value = await manage(agent, { server: 'lazy', command: 'active' });
    expect(JSON.stringify(tool.output.render({}, value))).toContain('mcp__lazy__<tool>');
  });
});

describe('工具与配置变化', () => {
  it('tools/change 后为新工具补齐限制，限制不变时不替换', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    ctx._registeredTools.push(mcpTool('mcp__lazy__extra'));
    ctx._emit('tools/change');
    await vi.waitFor(() => expect(agent._deny()).toContain('mcp__lazy__extra'));
    ctx._emit('tools/change');
    await Promise.resolve();
    expect(agent._restrictionCount()).toBe(1);
  });

  it('关闭懒加载后未显式选择的会话看到工具', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    config.servers.set({ ...SERVERS, lazy: { ...SERVERS.lazy, lazy: false } });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => expect(agent._deny()).toEqual([]));
  });

  it('卸载插件时解除限制', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    ctx._dispose();
    expect(agent._restrictionCount()).toBe(0);
  });
});
