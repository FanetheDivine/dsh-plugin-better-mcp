// 浏览器产物契约测试：dist/client.js 按包名注册闭包工厂并保留槽位注册。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertFreshDist } from './support/dist-freshness.ts';

/** 仓库根目录（tests/ 的上一级）。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 浏览器产物路径。 */
const CLIENT_FILE = path.join(ROOT, 'dist', 'client.js');

/** 浏览器产物注册 id，与 package.json 的 name 一致。 */
const CLIENT_ID = 'dsh-plugin-better-mcp';

/** 读取产物；产物缺失或过期时由检查给出构建提示。 */
function readBundle(): string {
  assertFreshDist();
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
