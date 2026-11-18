/**
 * 插件配置：schema、默认值、严格校验与热重载读取。
 * 导出 Config、PluginConfig、resolveConfig、readConfig 与单服务器校验。
 */
import Schema from '@deepseek-ai/schemastery';

import { PLUGIN_LABEL } from './constants.ts';
import type { Volatile } from './types.ts';
import {
  asString,
  isLoopbackHttpUrl,
  isPositiveInteger,
  isRecord,
  isValidServerName,
} from './utils.ts';

/** OAuth 客户端配置。 */
export interface OAuthClientConfig {
  /** 请求的 scope 列表。 */
  scopes: string[];
  /** 固定客户端标识。 */
  clientId?: string;
  /** 固定客户端密钥；只读取旧配置，界面写入凭据库。 */
  clientSecret?: string;
  /** 固定回调地址。 */
  redirectUri?: string;
  /** 覆盖发现的授权服务器地址。 */
  authorizationServer?: string;
  /** 覆盖发现的令牌端点。 */
  tokenEndpoint?: string;
}

/** 一台 MCP 服务器定义。 */
export interface ServerDefinition {
  /** 简介，写入会话的 MCP 目录。 */
  description: string;
  /** 传输方式。 */
  transport: 'stdio' | 'streamable-http';
  /** stdio：启动命令。 */
  command?: string;
  /** stdio：启动参数。 */
  args?: string[];
  /** stdio：额外环境变量。 */
  env?: Record<string, string>;
  /** stdio：工作目录。 */
  cwd?: string;
  /** streamable-http：端点地址。 */
  url?: string;
  /** streamable-http：额外请求头。 */
  headers?: Record<string, string>;
  /** 认证方式，缺省 oauth。 */
  auth: 'oauth' | 'none';
  /** 是否默认对会话隐藏，缺省 true。 */
  lazy: boolean;
  /** OAuth 参数。 */
  oauth?: OAuthClientConfig;
  /** 单次工具调用超时，转发给管理器。 */
  toolCallTimeoutMs?: number;
  /** 启动预算，转发给管理器。 */
  startupTimeoutMs?: number;
  /** 关闭预算，转发给管理器。 */
  closeTimeoutMs?: number;
  /** 重连策略，原样转发给管理器。 */
  reconnect?: Record<string, unknown>;
  /** 其它管理器字段。 */
  [key: string]: unknown;
}

/** 配置项的实时取值。 */
export interface PluginConfig {
  /** 本插件管理的服务器。 */
  servers: Record<string, ServerDefinition>;
}

/** 宿主传给 apply 的配置：每个字段是热重载引用。 */
export interface Config {
  /** 服务器定义。 */
  servers: Volatile<Record<string, ServerDefinition> | undefined>;
}

/** OAuth 参数 schema；只声明字段，不做默认值填充。 */
const OAuthSchema = Schema.object({
  scopes: Schema.array(Schema.string()),
  clientId: Schema.string(),
  clientSecret: Schema.string(),
  redirectUri: Schema.string(),
  authorizationServer: Schema.string(),
  tokenEndpoint: Schema.string(),
});

/** 单服务器 schema：声明已知字段，其余字段透传给管理器。 */
const ServerSchema = Schema.intersect([
  Schema.object({
    description: Schema.string(),
    transport: Schema.union(['stdio', 'streamable-http']).required(),
    command: Schema.string(),
    args: Schema.array(Schema.string()),
    env: Schema.dict(Schema.string()),
    cwd: Schema.string(),
    url: Schema.string(),
    headers: Schema.dict(Schema.string()),
    auth: Schema.union(['oauth', 'none']),
    lazy: Schema.boolean(),
    oauth: OAuthSchema,
    toolCallTimeoutMs: Schema.number(),
    startupTimeoutMs: Schema.number(),
    closeTimeoutMs: Schema.number(),
    reconnect: Schema.any(),
  }),
  Schema.dict(Schema.any()),
]);

/** 配置 schema。`servers` 是 volatile：写入后就地生效。 */
export const Config: Schema<Config> = Schema.object({
  servers: Schema.dict(ServerSchema).volatile(),
}) as unknown as Schema<Config>;

/** 合法的顶层配置键。 */
const CONFIG_KEYS = new Set<string>(['servers']);

/** 把缺省或 null 的输入转为空对象。 */
function normalizeInput(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) throw new Error(`${PLUGIN_LABEL}: config must be an object`);
  return raw;
}

/** 读取字符串数组；非法时返回 undefined。 */
function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === 'string') ? [...value] : undefined;
}

/** 读取字符串字典；非法时返回 undefined。 */
function stringDict(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return undefined;
    result[key] = item;
  }
  return result;
}

/** 校验并规范化 OAuth 参数。 */
function normalizeOAuth(name: string, raw: unknown): OAuthClientConfig {
  if (!isRecord(raw)) throw new Error(`${PLUGIN_LABEL}: servers.${name}.oauth must be an object`);
  const scopes = raw.scopes === undefined ? [] : stringArray(raw.scopes);
  if (scopes === undefined) {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.oauth.scopes must be an array of strings`);
  }
  const config: OAuthClientConfig = { scopes };
  for (const key of [
    'clientId',
    'clientSecret',
    'redirectUri',
    'authorizationServer',
    'tokenEndpoint',
  ] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.oauth.${key} must be a string`);
    }
    config[key] = value;
  }
  if (config.redirectUri !== undefined) assertLoopbackRedirect(name, config.redirectUri);
  return config;
}

/** 固定回调必须是回环 http 地址。 */
function assertLoopbackRedirect(name: string, redirectUri: string): void {
  if (!isLoopbackHttpUrl(redirectUri)) {
    throw new Error(
      `${PLUGIN_LABEL}: servers.${name}.oauth.redirectUri must be an http URL on 127.0.0.1 or localhost`,
    );
  }
}

/** 校验并规范化一台服务器定义。 */
export function normalizeServerDefinition(name: string, raw: unknown): ServerDefinition {
  if (!isValidServerName(name)) {
    throw new Error(
      `${PLUGIN_LABEL}: server name '${name}' must match ${String(/^[A-Za-z0-9_-]{1,32}$/)}`,
    );
  }
  if (!isRecord(raw)) throw new Error(`${PLUGIN_LABEL}: servers.${name} must be an object`);
  const transport = raw.transport;
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.transport must be stdio or streamable-http`);
  }
  const description = asString(raw.description)?.trim();
  if (description === undefined || description === '') {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.description is required`);
  }
  const config: ServerDefinition = {
    ...raw,
    description,
    transport,
    auth:
      raw.auth === undefined
        ? transport === 'stdio'
          ? 'none'
          : 'oauth'
        : (raw.auth as 'oauth' | 'none'),
    lazy: raw.lazy === undefined ? true : (raw.lazy as boolean),
  };
  if (config.auth !== 'oauth' && config.auth !== 'none') {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.auth must be oauth or none`);
  }
  if (typeof config.lazy !== 'boolean') {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.lazy must be a boolean`);
  }
  if (transport === 'stdio') {
    const command = asString(config.command);
    if (command === undefined || command.trim() === '') {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.command is required for a stdio server`);
    }
    if (typeof config.url === 'string' && config.url !== '') {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.url is not a stdio field`);
    }
    if (config.headers !== undefined) {
      const headers = stringDict(config.headers);
      if (headers === undefined) {
        throw new Error(`${PLUGIN_LABEL}: servers.${name}.headers must be a string map`);
      }
      if (Object.keys(headers).length > 0) {
        throw new Error(`${PLUGIN_LABEL}: servers.${name}.headers is not a stdio field`);
      }
    }
    const args = config.args === undefined ? [] : stringArray(config.args);
    if (args === undefined) {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.args must be an array of strings`);
    }
    config.args = args;
    const env = config.env === undefined ? {} : stringDict(config.env);
    if (env === undefined)
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.env must be a string map`);
    config.env = env;
  } else {
    const url = asString(config.url);
    if (url === undefined || url.trim() === '') {
      throw new Error(
        `${PLUGIN_LABEL}: servers.${name}.url is required for a streamable-http server`,
      );
    }
    new URL(url);
    if (typeof config.command === 'string' && config.command !== '') {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.command is not a streamable-http field`);
    }
    if (Array.isArray(config.args) && config.args.length > 0) {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.args is not a streamable-http field`);
    }
    if (isRecord(config.env) && Object.keys(config.env).length > 0) {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.env is not a streamable-http field`);
    }
    if (typeof config.cwd === 'string' && config.cwd !== '') {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.cwd is not a streamable-http field`);
    }
    const headers = config.headers === undefined ? {} : stringDict(config.headers);
    if (headers === undefined) {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.headers must be a string map`);
    }
    config.headers = headers;
    if (config.auth === 'oauth') {
      config.oauth =
        config.oauth === undefined ? { scopes: [] } : normalizeOAuth(name, config.oauth);
    } else if (config.oauth !== undefined) {
      config.oauth = normalizeOAuth(name, config.oauth);
    }
  }
  if (transport === 'stdio' && config.auth === 'oauth') {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.auth oauth requires streamable-http`);
  }
  for (const key of ['toolCallTimeoutMs', 'startupTimeoutMs', 'closeTimeoutMs'] as const) {
    const value = config[key];
    if (value !== undefined && !isPositiveInteger(value)) {
      throw new Error(`${PLUGIN_LABEL}: servers.${name}.${key} must be a positive integer`);
    }
  }
  if (config.reconnect !== undefined && !isRecord(config.reconnect)) {
    throw new Error(`${PLUGIN_LABEL}: servers.${name}.reconnect must be an object`);
  }
  return config;
}

/** 递归冻结。 */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value) as T;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value) as T;
  }
  return value;
}

/** 校验配置并与默认值合并，返回冻结的完整配置。 */
export function resolveConfig(raw?: unknown): Readonly<PluginConfig> {
  const input = normalizeInput(raw);
  for (const key of Object.keys(input)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`${PLUGIN_LABEL}: unknown config key "${key}"`);
  }
  const servers: Record<string, ServerDefinition> = {};
  if (input.servers !== undefined && input.servers !== null) {
    if (!isRecord(input.servers)) throw new Error(`${PLUGIN_LABEL}: servers must be an object`);
    for (const [name, definition] of Object.entries(input.servers)) {
      servers[name] = normalizeServerDefinition(name, definition);
    }
  }
  return deepFreeze({ servers });
}

/** 判断值是否是热重载引用。 */
function isVolatileRef(value: unknown): value is { get(): unknown } {
  return isRecord(value) && typeof value.get === 'function';
}

/** 读取宿主传入配置的当前值：展开热重载引用后交给 resolveConfig 校验。 */
export function readConfig(config?: unknown): Readonly<PluginConfig> {
  if (!isRecord(config)) return resolveConfig(config);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    values[key] = isVolatileRef(value) ? value.get() : value;
  }
  return resolveConfig(values);
}
