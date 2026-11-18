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
import type { McpKey, NS } from './locales.ts';
import {
  definitionFromValues,
  emptyForm,
  ServerForm,
  type ServerFormValues,
  valuesFromDefinition,
} from './server-form.tsx';
import { Button, ClientStyles, Modal, Switch } from './ui.tsx';

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

/** 连接状态名到字典键。 */
const STATE_KEYS: Record<string, McpKey> = {
  idle: 'stateIdle',
  connecting: 'stateConnecting',
  connected: 'stateConnected',
  reconnecting: 'stateReconnecting',
  'waiting-credentials': 'stateWaitingCredentials',
  failed: 'stateFailed',
  disabled: 'stateDisabled',
  closed: 'stateClosed',
};

/** 把服务器状态格式化为状态名与补充元数据。 */
export function statusParts(t: TranslateNS<typeof NS>, row: ServerRow): string[] {
  const key = STATE_KEYS[row.state];
  const parts = [key === undefined ? row.state : t(key)];
  if (row.state === 'connected') {
    parts.push(t('toolCount', { count: row.toolCount ?? 0 }));
    if (row.connectedAt !== undefined) {
      parts.push(t('connectedAt', { time: new Date(row.connectedAt).toLocaleString() }));
    }
  }
  if (row.attempt !== undefined) {
    parts.push(
      row.maxAttempts === undefined
        ? t('attempt', { attempt: row.attempt })
        : t('attemptOf', { attempt: row.attempt, max: row.maxAttempts }),
    );
  }
  if (row.cleanup === 'failed') parts.push(t('cleanupFailed'));
  if (row.cleanup === 'unconfirmed') parts.push(t('cleanupUnconfirmed'));
  return parts;
}

/** 服务器行。 */
export function ServerItem(props: {
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
  const { t, row } = props;
  const working = props.busy === row.name;
  const flags: string[] = [];
  if (row.auth === 'oauth') flags.push(row.authorized ? t('authorized') : t('needsAuth'));
  const parts = statusParts(t, row);
  const metadata = parts.slice(1);
  const hasExtra =
    metadata.length > 0 || row.url !== undefined || row.error !== undefined || row.managed;
  return (
    <li
      className="better-mcp-server"
      data-testid={`better-mcp-server-${row.name}`}
      aria-busy={working || undefined}
    >
      <div className="better-mcp-server-line">
        <span className="better-mcp-server-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>MCP</title>
            <path d="M7.5 9.5 4 12l3.5 2.5M16.5 9.5 20 12l-3.5 2.5" />
            <rect x="8.5" y="9.5" width="7" height="5" rx="1.2" />
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
            <path d="M12 6.6v2.9M12 14.5v2.9" />
          </svg>
        </span>
        <div className="better-mcp-server-main">
          <div className="better-mcp-server-title">
            <span className="better-mcp-server-name">{row.name}</span>
            <span className="better-mcp-badge">{row.managed ? t('managed') : t('external')}</span>
            {flags.map((flag) => (
              <span key={flag} className="better-mcp-badge">
                {flag}
              </span>
            ))}
          </div>
          {row.description !== undefined ? (
            <p className="better-mcp-description">{row.description}</p>
          ) : null}
        </div>
        <div className="better-mcp-server-side">
          <span className="better-mcp-state" data-state={row.state}>
            <span className="better-mcp-state-dot" data-state={row.state} aria-hidden="true" />
            {parts[0]}
          </span>
          {row.managed ? (
            <span className="better-mcp-lazy" title={t('lazyHint')}>
              <Switch
                checked={row.lazy}
                disabled={working}
                onChange={props.onLazy}
                label={t('lazyFor', { name: row.name })}
                title={t('lazyHint')}
              />
              <span>{t('lazy')}</span>
            </span>
          ) : null}
        </div>
      </div>
      {hasExtra ? (
        <div className="better-mcp-server-extra">
          {metadata.length > 0 ? (
            <p className="better-mcp-server-meta">{metadata.join(' · ')}</p>
          ) : null}
          {row.url !== undefined ? <p className="better-mcp-server-url">{row.url}</p> : null}
          {row.error !== undefined && row.error !== '' ? (
            <p className="better-mcp-diagnostics" role="alert">
              {row.error}
            </p>
          ) : null}
          {row.managed ? (
            <div className="better-mcp-actions">
              <Button busy={working} onClick={props.onRestart}>
                {working ? t('working') : t('restart')}
              </Button>
              {row.auth === 'oauth' ? (
                <Button disabled={working} onClick={props.onAuth}>
                  {row.authorized ? t('reauthorize') : t('authorize')}
                </Button>
              ) : null}
              {row.auth === 'oauth' && row.authorized ? (
                <Button disabled={working} onClick={props.onSignOut}>
                  {t('signout')}
                </Button>
              ) : null}
              <Button disabled={working} onClick={props.onEdit}>
                {t('edit')}
              </Button>
              <Button variant="danger" disabled={working} onClick={props.onDelete}>
                {t('delete')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 面板。 */
export function McpPanel({ t, variant, onClose }: McpPanelProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<EditingState | undefined>(undefined);
  const [deleting, setDeleting] = useState<ServerRow | undefined>(undefined);
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

  /** 执行一个带忙态的操作并返回是否成功。 */
  const run = async (
    key: string,
    operation: () => Promise<PanelSnapshot | undefined>,
  ): Promise<boolean> => {
    setBusy(key);
    setActionError(undefined);
    try {
      const result = await operation();
      if (result !== undefined) setSnapshot(result);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
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

  /** 关闭新增或编辑表单。 */
  const closeForm = (): void => {
    if (busy === 'form') return;
    setFormError(undefined);
    setEditing(undefined);
  };

  /** 打开删除确认。 */
  const deleteServer = (row: ServerRow): void => {
    setActionError(undefined);
    setDeleting(row);
  };

  /** 关闭删除确认。 */
  const closeDelete = (): void => {
    if (busy === deleting?.name) return;
    setActionError(undefined);
    setDeleting(undefined);
  };

  /** 确认删除服务器。 */
  const confirmDelete = async (): Promise<void> => {
    if (deleting === undefined) return;
    if (await run(deleting.name, () => removeServer(deleting.name))) setDeleting(undefined);
  };

  const addButton = (
    <Button
      variant="primary"
      size="md"
      onClick={() => {
        setFormError(undefined);
        setEditing({ mode: 'create', values: emptyForm() });
      }}
    >
      {t('add')}
    </Button>
  );
  const refreshButton = (
    <Button
      size="md"
      busy={busy === 'reload'}
      onClick={() =>
        void run('reload', async () => {
          await load();
          return undefined;
        })
      }
    >
      {t('refresh')}
    </Button>
  );

  const body = (
    <div className="better-mcp-panel-body">
      {loadError !== undefined ? (
        <div className="better-mcp-feedback better-mcp-feedback-error" role="alert">
          <span>
            {t('failedLoad')}: {loadError}
          </span>
          <Button onClick={() => void load()}>{t('retry')}</Button>
        </div>
      ) : null}
      {actionError !== undefined ? (
        <div className="better-mcp-feedback better-mcp-feedback-error" role="alert">
          {actionError}
        </div>
      ) : null}
      {authUrl !== undefined ? (
        <div className="better-mcp-feedback" role="status">
          <a href={authUrl} target="_blank" rel="noreferrer">
            {authUrl}
          </a>
        </div>
      ) : null}
      {snapshot === undefined && loadError === undefined ? (
        <div className="better-mcp-feedback" role="status">
          {t('loading')}
        </div>
      ) : null}
      {snapshot !== undefined && snapshot.servers.length === 0 ? (
        <div className="better-mcp-feedback" role="status">
          {t('empty')}
        </div>
      ) : null}
      {snapshot !== undefined && snapshot.servers.length > 0 ? (
        <ul className="better-mcp-server-list">
          {snapshot.servers.map((row) => (
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
                      description: row.description ?? '',
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
        </ul>
      ) : null}
    </div>
  );

  const dialogs = (
    <>
      <Modal
        open={editing !== undefined}
        onClose={closeForm}
        title={editing?.mode === 'edit' ? t('editTitle') : t('createTitle')}
        closeLabel={t('close')}
        className="better-mcp-dialog-form"
        testId="better-mcp-form-modal"
        footer={
          <>
            <Button size="lg" disabled={busy === 'form'} onClick={closeForm}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="submit"
              form="better-mcp-server-form"
              busy={busy === 'form'}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        {editing !== undefined ? (
          <ServerForm
            t={t}
            initial={editing.values}
            isEdit={editing.mode === 'edit'}
            busy={busy === 'form'}
            error={formError}
            onSubmit={(values) => void submitForm(values)}
          />
        ) : null}
      </Modal>
      <Modal
        open={deleting !== undefined}
        onClose={closeDelete}
        title={t('deleteTitle')}
        closeLabel={t('close')}
        description={
          deleting === undefined ? undefined : t('deleteConfirm', { name: deleting.name })
        }
        className="better-mcp-dialog-confirm"
        testId="better-mcp-delete-modal"
        footer={
          <>
            <Button size="lg" disabled={busy === deleting?.name} onClick={closeDelete}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              busy={busy === deleting?.name}
              onClick={() => void confirmDelete()}
            >
              {t('delete')}
            </Button>
          </>
        }
      >
        {deleting !== undefined && actionError !== undefined ? (
          <div className="better-mcp-feedback better-mcp-feedback-error" role="alert">
            {actionError}
          </div>
        ) : null}
      </Modal>
    </>
  );

  if (variant === 'page') {
    return (
      <div className="better-mcp-page" data-testid="better-mcp-panel">
        <ClientStyles />
        <section className="better-mcp-section">
          <div className="better-mcp-toolbar">
            <h4 className="better-mcp-section-title">{t('title')}</h4>
            {addButton}
            {refreshButton}
          </div>
          {body}
        </section>
        {dialogs}
      </div>
    );
  }
  return (
    <>
      <ClientStyles />
      <Modal
        open
        onClose={onClose ?? (() => undefined)}
        title={t('title')}
        closeLabel={t('close')}
        actions={
          <>
            {addButton}
            {refreshButton}
          </>
        }
      >
        {body}
      </Modal>
      {dialogs}
    </>
  );
}
