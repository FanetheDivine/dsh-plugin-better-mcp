// 前端入口接线测试：服务声明、中英字典、槽位注册参数、表单辅助函数与静态渲染。
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
import { McpPanel } from '../src/client/panel.tsx';
import {
  definitionFromValues,
  emptyForm,
  parseArgs,
  parseHeaders,
  ServerForm,
  type ServerFormValues,
  validateValues,
} from '../src/client/server-form.tsx';
import { makeClientCtx, translate } from './helpers.ts';

/** 带合法名称与地址的表单值。 */
function values(overrides: Partial<ServerFormValues> = {}): ServerFormValues {
  return {
    ...emptyForm(),
    name: 'alpha',
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
  });
});

describe('字典', () => {
  it('中英文键集一致且覆盖面板与表单文案', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(Object.keys(zh)).toEqual(
      expect.arrayContaining(['title', 'add', 'delete', 'save', 'aggregate', 'token']),
    );
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
  });
});

describe('ServerForm', () => {
  it('静态渲染创建标题与名称字段', () => {
    const html = renderToStaticMarkup(
      createElement(
        ServerForm as never,
        {
          t: translate(zh),
          initial: emptyForm(),
          isEdit: false,
          busy: false,
          onSubmit: () => undefined,
          onCancel: () => undefined,
        } as never,
      ),
    );
    expect(html).toContain('data-testid="better-mcp-form"');
    expect(html).toContain(zh.createTitle);
    expect(html).toContain(zh.name);
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
          managed: true,
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
      expose: {
        enabled: true,
        endpoint: '/better-mcp/mcp',
        groups: [
          {
            name: 'harness',
            title: 'Harness',
            url: 'http://127.0.0.1:3080/better-mcp/mcp/harness',
            include: ['workspace_*'],
            exclude: [],
          },
        ],
        token: 'tok',
      },
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
    // 静态渲染不执行 useEffect，因此不会发起状态请求。
    expect(fetchMock).not.toHaveBeenCalled();
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
