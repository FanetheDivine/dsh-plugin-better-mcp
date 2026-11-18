/**
 * 共享类型：宿主类型再导出与本地路由契约。
 * 全部为 type-only 导入，编译后不留运行时依赖。
 */

import type { Context, Events, Volatile } from '@deepseek-ai/cordis';
// Type-only：拉取 loader 入口与 `loader/volatile-update` 声明。
import type {} from '@deepseek-ai/cordis-plugin-loader';
// Type-only：拉取 `ctx.agents`、`agent/created` 与 `agent/pre-step` 声明。
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
// Type-only：拉取 `ctx.configEditor` 声明。
import type {} from '@deepseek-ai/dsh-config-editor';
// Type-only：拉取凭据服务与记录类型。
import type { CredentialKey, CredentialRecord, CredentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { McpManagedServerStatus, McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
// Type-only：拉取 `ctx.sessionProjections` 声明。
import type { ProjectionDefinition, ProjectionHandle } from '@deepseek-ai/dsh-session-projection';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { PluginConfig } from './config.ts';

/** 插件配置类型。 */
export type { PluginConfig } from './config.ts';

/** 宿主类型。插件内统一从这里导入。 */
export type {
  Agent,
  Context,
  CredentialKey,
  CredentialRecord,
  CredentialRef,
  Events,
  McpManagedServerStatus,
  McpManagedServerView,
  PreStepDecision,
  ProjectionDefinition,
  ProjectionHandle,
  SessionEvent,
  ToolDefinition,
  ToolRunContext,
  UserMessage,
  Volatile,
};

/** `@deepseek-ai/dsh-tools` 投影出的工具 schema。 */
export interface ToolSchemaView {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** 一条同源 JSON 路由。 */
export interface HostFetchRoute {
  readonly path: string;
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[];
  readonly requestBody: 'buffered' | 'streaming';
  readonly fetch: (request: Request) => Promise<Response>;
}

/** `ctx.connection` 的 fetch 部分；宿主包未导出类型，这里按服务契约声明。 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: {
      fetch: {
        register(route: HostFetchRoute): () => Promise<void>;
      };
    };
  }
}

/** 一条 Web 载体路由。 */
export interface ServerRoute {
  readonly kind: 'exact' | 'prefix';
  readonly path: string;
  readonly handler: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void | Promise<void>;
}

/** 简洁的日志接口。 */
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
}

/** 运行时读取配置的函数。 */
export type SettingsReader = () => Readonly<PluginConfig>;
