/**
 * 懒加载状态的持久化。
 *
 * 服务器定义来自插件行配置；用户在面板切换的懒加载值写在这里，避免每次切换都改写
 * profile。文件位于 `<dsh home>/plugin-data/better-mcp/state.json`。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { STATE_FILE } from './constants.ts';
import { pluginDataPath } from './home.ts';
import { isRecord } from './utils.ts';

/** 状态文档。 */
export interface LazyState {
  /** 服务器名到懒加载值的映射。 */
  lazy: Record<string, boolean>;
}

/** 状态文件的绝对路径。 */
async function statePath(): Promise<string> {
  return pluginDataPath(STATE_FILE);
}

/** 读取状态；文件缺失或损坏时按空状态处理。 */
export async function readState(): Promise<LazyState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(await statePath(), 'utf8'));
    const lazy: Record<string, boolean> = {};
    if (isRecord(parsed) && isRecord(parsed.lazy)) {
      for (const [name, value] of Object.entries(parsed.lazy)) {
        if (typeof value === 'boolean') lazy[name] = value;
      }
    }
    return { lazy };
  } catch {
    return { lazy: {} };
  }
}

/** 写入一台服务器的懒加载值。 */
export async function setLazy(name: string, lazy: boolean): Promise<void> {
  const state = await readState();
  state.lazy[name] = lazy;
  const path = await statePath();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

/** 移除一台服务器的懒加载值。 */
export async function clearLazy(name: string): Promise<void> {
  const state = await readState();
  if (!(name in state.lazy)) return;
  delete state.lazy[name];
  const path = await statePath();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}
