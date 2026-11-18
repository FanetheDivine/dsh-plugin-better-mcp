/**
 * 插件入口。导出宿主约定的 name、inject、apply 与 Config。
 *
 * 装配顺序：读取配置 → 创建服务器管理与路由 → 注册路由 → 挂载常驻服务器 →
 * 监听热更新。
 */

import { Config, type PluginConfig, readConfig } from './config.ts';
import { PLUGIN_LABEL, PLUGIN_ROW_ID } from './constants.ts';
import { PluginRoutes } from './routes.ts';
import { ServerManager } from './servers.ts';
import type { Context, PluginLogger } from './types.ts';

export { Config };

/** 插件名，与 cordis.patch.yml 的 id 一致。 */
export const name = PLUGIN_ROW_ID;

/** 需要宿主注入的服务。 */
export const inject = ['tools', 'mcpManager', 'credentials'];

/**
 * 插件启用时调用：解析配置、注册路由、挂载常驻服务器。
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
  const routes = new PluginRoutes(
    ctx,
    () => settings,
    manager,
    () => reconciliation,
  );

  routes.registerApi();
  routes.registerWeb();

  ctx.effect(() => {
    let disposed = false;
    void (async () => {
      for (const serverName of Object.keys(settings.servers)) {
        if (disposed) return;
        if (await manager.isLazy(serverName)) continue;
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
      })
      .catch((error: unknown) => {
        logger.warn(`better-mcp: config reconcile failed: ${String(error)}`);
      });
  });
}
