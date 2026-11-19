/**
 * 服务器新增/编辑表单：字段、校验与提交结构。
 * 表单只收集非密钥字段；客户端密钥经单独的路由写入凭据库。
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type KeyboardEvent, useRef, useState } from 'react';
import type { ServerDefinition } from './api.ts';
import type { McpKey, NS } from './locales.ts';

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
  /** 是否懒加载。 */
  lazy: boolean;
  /** OAuth 客户端标识。 */
  clientId: string;
  /** OAuth 客户端密钥。 */
  clientSecret: string;
  /** scopes 文本。 */
  scopesText: string;
}

/** 校验失败时返回的文案键。 */
export type FormErrorKey =
  | 'nameInvalid'
  | 'descriptionRequired'
  | 'urlInvalid'
  | 'commandRequired'
  | 'headersInvalid';

const FIELD_FOR_ERROR: Record<FormErrorKey, keyof ServerFormValues> = {
  nameInvalid: 'name',
  descriptionRequired: 'description',
  urlInvalid: 'url',
  headersInvalid: 'headersText',
  commandRequired: 'command',
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
    transport: 'stdio',
    url: '',
    headersText: '',
    command: '',
    argsText: '',
    lazy: true,
    clientId: '',
    clientSecret: '',
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
    lazy: definition.lazy !== false,
    clientId: typeof oauth.clientId === 'string' ? oauth.clientId : '',
    clientSecret: '',
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
    auth: values.transport === 'stdio' ? 'none' : 'oauth',
  };
  if (values.transport === 'streamable-http') {
    definition.url = values.url.trim();
    const headers = parseHeaders(values.headersText) ?? {};
    if (Object.keys(headers).length > 0) definition.headers = headers;
    const oauth: Record<string, unknown> = {};
    const scopes = values.scopesText
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (scopes.length > 0) oauth.scopes = scopes;
    if (values.clientId.trim() !== '') oauth.clientId = values.clientId.trim();
    if (Object.keys(oauth).length > 0) definition.oauth = oauth;
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

/** OAuth 客户端标识备选项。 */
const OAUTH_CLIENT_PRESETS: readonly {
  id: 'dsh' | 'codex';
  value: string;
  labelKey: McpKey;
  detailKey: McpKey;
}[] = [
  { id: 'dsh', value: '', labelKey: 'oauthClientDsh', detailKey: 'oauthClientDshDetail' },
  {
    id: 'codex',
    value: 'app_EMoamEEZ73f0CkXaXp7hrann',
    labelKey: 'oauthClientCodex',
    detailKey: 'oauthClientCodexDetail',
  },
];

/** 可自由输入并始终提供 DSH 与 Codex 备选项的客户端标识控件。 */
function OAuthClientInput({
  t,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  t: TranslateNS<typeof NS>;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  /** 选择备选项并保留输入框焦点。 */
  const select = (value: string): void => {
    onChange(value);
    setOpen(false);
    setActive(-1);
  };

  /** 处理备选项导航、选择与仅关闭弹层的 Escape。 */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        if (current < 0) return delta === 1 ? 0 : OAUTH_CLIENT_PRESETS.length - 1;
        return (current + delta + OAUTH_CLIENT_PRESETS.length) % OAUTH_CLIENT_PRESETS.length;
      });
      return;
    }
    if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      const preset = OAUTH_CLIENT_PRESETS[active];
      if (preset !== undefined) select(preset.value);
    }
  };

  return (
    <div className="better-mcp-autocomplete">
      <input
        id="better-mcp-clientId"
        name="clientId"
        className="better-mcp-input"
        value={value}
        role="combobox"
        autoComplete="off"
        placeholder={t('oauthClientPlaceholder')}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="better-mcp-client-id-options"
        aria-activedescendant={
          active >= 0 ? `better-mcp-client-option-${OAUTH_CLIENT_PRESETS[active]?.id}` : undefined
        }
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        id="better-mcp-client-id-options"
        className="better-mcp-autocomplete-options"
        role="listbox"
        aria-label={t('oauthClient')}
        hidden={!open}
      >
        {OAUTH_CLIENT_PRESETS.map((preset, index) => (
          <button
            key={preset.id}
            id={`better-mcp-client-option-${preset.id}`}
            type="button"
            role="option"
            tabIndex={-1}
            className="better-mcp-autocomplete-option"
            data-active={active === index || undefined}
            aria-selected={value === preset.value}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => select(preset.value)}
          >
            <span className="better-mcp-autocomplete-label">{t(preset.labelKey)}</span>
            <span className="better-mcp-autocomplete-detail">{t(preset.detailKey)}</span>
            {preset.value !== '' ? <code>{preset.value}</code> : null}
          </button>
        ))}
      </div>
    </div>
  );
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
  const describedBy = (key: keyof ServerFormValues): string | undefined => {
    const ids = key === 'name' ? ['better-mcp-name-hint'] : [];
    if (invalidField === key) ids.push(errorId(key));
    return ids.length === 0 ? undefined : ids.join(' ');
  };
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
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset className="better-mcp-form-grid" disabled={busy}>
        <div className="better-mcp-field">
          <label className="better-mcp-label" htmlFor="better-mcp-name">
            {t('name')}
            <span className="better-mcp-required" aria-hidden="true">
              {' *'}
            </span>
          </label>
          <input
            id="better-mcp-name"
            name="name"
            className="better-mcp-input"
            value={values.name}
            required
            disabled={isEdit}
            data-modal-autofocus={!isEdit ? true : undefined}
            aria-invalid={invalidField === 'name'}
            aria-describedby={describedBy('name')}
            onChange={(event) => update('name', event.target.value)}
          />
          <p className="better-mcp-field-hint" id="better-mcp-name-hint">
            {t('nameHint')}
          </p>
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
            <option value="stdio">{t('transportStdio')}</option>
            <option value="streamable-http">{t('transportHttp')}</option>
          </select>
        </div>
        <div className="better-mcp-field better-mcp-field-full">
          <label className="better-mcp-label" htmlFor="better-mcp-description">
            {t('description')}
            <span className="better-mcp-required" aria-hidden="true">
              {' *'}
            </span>
          </label>
          <textarea
            id="better-mcp-description"
            name="description"
            className="better-mcp-input better-mcp-textarea"
            value={values.description}
            required
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
                <span className="better-mcp-required" aria-hidden="true">
                  {' *'}
                </span>
              </label>
              <input
                id="better-mcp-url"
                name="url"
                className="better-mcp-input"
                value={values.url}
                required
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
              <div className="better-mcp-label-row">
                <label className="better-mcp-label" htmlFor="better-mcp-clientId">
                  {t('oauthClient')}
                </label>
                <span className="better-mcp-help">
                  <button
                    type="button"
                    className="better-mcp-help-trigger"
                    aria-label={t('oauthClientHelp')}
                    aria-describedby="better-mcp-oauth-client-help"
                  >
                    ?
                  </button>
                  <span
                    id="better-mcp-oauth-client-help"
                    className="better-mcp-help-tooltip"
                    role="tooltip"
                  >
                    {t('oauthClientHelpText')}
                  </span>
                </span>
              </div>
              <OAuthClientInput
                t={t}
                value={values.clientId}
                invalid={invalidField === 'clientId'}
                describedBy={describedBy('clientId')}
                onChange={(value) => update('clientId', value)}
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
        ) : (
          <>
            <div className="better-mcp-field">
              <label className="better-mcp-label" htmlFor="better-mcp-command">
                {t('command')}
                <span className="better-mcp-required" aria-hidden="true">
                  {' *'}
                </span>
              </label>
              <input
                id="better-mcp-command"
                name="command"
                className="better-mcp-input better-mcp-code"
                value={values.command}
                required
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
      </fieldset>
      {error !== undefined ? (
        <div className="better-mcp-form-error" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
