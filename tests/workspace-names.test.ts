// 工作区命名：路径键、稳定内部名、section 与公开工具名。
import { describe, expect, it } from 'vitest';

import {
  internalToolPrefix,
  isInternalToolName,
  isWorkspaceInternalName,
  normalizeWorkspaceKey,
  workspaceInternalName,
  workspacePublicToolName,
  workspaceSectionName,
} from '../src/workspace-names.ts';

describe('normalizeWorkspaceKey', () => {
  it('统一 Windows 斜杠、盘符与尾部分隔符', () => {
    expect(normalizeWorkspaceKey('d:\\Git\\My Project\\')).toBe('D:/Git/My Project');
    expect(normalizeWorkspaceKey('D:/Git/My Project///')).toBe('D:/Git/My Project');
    expect(normalizeWorkspaceKey('D:\\')).toBe('D:/');
  });

  it('保留 POSIX 根目录与 Unicode 路径', () => {
    expect(normalizeWorkspaceKey('/')).toBe('/');
    expect(normalizeWorkspaceKey('/tmp/项目 α///')).toBe('/tmp/项目 α');
    expect(normalizeWorkspaceKey('/tmp/a\\b')).toBe('/tmp/a/b');
  });

  it('规范化 UNC 路径且结果幂等', () => {
    const key = normalizeWorkspaceKey('\\\\server\\share\\folder\\');
    expect(key).toBe('//server/share/folder');
    expect(normalizeWorkspaceKey(key)).toBe(key);
  });
});

describe('workspaceInternalName', () => {
  it('使用可读配置前缀与固定 SHA-256 摘要', () => {
    const name = workspaceInternalName('serena', 'D:/Git/My Project');
    expect(name).toBe('bm_serena_d6c3cade5b22a7da');
    expect(workspaceInternalName('serena', 'd:\\Git\\My Project\\')).toBe(name);
  });

  it('长配置名仍满足宿主服务器名限制', () => {
    const name = workspaceInternalName('serena_with_a_very_long_server_name', '/tmp/project');
    expect(name).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(name).toHaveLength(32);
    expect(name.startsWith('bm_serena_with_')).toBe(true);
  });

  it('区分工作区与可读前缀相同的配置', () => {
    const first = workspaceInternalName('serena_primary', '/tmp/one');
    const second = workspaceInternalName('serena_primary', '/tmp/two');
    const otherServer = workspaceInternalName('serena_primary_extra', '/tmp/one');
    expect(second).not.toBe(first);
    expect(otherServer).not.toBe(first);
  });

  it('识别本插件内部名的完整结构', () => {
    const name = workspaceInternalName('serena', '/tmp/project');
    expect(isWorkspaceInternalName(name)).toBe(true);
    expect(isWorkspaceInternalName(`x${name}`)).toBe(false);
    expect(isWorkspaceInternalName('serena')).toBe(false);
    expect(isWorkspaceInternalName('bm_serena_short')).toBe(false);
  });
});

describe('工作区工具名', () => {
  const internal = 'bm_serena_d6c3cade5b22a7da';
  const similar = `${internal}_other`;

  it('生成 section 名与精确内部工具前缀', () => {
    expect(workspaceSectionName(internal)).toBe(`mcp:${internal}`);
    expect(internalToolPrefix(internal)).toBe(`mcp__${internal}__`);
  });

  it('替换普通内部工具前缀并保留宿主规范化后缀', () => {
    const target = `mcp__${internal}__read_file_0123456789ab`;
    expect(workspacePublicToolName('serena', internal, target)).toBe(
      'mcp__serena__read_file_0123456789ab',
    );
  });

  it('长公开配置名替换后仍符合 64 字符工具名预算', () => {
    const server = 's'.repeat(32);
    const longInternal = workspaceInternalName(server, '/tmp/project');
    const suffix = 'x'.repeat(25);
    const target = `mcp__${longInternal}__${suffix}`;
    const publicName = workspacePublicToolName(server, longInternal, target);
    expect(publicName).toBe(`mcp__${server}__${suffix}`);
    expect(publicName).toHaveLength(64);
  });

  it('相似内部名、共享工具和空后缀不属于目标实例', () => {
    expect(isInternalToolName(`mcp__${internal}__list`, internal)).toBe(true);
    expect(isInternalToolName(`mcp__${similar}__list`, internal)).toBe(false);
    expect(isInternalToolName('mcp__serena__list', internal)).toBe(false);
    expect(isInternalToolName(`mcp__${internal}__`, internal)).toBe(false);
    expect(workspacePublicToolName('serena', internal, `mcp__${similar}__list`)).toBeUndefined();
    expect(workspacePublicToolName('serena', internal, 'mcp__serena__list')).toBeUndefined();
    expect(workspacePublicToolName('serena', internal, `mcp__${internal}__`)).toBeUndefined();
  });
});
