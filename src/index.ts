/**
 * 插件入口。导出宿主约定的 name、inject、apply 与 Config。
 *
 * 装配共享服务器、工作区实例池、Agent 代理、资源隔离、路由和会话可见性。
 */

import { existsSync } from 'node:fs';

import { Config, type PluginConfig, readConfig } from './config.ts';
import { CATALOG_SOURCE, PLUGIN_LABEL, PLUGIN_ROW_ID } from './constants.ts';
import { PluginRoutes } from './routes.ts';
import { ServerManager } from './servers.ts';
import { buildManageTool } from './tools.ts';
import type { Agent, Context, PluginLogger } from './types.ts';
import { VisibilityRuntime } from './visibility.ts';
import { WorkspaceBindings } from './workspace-bindings.ts';
import { normalizeWorkspaceKey } from './workspace-names.ts';
import { createWorkspaceCleanupNotice } from './workspace-notices.ts';
import { WorkspacePool } from './workspace-pool.ts';
import { WorkspacePresentationRuntime } from './workspace-presentation.ts';
import { type WorkspaceProxyRoute, WorkspaceProxyRuntime } from './workspace-proxy.ts';
import { WorkspaceResourceRuntime } from './workspace-resources.ts';

export { Config };

/** 插件名，与 cordis.patch.yml 的 id 一致。 */
export const name = PLUGIN_ROW_ID;

/** 需要宿主注入的服务。 */
export const inject = ['tools', 'mcpManager', 'credentials'];

/** 插件启用时装配共享与工作区运行时，并接入 volatile 配置对账。 */
export function apply(ctx: Context, config?: unknown): void {
  let settings: Readonly<PluginConfig> = readConfig(config);
  const logger: PluginLogger = {
    info: (message) => ctx.logger?.info?.(message),
    warn: (message) => ctx.logger?.warn?.(message),
  };
  logger.info(
    `[${PLUGIN_LABEL}] apply: ${Object.keys(settings.servers).length} configured server(s)`,
  );

  const manager = new ServerManager(ctx, () => settings, logger);
  const pool = new WorkspacePool(ctx, manager, {
    workspaceExists: (workspaceKey) => existsSync(workspaceKey),
  });
  let reconciliation: Promise<void> = Promise.resolve();
  /** 配置或授权对账完成后的回调，由会话可见性接入。 */
  let afterReconcile: (() => void) | undefined;
  const routes = new PluginRoutes(
    ctx,
    () => settings,
    manager,
    () => reconciliation,
    () => afterReconcile?.(),
    pool,
  );

  routes.registerApi();
  routes.registerWeb();

  ctx.effect(() => {
    let disposed = false;
    void (async () => {
      for (const serverName of Object.keys(settings.servers)) {
        if (disposed) return;
        try {
          await manager.mount(serverName);
        } catch (error) {
          logger.warn(
            `better-mcp: could not mount '${serverName}' at startup: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    })();
    return () => {
      disposed = true;
      routes.dispose();
      void pool.dispose();
      manager.dispose();
    };
  }, 'better-mcp: configured servers');

  ctx.inject(
    ['agents', 'sessionProjections', 'workingDirectory', 'mcpResources', 'systemPrompt'],
    async (scoped: Context) => {
      const currentWorkspaceKey = (agent: Agent): string =>
        normalizeWorkspaceKey(scoped.workingDirectory.get(agent.session));
      const workspaceExists = (workspaceKey: string): boolean => existsSync(workspaceKey);
      let visibility: VisibilityRuntime;
      const proxyCallbacks = {
        currentWorkspaceKey,
        isActive: (agent: Agent, route: WorkspaceProxyRoute) =>
          visibility.isActive(agent, route.serverName),
        isGenerationCurrent: (route: WorkspaceProxyRoute) =>
          pool.isCurrent(route.serverName, route.workspaceKey, route.generation),
        workspaceExists,
      };
      const proxy = new WorkspaceProxyRuntime(scoped, proxyCallbacks);
      const resources = new WorkspaceResourceRuntime(scoped, proxyCallbacks);
      const activeRoutes = (agent: Agent): WorkspaceProxyRoute[] => {
        const workspaceKey = currentWorkspaceKey(agent);
        return pool
          .list()
          .filter(
            (instance) =>
              instance.workspaceKey === workspaceKey &&
              visibility.isActive(agent, instance.serverName) &&
              instance.activeAgents.has(agent),
          )
          .map((instance) => ({
            serverName: instance.serverName,
            internalName: instance.internalName,
            workspaceKey: instance.workspaceKey,
            generation: instance.generation,
          }));
      };
      const presentation = new WorkspacePresentationRuntime({
        currentWorkspaceKey,
        activeRoutes,
        internalNames: () => pool.list().map((instance) => instance.internalName),
      });
      visibility = new VisibilityRuntime(
        scoped,
        () => settings,
        logger,
        (serverName) => manager.isAuthorized(serverName),
        { pool, proxy, resources, currentWorkspaceKey },
      );
      const bindings = new WorkspaceBindings({
        pool,
        getSettings: () => settings,
        currentWorkspaceKey,
        workspaceExists,
        onDeactivate: (agent, serverName) => visibility.setActive(agent, serverName, false),
      });
      bindings.onCleanup = (agent, oldWorkspace, newWorkspace, results) => {
        for (const result of results) {
          const notice = createWorkspaceCleanupNotice(result);
          const occupancy =
            result.state === 'retained'
              ? 'Other Agents remain bound to the old workspace, so its MCP instance is still running and the folder remains occupied.'
              : notice.detail;
          visibility.queueWorkspaceNotice(agent, {
            ...notice,
            detail:
              `The working directory changed from '${oldWorkspace}' to '${newWorkspace}'. ` +
              (occupancy ?? ''),
          });
        }
      };
      bindings.onMissing = (agent, workspace, results) => {
        for (const result of results) {
          const notice = createWorkspaceCleanupNotice(result, 'workspace-missing');
          visibility.queueWorkspaceNotice(agent, {
            ...notice,
            detail: `Workspace folder '${workspace}' is missing. ${notice.detail ?? ''}`,
          });
        }
      };
      await visibility.start();
      await manager.refreshAuthorizationAll();
      scoped.effect(() => {
        afterReconcile = () => {
          visibility.syncAll();
          visibility.notifyAll();
        };
        return () => {
          afterReconcile = undefined;
          visibility.dispose();
          resources.dispose();
          proxy.dispose();
        };
      }, 'better-mcp: session visibility');
      scoped.effect(
        () =>
          scoped.tools.register(
            buildManageTool(manager, visibility, () => settings, { pool, currentWorkspaceKey }),
          ),
        'better-mcp: mcp_manage',
      );
      scoped.on('agent/created', ({ agent }) => {
        bindings.created(agent);
        visibility.sync(agent);
        return undefined;
      });
      scoped.on('agent/disposed', ({ agent }) => {
        visibility.forget(agent);
        bindings.disposed(agent);
      });
      scoped.on('working-directory/access', (request, next) => bindings.access(request, next));
      scoped.on('session/event', (session, event) => {
        if (event.type !== 'turn/end') return;
        const agent = scoped.agents.get(session.id);
        if (agent !== undefined) visibility.deactivateAfterTurn(agent);
      });
      scoped.on('agent/pre-step', async ({ agent }, next) => {
        await bindings.checkAgent(agent);
        const decision = await next();
        if (decision.kind === 'reject') return decision;
        const catalog = visibility.catalogFor(agent);
        // 每步最多一条目录消息，配置恢复时也移除过期待处理目录。
        const rest = decision.messages.filter(
          (message) => (message.source as { kind?: unknown }).kind !== CATALOG_SOURCE,
        );
        if (catalog === undefined && rest.length === decision.messages.length) return decision;
        return { ...decision, messages: catalog === undefined ? rest : [...rest, catalog] };
      });
      scoped.on('system-prompt/assemble', (input, context, next) =>
        presentation.assemble(input, context, next),
      );
      scoped.on('tools/pre-execute', (execution, next) => resources.preExecute(execution, next));
      scoped.on('tools/change', () => visibility.scheduleSyncAll());
      for (const agent of scoped.agents.list()) bindings.created(agent);
      visibility.syncAll();
    },
  );

  ctx.on('loader/volatile-update', () => {
    let next: Readonly<PluginConfig>;
    try {
      next = readConfig(config);
    } catch (error) {
      logger.warn(`better-mcp: config update ignored: ${String(error)}`);
      return;
    }
    const previous = settings;
    settings = next;
    reconciliation = reconciliation
      .then(async () => {
        await pool.reconcile(previous, next);
        await manager.reconcile(previous, next);
        afterReconcile?.();
      })
      .catch((error: unknown) => {
        logger.warn(`better-mcp: config reconcile failed: ${String(error)}`);
      });
  });
}
