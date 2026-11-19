// 前端入口接线测试：服务声明、中英字典、槽位注册参数、表单辅助函数与静态渲染。

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PanelSnapshot } from '../src/client/api.ts';
import { apply, inject, PACKAGE_NAME, ROW_ID, ROW_KEY } from '../src/client/index.tsx';
import { en, NS, zh } from '../src/client/locales.ts';
import { McpPanel, ServerItem, startStatusPolling, statusParts } from '../src/client/panel.tsx';
import {
  definitionFromValues,
  emptyForm,
  fieldForError,
  parseArgs,
  parseHeaders,
  ServerForm,
  type ServerFormValues,
  validateValues,
} from '../src/client/server-form.tsx';
import { CLIENT_STYLES } from '../src/client/ui.tsx';
import { makeClientCtx, translate } from './helpers.ts';

/** 带合法名称与地址的表单值。 */
function values(overrides: Partial<ServerFormValues> = {}): ServerFormValues {
  return {
    ...emptyForm(),
    name: 'alpha',
    description: 'Alpha tools',
    url: 'https://example.com/mcp',
    ...overrides,
  };
}

/** 应用入口后取出配置页注册的组件。 */
function configComponent(): (props: { view: 'summary' | 'page'; t: unknown }) => unknown {
  const ctx = makeClientCtx();
  apply(ctx);
  const registration = ctx._slotRegistrations.find(
    (entry) => entry.options.name === 'plugins.row.config',
  );
  if (registration === undefined) throw new Error('缺少 plugins.row.config 槽位注册');
  return registration.component as (props: { view: 'summary' | 'page'; t: unknown }) => unknown;
}

/** 静态渲染配置页的指定视图。 */
function renderConfigPage(view: 'summary' | 'page', dict: Record<string, string>): string {
  return renderToStaticMarkup(
    createElement(configComponent() as never, { view, t: translate(dict) } as never),
  );
}

describe('前端入口', () => {
  it('声明客户端服务与插件行键', () => {
    expect(inject).toEqual(['slots', 'locale']);
    expect(PACKAGE_NAME).toBe('dsh-plugin-better-mcp');
    expect(ROW_ID).toBe('better-mcp');
    expect(ROW_KEY).toBe('dsh-plugin-better-mcp#better-mcp');
  });

  it('注册中英字典、侧栏动作与配置页', () => {
    const ctx = makeClientCtx();
    apply(ctx);

    expect(ctx._localeRegistrations).toHaveLength(1);
    const dictionary = ctx._localeRegistrations[0];
    expect(dictionary?.ns).toBe(NS);
    expect(Object.keys(dictionary?.dicts ?? {}).sort()).toEqual(['en', 'zh']);
    expect(dictionary?.dicts.zh).toBe(zh);
    expect(dictionary?.dicts.en).toBe(en);

    expect(ctx._slotInjections).toEqual(['sidebar.footer.action', 'plugins.row.config']);

    expect(ctx._slotRegistrations[0]?.options).toEqual({
      name: 'sidebar.footer.action',
      id: 'better-mcp',
      order: 52,
      locale: NS,
    });
    expect(ctx._slotRegistrations[1]?.options).toEqual({
      name: 'plugins.row.config',
      key: ROW_KEY,
      locale: NS,
    });

    const sidebar = ctx._slotRegistrations[0]?.component;
    const html = renderToStaticMarkup(
      createElement(sidebar as never, { t: translate(zh), wide: true } as never),
    );
    expect(html).toContain('title="MCP 服务器"');
    expect(html).toContain('aria-label="MCP 服务器"');
    expect(html).toContain('viewBox="0 0 16 16"');
    expect(html).not.toContain('<span>MCP 服务器</span>');
  });
});

describe('字典', () => {
  it('中英文键集一致且覆盖面板与表单文案', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(Object.keys(zh)).toEqual(
      expect.arrayContaining(['title', 'panelTitle', 'add', 'delete', 'save']),
    );
  });

  it('每个键都被前端源码引用', () => {
    const dir = path.join(import.meta.dirname, '..', 'src', 'client');
    const source = readdirSync(dir)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => readFileSync(path.join(dir, file), 'utf8'))
      .join('\n');
    for (const key of Object.keys(zh)) expect(source, key).toContain(`'${key}'`);
  });

  it('英文徽标与开关使用 sentence case', () => {
    for (const key of ['lazy', 'authorized', 'needsAuth'] as const) {
      expect(en[key].charAt(0)).toBe(en[key].charAt(0).toUpperCase());
    }
  });
});

describe('服务器表单辅助函数', () => {
  it('解析合法的请求头文本', () => {
    expect(parseHeaders('Authorization: Bearer token\nX-Test: 1\n')).toEqual({
      Authorization: 'Bearer token',
      'X-Test': '1',
    });
  });

  it('拒绝缺少冒号的行', () => {
    expect(parseHeaders('Authorization: Bearer token\nnot-a-header')).toBeUndefined();
  });

  it('解析参数文本并丢弃空行', () => {
    expect(parseArgs(' -y \n\n server \n')).toEqual(['-y', 'server']);
  });

  it('校验非法名称', () => {
    expect(validateValues(values({ name: 'bad name' }))).toBe('nameInvalid');
  });

  it('校验非法地址', () => {
    expect(validateValues(values({ url: 'not-a-url' }))).toBe('urlInvalid');
  });

  it('要求 stdio 命令', () => {
    expect(validateValues(values({ transport: 'stdio', command: '   ' }))).toBe('commandRequired');
    expect(validateValues(values({ description: '  ' }))).toBe('descriptionRequired');
  });

  it('拒绝非回环的 OAuth 回调地址', () => {
    expect(
      validateValues(values({ auth: 'oauth', redirectUri: 'https://example.com/callback' })),
    ).toBe('redirectInvalid');
  });

  it('接受合法的 http 配置', () => {
    expect(
      validateValues(values({ auth: 'oauth', redirectUri: 'http://127.0.0.1:19876/callback' })),
    ).toBeUndefined();
    expect(validateValues(values({ auth: 'none' }))).toBeUndefined();
  });

  it('http + OAuth 定义保留客户端标识与 scopes，不携带客户端密钥', () => {
    const definition = definitionFromValues(
      values({
        url: ' https://example.com/mcp ',
        auth: 'oauth',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        scopesText: 'read write',
      }),
    );
    expect(definition.url).toBe('https://example.com/mcp');
    expect(definition.auth).toBe('oauth');
    expect(definition).not.toHaveProperty('clientSecret');
    const oauth = definition.oauth as Record<string, unknown>;
    expect(oauth.clientId).toBe('client-1');
    expect(oauth.scopes).toEqual(['read', 'write']);
    expect(oauth).not.toHaveProperty('clientSecret');
  });

  it('stdio 定义固定 auth 为 none 并收集命令与参数', () => {
    const definition = definitionFromValues(
      values({
        transport: 'stdio',
        command: ' npx ',
        argsText: ' -y\n\n server \n',
        auth: 'oauth',
      }),
    );
    expect(definition.auth).toBe('none');
    expect(definition.command).toBe('npx');
    expect(definition.args).toEqual(['-y', 'server']);
    expect(definition.description).toBe('Alpha tools');
  });
});

describe('表单错误定位', () => {
  it('把校验错误映射到对应字段', () => {
    expect(fieldForError('nameInvalid')).toBe('name');
    expect(fieldForError('descriptionRequired')).toBe('description');
    expect(fieldForError('urlInvalid')).toBe('url');
    expect(fieldForError('headersInvalid')).toBe('headersText');
    expect(fieldForError('commandRequired')).toBe('command');
    expect(fieldForError('redirectInvalid')).toBe('redirectUri');
  });
});

describe('ServerForm', () => {
  it('静态渲染稳定字段关联与密钥自动完成语义', () => {
    const html = renderToStaticMarkup(
      createElement(
        ServerForm as never,
        {
          t: translate(zh),
          initial: emptyForm(),
          isEdit: false,
          busy: false,
          onSubmit: () => undefined,
        } as never,
      ),
    );
    expect(html).toContain('data-testid="better-mcp-form"');
    expect(html).toContain('for="better-mcp-name"');
    expect(html).toContain('id="better-mcp-name"');
    expect(html).toContain('aria-describedby="better-mcp-name-hint"');
    expect(html).toContain(zh.nameHint);
    expect(html).toContain('<fieldset');
    expect(html).toContain('required=""');
    expect(html).toContain('name="clientSecret"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('aria-busy="false"');
  });

  it('保存期间禁用全部字段', () => {
    const html = renderToStaticMarkup(
      createElement(
        ServerForm as never,
        {
          t: translate(zh),
          initial: emptyForm(),
          isEdit: false,
          busy: true,
          onSubmit: () => undefined,
        } as never,
      ),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('<fieldset');
    expect(html).toContain('disabled=""');
  });
});

describe('状态轮询', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('立即读取，慢请求结束后才安排下一秒刷新', async () => {
    vi.useFakeTimers();
    const first = Promise.withResolvers<void>();
    const refresh = vi.fn(() => first.promise);
    const stop = startStatusPolling(refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
  });

  it('读取失败后继续刷新，停止后清除计时器', async () => {
    vi.useFakeTimers();
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const stop = startStatusPolling(refresh);

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('停止后在途请求不再安排刷新', async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<void>();
    const refresh = vi.fn(() => pending.promise);
    const stop = startStatusPolling(refresh);

    stop();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('McpPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('静态渲染显示加载文案', () => {
    const snapshot: PanelSnapshot = {
      servers: [
        {
          name: 'alpha',
          transport: 'streamable-http',
          url: 'https://example.com/mcp',
          auth: 'oauth',
          lazy: true,
          authorized: false,
          mounted: false,
          state: 'connected',
          toolCount: 2,
        },
      ],
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const html = renderToStaticMarkup(
      createElement(McpPanel as never, { t: translate(en), variant: 'page' } as never),
    );
    expect(html).toContain('data-testid="better-mcp-panel"');
    expect(html).toContain('Loading…');
    expect(html).toContain('role="status"');
    expect(html).toContain(en.panelTitle);
    expect(html).toContain(en.add);
    expect(html).not.toContain('>Refresh<');
    // 静态渲染不执行 useEffect，因此不会发起状态请求。
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** 渲染一行服务器。 */
function renderRow(row: Record<string, unknown>, dict: Record<string, string> = zh): string {
  const noop = () => undefined;
  return renderToStaticMarkup(
    createElement(
      ServerItem as never,
      {
        t: translate(dict),
        row: {
          name: 'alpha',
          lazy: true,
          authorized: false,
          mounted: true,
          state: 'idle',
          ...row,
        },
        busy: undefined,
        onLazy: noop,
        onRestart: noop,
        onAuth: noop,
        onSignOut: noop,
        onEdit: noop,
        onDelete: noop,
      } as never,
    ),
  );
}

describe('服务器行', () => {
  it('状态按字典格式化', () => {
    expect(
      statusParts(translate(zh), {
        name: 'a',
        lazy: true,
        authorized: false,
        mounted: true,
        state: 'connected',
        toolCount: 3,
      }),
    ).toEqual(['已连接', '3 个工具']);
    expect(
      statusParts(translate(en), {
        name: 'a',
        lazy: true,
        authorized: false,
        mounted: true,
        state: 'reconnecting',
        attempt: 2,
        maxAttempts: 5,
        error: 'HTTP 502',
      }),
    ).toEqual(['Reconnecting', 'Reconnect 2 of 5']);
  });

  it('本插件服务器使用管理列表语义与带名称的懒加载开关', () => {
    const html = renderRow({ description: 'Alpha tools' });
    expect(html).toContain('<li');
    expect(html).toContain('Alpha tools');
    expect(html).toContain(zh.restart);
    expect(html).toContain(zh.edit);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="为 alpha 启用懒加载"');
    expect(html).toContain('aria-describedby="better-mcp-lazy-note"');
  });

  it('连接诊断使用可展开区域', () => {
    const html = renderRow({ error: 'HTTP 502' });
    expect(html).toContain('<details class="better-mcp-diagnostics"');
    expect(html).toContain(zh.errorDetails);
    expect(html).toContain('HTTP 502');
  });

  it('名称区域不显示行图标与来源标签', () => {
    const html = renderRow({});
    expect(html).not.toContain('better-mcp-server-icon');
    expect(html).not.toContain('本插件');
    expect(html).not.toContain('其他来源');
    expect(html).toContain(zh.edit);
    expect(html).toContain(zh.delete);
  });
});

describe('主题样式', () => {
  it('使用宿主主题变量描述表面、文本、状态与主按钮', () => {
    for (const token of [
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-label-primary',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-button-primary-fill',
    ]) {
      expect(CLIENT_STYLES).toContain(token);
    }
    expect(CLIENT_STYLES).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});

describe('配置页', () => {
  it('summary 视图渲染一行描述', () => {
    expect(renderConfigPage('summary', zh)).toContain(zh.summary);
    expect(renderConfigPage('summary', en)).toContain(en.summary);
  });

  it('page 视图渲染共享面板', () => {
    const html = renderConfigPage('page', zh);
    expect(html).toContain('better-mcp-panel');
    expect(html).toContain('data-testid="better-mcp-panel"');
    expect(html).toContain(zh.loading);
  });
});
