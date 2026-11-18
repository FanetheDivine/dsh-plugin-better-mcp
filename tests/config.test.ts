// 配置：默认值、严格校验、服务器定义规则与热重载读取。
import { describe, expect, it } from 'vitest';

import { Config, normalizeServerDefinition, readConfig, resolveConfig } from '../src/config.ts';
import { volatile } from './helpers.ts';

describe('resolveConfig', () => {
  it('缺省为空服务器、启用聚合端点与默认组', () => {
    const config = resolveConfig();
    expect(config.servers).toEqual({});
    expect(config.expose.enabled).toBe(true);
    expect(config.expose.endpoint).toBe('/better-mcp/mcp');
    expect(config.expose.groups.harness?.include).toEqual(['workspace_*', 'session_*']);
  });

  it('undefined 与 null 都按缺省处理', () => {
    expect(resolveConfig(undefined).servers).toEqual({});
    expect(resolveConfig(null).expose.enabled).toBe(true);
  });

  it('拒绝未知顶层键', () => {
    expect(() => resolveConfig({ bogus: 1 })).toThrow('unknown config key "bogus"');
    expect(() => resolveConfig([])).toThrow('config must be an object');
  });

  it('拒绝非法服务器名', () => {
    expect(() =>
      resolveConfig({ servers: { 'bad name': { transport: 'stdio', command: 'x' } } }),
    ).toThrow('server name');
  });

  it('结果冻结', () => {
    const config = resolveConfig({ servers: { one: { transport: 'stdio', command: 'node' } } });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.servers)).toBe(true);
    expect(Object.isFrozen(config.expose.groups)).toBe(true);
  });
});

describe('服务器定义校验', () => {
  it('stdio 需要命令，禁止 url 与请求头', () => {
    expect(() => normalizeServerDefinition('one', { transport: 'stdio' })).toThrow(
      'command is required',
    );
    expect(() =>
      normalizeServerDefinition('one', { transport: 'stdio', command: 'node', url: 'https://x' }),
    ).toThrow('not a stdio field');
    expect(() =>
      normalizeServerDefinition('one', {
        transport: 'stdio',
        command: 'node',
        headers: { Authorization: 'x' },
      }),
    ).toThrow('not a stdio field');
  });

  it('http 需要 url，禁止命令、参数、环境与工作目录', () => {
    expect(() => normalizeServerDefinition('one', { transport: 'streamable-http' })).toThrow(
      'url is required',
    );
    for (const extra of [
      { command: 'node' },
      { args: ['x'] },
      { env: { A: '1' } },
      { cwd: '/tmp' },
    ]) {
      expect(() =>
        normalizeServerDefinition('one', {
          transport: 'streamable-http',
          url: 'https://x',
          ...extra,
        }),
      ).toThrow('not a streamable-http field');
    }
  });

  it('默认 auth=oauth、lazy=true，stdio 缺省 auth 归一为 none', () => {
    const http = normalizeServerDefinition('one', {
      transport: 'streamable-http',
      url: 'https://x',
    });
    expect(http.auth).toBe('oauth');
    expect(http.lazy).toBe(true);
    expect(http.oauth).toEqual({ scopes: [] });
    const stdio = normalizeServerDefinition('one', { transport: 'stdio', command: 'node' });
    expect(stdio.auth).toBe('none');
  });

  it('stdio 不接受 oauth', () => {
    expect(() =>
      normalizeServerDefinition('one', { transport: 'stdio', command: 'node', auth: 'oauth' }),
    ).toThrow('requires streamable-http');
  });

  it('回调地址必须是回环 http', () => {
    expect(() =>
      normalizeServerDefinition('one', {
        transport: 'streamable-http',
        url: 'https://x',
        oauth: { redirectUri: 'https://example.com/cb' },
      }),
    ).toThrow('127.0.0.1 or localhost');
    expect(
      normalizeServerDefinition('one', {
        transport: 'streamable-http',
        url: 'https://x',
        oauth: { redirectUri: 'http://127.0.0.1:19876/callback' },
      }).oauth?.redirectUri,
    ).toBe('http://127.0.0.1:19876/callback');
  });

  it('未知字段透传，供管理器使用', () => {
    const definition = normalizeServerDefinition('one', {
      transport: 'stdio',
      command: 'node',
      reconnect: { attempts: 3 },
      customField: 'kept',
    });
    expect(definition.reconnect).toEqual({ attempts: 3 });
    expect(definition.customField).toBe('kept');
  });
});

describe('聚合端点校验', () => {
  it('端点必须是以 / 开头的路径', () => {
    expect(() => resolveConfig({ expose: { endpoint: 'mcp' } })).toThrow('path starting with /');
  });

  it('去掉末尾斜杠', () => {
    expect(resolveConfig({ expose: { endpoint: '/custom/mcp/' } }).expose.endpoint).toBe(
      '/custom/mcp',
    );
  });

  it('组为空时补默认组', () => {
    expect(resolveConfig({ expose: { groups: {} } }).expose.groups.harness).toBeDefined();
  });

  it('组名不能为空', () => {
    expect(() => resolveConfig({ expose: { groups: { '': {} } } })).toThrow(
      'keys must not be empty',
    );
  });
});

describe('readConfig', () => {
  it('展开 volatile 引用', () => {
    const config = {
      servers: volatile({ one: { transport: 'stdio', command: 'node' } }),
      expose: volatile(undefined),
    };
    expect(readConfig(config).servers.one?.command).toBe('node');
  });

  it('引用变化后读到新值', () => {
    const servers = volatile({});
    const config = { servers, expose: volatile(undefined) };
    servers.set({ two: { transport: 'stdio', command: 'npx' } } as never);
    expect(readConfig(config).servers.two?.command).toBe('npx');
  });
});

describe('Config schema', () => {
  it('接受空对象并返回热重载引用', () => {
    const parsed = Config({});
    expect(typeof parsed.servers.get).toBe('function');
    expect(parsed.servers.get()).toEqual({});
  });

  it('拒绝非法传输方式', () => {
    expect(() => Config({ servers: { one: { transport: 'sse', url: 'https://x' } } })).toThrow();
  });
});
