/**
 * 服务器新增/编辑表单：字段、校验与提交结构。
 * 表单只收集非密钥字段；客户端密钥经单独的路由写入凭据库。
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { useRef, useState } from 'react';
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

const FIELD_FOR_ERROR: Record<FormErrorKey, keyof ServerFormValues> = {
  nameInvalid: 'name',
  descriptionRequired: 'description',
  urlInvalid: 'url',
  headersInvalid: 'headersText',
  commandRequired: 'command',
  redirectInvalid: 'redirectUri',
};

/** 把校验错误映射到对应的表单字段。 */
export function fieldForError(error: FormErrorKey): keyof ServerFormValues {
  return FIELD_FOR_ERROR[error];
}

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
}

/** 表单组件。 */
export function ServerForm({
  t,
  initial,
  isEdit,
  busy,
  error,
  onSubmit,
}: ServerFormProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ServerFormValues>(initial);
  const [invalid, setInvalid] = useState<FormErrorKey | undefined>(undefined);
  const invalidField = invalid === undefined ? undefined : fieldForError(invalid);

  const update = <K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
    setInvalid(undefined);
  };

  const errorId = (key: keyof ServerFormValues): string => `better-mcp-${key}-error`;
  const describedBy = (key: keyof ServerFormValues): string | undefined =>
    invalidField === key ? errorId(key) : undefined;
  const fieldError = (key: keyof ServerFormValues): JSX.Element | null => {
    if (invalid === undefined || invalidField !== key) return null;
    return (
      <p className="better-mcp-field-error" id={errorId(key)}>
        {t(invalid)}
      </p>
    );
  };

  const save = (): void => {
    const failure = validateValues(values);
    if (failure !== undefined) {
      setInvalid(failure);
      formRef.current?.querySelector<HTMLElement>(`[name="${fieldForError(failure)}"]`)?.focus();
      return;
    }
    onSubmit(values);
  };

  return (
    <form
      ref={formRef}
      id="better-mcp-server-form"
      className="better-mcp-form"
      data-testid="better-mcp-form"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="better-mcp-form-grid">
        <div className="better-mcp-field">
          <label className="better-mcp-label" htmlFor="better-mcp-name">
            {t('name')}
          </label>
          <input
            id="better-mcp-name"
            name="name"
            className="better-mcp-input"
            value={values.name}
            disabled={isEdit}
            data-modal-autofocus={!isEdit ? true : undefined}
            aria-invalid={invalidField === 'name'}
            aria-describedby={describedBy('name')}
            onChange={(event) => update('name', event.target.value)}
          />
          {fieldError('name')}
        </div>
        <div className="better-mcp-field">
          <label className="better-mcp-label" htmlFor="better-mcp-transport">
            {t('transport')}
          </label>
          <select
            id="better-mcp-transport"
            name="transport"
            className="better-mcp-input"
            value={values.transport}
            aria-invalid={invalidField === 'transport'}
            aria-describedby={describedBy('transport')}
            onChange={(event) =>
              update('transport', event.target.value === 'stdio' ? 'stdio' : 'streamable-http')
            }
          >
            <option value="streamable-http">{t('transportHttp')}</option>
            <option value="stdio">{t('transportStdio')}</option>
          </select>
        </div>
        <div className="better-mcp-field better-mcp-field-full">
          <label className="better-mcp-label" htmlFor="better-mcp-description">
            {t('description')}
          </label>
          <textarea
            id="better-mcp-description"
            name="description"
            className="better-mcp-input better-mcp-textarea"
            value={values.description}
            placeholder={t('descriptionPlaceholder')}
            data-modal-autofocus={isEdit ? true : undefined}
            aria-invalid={invalidField === 'description'}
            aria-describedby={describedBy('description')}
            onChange={(event) => update('description', event.target.value)}
          />
          {fieldError('description')}
        </div>
        {values.transport === 'streamable-http' ? (
          <>
            <div className="better-mcp-field better-mcp-field-full">
              <label className="better-mcp-label" htmlFor="better-mcp-url">
                {t('address')}
              </label>
              <input
                id="better-mcp-url"
                name="url"
                className="better-mcp-input"
                value={values.url}
                aria-invalid={invalidField === 'url'}
                aria-describedby={describedBy('url')}
                onChange={(event) => update('url', event.target.value)}
              />
              {fieldError('url')}
            </div>
            <div className="better-mcp-field better-mcp-field-full">
              <label className="better-mcp-label" htmlFor="better-mcp-headersText">
                {t('headers')}
              </label>
              <textarea
                id="better-mcp-headersText"
                name="headersText"
                className="better-mcp-input better-mcp-textarea better-mcp-code"
                value={values.headersText}
                placeholder="Authorization: Bearer …"
                aria-invalid={invalidField === 'headersText'}
                aria-describedby={describedBy('headersText')}
                onChange={(event) => update('headersText', event.target.value)}
              />
              {fieldError('headersText')}
            </div>
            <div className="better-mcp-field">
              <label className="better-mcp-label" htmlFor="better-mcp-auth">
                {t('auth')}
              </label>
              <select
                id="better-mcp-auth"
                name="auth"
                className="better-mcp-input"
                value={values.auth}
                aria-invalid={invalidField === 'auth'}
                aria-describedby={describedBy('auth')}
                onChange={(event) =>
                  update('auth', event.target.value === 'none' ? 'none' : 'oauth')
                }
              >
                <option value="oauth">{t('authOAuth')}</option>
                <option value="none">{t('authNone')}</option>
              </select>
            </div>
            {values.auth === 'oauth' ? (
              <>
                <div className="better-mcp-field">
                  <label className="better-mcp-label" htmlFor="better-mcp-clientId">
                    {t('oauthClient')}
                  </label>
                  <input
                    id="better-mcp-clientId"
                    name="clientId"
                    className="better-mcp-input"
                    value={values.clientId}
                    aria-invalid={invalidField === 'clientId'}
                    aria-describedby={describedBy('clientId')}
                    onChange={(event) => update('clientId', event.target.value)}
                  />
                </div>
                <div className="better-mcp-field">
                  <label className="better-mcp-label" htmlFor="better-mcp-clientSecret">
                    {t('clientSecret')}
                  </label>
                  <input
                    id="better-mcp-clientSecret"
                    name="clientSecret"
                    className="better-mcp-input"
                    type="password"
                    autoComplete="new-password"
                    value={values.clientSecret}
                    placeholder={isEdit ? t('secretPlaceholder') : ''}
                    aria-invalid={invalidField === 'clientSecret'}
                    aria-describedby={describedBy('clientSecret')}
                    onChange={(event) => update('clientSecret', event.target.value)}
                  />
                </div>
                <div className="better-mcp-field better-mcp-field-full">
                  <label className="better-mcp-label" htmlFor="better-mcp-redirectUri">
                    {t('redirectUri')}
                  </label>
                  <input
                    id="better-mcp-redirectUri"
                    name="redirectUri"
                    className="better-mcp-input"
                    value={values.redirectUri}
                    placeholder="http://127.0.0.1:19876/callback"
                    aria-invalid={invalidField === 'redirectUri'}
                    aria-describedby={describedBy('redirectUri')}
                    onChange={(event) => update('redirectUri', event.target.value)}
                  />
                  {fieldError('redirectUri')}
                </div>
                <div className="better-mcp-field better-mcp-field-full">
                  <label className="better-mcp-label" htmlFor="better-mcp-scopesText">
                    {t('scopes')}
                  </label>
                  <input
                    id="better-mcp-scopesText"
                    name="scopesText"
                    className="better-mcp-input"
                    value={values.scopesText}
                    aria-invalid={invalidField === 'scopesText'}
                    aria-describedby={describedBy('scopesText')}
                    onChange={(event) => update('scopesText', event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="better-mcp-field">
              <label className="better-mcp-label" htmlFor="better-mcp-command">
                {t('command')}
              </label>
              <input
                id="better-mcp-command"
                name="command"
                className="better-mcp-input better-mcp-code"
                value={values.command}
                aria-invalid={invalidField === 'command'}
                aria-describedby={describedBy('command')}
                onChange={(event) => update('command', event.target.value)}
              />
              {fieldError('command')}
            </div>
            <div className="better-mcp-field better-mcp-field-full">
              <label className="better-mcp-label" htmlFor="better-mcp-argsText">
                {t('args')}
              </label>
              <textarea
                id="better-mcp-argsText"
                name="argsText"
                className="better-mcp-input better-mcp-textarea better-mcp-code"
                value={values.argsText}
                aria-invalid={invalidField === 'argsText'}
                aria-describedby={describedBy('argsText')}
                onChange={(event) => update('argsText', event.target.value)}
              />
            </div>
          </>
        )}
        <div className="better-mcp-field better-mcp-field-full">
          <label className="better-mcp-checkbox" htmlFor="better-mcp-lazy">
            <input
              id="better-mcp-lazy"
              name="lazy"
              type="checkbox"
              checked={values.lazy}
              onChange={(event) => update('lazy', event.target.checked)}
            />
            <span>{t('lazy')}</span>
          </label>
        </div>
      </div>
      {error !== undefined ? (
        <div className="better-mcp-form-error" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
