/**
 * 凭据读写的封装。
 *
 * 两类秘密都存进 DSH 凭据库：OAuth 授权与固定客户端密钥。
 * 配置文件只保留非密钥字段。
 */
import { CREDENTIAL_SCOPE } from './constants.ts';
import type { Context, CredentialKey, CredentialRecord } from './types.ts';
import { asString, grantId, isRecord } from './utils.ts';

/** 一次 OAuth 授权的持久化内容。 */
export interface OAuthGrant {
  /** 访问令牌。 */
  accessToken: string;
  /** 刷新令牌。 */
  refreshToken?: string;
  /** 过期时间戳（毫秒）。 */
  expiresAt?: number;
  /** 令牌类型。 */
  tokenType?: string;
  /** 客户端标识。 */
  clientId?: string;
  /** 授权时使用的客户端密钥。 */
  clientSecret?: string;
  /** 刷新端点。 */
  tokenEndpoint?: string;
  /** 资源标识。 */
  resource?: string;
  /** 授权服务器元数据。 */
  authorization?: Record<string, unknown>;
  /** 授权完成时间。 */
  authorizedAt?: number;
}

/** 构造一个凭据记录键。 */
export function recordKey(id: string): CredentialKey {
  return `${CREDENTIAL_SCOPE}/${id}` as unknown as CredentialKey;
}

/** 读取一台服务器的授权记录。 */
export async function readGrant(ctx: Context, serverName: string): Promise<OAuthGrant | undefined> {
  try {
    const record = await ctx.credentials.readRecord(recordKey(grantId(serverName)));
    if (record === undefined || record.kind !== 'grant' || !isRecord(record.payload))
      return undefined;
    if (asString(record.payload.accessToken) === undefined) return undefined;
    return record.payload as unknown as OAuthGrant;
  } catch {
    return undefined;
  }
}

/** 写入一台服务器的授权记录。 */
export async function writeGrant(
  ctx: Context,
  serverName: string,
  grant: OAuthGrant,
): Promise<void> {
  await ctx.credentials.modifyRecord(
    recordKey(grantId(serverName)),
    async () => ({ kind: 'grant', payload: grant }) satisfies CredentialRecord,
  );
}

/** 删除一台服务器的授权记录。 */
export async function deleteGrant(ctx: Context, serverName: string): Promise<void> {
  await ctx.credentials.deleteRecord(recordKey(grantId(serverName)));
}

/** 客户端密钥的记录键。 */
function clientSecretKey(serverName: string): CredentialKey {
  return recordKey(`${grantId(serverName)}-client`);
}

/** 读取固定客户端的密钥。 */
export async function readClientSecret(
  ctx: Context,
  serverName: string,
): Promise<string | undefined> {
  try {
    const record = await ctx.credentials.readRecord(clientSecretKey(serverName));
    if (record === undefined || record.kind !== 'api-key') return undefined;
    return asString(record.key);
  } catch {
    return undefined;
  }
}

/** 写入固定客户端的密钥。 */
export async function writeClientSecret(
  ctx: Context,
  serverName: string,
  secret: string,
): Promise<void> {
  await ctx.credentials.modifyRecord(
    clientSecretKey(serverName),
    async () => ({ kind: 'api-key', key: secret }) satisfies CredentialRecord,
  );
}

/** 删除固定客户端的密钥。 */
export async function deleteClientSecret(ctx: Context, serverName: string): Promise<void> {
  await ctx.credentials.deleteRecord(clientSecretKey(serverName));
}
