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

import { en, NS, zh } from './locales.ts';
import { McpPanel } from './panel.tsx';

/** 需要宿主注入的客户端服务。 */
export const inject = ['slots', 'locale'];

/** 插件包名，用于拼接配置页的槽位键。 */
export const PACKAGE_NAME = 'dsh-plugin-better-mcp';

/** 插件行 id。 */
export const ROW_ID = 'better-mcp';

/** 配置页的槽位键。 */
export const ROW_KEY = `${PACKAGE_NAME}#${ROW_ID}`;

/** 侧栏触发按钮。 */
function SidebarAction({ t, wide }: { t: TranslateNS<typeof NS>; wide: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        title={t('title')}
        aria-label={t('title')}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: wide ? 'flex-start' : 'center',
          gap: 6,
          width: '100%',
          padding: wide ? '6px 8px' : '6px',
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>{t('title')}</title>
          <path d="M7.5 9.5 4 12l3.5 2.5" />
          <path d="M16.5 9.5 20 12l-3.5 2.5" />
          <rect x="8.5" y="9.5" width="7" height="5" rx="1.2" />
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
          <path d="M12 6.6v2.9M12 14.5v2.9" />
        </svg>
        {wide ? <span>{t('title')}</span> : null}
      </button>
      {open ? <McpPanel t={t} variant="modal" onClose={() => setOpen(false)} /> : null}
    </>
  );
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
    return <div style={{ fontSize: 12, opacity: 0.75 }}>{t('summary')}</div>;
  }
  return <McpPanel t={t} variant="page" />;
}

/** 插件在前端启用时调用：注册字典、侧栏动作与配置页。 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-better-mcp: dictionaries');
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: ROW_ID, order: 52, locale: NS },
      SidebarAction,
    ),
  );
  ctx.slots.inject('plugins.row.config', () =>
    ctx.slots.register({ name: 'plugins.row.config', key: ROW_KEY, locale: NS }, ConfigPage),
  );
}
