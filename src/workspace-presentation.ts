/** 工作区 MCP instructions 与资源服务器提示的隔离和公开名还原。 */
import type {
  AssembleContext,
  AssembledSection,
  PromptPresentation,
} from '@deepseek-ai/dsh-system-prompt';

import type { Agent } from './types.ts';
import { isWorkspaceInternalName } from './workspace-names.ts';
import type { WorkspaceProxyRoute } from './workspace-proxy.ts';

/** 展示层需要的 active 路由字段。 */
export type WorkspacePresentationRoute = Pick<
  WorkspaceProxyRoute,
  'serverName' | 'internalName' | 'workspaceKey'
>;

/** 一次 system prompt 组装的工作区视图。 */
export interface WorkspacePresentationView {
  readonly agent: Agent | undefined;
  readonly workspaceKey: string | undefined;
  readonly activeRoutes: Iterable<WorkspacePresentationRoute>;
}

/** 展示运行时读取 Agent 当前绑定与 active 路由。 */
export interface WorkspacePresentationCallbacks {
  currentWorkspaceKey(agent: Agent): string | undefined;
  activeRoutes(agent: Agent): Iterable<WorkspacePresentationRoute>;
}

/** rc.5 资源服务器提示的固定前缀与结尾。 */
const RESOURCE_PROMPT_PREFIX =
  '## MCP resource servers\n\n' +
  'Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names ' +
  'as the server argument: ';

/** 在 waterfall 下游完成后过滤工作区提示。 */
export class WorkspacePresentationRuntime {
  constructor(private readonly callbacks: WorkspacePresentationCallbacks) {}

  /** system-prompt/assemble 监听器；仅在 next 完成后改写最终 sections。 */
  async assemble(
    _presentation: PromptPresentation,
    context: AssembleContext,
    next: () => Promise<PromptPresentation>,
  ): Promise<PromptPresentation> {
    const assembled = await next();
    const agent = context.agent;
    return rewriteWorkspacePresentation(assembled, {
      agent,
      workspaceKey: agent === undefined ? undefined : this.callbacks.currentWorkspaceKey(agent),
      activeRoutes: agent === undefined ? [] : this.callbacks.activeRoutes(agent),
    });
  }
}

/** 仅处理本插件内部 instructions 与宿主资源服务器列表，保留其他 sections。 */
export function rewriteWorkspacePresentation(
  presentation: PromptPresentation,
  view: WorkspacePresentationView,
): PromptPresentation {
  const routes = view.agent === undefined ? [] : [...view.activeRoutes];
  const currentRoutes = new Map(
    routes
      .filter(
        (route) =>
          route.workspaceKey === view.workspaceKey && isWorkspaceInternalName(route.internalName),
      )
      .map((route) => [route.internalName, route.serverName]),
  );
  const sections: AssembledSection[] = [];
  for (const section of presentation.sections) {
    const internalName = workspaceInstructionName(section);
    if (internalName !== undefined) {
      const serverName = currentRoutes.get(internalName);
      if (serverName === undefined) continue;
      sections.push({
        ...section,
        text: restoreInstructionTitle(section.text, internalName, serverName),
      });
      continue;
    }
    if (section.name === 'mcp-resource-servers') {
      const names = [...currentRoutes.values()];
      sections.push({ ...section, text: rewriteResourceServerPrompt(section.text, names) });
      continue;
    }
    sections.push(section);
  }
  return { ...presentation, sections };
}

/** 返回本插件拥有的 instructions 内部名。 */
function workspaceInstructionName(section: AssembledSection): string | undefined {
  if (!section.name.startsWith('mcp:')) return undefined;
  const internalName = section.name.slice('mcp:'.length);
  return isWorkspaceInternalName(internalName) ? internalName : undefined;
}

/** rc.5 instructions 标题使用 `### MCP server: <name>`，正文保持原样。 */
function restoreInstructionTitle(text: string, internalName: string, serverName: string): string {
  const heading = `### MCP server: ${internalName}`;
  if (!text.startsWith(heading)) return text;
  return `### MCP server: ${serverName}${text.slice(heading.length)}`;
}

/** 从 rc.5 列表移除内部名，再加入当前 Agent 的 active 公开名。 */
function rewriteResourceServerPrompt(text: string, activeNames: Iterable<string>): string {
  const sharedNames = parseResourceServerNames(text);
  if (sharedNames === undefined) return text.includes('bm_') ? '' : text;
  const names = new Set([
    ...sharedNames.filter((name) => !isWorkspaceInternalName(name)),
    ...activeNames,
  ]);
  if (names.size === 0) return '';
  return `${RESOURCE_PROMPT_PREFIX}${JSON.stringify([...names].sort())}.`;
}

/** 读取宿主生成的 JSON 名称数组；格式变化时由调用方避免泄露内部名。 */
function parseResourceServerNames(text: string): string[] | undefined {
  if (!text.startsWith(RESOURCE_PROMPT_PREFIX) || !text.endsWith('.')) return undefined;
  const json = text.slice(RESOURCE_PROMPT_PREFIX.length, -1);
  try {
    const names: unknown = JSON.parse(json);
    if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) return undefined;
    return names;
  } catch {
    return undefined;
  }
}
