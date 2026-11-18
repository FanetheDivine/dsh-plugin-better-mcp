/**
 * 面板路由、OAuth 回调与聚合端点注册。
 *
 * /api/better-mcp/* 走同源 fetch 路由；OAuth 回调与聚合端点是 Web 载体的
 * 普通路由。服务器定义的写入经宿主 config editor 落回 profile 用户层。
 */
import { createServer, type Server } from 'node:http';

import { type AggregateOptions, createGroupHandler } from './aggregate.ts';
import type { OAuthClientConfig, ServerDefinition } from './config.ts';
import { normalizeServerDefinition } from './config.ts';
import {
  AGGREGATE_CALL_TIMEOUT_MS,
  CALLBACK_PATH,
  ENDPOINT_DEFAULT,
  PENDING_TTL_MS,
  PLUGIN_LABEL,
} from './constants.ts';
import {
  deleteClientSecret,
  deleteGrant,
  ensureEndpointToken,
  readClientSecret,
  rotateEndpointToken,
  writeClientSecret,
  writeGrant,
} from './credentials.ts';
import {
  authorizationUrl,
  discover,
  exchangeCode,
  type PendingAuthorization,
  registerClient,
} from './oauth.ts';
import type { PanelSnapshotWithToken, ServerManager } from './servers.ts';
import { clearLazy, setLazy } from './state.ts';
import type {
  Context,
  PluginLogger,
  ServerRoute,
  SettingsReader,
  ToolSchemaView,
} from './types.ts';
import { asString, escapeHtml, isRecord, jsonResponse } from './utils.ts';

/** 待完成授权上下文。 */
interface PendingContext extends PendingAuthorization {
  /** 固定回环监听器。 */
  listener?: Server | undefined;
}

/** 结果页标题与正文。 */
function resultPage(title: string, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:system-ui,sans-serif;padding:32px;line-height:1.5"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></body>`;
}

/** 路由与 OAuth 运行时。 */
export class PluginRoutes {
  /** state → 待完成授权。 */
  private readonly pending = new Map<string, PendingContext>();
  /** 仍等待回调的回环监听器。 */
  private readonly listeners = new Set<Server>();
  /** 组名 → 聚合处理器。 */
  private readonly handlers = new Map<string, ReturnType<typeof createGroupHandler>>();
  /** 聚合端点前缀路由的 disposer。 */
  private aggregateDispose: (() => void) | undefined;
  /** 已注册的前缀路径。 */
  private aggregatePath: string | undefined;
  /** 释放函数。 */
  private readonly disposers: Array<() => void | Promise<void>> = [];

  constructor(
    private readonly ctx: Context,
    private readonly getSettings: SettingsReader,
    private readonly manager: ServerManager,
    private readonly logger: PluginLogger,
    private readonly waitIdle: () => Promise<void> = async () => undefined,
  ) {}

  /** 注册全部同源 JSON 路由。 */
  registerApi(): void {
    this.ctx.inject(['connection'], (webCtx) => {
      const routes = [
        {
          path: '/api/better-mcp/status',
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async () => jsonResponse(await this.snapshotWithToken()),
        },
        {
          path: '/api/better-mcp/lazy',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.setLazy(request),
        },
        {
          path: '/api/better-mcp/restart',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.restart(request),
        },
        {
          path: '/api/better-mcp/servers',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.upsertServer(request),
        },
        {
          path: '/api/better-mcp/servers/remove',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.removeServer(request),
        },
        {
          path: '/api/better-mcp/oauth/start',
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.startOAuth(request),
        },
        {
          path: '/api/better-mcp/oauth/signout',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.signOut(request),
        },
        {
          path: '/api/better-mcp/oauth/client',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request: Request) => this.configureClient(request),
        },
        {
          path: '/api/better-mcp/endpoint/rotate',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async () => jsonResponse({ token: await rotateEndpointToken(this.ctx) }),
        },
      ] as const;
      for (const route of routes) {
        this.disposers.push(
          webCtx.connection.fetch.register(
            route as unknown as Parameters<typeof webCtx.connection.fetch.register>[0],
          ),
        );
      }
    });
  }

  /** 注册回调与聚合端点路由。 */
  registerWeb(): void {
    this.ctx.inject(['webServer'], (serverCtx) => {
      this.disposers.push(
        serverCtx.webServer.register({
          kind: 'exact',
          path: CALLBACK_PATH,
          handler: async (req, res) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const result = await this.completeAuthorization(url.searchParams);
            res.writeHead(result.ok ? 200 : 400, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            });
            res.end(
              resultPage(
                result.ok ? 'Authorization complete' : 'Authorization failed',
                result.detail,
              ),
            );
          },
        } satisfies ServerRoute),
      );
      this.syncAggregateRoute();
    });
  }

  /** 按当前配置重建聚合端点路由。 */
  syncAggregateRoute(): void {
    const webServer = this.ctx.get('webServer');
    if (webServer === undefined) return;
    const endpoint = this.getSettings().expose.endpoint;
    if (this.aggregateDispose !== undefined && this.aggregatePath === endpoint) return;
    this.aggregateDispose?.();
    this.aggregateDispose = webServer.register({
      kind: 'prefix',
      path: endpoint,
      handler: async (req, res) => {
        const settings = this.getSettings();
        if (!settings.expose.enabled) {
          res.writeHead(404, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(JSON.stringify({ error: 'The aggregate MCP endpoint is disabled.' }));
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const suffix = url.pathname.slice(settings.expose.endpoint.length).replace(/^\/+/, '');
        const groupName =
          suffix === ''
            ? Object.keys(settings.expose.groups)[0]
            : decodeURIComponent(suffix.split('/')[0] ?? '');
        if (groupName === undefined || settings.expose.groups[groupName] === undefined) {
          res.writeHead(404, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(
            JSON.stringify({
              error: `Unknown group '${groupName ?? ''}'. Known: ${Object.keys(settings.expose.groups).join(', ')}`,
            }),
          );
          return;
        }
        await this.handlerFor(groupName)(req, res);
      },
    } satisfies ServerRoute);
    this.aggregatePath = endpoint;
  }

  /** 取得一个组的处理器。 */
  private handlerFor(groupName: string): ReturnType<typeof createGroupHandler> {
    let handler = this.handlers.get(groupName);
    if (handler !== undefined) return handler;
    const options: AggregateOptions = {
      group: groupName,
      groupDefinition: () =>
        this.getSettings().expose.groups[groupName] ?? { include: [], exclude: [] },
      token: () => ensureEndpointToken(this.ctx, this.logger),
      tools: () => this.ctx.tools.schemas() as unknown as ReadonlyArray<ToolSchemaView>,
      call: (name, args, signal) =>
        this.manager.execute(name, args, signal ?? AbortSignal.timeout(AGGREGATE_CALL_TIMEOUT_MS)),
      logger: this.logger,
    };
    handler = createGroupHandler(options);
    this.handlers.set(groupName, handler);
    return handler;
  }

  /** 释放全部路由、监听与待处理授权。 */
  dispose(): void {
    for (const server of this.listeners) server.close();
    this.listeners.clear();
    this.pending.clear();
    this.aggregateDispose?.();
    this.aggregateDispose = undefined;
    this.aggregatePath = undefined;
    for (const dispose of this.disposers.splice(0)) void dispose();
  }

  // ---------------------------------------------------------------------------
  // 面板路由
  // ---------------------------------------------------------------------------

  /** 带令牌的快照。 */
  private async snapshotWithToken(): Promise<PanelSnapshotWithToken> {
    await this.waitIdle();
    return this.manager.snapshot(true, () => ensureEndpointToken(this.ctx, this.logger));
  }

  /** 写入一台服务器的懒加载开关。 */
  private async setLazy(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined || this.getSettings().servers[serverName] === undefined) {
      return jsonResponse({ error: `Unknown server '${String(body.server)}'` }, 400);
    }
    const lazy = body.lazy === true;
    await setLazy(serverName, lazy);
    if (lazy) {
      await this.manager.unmount(serverName);
    } else {
      try {
        await this.manager.mount(serverName);
      } catch (error) {
        return jsonResponse({ error: messageOf(error) }, 409);
      }
    }
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 重连一台服务器。 */
  private async restart(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined || this.getSettings().servers[serverName] === undefined) {
      return jsonResponse({ error: `Unknown server '${String(body.server)}'` }, 400);
    }
    try {
      await this.manager.restart(serverName);
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 409);
    }
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 新增或更新服务器定义。 */
  private async upsertServer(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined) return jsonResponse({ error: 'server is required' }, 400);
    if (!isRecord(body.definition))
      return jsonResponse({ error: 'definition must be an object' }, 400);
    let definition: ServerDefinition;
    try {
      definition = normalizeServerDefinition(serverName, body.definition);
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 400);
    }
    const existing = this.getSettings().servers[serverName];
    if (existing === undefined) {
      const taken = this.manager.listManagedNames().includes(serverName);
      if (taken)
        return jsonResponse(
          { error: `Server '${serverName}' is already managed by another plugin` },
          400,
        );
    }
    try {
      await this.editServers((servers) => ({ ...servers, [serverName]: definition }));
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 409);
    }
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 删除服务器定义，并清理授权、客户端密钥与懒加载状态。 */
  private async removeServer(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined || this.getSettings().servers[serverName] === undefined) {
      return jsonResponse({ error: `Unknown server '${String(body.server)}'` }, 400);
    }
    await this.manager.unmount(serverName);
    try {
      await this.editServers((servers) => {
        const next = { ...servers };
        delete next[serverName];
        return next;
      });
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 409);
    }
    await deleteGrant(this.ctx, serverName);
    await deleteClientSecret(this.ctx, serverName);
    await clearLazy(serverName);
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 配置固定 OAuth 客户端。 */
  private async configureClient(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined || this.getSettings().servers[serverName] === undefined) {
      return jsonResponse({ error: `Unknown server '${String(body.server)}'` }, 400);
    }
    const clientId = asString(body.clientId);
    const redirectUri = asString(body.redirectUri);
    if (redirectUri !== undefined) {
      try {
        const url = new URL(redirectUri);
        if (
          url.protocol !== 'http:' ||
          (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        ) {
          throw new Error('redirectUri must point at 127.0.0.1 or localhost');
        }
      } catch (error) {
        return jsonResponse({ error: messageOf(error) }, 400);
      }
    }
    try {
      await this.editServers((servers) => {
        const current = isRecord(servers[serverName]) ? { ...servers[serverName] } : {};
        const oauth = isRecord(current.oauth) ? { ...current.oauth } : {};
        if (clientId !== undefined) oauth.clientId = clientId;
        if (redirectUri !== undefined) oauth.redirectUri = redirectUri;
        return { ...servers, [serverName]: { ...current, oauth } };
      });
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 409);
    }
    const secret = asString(body.clientSecret);
    if (secret !== undefined) {
      if (secret === '') await deleteClientSecret(this.ctx, serverName);
      else await writeClientSecret(this.ctx, serverName, secret);
    }
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 发起 OAuth。 */
  private async startOAuth(request: Request): Promise<Response> {
    const url = new URL(request.url, `http://${request.headers.get('host') ?? '127.0.0.1'}`);
    const serverName = url.searchParams.get('server') ?? '';
    const definition = this.getSettings().servers[serverName];
    if (definition === undefined)
      return jsonResponse({ error: `Unknown server '${serverName}'` }, 400);
    const endpoint = asString(definition.url);
    if (endpoint === undefined) {
      return jsonResponse({ error: 'Only streamable-http servers can use OAuth.' }, 400);
    }
    try {
      const oauthDefinition: OAuthClientConfig = definition.oauth ?? { scopes: [] };
      const discovery = await discover(endpoint);
      await applyAuthorizationOverrides(discovery, oauthDefinition);
      const scopes = oauthDefinition.scopes.length > 0 ? oauthDefinition.scopes : discovery.scopes;
      const redirectUri = oauthDefinition.redirectUri ?? `${url.origin}${CALLBACK_PATH}`;
      let clientId = oauthDefinition.clientId;
      let clientSecret =
        oauthDefinition.clientSecret ?? (await readClientSecret(this.ctx, serverName));
      if (clientId === undefined) {
        const registered = await registerClient(discovery, {
          clientName: 'DeepSeek Harness (better-mcp)',
          redirectUri,
          scopes,
        });
        clientId = registered.clientId;
        clientSecret = registered.clientSecret;
      }
      const flow = authorizationUrl(discovery, {
        clientId,
        redirectUri,
        scopes,
        resource: discovery.resource,
      });
      const context: PendingContext = {
        serverName,
        verifier: flow.verifier,
        redirectUri,
        clientId,
        ...(clientSecret === undefined ? {} : { clientSecret }),
        resource: discovery.resource,
        authorization: discovery.authorization,
        createdAt: Date.now(),
      };
      this.pending.set(flow.state, context);
      if (oauthDefinition.redirectUri !== undefined) {
        try {
          context.listener = await this.startLoopbackListener(redirectUri);
        } catch (error) {
          this.pending.delete(flow.state);
          return jsonResponse(
            { error: `Could not bind the fixed redirect ${redirectUri}: ${messageOf(error)}` },
            502,
          );
        }
      }
      return jsonResponse({ url: flow.url, scopes, redirectUri });
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 502);
    }
  }

  /** 退出登录。 */
  private async signOut(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const serverName = asString(body.server);
    if (serverName === undefined) return jsonResponse({ error: 'server is required' }, 400);
    await deleteGrant(this.ctx, serverName);
    await this.manager.unmount(serverName);
    return jsonResponse(await this.snapshotWithToken());
  }

  /** 通过宿主 config editor 写回服务器字典。 */
  private async editServers(
    change: (servers: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    const editor = this.ctx.get('configEditor');
    const entry = this.ctx.fiber?.entry;
    if (editor === undefined || entry === undefined) {
      throw new Error('Configuration cannot be saved in this profile');
    }
    await editor.edit(entry, (current) => {
      const servers = isRecord(current.servers) ? current.servers : {};
      return { ...current, servers: change({ ...servers }) };
    });
  }

  // ---------------------------------------------------------------------------
  // OAuth 回调
  // ---------------------------------------------------------------------------

  /** 换取授权码、存授权并按懒加载重新挂载。 */
  private async completeAuthorization(
    params: URLSearchParams,
  ): Promise<{ ok: boolean; detail: string }> {
    if (params.get('error') !== null) {
      return {
        ok: false,
        detail: `${params.get('error')}: ${params.get('error_description') ?? ''}`,
      };
    }
    const state = params.get('state') ?? '';
    const code = params.get('code') ?? '';
    const context = this.pending.get(state);
    this.pending.delete(state);
    if (context === undefined || Date.now() - context.createdAt > PENDING_TTL_MS) {
      return {
        ok: false,
        detail: 'Unknown or expired state. Start the sign-in again from the MCP panel.',
      };
    }
    try {
      context.listener?.close();
      context.listener = undefined;
      if (code === '') return { ok: false, detail: 'The provider returned no authorization code.' };
      const grant = await exchangeCode(context, code);
      await writeGrant(this.ctx, context.serverName, {
        ...grant,
        clientId: context.clientId,
        ...(context.clientSecret === undefined ? {} : { clientSecret: context.clientSecret }),
        tokenEndpoint: asString(context.authorization.token_endpoint) ?? '',
        resource: context.resource,
        authorization: context.authorization,
        authorizedAt: Date.now(),
      });
      await this.manager.unmount(context.serverName);
      if (!(await this.manager.isLazy(context.serverName)))
        await this.manager.mount(context.serverName);
      return { ok: true, detail: `Signed in for '${context.serverName}'. You can close this tab.` };
    } catch (error) {
      return { ok: false, detail: messageOf(error) };
    }
  }

  /** 在固定回环端口监听一次回调。 */
  private async startLoopbackListener(redirectUri: string): Promise<Server> {
    const redirect = new URL(redirectUri);
    if (redirect.hostname !== '127.0.0.1' && redirect.hostname !== 'localhost') {
      throw new Error('A fixed OAuth redirect must point at 127.0.0.1 or localhost.');
    }
    const server = createServer(async (req, res) => {
      const incoming = new URL(req.url ?? '/', `${redirect.protocol}//${redirect.host}`);
      if (incoming.pathname !== redirect.pathname) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      const result = await this.completeAuthorization(incoming.searchParams);
      res.writeHead(result.ok ? 200 : 400, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(
        resultPage(result.ok ? 'Authorization complete' : 'Authorization failed', result.detail),
      );
      setTimeout(() => server.close(), 100);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(redirect.port || '80'), redirect.hostname, () => resolve());
    });
    this.listeners.add(server);
    const timer = setTimeout(() => {
      this.listeners.delete(server);
      server.close();
    }, PENDING_TTL_MS);
    timer.unref?.();
    server.once('close', () => {
      clearTimeout(timer);
      this.listeners.delete(server);
    });
    return server;
  }
}

/** 应用配置里的授权服务器与令牌端点覆盖。 */
async function applyAuthorizationOverrides(
  discovery: Awaited<ReturnType<typeof discover>>,
  oauth: OAuthClientConfig,
): Promise<void> {
  if (oauth.tokenEndpoint !== undefined) {
    discovery.authorization.token_endpoint = oauth.tokenEndpoint;
  }
  if (oauth.authorizationServer !== undefined) {
    const base = oauth.authorizationServer.replace(/\/+$/, '');
    const candidates = [
      `${base}/.well-known/oauth-authorization-server`,
      `${base}/.well-known/openid-configuration`,
    ];
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) continue;
        const value: unknown = await response.json();
        if (isRecord(value)) {
          discovery.authorization = value;
          discovery.authorizationServer = base;
          if (oauth.tokenEndpoint !== undefined) value.token_endpoint = oauth.tokenEndpoint;
          return;
        }
      } catch {
        // 尝试下一个候选地址。
      }
    }
  }
}

/** 读取错误消息。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 端点默认值的再导出，便于调用方引用。 */
export const DEFAULT_ENDPOINT = ENDPOINT_DEFAULT;

/** 日志前缀。 */
export const ROUTE_LABEL = PLUGIN_LABEL;
