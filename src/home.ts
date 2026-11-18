/** DSH 家目录解析：优先使用宿主提供的路径助手，失败时回退到环境变量与默认目录。 */
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DATA_DIR } from './constants.ts';

/** 宿主导出的 `dshHomePath`。 */
type HomePath = (...segments: string[]) => string;

/** 已解析的路径助手。 */
let resolved: HomePath | undefined;

/** 解析 `dshHomePath`，只在首次调用时尝试导入宿主包。 */
async function homePath(): Promise<HomePath> {
  if (resolved !== undefined) return resolved;
  try {
    const module = (await import('@deepseek-ai/dsh-home-paths')) as { dshHomePath: HomePath };
    resolved = module.dshHomePath;
  } catch {
    const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    resolved = (...segments: string[]) => join(home, ...segments);
  }
  return resolved;
}

/** 插件数据区内的绝对路径。 */
export async function pluginDataPath(...segments: string[]): Promise<string> {
  const resolve = await homePath();
  return resolve('plugin-data', DATA_DIR, ...segments);
}
