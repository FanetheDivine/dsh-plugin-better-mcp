// 发布内容回归：npm pack --dry-run 断言 tarball 只含发布所需文件。
// files 字段决定分发内容；src / tests / scripts / specs 不得进包。产物过期时测试失败。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertFreshDist } from './support/dist-freshness.ts';

/** 仓库根目录。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 打包结果缓存。 */
let cachedPaths: Set<string> | undefined;

/** 执行 npm pack --dry-run --json，返回文件路径集合。 */
function packedPaths(): Set<string> {
  if (cachedPaths !== undefined) return cachedPaths;
  assertFreshDist();
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(`npm pack --dry-run 失败：${String(result.stderr ?? result.stdout)}`);
  // npm 11 与更早版本输出数组；npm 12 起输出以包名为键的对象。
  const report = JSON.parse(String(result.stdout ?? '[]')) as
    | Array<{ files?: Array<{ path: string }> }>
    | Record<string, { files?: Array<{ path: string }> }>;
  const entries = Array.isArray(report) ? report : Object.values(report);
  cachedPaths = new Set(entries.flatMap((entry) => entry.files ?? []).map((file) => file.path));
  return cachedPaths;
}

describe('npm 包内容', () => {
  it('包含运行产物、补丁、图标、字典与 README', () => {
    const packed = packedPaths();
    for (const required of [
      'dist/index.mjs',
      'dist/index.d.ts',
      'dist/client.js',
      'cordis.patch.yml',
      'README.md',
      'icon.svg',
      'locale/en.json',
      'locale/zh.json',
    ]) {
      expect(packed.has(required), required).toBe(true);
    }
  });

  it('不包含开发目录', () => {
    const packed = packedPaths();
    for (const prefix of ['src/', 'tests/', 'scripts/', 'specs/', 'docs/', 'worktrees/']) {
      expect(
        [...packed].some((file) => file.startsWith(prefix)),
        prefix,
      ).toBe(false);
    }
  }, 30_000);

  it('补丁插入 better-mcp 行且服务器留空', () => {
    const patch = readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8');
    expect(patch).toContain('id: better-mcp');
    expect(patch).toContain('name: dsh-plugin-better-mcp');
    expect(patch).toContain('servers: {}');
  });
});

describe('前端产物', () => {
  it('以包名注册闭包工厂并保留导出', () => {
    packedPaths();
    const client = readFileSync(path.join(ROOT, 'dist', 'client.js'), 'utf8');
    expect(client).toContain('window.__ModuleLoader__.load(');
    expect(client).toContain('id: "dsh-plugin-better-mcp"');
    expect(client).toContain('exports.inject');
    expect(client).toContain('exports.apply');
  });
});
