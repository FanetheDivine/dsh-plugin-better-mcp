/**
 * 共享 MCP 面板：服务器状态、懒加载、重连、授权与增删改。
 * 侧栏弹窗与插件页配置页使用同一个组件。
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { useCallback, useEffect, useState } from 'react';

import {
  configureClient,
  fetchStatus,
  type PanelSnapshot,
  removeServer,
  restart,
  type ServerRow,
  setLazy,
  signOut,
  startOAuth,
  upsertServer,
} from './api.ts';
import type { NS } from './locales.ts';
import {
  definitionFromValues,
  emptyForm,
  ServerForm,
  type ServerFormValues,
  valuesFromDefinition,
} from './server-form.tsx';

/** 面板属性。 */
export interface McpPanelProps {
  /** 翻译函数。 */
  t: TranslateNS<typeof NS>;
  /** 渲染形态。 */
  variant: 'modal' | 'page';
  /** 关闭回调，仅弹窗形态使用。 */
  onClose?: () => void;
}

/** 正在编辑的表单。 */
interface EditingState {
  /** 新增或编辑。 */
  mode: 'create' | 'edit';
  /** 表单值。 */
  values: ServerFormValues;
  /** 编辑时的原名称。 */
  originalName?: string;
}

/** 状态点颜色。 */
function stateColor(state: string): string {
  switch (state) {
    case 'connected':
      return '#2e9e5b';
    case 'connecting':
    case 'reconnecting':
    case 'waiting-credentials':
      return '#d99b2b';
    case 'failed':
      return '#d9534f';
    default:
      return '#8a8f98';
  }
}

/** 服务器行。 */
function ServerItem(props: {
  t: TranslateNS<typeof NS>;
  row: ServerRow;
  busy: string | undefined;
  onLazy: (lazy: boolean) => void;
  onRestart: () => void;
  onAuth: () => void;
  onSignOut: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const { t, row, busy } = props;
  const working = busy === row.name;
  const flags: string[] = [];
  if (row.auth === 'oauth') flags.push(row.authorized ? t('authorized') : t('needsAuth'));
  return (
    <div style={styles.server} data-testid={`better-mcp-server-${row.name}`}>
      <div style={styles.serverHead}>
        <span style={{ ...styles.dot, background: stateColor(row.state) }} />
        <span style={styles.serverName}>{row.name}</span>
        <span style={styles.badge}>{row.managed ? t('managed') : t('external')}</span>
        {flags.map((flag) => (
          <span key={flag} style={styles.badge}>
            {flag}
          </span>
        ))}
        <span style={styles.spacer} />
        {row.managed ? (
          <label style={styles.switch} title={t('lazy')}>
            <input
              type="checkbox"
              checked={row.lazy}
              disabled={working}
              onChange={(event) => props.onLazy(event.target.checked)}
            />
            <span>{t('lazy')}</span>
          </label>
        ) : null}
      </div>
      <div style={styles.serverDetail}>
        <span>{row.state}</span>
        {row.detail !== undefined ? <span> · {row.detail}</span> : null}
        {row.state === 'connected' ? <span> · {row.toolCount ?? 0} tools</span> : null}
      </div>
      {row.url !== undefined ? <div style={styles.serverUrl}>{row.url}</div> : null}
      <div style={styles.rowActions}>
        <button type="button" style={styles.button} disabled={working} onClick={props.onRestart}>
          {working ? '…' : t('restart')}
        </button>
        {row.auth === 'oauth' ? (
          <button type="button" style={styles.button} disabled={working} onClick={props.onAuth}>
            {row.authorized ? t('reauthorize') : t('authorize')}
          </button>
        ) : null}
        {row.auth === 'oauth' && row.authorized ? (
          <button type="button" style={styles.button} disabled={working} onClick={props.onSignOut}>
            {t('signout')}
          </button>
        ) : null}
        {row.managed ? (
          <>
            <button type="button" style={styles.button} disabled={working} onClick={props.onEdit}>
              {t('edit')}
            </button>
            <button type="button" style={styles.danger} disabled={working} onClick={props.onDelete}>
              {t('delete')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** 面板。 */
export function McpPanel({ t, variant, onClose }: McpPanelProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<EditingState | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [authUrl, setAuthUrl] = useState<string | undefined>(undefined);

  /** 重新读取快照。 */
  const load = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await fetchStatus());
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 执行一个带忙态的操作。 */
  const run = async (
    key: string,
    operation: () => Promise<PanelSnapshot | undefined>,
  ): Promise<void> => {
    setBusy(key);
    setActionError(undefined);
    try {
      const result = await operation();
      if (result !== undefined) setSnapshot(result);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  };

  /** 发起授权。 */
  const authorize = async (row: ServerRow): Promise<void> => {
    setBusy(row.name);
    setActionError(undefined);
    const tab = window.open('', '_blank');
    try {
      const result = await startOAuth(row.name);
      setAuthUrl(result.url);
      if (tab !== null) tab.location.href = result.url;
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      tab?.close();
    } finally {
      setBusy(undefined);
    }
  };

  /** 提交表单。 */
  const submitForm = async (values: ServerFormValues): Promise<void> => {
    setBusy('form');
    setFormError(undefined);
    try {
      const definition = definitionFromValues(values);
      let next = await upsertServer(values.name, definition);
      if (
        values.transport === 'streamable-http' &&
        values.auth === 'oauth' &&
        values.clientSecret !== ''
      ) {
        next = await configureClient({
          server: values.name,
          clientSecret: values.clientSecret,
          ...(values.clientId.trim() === '' ? {} : { clientId: values.clientId.trim() }),
          ...(values.redirectUri.trim() === '' ? {} : { redirectUri: values.redirectUri.trim() }),
        });
      }
      setSnapshot(next);
      setEditing(undefined);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  };

  /** 删除服务器。 */
  const deleteServer = (row: ServerRow): void => {
    if (!window.confirm(t('deleteConfirm', { name: row.name }))) return;
    void run(row.name, () => removeServer(row.name));
  };

  const body = (
    <div style={styles.body}>
      {loadError !== undefined ? (
        <div style={styles.errorBox}>
          <span>
            {t('failedLoad')}: {loadError}
          </span>
          <button type="button" style={styles.button} onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : null}
      {actionError !== undefined ? <div style={styles.errorBox}>{actionError}</div> : null}
      {authUrl !== undefined ? (
        <div style={styles.notice}>
          <a href={authUrl} target="_blank" rel="noreferrer">
            {authUrl}
          </a>
        </div>
      ) : null}
      {editing !== undefined ? (
        <ServerForm
          t={t}
          initial={editing.values}
          isEdit={editing.mode === 'edit'}
          busy={busy === 'form'}
          error={formError}
          onSubmit={(values) => void submitForm(values)}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
      {snapshot === undefined && loadError === undefined ? (
        <div style={styles.muted}>{t('loading')}</div>
      ) : null}
      {snapshot !== undefined && snapshot.servers.length === 0 ? (
        <div style={styles.muted}>{t('empty')}</div>
      ) : null}
      {snapshot?.servers.map((row) => (
        <ServerItem
          key={row.name}
          t={t}
          row={row}
          busy={busy}
          onLazy={(lazy) => void run(row.name, () => setLazy(row.name, lazy))}
          onRestart={() => void run(row.name, () => restart(row.name))}
          onAuth={() => void authorize(row)}
          onSignOut={() => void run(row.name, () => signOut(row.name))}
          onEdit={() => {
            setFormError(undefined);
            setEditing({
              mode: 'edit',
              values: valuesFromDefinition(
                row.name,
                row.definition ?? {
                  transport: row.transport ?? 'streamable-http',
                  auth: row.auth,
                  lazy: row.lazy,
                  url: row.url,
                },
              ),
              originalName: row.name,
            });
          }}
          onDelete={() => deleteServer(row)}
        />
      ))}
    </div>
  );

  const addButton = (
    <button
      type="button"
      style={styles.primary}
      onClick={() => {
        setFormError(undefined);
        setEditing({ mode: 'create', values: emptyForm() });
      }}
    >
      {t('add')}
    </button>
  );

  const header = (
    <div style={styles.header}>
      <span style={styles.brand}>MCP</span>
      <span style={styles.title}>{t('title')}</span>
      <span style={styles.spacer} />
      {addButton}
      <button
        type="button"
        style={styles.button}
        onClick={() => void load()}
        disabled={busy === 'reload'}
      >
        {t('retry')}
      </button>
      {variant === 'modal' && onClose !== undefined ? (
        <button type="button" style={styles.iconButton} aria-label={t('close')} onClick={onClose}>
          ×
        </button>
      ) : null}
    </div>
  );

  if (variant === 'page') {
    return (
      <div style={styles.page} data-testid="better-mcp-panel">
        {header}
        {body}
      </div>
    );
  }
  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" data-testid="better-mcp-modal">
      <div style={styles.card}>
        {header}
        {body}
      </div>
    </div>
  );
}

/** 面板样式。 */
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    width: 'min(640px, 94vw)',
    maxHeight: '78vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 12,
    background: 'var(--dsh-surface, #1b1c1f)',
    color: 'var(--dsh-text, inherit)',
    border: '1px solid var(--dsh-border, #33353a)',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 10,
    border: '1px solid var(--dsh-border, #33353a)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--dsh-border, #33353a)',
  },
  brand: { fontWeight: 700, color: '#5b7cfa', fontSize: 13 },
  title: { fontSize: 13, fontWeight: 600 },
  spacer: { flex: 1 },
  body: {
    padding: '10px 14px 14px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  server: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--dsh-border, #33353a)',
  },
  serverHead: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 999, flex: 'none' },
  serverName: { fontWeight: 600, fontSize: 13 },
  badge: {
    fontSize: 11,
    padding: '1px 6px',
    borderRadius: 999,
    border: '1px solid var(--dsh-border, #33353a)',
    opacity: 0.8,
  },
  switch: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: 0.9 },
  serverDetail: { fontSize: 12, opacity: 0.75 },
  serverUrl: {
    fontSize: 12,
    fontFamily: 'ui-monospace, monospace',
    opacity: 0.7,
    wordBreak: 'break-all',
  },
  rowActions: { display: 'flex', gap: 6, marginTop: 2 },
  muted: { fontSize: 12, opacity: 0.6 },
  button: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--dsh-border, #33353a)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
  primary: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: '#4f7df3',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
  },
  danger: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #d9534f',
    background: 'transparent',
    color: '#d9534f',
    cursor: 'pointer',
    fontSize: 12,
  },
  iconButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(217, 83, 79, 0.12)',
    color: '#d9534f',
    fontSize: 12,
  },
  notice: { fontSize: 12, wordBreak: 'break-all' },
  empty: { fontSize: 12, opacity: 0.6 },
} as const;
