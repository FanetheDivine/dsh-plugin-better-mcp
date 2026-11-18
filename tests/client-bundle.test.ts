// 浏览器产物契约测试：dist/client.js 按包名注册闭包工厂并保留槽位注册。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** 仓库根目录（tests/ 的上一级）。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 浏览器产物路径。 */
const CLIENT_FILE = path.join(ROOT, 'dist', 'client.js');

/** 浏览器产物注册 id，与 package.json 的 name 一致。 */
const CLIENT_ID = 'dsh-plugin-better-mcp';

/** 产物缺失时先构建，保证测试独立可跑。 */
function readBundle(): string {
  if (!existsSync(CLIENT_FILE)) {
    const build = spawnSync('pnpm', ['build'], {
      cwd: ROOT,
      encoding: 'utf8',
      // Windows 下 pnpm 是 pnpm.cmd，需经 shell 启动
      shell: process.platform === 'win32',
    });
    if (build.status !== 0) {
      throw new Error(`pnpm build 失败：${String(build.stderr ?? build.stdout ?? '未知错误')}`);
    }
  }
  return readFileSync(CLIENT_FILE, 'utf8');
}

describe('前端产物（dist/client.js）', () => {
  it('按包名注册闭包工厂并包含槽位注册', () => {
    const code = readBundle();

    expect(code.startsWith('window.__ModuleLoader__.load({')).toBe(true);
    expect(code).toContain(`id: "${CLIENT_ID}"`);
    expect(code).toContain('factory: (require) =>');
    expect(code).toContain('"better-mcp"');
    expect(code).toContain('"sidebar.footer.action"');
    expect(code).not.toContain('dsh-plugin-template');

    // 构建器会重新缩进 banner/footer；折叠空白后校验工厂以固定语句收尾。
    const tail = code.slice(code.lastIndexOf('return module.exports;')).replace(/\s+/g, ' ').trim();
    expect(tail).toBe('return module.exports; } });');
  });
});
