// 懒加载状态的读写与容错。
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearLazy, readState, setLazy } from '../src/state.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'better-mcp-state-'));
  process.env.DSH_HOME = home;
});

afterEach(async () => {
  delete process.env.DSH_HOME;
  await rm(home, { recursive: true, force: true });
});

describe('state', () => {
  it('没有文件时为空状态', async () => {
    expect(await readState()).toEqual({ lazy: {} });
  });

  it('损坏文件按空状态处理', async () => {
    const path = join(home, 'plugin-data', 'better-mcp', 'state.json');
    await mkdir(join(home, 'plugin-data', 'better-mcp'), { recursive: true });
    await writeFile(path, '{ not json', 'utf8');
    expect(await readState()).toEqual({ lazy: {} });
  });

  it('写入后读回', async () => {
    await setLazy('figma', true);
    await setLazy('chrome', false);
    expect(await readState()).toEqual({ lazy: { figma: true, chrome: false } });
  });

  it('文件是合法 JSON 且有缩进', async () => {
    await setLazy('one', true);
    const text = await readFile(join(home, 'plugin-data', 'better-mcp', 'state.json'), 'utf8');
    expect(JSON.parse(text)).toEqual({ lazy: { one: true } });
    expect(text).toContain('\n');
  });

  it('清除一项', async () => {
    await setLazy('one', true);
    await setLazy('two', false);
    await clearLazy('one');
    expect(await readState()).toEqual({ lazy: { two: false } });
  });

  it('清除不存在的项不写文件', async () => {
    await clearLazy('missing');
    expect(await readState()).toEqual({ lazy: {} });
  });
});
