// 工作区代理：根工具发现、公开名差异同步、执行保护与内容投影。
import type {
  ToolDefinition,
  ToolExecution,
  ToolExecutionResult,
  ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '../src/types.ts';
import { workspaceInternalName } from '../src/workspace-names.ts';
import {
  collectWorkspaceInternalToolNames,
  discoverWorkspaceToolTargets,
  type WorkspaceProxyRoute,
  WorkspaceProxyRuntime,
} from '../src/workspace-proxy.ts';
import { type FakeAgent, makeAgent, makeCtx } from './helpers.ts';

const WORKSPACE = '/tmp/project';
const INTERNAL = 'bm_serena_d6c3cade5b22a7da';
const TARGET_NAME = `mcp__${INTERNAL}__read_file`;
const PUBLIC_NAME = 'mcp__serena__read_file';

/** 构造一个完整 rc.5 工具定义。 */
function tool(
  name: string,
  execute: ToolDefinition['execute'] = async () => 'old',
): ToolDefinition {
  return {
    name,
    description: 'Read a project file',
    parameters: { path: { type: 'string', required: true } },
    deferLoading: true,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    timeoutMs: 2500,
    execute,
  };
}

/** 构造代理执行上下文。 */
function execution(agent?: FakeAgent, signal = new AbortController().signal): ToolRunContext {
  return { agent, signal, arguments: { path: 'src/index.ts' } } as unknown as ToolRunContext;
}

/** 创建可编程绑定、active 与 generation 状态。 */
function setup(target: ToolDefinition = tool(TARGET_NAME)) {
  const ctx = makeCtx();
  const agent = makeAgent();
  ctx._registeredTools.push(target);
  const route: WorkspaceProxyRoute = {
    serverName: 'serena',
    internalName: INTERNAL,
    workspaceKey: WORKSPACE,
    generation: 1,
  };
  const state = {
    binding: WORKSPACE as string | undefined,
    active: true,
    generation: 1,
    exists: true,
  };
  const runtime = new WorkspaceProxyRuntime(ctx, {
    currentWorkspaceKey: (current) =>
      current === (agent as unknown as Agent) ? state.binding : undefined,
    isActive: () => state.active,
    isGenerationCurrent: (current) => current.generation === state.generation,
    workspaceExists: () => state.exists,
  });
  return { ctx, agent, route, runtime, state, target };
}

describe('工作区工具发现', () => {
  it('从根注册表发现精确前缀并转换普通公开名', () => {
    const ctx = makeCtx();
    const expected = tool(TARGET_NAME);
    ctx._registeredTools.push(
      expected,
      tool(`mcp__${INTERNAL}_other__read_file`),
      tool('mcp__serena__read_file'),
      tool(`mcp__${INTERNAL}__`),
    );

    const discovered = discoverWorkspaceToolTargets(ctx, 'serena', INTERNAL);
    expect([...discovered.keys()]).toEqual([PUBLIC_NAME]);
    expect(discovered.get(PUBLIC_NAME)).toBe(expected);
    expect(discoverWorkspaceToolTargets(ctx, 'serena', `${INTERNAL}_other`)).not.toHaveProperty(
      'size',
      0,
    );
  });

  it('收集指定实例的内部工具名供 deny 使用', () => {
    const ctx = makeCtx();
    const other = `${INTERNAL}_other`;
    ctx._registeredTools.push(
      tool(`mcp__${INTERNAL}__write`),
      tool(`mcp__${other}__read`),
      tool(TARGET_NAME),
      tool('mcp__serena__read_file'),
    );
    expect(collectWorkspaceInternalToolNames(ctx, [INTERNAL])).toEqual([
      TARGET_NAME,
      `mcp__${INTERNAL}__write`,
    ]);
    expect(collectWorkspaceInternalToolNames(ctx, [INTERNAL, other])).toHaveLength(3);
  });

  it('按 configured 完整服务器名收集含双下划线配置名的内部工具', () => {
    const internal = workspaceInternalName('foo__bar', WORKSPACE);
    const shared = 'bm_shared_0123456789abcdef';
    const ctx = makeCtx({
      statuses: {
        [internal]: { state: 'closed', result: { closeConfirmed: true } },
        bm_shared: { state: 'closed', result: { closeConfirmed: true } },
      },
    });
    const target = `mcp__${internal}__read_file`;
    ctx._registeredTools.push(
      tool(target),
      tool(`mcp__${shared}__read_file`),
      tool('mcp__bm_shared__read_file'),
    );

    expect(collectWorkspaceInternalToolNames(ctx)).toEqual([target]);
  });

  it('发现含双下划线配置名的 target 并还原完整公开名', () => {
    const internal = workspaceInternalName('foo__bar', WORKSPACE);
    const target = tool(`mcp__${internal}__read_file`);
    const ctx = makeCtx();
    ctx._registeredTools.push(target);

    const discovered = discoverWorkspaceToolTargets(ctx, 'foo__bar', internal);
    expect([...discovered.keys()]).toEqual(['mcp__foo__bar__read_file']);
    expect(discovered.get('mcp__foo__bar__read_file')).toBe(target);
  });
});

describe('WorkspaceProxyRuntime 差异同步', () => {
  it('target 不变时保留代理，增删时只更新差异项', () => {
    const { ctx, agent, route, runtime, target } = setup();
    runtime.sync(agent, route);
    const original = agent.ctx.tools.get(PUBLIC_NAME);
    expect(original).toBeDefined();
    expect(original).not.toBe(target);

    runtime.sync(agent, route);
    expect(agent.ctx.tools.get(PUBLIC_NAME)).toBe(original);
    expect(agent._registeredTools).toHaveLength(1);

    const write = tool(`mcp__${INTERNAL}__write_file`);
    setupTarget(ctx, runtime, agent, route, [target, write]);
    expect(agent.ctx.tools.get(PUBLIC_NAME)).toBe(original);
    expect(agent.ctx.tools.get('mcp__serena__write_file')).toBeDefined();

    setupTarget(ctx, runtime, agent, route, [write]);
    expect(agent.ctx.tools.get(PUBLIC_NAME)).toBeUndefined();
    expect(agent._registeredTools.map((item) => item.name)).toEqual(['mcp__serena__write_file']);
  });

  it('同步一个服务器时保留同 Agent 的其他工作区服务器代理', () => {
    const { ctx, agent, route, runtime } = setup();
    const otherInternal = 'bm_other_0123456789abcdef';
    const otherTarget = tool(`mcp__${otherInternal}__search`);
    ctx._registeredTools.push(otherTarget);
    const otherRoute: WorkspaceProxyRoute = {
      serverName: 'other',
      internalName: otherInternal,
      workspaceKey: WORKSPACE,
      generation: 1,
    };

    runtime.sync(agent, route);
    runtime.sync(agent, otherRoute);
    expect(agent.ctx.tools.get(PUBLIC_NAME)).toBeDefined();
    expect(agent.ctx.tools.get('mcp__other__search')).toBeDefined();

    runtime.sync(agent, { ...route, generation: 2 });
    expect(agent.ctx.tools.get(PUBLIC_NAME)).toBeDefined();
    expect(agent.ctx.tools.get('mcp__other__search')).toBeDefined();
  });

  it('target 热更新时先释放旧代再注册同名代理', async () => {
    const { ctx, agent, route, runtime, target } = setup();
    runtime.sync(agent, route);
    const oldProxy = agent.ctx.tools.get(PUBLIC_NAME);
    const replacement = tool(TARGET_NAME, async () => 'new');
    const originalRegister = agent.ctx.tools.register.bind(agent.ctx.tools);
    agent.ctx.tools.register = (definition) => {
      if (definition.name === PUBLIC_NAME) {
        expect(agent._registeredTools.some((item) => item.name === PUBLIC_NAME)).toBe(false);
      }
      return originalRegister(definition);
    };
    ctx._registeredTools.splice(ctx._registeredTools.indexOf(target), 1, replacement);

    runtime.sync(agent, route);
    const proxy = agent.ctx.tools.get(PUBLIC_NAME);
    expect(proxy).not.toBe(oldProxy);
    expect(agent._registeredTools).toHaveLength(1);
    await expect(proxy?.execute({}, execution(agent))).resolves.toBe('new');
  });

  it('不同 Agent 的同名公开代理分别执行当前工作区 target', async () => {
    const ctx = makeCtx();
    const first = makeAgent('agent-a', '/tmp/project-a');
    const second = makeAgent('agent-b', '/tmp/project-b');
    const otherInternal = 'bm_serena_0123456789abcdef';
    const firstTarget = tool(TARGET_NAME, async () => 'project-a');
    const secondTarget = tool(`mcp__${otherInternal}__read_file`, async () => 'project-b');
    ctx._registeredTools.push(firstTarget, secondTarget);
    const runtime = new WorkspaceProxyRuntime(ctx, {
      currentWorkspaceKey: (current) => current.cwd,
      isActive: () => true,
      isGenerationCurrent: () => true,
    });
    const firstRoute: WorkspaceProxyRoute = {
      serverName: 'serena',
      internalName: INTERNAL,
      workspaceKey: first.cwd,
      generation: 1,
    };
    const secondRoute: WorkspaceProxyRoute = {
      ...firstRoute,
      internalName: otherInternal,
      workspaceKey: second.cwd,
    };

    runtime.sync(first, firstRoute);
    runtime.sync(second, secondRoute);
    expect(first.ctx.tools.get(PUBLIC_NAME)).not.toBe(second.ctx.tools.get(PUBLIC_NAME));
    await expect(first.ctx.tools.get(PUBLIC_NAME)?.execute({}, execution(first))).resolves.toBe(
      'project-a',
    );
    await expect(second.ctx.tools.get(PUBLIC_NAME)?.execute({}, execution(second))).resolves.toBe(
      'project-b',
    );

    second.cwd = first.cwd;
    await expect(second.ctx.tools.get(PUBLIC_NAME)?.execute({}, execution(second))).rejects.toThrow(
      /stale workspace tool/i,
    );
  });

  it('工作区或 generation 换代时替换代理，dispose 释放全部注册', () => {
    const { agent, route, runtime } = setup();
    runtime.sync(agent, route);
    const original = agent.ctx.tools.get(PUBLIC_NAME);
    runtime.sync(agent, { ...route, generation: 2 });
    expect(agent.ctx.tools.get(PUBLIC_NAME)).not.toBe(original);
    expect(agent._registeredTools).toHaveLength(1);

    runtime.disposeAgent(agent);
    expect(agent._registeredTools).toHaveLength(0);
    runtime.sync(agent, route);
    expect(agent._registeredTools).toHaveLength(1);
    runtime.dispose();
    expect(agent._registeredTools).toHaveLength(0);
  });
});

describe('工作区代理执行保护', () => {
  it('拒绝缺失 Agent、错误绑定、inactive、根 target 换代与 generation 过期', async () => {
    const { ctx, agent, route, runtime, state, target } = setup();
    runtime.sync(agent, route);
    const proxy = agent.ctx.tools.get(PUBLIC_NAME);
    if (proxy === undefined) throw new Error('proxy missing');
    const execute = vi.spyOn(target, 'execute');

    await expect(proxy.execute({}, execution())).rejects.toThrow(/stale workspace tool/i);
    state.binding = '/tmp/other';
    await expect(proxy.execute({}, execution(agent))).rejects.toThrow(/stale workspace tool/i);
    state.binding = WORKSPACE;
    state.active = false;
    await expect(proxy.execute({}, execution(agent))).rejects.toThrow(/stale workspace tool/i);
    state.active = true;
    state.generation = 2;
    await expect(proxy.execute({}, execution(agent))).rejects.toThrow(/stale workspace tool/i);
    state.generation = 1;
    state.exists = false;
    await expect(proxy.execute({}, execution(agent))).rejects.toThrow(/stale workspace tool/i);
    state.exists = true;
    ctx._registeredTools.splice(ctx._registeredTools.indexOf(target), 1, tool(TARGET_NAME));
    await expect(proxy.execute({}, execution(agent))).rejects.toThrow(/stale workspace tool/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it('直接调用捕获的 target 并透传原始 cancel signal', async () => {
    const controller = new AbortController();
    const execute = vi.fn(async (_args: unknown, exec: ToolRunContext) => {
      expect(exec.signal).toBe(controller.signal);
      return 'done';
    });
    const { agent, route, runtime } = setup(tool(TARGET_NAME, execute));
    runtime.sync(agent, route);
    const proxy = agent.ctx.tools.get(PUBLIC_NAME);
    const exec = execution(agent, controller.signal);
    await expect(proxy?.execute({ path: 'README.md' }, exec)).resolves.toBe('done');
    expect(execute).toHaveBeenCalledWith({ path: 'README.md' }, exec);
    controller.abort();
    expect(exec.signal.aborted).toBe(true);
  });
});

describe('工作区代理内容委托', () => {
  it('保留 output、timeout 与 presentation，并显式委托图片 projectContent 和 finalize', () => {
    const image = { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' } as const;
    const finalText = { type: 'text', text: 'final' } as const;
    const presentCall = vi.fn(() => ({ card: 'generic', title: 'Read file' }) as const);
    const presentResult = vi.fn(() => ({ card: 'generic', title: 'Read result' }) as const);
    const projectContent = vi.fn(() => [image]);
    const finalizeContent = vi.fn(() => [finalText]);
    const target: ToolDefinition = {
      ...tool(TARGET_NAME),
      presentCall,
      presentResult,
      projectContent,
      finalizeContent,
    };
    const { agent, route, runtime } = setup(target);
    runtime.sync(agent, route);
    const proxy = agent.ctx.tools.get(PUBLIC_NAME);
    if (proxy === undefined) throw new Error('proxy missing');

    expect(proxy.description).toBe(target.description);
    expect(proxy.parameters).toBe(target.parameters);
    expect(proxy.deferLoading).toBe(true);
    expect(proxy.output).toBe(target.output);
    expect(proxy.timeoutMs).toBe(2500);
    expect(proxy.presentCall).toBe(presentCall);
    expect(proxy.presentResult).toBe(presentResult);

    const exec = { name: PUBLIC_NAME } as unknown as Readonly<ToolExecution>;
    const result = { isError: false, value: 'done', content: [] } as ToolExecutionResult;
    expect(proxy.projectContent?.(exec, result)).toEqual([image]);
    expect(proxy.finalizeContent?.(exec, result)).toEqual([finalText]);
    expect(projectContent).toHaveBeenCalledWith(exec, result);
    expect(finalizeContent).toHaveBeenCalledWith(exec, result);
  });
});

/** 替换根工具集并同步一个 Agent。 */
function setupTarget(
  ctx: ReturnType<typeof makeCtx>,
  runtime: WorkspaceProxyRuntime,
  agent: FakeAgent,
  route: WorkspaceProxyRoute,
  targets: ToolDefinition[],
): void {
  ctx._registeredTools.splice(
    0,
    ctx._registeredTools.length,
    ...ctx._registeredTools.filter((item) => !item.name.startsWith(`mcp__${route.internalName}__`)),
    ...targets,
  );
  runtime.sync(agent, route);
}
