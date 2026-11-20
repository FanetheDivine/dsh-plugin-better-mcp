// 工作区 MCP 上下文：instructions/resource 提示隔离、Agent-local 资源转发与内部调用守卫。
import type {
  AssembleContext,
  AssembledSection,
  PromptPresentation,
} from '@deepseek-ai/dsh-system-prompt';
import type { PreToolDecision, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '../src/types.ts';
import { workspaceInternalName } from '../src/workspace-names.ts';
import {
  rewriteWorkspacePresentation,
  WorkspacePresentationRuntime,
} from '../src/workspace-presentation.ts';
import {
  guardWorkspaceResourceCall,
  type WorkspaceResourceRoute,
  WorkspaceResourceRuntime,
} from '../src/workspace-resources.ts';
import { type FakeAgent, makeAgent, makeCtx } from './helpers.ts';

const WORKSPACE_A = '/tmp/project-a';
const WORKSPACE_B = '/tmp/project-b';
const INTERNAL_A = workspaceInternalName('serena', WORKSPACE_A);
const INTERNAL_B = workspaceInternalName('serena', WORKSPACE_B);
const ROUTE_A: WorkspaceResourceRoute = {
  serverName: 'serena',
  internalName: INTERNAL_A,
  workspaceKey: WORKSPACE_A,
  generation: 1,
};
const ROUTE_B: WorkspaceResourceRoute = {
  serverName: 'serena',
  internalName: INTERNAL_B,
  workspaceKey: WORKSPACE_B,
  generation: 1,
};

/** 构造只含指定 sections 的完整提示展示。 */
function presentation(sections: AssembledSection[]): PromptPresentation {
  return { sections, contexts: [], variables: {} };
}

/** 构造宿主 rc.5 的 MCP instructions section。 */
function instructions(internalName: string, text: string): AssembledSection {
  return {
    name: `mcp:${internalName}`,
    text: `### MCP server: ${internalName}\n\n${text}`,
    interpolate: false,
  };
}

/** 构造宿主 rc.5 的 resource servers section。 */
function resourceServers(names: string[]): AssembledSection {
  return {
    name: 'mcp-resource-servers',
    text:
      names.length === 0
        ? ''
        : '## MCP resource servers\n\n' +
          'Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names ' +
          `as the server argument: ${JSON.stringify([...names].sort())}.`,
    interpolate: false,
  };
}

/** 创建多 Agent 可编程路由状态与资源运行时。 */
function setupResources() {
  const ctx = makeCtx();
  const agent = makeAgent('agent-a', WORKSPACE_A);
  const bindings = new Map<Agent, string>([[agent as unknown as Agent, WORKSPACE_A]]);
  const active = new Set<Agent>([agent as unknown as Agent]);
  const generations = new Map<string, number>([
    [INTERNAL_A, 1],
    [INTERNAL_B, 1],
  ]);
  const missing = new Set<string>();
  const requestsA = vi.fn(async () => ({ workspace: 'a' }));
  const requestsB = vi.fn(async () => ({ workspace: 'b' }));
  ctx.mcpResources.register(INTERNAL_A, { request: requestsA });
  ctx.mcpResources.register(INTERNAL_B, { request: requestsB });
  const runtime = new WorkspaceResourceRuntime(ctx, {
    currentWorkspaceKey: (current) => bindings.get(current),
    isActive: (current) => active.has(current),
    isGenerationCurrent: (route) => generations.get(route.internalName) === route.generation,
    workspaceExists: (workspaceKey) => !missing.has(workspaceKey),
  });
  return {
    ctx,
    agent,
    runtime,
    requestsA,
    requestsB,
    bindings,
    active,
    generations,
    missing,
  };
}

/** 通过宿主三个全局资源工具之一发起 Agent 调用。 */
function executeResource(
  ctx: ReturnType<typeof makeCtx>,
  name: string,
  args: Record<string, unknown>,
  agent?: FakeAgent,
): Promise<unknown> {
  const tool = ctx.tools.get(name);
  if (tool === undefined) throw new Error(`Missing resource tool ${name}`);
  const exec = {
    agent: agent as unknown as Agent | undefined,
    signal: new AbortController().signal,
    arguments: args,
  } as unknown as ToolRunContext;
  return tool.execute(args, exec);
}

/** 构造 pre-execute 调用视图。 */
function resourceExecution(name: string, server: unknown): ToolExecution {
  return { name, arguments: { server } } as unknown as ToolExecution;
}

describe('工作区 system prompt 展示', () => {
  it('在 await next 后仅保留当前工作区 active instructions，并还原公开标题', async () => {
    const agent = makeAgent('agent-a', WORKSPACE_A);
    const shared: AssembledSection = {
      name: 'mcp:shared',
      text: '### MCP server: shared\n\nshared instructions',
      interpolate: false,
    };
    const runtime = new WorkspacePresentationRuntime({
      currentWorkspaceKey: (current) =>
        current === (agent as unknown as Agent) ? WORKSPACE_A : undefined,
      activeRoutes: (current) => (current === (agent as unknown as Agent) ? [ROUTE_A] : []),
    });
    const next = vi.fn(async () =>
      presentation([
        shared,
        instructions(INTERNAL_B, 'project B'),
        instructions(INTERNAL_A, 'project A'),
      ]),
    );

    const result = await runtime.assemble(presentation([]), { agent } as AssembleContext, next);

    expect(next).toHaveBeenCalledOnce();
    expect(result.sections.map((section) => section.name)).toEqual([
      'mcp:shared',
      `mcp:${INTERNAL_A}`,
    ]);
    expect(result.sections[0]).toBe(shared);
    expect(result.sections[1]?.text).toBe('### MCP server: serena\n\nproject A');
    expect(result.sections[1]?.text).not.toContain(INTERNAL_A);
  });

  it('无 Agent 或 inactive 时隐藏工作区 sections，共享 sections 保持原样', () => {
    const shared: AssembledSection = { name: 'mcp:shared', text: 'shared', interpolate: false };
    const input = presentation([
      shared,
      instructions(INTERNAL_A, 'project A'),
      resourceServers(['shared', INTERNAL_A]),
    ]);

    const withoutAgent = rewriteWorkspacePresentation(input, {
      agent: undefined,
      workspaceKey: undefined,
      activeRoutes: [],
    });
    expect(withoutAgent.sections).toEqual([shared, resourceServers(['shared'])]);

    const inactive = rewriteWorkspacePresentation(input, {
      agent: makeAgent() as unknown as Agent,
      workspaceKey: WORKSPACE_A,
      activeRoutes: [],
    });
    expect(inactive.sections).toEqual([shared, resourceServers(['shared'])]);
  });

  it('resource servers prompt 仅列当前 active 公开名并保留共享服务器', () => {
    const input = presentation([resourceServers(['shared', 'z-shared', INTERNAL_A, INTERNAL_B])]);
    const result = rewriteWorkspacePresentation(input, {
      agent: makeAgent() as unknown as Agent,
      workspaceKey: WORKSPACE_A,
      activeRoutes: [ROUTE_A, ROUTE_B],
    });

    expect(result.sections).toEqual([resourceServers(['serena', 'shared', 'z-shared'])]);
    expect(result.sections[0]?.text).not.toContain('bm_');
    expect(result.sections[0]?.text).not.toContain(INTERNAL_B);
  });
});

describe('WorkspaceResourceRuntime 转发与隔离', () => {
  it('以公开名注册 Agent-local provider，并将三种请求转发到当前内部 provider', async () => {
    const { ctx, agent, runtime, requestsA, requestsB } = setupResources();
    runtime.sync(agent, ROUTE_A);

    expect(agent._resourceProviders.map((entry) => entry.server)).toEqual(['serena']);
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena', cursor: 'next' }, agent),
    ).resolves.toEqual({ workspace: 'a' });
    await expect(
      executeResource(
        ctx,
        'list_mcp_resource_templates',
        { server: 'serena', cursor: 'templates' },
        agent,
      ),
    ).resolves.toEqual({ workspace: 'a' });
    await expect(
      executeResource(
        ctx,
        'read_mcp_resource',
        { server: 'serena', uri: 'file:///project-a/README.md' },
        agent,
      ),
    ).resolves.toEqual({ workspace: 'a' });

    expect(requestsA.mock.calls.map(([request]) => request)).toEqual([
      { method: 'resources/list', cursor: 'next' },
      { method: 'resources/templates/list', cursor: 'templates' },
      { method: 'resources/read', uri: 'file:///project-a/README.md' },
    ]);
    for (const [, exec] of requestsA.mock.calls) expect(exec.agent).toBeUndefined();
    expect(requestsB).not.toHaveBeenCalled();
  });

  it('相同公开名在两个 Agent 中分别路由到各自工作区', async () => {
    const { ctx, agent, runtime, requestsA, requestsB, bindings, active } = setupResources();
    const other = makeAgent('agent-b', WORKSPACE_B);
    bindings.set(other as unknown as Agent, WORKSPACE_B);
    active.add(other as unknown as Agent);
    runtime.sync(agent, ROUTE_A);
    runtime.sync(other, ROUTE_B);

    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, agent),
    ).resolves.toEqual({ workspace: 'a' });
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, other),
    ).resolves.toEqual({ workspace: 'b' });
    expect(requestsA).toHaveBeenCalledOnce();
    expect(requestsB).toHaveBeenCalledOnce();
  });

  it('拒绝缺失 target、过期 target、错误绑定、inactive 与失效 generation', async () => {
    const { ctx, agent, runtime, requestsA, bindings, active, generations } = setupResources();
    const missingCtx = makeCtx();
    const missingRuntime = new WorkspaceResourceRuntime(missingCtx, {
      currentWorkspaceKey: () => WORKSPACE_A,
      isActive: () => true,
      isGenerationCurrent: () => true,
    });
    missingCtx._resourceTools.pop();
    expect(() => missingRuntime.sync(agent, ROUTE_A)).toThrow(/resource tools.*unavailable/i);

    runtime.sync(agent, ROUTE_A);
    bindings.set(agent as unknown as Agent, WORKSPACE_B);
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, agent),
    ).rejects.toThrow(/stale workspace resource/i);

    bindings.set(agent as unknown as Agent, WORKSPACE_A);
    active.delete(agent as unknown as Agent);
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, agent),
    ).rejects.toThrow(/stale workspace resource/i);

    active.add(agent as unknown as Agent);
    generations.set(INTERNAL_A, 2);
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, agent),
    ).rejects.toThrow(/stale workspace resource/i);

    generations.set(INTERNAL_A, 1);
    const index = ctx._resourceTools.findIndex((tool) => tool.name === 'list_mcp_resources');
    const original = ctx._resourceTools[index];
    if (original === undefined) throw new Error('list target missing');
    ctx._resourceTools[index] = { ...original };
    await expect(
      executeResource(ctx, 'list_mcp_resources', { server: 'serena' }, agent),
    ).rejects.toThrow(/stale workspace resource/i);
    expect(requestsA).not.toHaveBeenCalled();
  });

  it('同步保持同代 provider，按服务器释放并在 dispose 时清空', () => {
    const { agent, runtime } = setupResources();
    const otherRoute: WorkspaceResourceRoute = {
      ...ROUTE_A,
      serverName: 'other',
      internalName: workspaceInternalName('other', WORKSPACE_A),
    };
    runtime.sync(agent, ROUTE_A);
    runtime.sync(agent, otherRoute);
    const original = agent._resourceProviders.find((entry) => entry.server === 'serena')?.provider;

    runtime.sync(agent, ROUTE_A);
    expect(agent._resourceProviders.find((entry) => entry.server === 'serena')?.provider).toBe(
      original,
    );
    expect(agent._resourceProviders).toHaveLength(2);

    runtime.release(agent, 'serena');
    expect(agent._resourceProviders.map((entry) => entry.server)).toEqual(['other']);
    runtime.sync(agent, ROUTE_A);
    runtime.disposeAgent(agent);
    expect(agent._resourceProviders).toHaveLength(0);

    runtime.sync(agent, ROUTE_A);
    runtime.dispose();
    expect(agent._resourceProviders).toHaveLength(0);
    runtime.sync(agent, ROUTE_A);
    expect(agent._resourceProviders).toHaveLength(0);
  });
});

describe('工作区资源 pre-execute 守卫', () => {
  it.each(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])(
    '拒绝直接通过 %s 使用本插件内部名，且不调用 next',
    async (name) => {
      const denial = guardWorkspaceResourceCall(resourceExecution(name, INTERNAL_A));
      expect(denial).toEqual({
        kind: 'deny',
        reason: expect.stringMatching(/workspace-internal/i),
      });

      const next = vi.fn(async (): Promise<PreToolDecision> => ({ kind: 'allow' }));
      const runtime = new WorkspaceResourceRuntime(makeCtx(), {
        currentWorkspaceKey: () => undefined,
        isActive: () => false,
        isGenerationCurrent: () => false,
      });
      await expect(runtime.preExecute(resourceExecution(name, INTERNAL_A), next)).resolves.toEqual(
        denial,
      );
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('共享服务器、其他工具和非字符串 server 保持原管线', async () => {
    const runtime = new WorkspaceResourceRuntime(makeCtx(), {
      currentWorkspaceKey: () => undefined,
      isActive: () => false,
      isGenerationCurrent: () => false,
    });
    for (const exec of [
      resourceExecution('list_mcp_resources', 'shared'),
      resourceExecution('read_mcp_resource', undefined),
      resourceExecution('mcp__shared__read', INTERNAL_A),
    ]) {
      const next = vi.fn(async (): Promise<PreToolDecision> => ({ kind: 'allow' }));
      await expect(runtime.preExecute(exec, next)).resolves.toEqual({ kind: 'allow' });
      expect(next).toHaveBeenCalledOnce();
    }
  });
});
