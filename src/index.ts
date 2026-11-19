/**
 * 插件入口。导出宿主约定的 name、inject、apply 与 Config。
 *
 * 装配顺序：读取配置 → 创建服务器管理与路由 → 注册路由 → 挂载全部服务器 →
 * 监听热更新。`agents` 与 `sessionProjections` 可用时注册 `mcp_manage` 与会话可见性。
 */

import { Config, type PluginConfig, readConfig } from './config.ts';
import { CATALOG_SOURCE, PLUGIN_LABEL, PLUGIN_ROW_ID } from './constants.ts';
import { PluginRoutes } from './routes.ts';
import { ServerManager } from './servers.ts';
import { buildManageTool } from './tools.ts';
import type { Context, PluginLogger } from './types.ts';
import { VisibilityRuntime } from './visibility.ts';

export { Config };

/** 插件名，与 cordis.patch.yml 的 id 一致。 */
export const name = PLUGIN_ROW_ID;

/** 需要宿主注入的服务。 */
export const inject = ['tools', 'mcpManager', 'credentials'];

/**
 * 插件启用时调用：解析配置、注册路由、挂载全部服务器、接入会话可见性。
 * 保存 volatile 配置后宿主发出 `loader/volatile-update`，插件按新值对账。
 */
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
  let reconciliation: Promise<void> = Promise.resolve();
  /** 配置或授权对账完成后的回调，由会话可见性接入。 */
  let afterReconcile: (() => void) | undefined;
  const routes = new PluginRoutes(
    ctx,
    () => settings,
    manager,
    () => reconciliation,
    () => afterReconcile?.(),
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
      manager.dispose();
    };
  }, 'better-mcp: configured servers');

  ctx.inject(['agents', 'sessionProjections'], async (scoped: Context) => {
    const visibility = new VisibilityRuntime(
      scoped,
      () => settings,
      logger,
      (serverName) => manager.isAuthorized(serverName),
    );
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
      };
    }, 'better-mcp: session visibility');
    scoped.effect(
      () => scoped.tools.register(buildManageTool(manager, visibility, () => settings)),
      'better-mcp: mcp_manage',
    );
    scoped.on('agent/created', ({ agent }) => {
      visibility.sync(agent);
      return undefined;
    });
    scoped.on('agent/disposed', ({ agent }) => visibility.forget(agent));
    scoped.on('session/event', (session, event) => {
      if (event.type !== 'turn/end') return;
      const agent = scoped.agents.get(session.id);
      if (agent !== undefined) visibility.deactivateAfterTurn(agent);
    });
    scoped.on('agent/pre-step', async ({ agent }, next) => {
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
    scoped.on('tools/change', () => visibility.scheduleSyncAll());
    visibility.syncAll();
  });

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
        await manager.reconcile(previous, next);
        afterReconcile?.();
      })
      .catch((error: unknown) => {
        logger.warn(`better-mcp: config reconcile failed: ${String(error)}`);
      });
  });
}
