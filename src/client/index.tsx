/**
 * 浏览器入口：注册中英文字典、侧栏底部动作与插件页配置页。
 * 导出 inject 与 apply。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
// Type-only：拉取 plugins.row.config 槽位声明。
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
// Type-only：拉取 ctx.slots 服务。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
// Type-only：拉取 sidebar.footer.action 槽位声明。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { useEffect, useState } from 'react';

import { fetchStatus, type PanelSnapshot } from './api.ts';

import { en, NS, zh } from './locales.ts';
import { McpPanel, startStatusPolling } from './panel.tsx';
import { ClientStyles, McpIcon } from './ui.tsx';

/** 需要宿主注入的客户端服务。 */
export const inject = ['slots', 'locale', 'pluginNavigation'];

/** 插件包名，用于拼接配置页的槽位键。 */
export const PACKAGE_NAME = 'dsh-plugin-better-mcp';

/** 插件行 id。 */
export const ROW_ID = 'better-mcp';

/** 配置页的槽位键。 */
export const ROW_KEY = `${PACKAGE_NAME}#${ROW_ID}`;

/** 打开本插件的行配置页。 */
export function openPluginConfig(ctx: Context): void {
  ctx.pluginNavigation.openBundle(PACKAGE_NAME);
  // 宿主的 main 槽位键未纳入 SlotMap 类型声明。
  const entry = ctx.slots
    .entries('main' as never)
    .find((candidate) => candidate.options.key === 'plugins');
  const store = entry?.store;
  if (store === undefined || typeof store === 'function') return;
  store.create().actions.setView?.({ kind: 'row', name: PACKAGE_NAME, rowId: ROW_ID });
}

/** 判断快照中是否存在待授权 OAuth 服务器。 */
export function hasPendingAuthorization(snapshot: PanelSnapshot): boolean {
  return snapshot.servers.some((row) => row.auth === 'oauth' && !row.authorized);
}

/** 侧栏按钮的展示属性。 */
export function SidebarButton({
  t,
  wide,
  needsAuth,
  onOpen,
}: {
  t: TranslateNS<typeof NS>;
  wide: boolean;
  needsAuth: boolean;
  onOpen: () => void;
}): JSX.Element {
  return (
    <div className="better-mcp-entry" data-dsh-part="entry" data-rail={wide ? undefined : 'rail'}>
      <ClientStyles />
      <button
        type="button"
        className="better-mcp-sidebar-action"
        title={t('title')}
        aria-label={t('title')}
        data-attention={needsAuth || undefined}
        onClick={onOpen}
      >
        <McpIcon />
      </button>
    </div>
  );
}

/** 侧栏触发按钮，独立同步待授权状态。 */
function SidebarAction({
  t,
  wide,
  onOpen,
}: {
  t: TranslateNS<typeof NS>;
  wide: boolean;
  onOpen: () => void;
}): JSX.Element {
  const [needsAuth, setNeedsAuth] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = startStatusPolling(async () => {
      const snapshot = await fetchStatus();
      if (active) setNeedsAuth(hasPendingAuthorization(snapshot));
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  return <SidebarButton t={t} wide={wide} needsAuth={needsAuth} onOpen={onOpen} />;
}

/** 插件页配置项。 */
function ConfigPage({
  t,
  view,
}: {
  t: TranslateNS<typeof NS>;
  view: 'summary' | 'page';
}): JSX.Element {
  if (view === 'summary') {
    return (
      <>
        <ClientStyles />
        <div className="better-mcp-summary">{t('summary')}</div>
      </>
    );
  }
  return <McpPanel t={t} variant="page" />;
}

/** 插件在前端启用时调用：注册字典、侧栏动作与配置页。 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-better-mcp: dictionaries');
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: ROW_ID, order: 52, locale: NS },
      (props) => <SidebarAction {...props} onOpen={() => openPluginConfig(ctx)} />,
    ),
  );
  ctx.slots.inject('plugins.row.config', () =>
    ctx.slots.register({ name: 'plugins.row.config', key: ROW_KEY, locale: NS }, ConfigPage),
  );
}
