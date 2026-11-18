/**
 * 服务器新增/编辑表单：字段、校验与提交结构。
 * 表单只收集非密钥字段；客户端密钥经单独的路由写入凭据库。
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { useState } from 'react';
import type { ServerDefinition } from './api.ts';
import type { NS } from './locales.ts';

/** 表单值。 */
export interface ServerFormValues {
  /** 服务器名。 */
  name: string;
  /** 简介。 */
  description: string;
  /** 传输方式。 */
  transport: 'stdio' | 'streamable-http';
  /** http 地址。 */
  url: string;
  /** 请求头文本。 */
  headersText: string;
  /** stdio 命令。 */
  command: string;
  /** stdio 参数文本。 */
  argsText: string;
  /** 认证方式。 */
  auth: 'oauth' | 'none';
  /** 是否懒加载。 */
  lazy: boolean;
  /** OAuth 客户端标识。 */
  clientId: string;
  /** OAuth 客户端密钥。 */
  clientSecret: string;
  /** OAuth 回调地址。 */
  redirectUri: string;
  /** scopes 文本。 */
  scopesText: string;
}

/** 校验失败时返回的文案键。 */
export type FormErrorKey =
  | 'nameInvalid'
  | 'descriptionRequired'
  | 'urlInvalid'
  | 'commandRequired'
  | 'headersInvalid'
  | 'redirectInvalid';

/** 空表单。 */
export function emptyForm(): ServerFormValues {
  return {
    name: '',
    description: '',
    transport: 'streamable-http',
    url: '',
    headersText: '',
    command: '',
    argsText: '',
    auth: 'oauth',
    lazy: true,
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scopesText: '',
  };
}

/** 从已有定义填充表单。 */
export function valuesFromDefinition(name: string, definition: ServerDefinition): ServerFormValues {
  const oauth = isRecord(definition.oauth) ? definition.oauth : {};
  const scopes = Array.isArray(oauth.scopes)
    ? oauth.scopes.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    name,
    description: typeof definition.description === 'string' ? definition.description : '',
    transport: definition.transport === 'stdio' ? 'stdio' : 'streamable-http',
    url: typeof definition.url === 'string' ? definition.url : '',
    headersText: isRecord(definition.headers)
      ? Object.entries(definition.headers)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n')
      : '',
    command: typeof definition.command === 'string' ? definition.command : '',
    argsText: Array.isArray(definition.args)
      ? definition.args.filter((value): value is string => typeof value === 'string').join('\n')
      : '',
    auth: definition.auth === 'none' ? 'none' : 'oauth',
    lazy: definition.lazy !== false,
    clientId: typeof oauth.clientId === 'string' ? oauth.clientId : '',
    clientSecret: '',
    redirectUri: typeof oauth.redirectUri === 'string' ? oauth.redirectUri : '',
    scopesText: scopes.join(' '),
  };
}

/** 解析请求头文本。 */
export function parseHeaders(text: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) return undefined;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key === '') return undefined;
    headers[key] = value;
  }
  return headers;
}

/** 解析参数文本。 */
export function parseArgs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** 校验表单，返回第一个失败的文案键。 */
export function validateValues(values: ServerFormValues): FormErrorKey | undefined {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(values.name)) return 'nameInvalid';
  if (values.description.trim() === '') return 'descriptionRequired';
  if (values.transport === 'streamable-http') {
    if (values.url.trim() === '') return 'urlInvalid';
    try {
      const url = new URL(values.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'urlInvalid';
    } catch {
      return 'urlInvalid';
    }
    if (parseHeaders(values.headersText) === undefined) return 'headersInvalid';
    if (values.auth === 'oauth' && values.redirectUri.trim() !== '') {
      try {
        const url = new URL(values.redirectUri);
        if (
          url.protocol !== 'http:' ||
          (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        ) {
          return 'redirectInvalid';
        }
      } catch {
        return 'redirectInvalid';
      }
    }
  } else if (values.command.trim() === '') {
    return 'commandRequired';
  }
  return undefined;
}

/** 把表单值转换为提交给宿主的定义。 */
export function definitionFromValues(values: ServerFormValues): ServerDefinition {
  const definition: ServerDefinition = {
    description: values.description.trim(),
    transport: values.transport,
    lazy: values.lazy,
    auth: values.transport === 'stdio' ? 'none' : values.auth,
  };
  if (values.transport === 'streamable-http') {
    definition.url = values.url.trim();
    const headers = parseHeaders(values.headersText) ?? {};
    if (Object.keys(headers).length > 0) definition.headers = headers;
    if (values.auth === 'oauth') {
      const oauth: Record<string, unknown> = {};
      const scopes = values.scopesText
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value !== '');
      if (scopes.length > 0) oauth.scopes = scopes;
      if (values.clientId.trim() !== '') oauth.clientId = values.clientId.trim();
      if (values.redirectUri.trim() !== '') oauth.redirectUri = values.redirectUri.trim();
      if (Object.keys(oauth).length > 0) definition.oauth = oauth;
    }
  } else {
    definition.command = values.command.trim();
    const args = parseArgs(values.argsText);
    if (args.length > 0) definition.args = args;
  }
  return definition;
}

/** 判断值是否是普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 表单组件属性。 */
export interface ServerFormProps {
  /** 翻译函数。 */
  t: TranslateNS<typeof NS>;
  /** 初始值。 */
  initial: ServerFormValues;
  /** 是否编辑已有服务器。 */
  isEdit: boolean;
  /** 是否正在提交。 */
  busy: boolean;
  /** 提交失败的原因。 */
  error?: string | undefined;
  /** 提交。 */
  onSubmit: (values: ServerFormValues) => void;
  /** 取消。 */
  onCancel: () => void;
}

/** 表单组件。 */
export function ServerForm({
  t,
  initial,
  isEdit,
  busy,
  error,
  onSubmit,
  onCancel,
}: ServerFormProps) {
  const [values, setValues] = useState<ServerFormValues>(initial);
  const [invalid, setInvalid] = useState<FormErrorKey | undefined>(undefined);

  const update = <K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
    setInvalid(undefined);
  };

  const save = (): void => {
    const failure = validateValues(values);
    if (failure !== undefined) {
      setInvalid(failure);
      return;
    }
    onSubmit(values);
  };

  return (
    <div style={styles.form} data-testid="better-mcp-form">
      <div style={styles.formTitle}>{isEdit ? t('editTitle') : t('createTitle')}</div>
      <label style={styles.field}>
        <span style={styles.label}>{t('name')}</span>
        <input
          style={styles.input}
          value={values.name}
          disabled={isEdit}
          onChange={(event) => update('name', event.target.value)}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label}>{t('description')}</span>
        <textarea
          style={styles.textarea}
          value={values.description}
          placeholder={t('descriptionPlaceholder')}
          onChange={(event) => update('description', event.target.value)}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label}>{t('transport')}</span>
        <select
          style={styles.input}
          value={values.transport}
          onChange={(event) =>
            update('transport', event.target.value === 'stdio' ? 'stdio' : 'streamable-http')
          }
        >
          <option value="streamable-http">{t('transportHttp')}</option>
          <option value="stdio">{t('transportStdio')}</option>
        </select>
      </label>
      {values.transport === 'streamable-http' ? (
        <>
          <label style={styles.field}>
            <span style={styles.label}>{t('address')}</span>
            <input
              style={styles.input}
              value={values.url}
              onChange={(event) => update('url', event.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t('headers')}</span>
            <textarea
              style={styles.textarea}
              value={values.headersText}
              placeholder={'Authorization: Bearer …'}
              onChange={(event) => update('headersText', event.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t('auth')}</span>
            <select
              style={styles.input}
              value={values.auth}
              onChange={(event) => update('auth', event.target.value === 'none' ? 'none' : 'oauth')}
            >
              <option value="oauth">{t('authOAuth')}</option>
              <option value="none">{t('authNone')}</option>
            </select>
          </label>
          {values.auth === 'oauth' ? (
            <>
              <label style={styles.field}>
                <span style={styles.label}>{t('oauthClient')}</span>
                <input
                  style={styles.input}
                  value={values.clientId}
                  onChange={(event) => update('clientId', event.target.value)}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>{t('clientSecret')}</span>
                <input
                  style={styles.input}
                  type="password"
                  value={values.clientSecret}
                  placeholder={isEdit ? t('secretPlaceholder') : ''}
                  onChange={(event) => update('clientSecret', event.target.value)}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>{t('redirectUri')}</span>
                <input
                  style={styles.input}
                  value={values.redirectUri}
                  placeholder="http://127.0.0.1:19876/callback"
                  onChange={(event) => update('redirectUri', event.target.value)}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>{t('scopes')}</span>
                <input
                  style={styles.input}
                  value={values.scopesText}
                  onChange={(event) => update('scopesText', event.target.value)}
                />
              </label>
            </>
          ) : null}
        </>
      ) : (
        <>
          <label style={styles.field}>
            <span style={styles.label}>{t('command')}</span>
            <input
              style={styles.input}
              value={values.command}
              onChange={(event) => update('command', event.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t('args')}</span>
            <textarea
              style={styles.textarea}
              value={values.argsText}
              onChange={(event) => update('argsText', event.target.value)}
            />
          </label>
        </>
      )}
      <label style={styles.checkbox}>
        <input
          type="checkbox"
          checked={values.lazy}
          onChange={(event) => update('lazy', event.target.checked)}
        />
        <span>{t('lazy')}</span>
      </label>
      {invalid !== undefined ? <div style={styles.error}>{t(invalid)}</div> : null}
      {error !== undefined ? <div style={styles.error}>{error}</div> : null}
      <div style={styles.actions}>
        <button type="button" style={styles.button} onClick={onCancel} disabled={busy}>
          {t('cancel')}
        </button>
        <button type="button" style={styles.primary} onClick={save} disabled={busy}>
          {t('save')}
        </button>
      </div>
    </div>
  );
}

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    border: '1px solid var(--dsh-border, #33353a)',
    borderRadius: 10,
    margin: '10px 0',
  },
  formTitle: { fontSize: 14, fontWeight: 600 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, opacity: 0.7 },
  input: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsh-border, #33353a)',
    background: 'var(--dsh-surface, transparent)',
    color: 'inherit',
    fontSize: 13,
  },
  textarea: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsh-border, #33353a)',
    background: 'var(--dsh-surface, transparent)',
    color: 'inherit',
    fontSize: 13,
    minHeight: 64,
    fontFamily: 'ui-monospace, monospace',
  },
  checkbox: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
  error: { color: '#d9534f', fontSize: 12 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  button: {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid var(--dsh-border, #33353a)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 13,
  },
  primary: {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: '#4f7df3',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
} as const;
