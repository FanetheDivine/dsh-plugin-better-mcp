// 凭据：授权、客户端密钥与聚合令牌。
import { describe, expect, it } from 'vitest';

import {
  deleteClientSecret,
  deleteGrant,
  ensureEndpointToken,
  readClientSecret,
  readGrant,
  recordKey,
  rotateEndpointToken,
  writeClientSecret,
  writeGrant,
} from '../src/credentials.ts';
import { grantId } from '../src/utils.ts';
import { makeCtx } from './helpers.ts';

describe('凭据记录键', () => {
  it('作用域与 id 以斜杠分隔', () => {
    expect(recordKey('abc')).toBe('better-mcp/abc');
  });

  it('grantId 合法、稳定且带摘要', () => {
    const id = grantId('My Server');
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id.length).toBeLessThanOrEqual(41);
    expect(grantId('My Server')).toBe(id);
    expect(grantId('other')).not.toBe(id);
    expect(grantId('a.b c')).toMatch(/^a-b-c-/);
  });
});

describe('授权记录', () => {
  it('写入后读回', async () => {
    const ctx = makeCtx();
    await writeGrant(ctx, 'figma', { accessToken: 'a', refreshToken: 'r', expiresAt: 1 });
    expect(await readGrant(ctx, 'figma')).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
  });

  it('没有 accessToken 的 payload 视为未授权', async () => {
    const ctx = makeCtx();
    await ctx.credentials.modifyRecord(recordKey(grantId('figma')), async () => ({
      kind: 'grant',
      payload: {},
    }));
    expect(await readGrant(ctx, 'figma')).toBeUndefined();
  });

  it('删除', async () => {
    const ctx = makeCtx();
    await writeGrant(ctx, 'figma', { accessToken: 'a' });
    await deleteGrant(ctx, 'figma');
    expect(await readGrant(ctx, 'figma')).toBeUndefined();
  });
});

describe('客户端密钥', () => {
  it('写入、读取、删除', async () => {
    const ctx = makeCtx();
    await writeClientSecret(ctx, 'figma', 'secret');
    expect(await readClientSecret(ctx, 'figma')).toBe('secret');
    await deleteClientSecret(ctx, 'figma');
    expect(await readClientSecret(ctx, 'figma')).toBeUndefined();
  });
});

describe('聚合端点令牌', () => {
  it('首次读取时创建并复用', async () => {
    const ctx = makeCtx();
    const first = await ensureEndpointToken(ctx);
    expect(first).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(await ensureEndpointToken(ctx)).toBe(first);
  });

  it('轮换后换新令牌', async () => {
    const ctx = makeCtx();
    const first = await ensureEndpointToken(ctx);
    const second = await rotateEndpointToken(ctx);
    expect(second).not.toBe(first);
    expect(await ensureEndpointToken(ctx)).toBe(second);
  });
});
