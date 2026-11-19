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

  it('可见性变化立即注入调用方，重复选择保持原队列', async () => {
    const first = makeAgent('one');
    const second = makeAgent('two');
    const { ctx, manage } = await setup([first, second]);
    await step(ctx, first);
    await step(ctx, second);
    await manage(first, { server: 'lazy', command: 'active' });

    expect(first.inbox.nextStep).toHaveLength(1);
    expect(JSON.stringify(first.inbox.nextStep[0]?.content)).toContain('<system-reminder>');
    expect(JSON.stringify(first.inbox.nextStep[0]?.content)).toContain('Now active: `lazy`');
    expect(second.inbox.nextStep).toHaveLength(0);

    await manage(first, { server: 'lazy', command: 'active' });
    expect(first.inbox.nextStep).toHaveLength(1);
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

describe('Turn 结束自动停用', () => {
  it('重置默认 active 与手动 active 的服务器，且不注入唤醒消息', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await manage(agent, { server: 'lazy', command: 'active' });
    expect(agent._deny()).toEqual([]);
    await step(ctx, agent);

    ctx._endTurn(agent);

    expect(agent._deny()).toEqual(['mcp__eager__run', 'mcp__lazy__fetch', 'mcp__lazy__search']);
    expect(agent.inbox.nextStep).toHaveLength(0);
    expect(agent.inbox.nextTurn).toHaveLength(0);
  });

  it.each(['completed', 'error', 'aborted'] as const)('%s 的 Turn 也重置可见性', async (kind) => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);

    ctx._endTurn(agent, kind);

    expect(agent._deny()).toEqual(['mcp__eager__run', 'mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('后续 Turn 可以重新启用服务器', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await manage(agent, { server: 'lazy', command: 'active' });
    ctx._endTurn(agent);

    await manage(agent, { server: 'lazy', command: 'active' });
    expect(agent._deny()).toEqual(['mcp__eager__run']);
    await manage(agent, { server: 'eager', command: 'active' });
    expect(agent._deny()).toEqual([]);

    ctx._endTurn(agent);
    expect(agent._deny()).toEqual(['mcp__eager__run', 'mcp__lazy__fetch', 'mcp__lazy__search']);
  });

  it('下一步记录目录更新，后续步骤不重复提醒', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await step(ctx, agent);
    await manage(agent, { server: 'lazy', command: 'active' });
    await step(ctx, agent);

    ctx._endTurn(agent);

    expect(agent.inbox.nextStep).toHaveLength(0);
    const text = await step(ctx, agent);
    expect(text).toContain('Now inactive: `eager`');
    expect(text).toContain('Now inactive: `lazy`');
    expect(text).toContain('- `eager` (inactive): Eager tools');
    expect(text).toContain('- `lazy` (inactive): Lazy tools');
    expect(await step(ctx, agent)).toBeUndefined();
  });

  it('已经全部 inactive 时不写重复目录', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await step(ctx, agent);
    await manage(agent, { server: 'eager', command: 'inactive' });
    await step(ctx, agent);

    ctx._endTurn(agent);

    expect(agent.inbox.nextStep).toHaveLength(0);
    expect(await step(ctx, agent)).toBeUndefined();
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

/** 执行一次 pre-step，准入待处理消息，提交最终目录并返回正文。 */
async function step(
  ctx: Awaited<ReturnType<typeof setup>>['ctx'],
  agent: FakeAgent,
): Promise<string | undefined> {
  const pending = agent._claim();
  const decision = (await ctx._waterfall(
    'agent/pre-step',
    { agent, messages: pending },
    { kind: 'enter', messages: pending },
  )) as { messages: Array<{ source: unknown; content: Array<{ text: string }> }> };
  const catalog = decision.messages.find(
    (message) => (message.source as { kind?: unknown }).kind === 'better-mcp-catalog',
  );
  if (catalog === undefined) return undefined;
  agent._commit(catalog);
  return catalog.content[0]?.text;
}

describe('目录消息', () => {
  it('首步写入完整目录', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    const text = await step(ctx, agent);
    expect(text).toContain('- `eager` (active): Eager tools');
    expect(text).toContain('- `lazy` (inactive): Lazy tools');
    expect(text).toContain('`mcp_manage`');
  });

  it('状态不变且消息可见时不写', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    await step(ctx, agent);
    expect(await step(ctx, agent)).toBeUndefined();
  });

  it('压缩移出目录后补写完整目录', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    await step(ctx, agent);
    agent._compact();
    const text = await step(ctx, agent);
    expect(text).toContain('The following MCP servers are configured');
  });

  it('激活与停用各写一条更新消息', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await step(ctx, agent);
    await manage(agent, { server: 'lazy', command: 'active' });
    expect(await step(ctx, agent)).toContain(
      'Now active: `lazy`. Call its tools directly with the mcp__lazy__ prefix.',
    );
    expect(await step(ctx, agent)).toBeUndefined();
    await manage(agent, { server: 'lazy', command: 'inactive' });
    expect(await step(ctx, agent)).toContain('Now inactive: `lazy`');
  });

  it('显式选择从会话日志恢复', async () => {
    const agent = makeAgent();
    const { ctx, manage } = await setup([agent]);
    await step(ctx, agent);
    await manage(agent, { server: 'lazy', command: 'active' });
    await step(ctx, agent);
    const restored = makeAgent('restored');
    restored.session.events.push(...agent.session.events);
    restored.session.surface.nodes.push(...agent.session.surface.nodes);
    ctx._agents.push(restored);
    ctx._emit('agent/created', { agent: restored, source: 'resume' });
    expect(restored._deny()).toEqual([]);
    expect(await step(ctx, restored)).toBeUndefined();
  });

  it('配置变化后写更新消息', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    await step(ctx, agent);
    config.servers.set({ ...SERVERS, eager: { ...SERVERS.eager, description: 'Renamed' } });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(async () =>
      expect(await step(ctx, agent)).toContain('The MCP server list changed.'),
    );
  });

  it('配置对账后立即向全部在线会话注入目录', async () => {
    const first = makeAgent('one');
    const second = makeAgent('two');
    const { ctx, config } = await setup([first, second]);
    config.servers.set({ ...SERVERS, eager: { ...SERVERS.eager, description: 'Renamed' } });
    ctx._emit('loader/volatile-update', [['servers']]);

    await vi.waitFor(() => {
      expect(first.inbox.nextStep).toHaveLength(1);
      expect(second.inbox.nextStep).toHaveLength(1);
    });
    expect(JSON.stringify(first.inbox.nextStep[0]?.content)).toContain('Renamed');
    expect(JSON.stringify(second.inbox.nextStep[0]?.content)).toContain('Renamed');
  });

  it('配置内容不变时不注入重复目录', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    await step(ctx, agent);
    config.servers.set({ ...SERVERS });
    ctx._emit('loader/volatile-update', [['servers']]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(agent.inbox.nextStep).toHaveLength(0);
  });

  it('连续配置变化在下一步只提交最新目录', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    await step(ctx, agent);
    config.servers.set({ ...SERVERS, eager: { ...SERVERS.eager, description: 'Renamed' } });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => expect(agent.inbox.nextStep).toHaveLength(1));

    config.servers.set({ ...SERVERS, eager: { ...SERVERS.eager, description: 'Latest' } });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => expect(agent.inbox.nextStep).toHaveLength(2));

    const text = await step(ctx, agent);
    expect(text).toContain('Latest');
    expect(text).not.toContain('Renamed');
    const catalogs = agent.session.events.filter(
      (event) =>
        (event.data.source as { kind?: unknown } | undefined)?.kind === 'better-mcp-catalog',
    );
    expect(catalogs).toHaveLength(2);
  });

  it('配置恢复后在下一步移除过期待处理目录', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    await step(ctx, agent);
    config.servers.set({ ...SERVERS, eager: { ...SERVERS.eager, description: 'Renamed' } });
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(() => expect(agent.inbox.nextStep).toHaveLength(1));

    config.servers.set({ ...SERVERS });
    ctx._emit('loader/volatile-update', [['servers']]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await step(ctx, agent)).toBeUndefined();
    const catalogs = agent.session.events.filter(
      (event) =>
        (event.data.source as { kind?: unknown } | undefined)?.kind === 'better-mcp-catalog',
    );
    expect(catalogs).toHaveLength(1);
  });

  it('没有服务器且从未发布时不写；删光服务器后写空目录', async () => {
    const agent = makeAgent();
    const { ctx, config } = await setup([agent]);
    await step(ctx, agent);
    config.servers.set({});
    ctx._emit('loader/volatile-update', [['servers']]);
    await vi.waitFor(async () =>
      expect(await step(ctx, agent)).toContain('No MCP servers are available.'),
    );
    const fresh = makeAgent('fresh');
    expect(await step(ctx, fresh)).toBeUndefined();
  });

  it('拒绝的步骤保持原样', async () => {
    const agent = makeAgent();
    const { ctx } = await setup([agent]);
    const decision = await ctx._waterfall(
      'agent/pre-step',
      { agent, messages: [] },
      { kind: 'reject' },
    );
    expect(decision).toEqual({ kind: 'reject' });
  });
});
