// 会话可见性实机用例：目录提醒、默认隐藏、mcp_manage 切换、会话隔离与压缩补写。
// 用法：在 profile 目录运行 node visibility-cases.mjs；env：RDT_REPO、RDT_DSH_PKG。
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mcpToolNames, toolSummary } from './mock-provider.mjs';

const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RDT_REPO;
if (!REPO) throw new Error('RDT_REPO 必填：插件仓库绝对路径');
const SERVER = process.env.RDT_SERVER ?? 'deepwiki';
const PLUGIN = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const dshPkg =
  process.env.RDT_DSH_PKG ??
  join(execSync('npm root -g', { encoding: 'utf8' }).trim(), '@deepseek-ai', 'dsh', 'package.json');

const require = createRequire(dshPkg);
const { createLaunchEnvironmentSnapshot } = await import(
  pathToFileURL(require.resolve('@deepseek-ai/dsh-launch-environment'))
);
const { createUserMessage } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')));
const lib = join(dirname(dshPkg), 'lib');
let runProfile;
for (const file of readdirSync(lib)
  .filter((name) => /^profile-boot.*\.js$/.test(name))
  .sort((a, b) => a.length - b.length)) {
  const mod = await import(pathToFileURL(join(lib, file)));
  if (typeof mod.runProfile === 'function') {
    runProfile = mod.runProfile;
    break;
  }
}
assert(runProfile, 'runProfile not found');

process.env.DSH_PROFILE = process.env.RDT_PROFILE ?? basename(root);
process.env.DSH_PROFILE_DIR = root;
process.env.DSH_TELEMETRY_DISABLED = '1';
const runtime = await runProfile({
  profile: process.env.DSH_PROFILE,
  environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]),
  patchFiles: [],
  args: ['--no-open', '--port', '0'],
});
const app = runtime.ctx;
const adapter = app.get('rdtMock');
assert(adapter, '缺少 rdt-mock provider，先用 setup-env.sh 搭建 profile');

const results = [];
const handles = [];
/** 本次运行的会话后缀，避免与上一次运行的同名会话冲突。 */
const RUN = process.env.RDT_RUN_ID ?? Date.now().toString(36);

/** 记录一条用例结果。 */
async function check(label, fn) {
  try {
    const detail = await fn();
    results.push({ label, status: 'PASS', detail });
    console.log('PASS', label, JSON.stringify(detail ?? {}));
  } catch (error) {
    results.push({ label, status: 'FAIL', error: error?.stack ?? String(error) });
    console.error('FAIL', label, error);
  }
}

/** 用 mock 模型创建会话。 */
async function create(id) {
  const h = await app.agents.create({
    sessionId: `${id}-${RUN}`,
    meta: { cwd: REPO },
    agentOptions: { provider: 'mock', model: 'mock-model' },
  });
  handles.push(h);
  return h.agent;
}

/** 发送一条消息并等待本轮结束，返回本轮的新请求。 */
async function turn(agent, text, timeout = 60000) {
  const from = adapter.calls.length;
  agent.followup(
    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  );
  let timer;
  try {
    await Promise.race([
      agent.whenIdle(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TEST_TIMEOUT ${agent.session.id}`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return adapter.calls.slice(from);
}

const events = (agent) => agent.session.snapshotEvents();
const catalogs = (agent) =>
  events(agent)
    .filter((event) => event.type === 'user/message')
    .map((event) => event.data)
    .filter((data) => data.source?.kind === 'better-mcp-catalog');

const lastCatalog = (agent) => catalogs(agent).at(-1);
const textOf = (data) => data.content.map((block) => block.text ?? '').join('\n');
/** 最后一次请求的可见 MCP 工具。 */
const visible = (call) => mcpToolNames(call.tools);
/** 请求里的目录提醒正文。 */
const reminders = (call) =>
  (call.messages ?? [])
    .filter((m) => m.role === 'user')
    .flatMap((m) => (m.content ?? []).map((b) => b.text ?? ''))
    .filter((text) => text.includes('<system-reminder>'));

/** 全局已注册的本服务器工具名。 */
const globalTools = () =>
  app
    .get('tools')
    .schemas()
    .map((tool) => tool.name)
    .filter((name) => name.startsWith(`mcp__${SERVER}__`));

/** 等待服务器连接并注册工具，最长 90 秒。 */
async function waitServer() {
  for (let i = 0; i < 180; i += 1) {
    if (globalTools().length > 0) return globalTools();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务器 ${SERVER} 在 90 秒内没有注册工具`);
}

await check('V0 服务器已连接并注册工具', async () => {
  const names = await waitServer();
  return { tools: names };
});

await check('V1 目录提醒出现在第一个请求', async () => {
  const agent = await create('v1-catalog');
  const [call] = await turn(agent, 'MCP_TOOLS');
  const text = reminders(call).find((t) => t.includes('<mcp_servers>'));
  assert(text, '请求里没有 MCP 目录提醒');
  assert(text.includes(`\`${SERVER}\` (inactive)`), '目录未把服务器标为 inactive');
  assert(text.includes('查询公开 GitHub 仓库的 Wiki 结构与内容'), '目录缺少简介');
  assert(text.includes('mcp_manage'), '目录未说明 mcp_manage');
  assert(text.includes('mcp__<server>__<tool>'), '目录未说明工具前缀');
  return { entries: text.split('\n').filter((l) => l.startsWith('- `')).length };
});

await check('V2 懒加载服务器默认不可见', async () => {
  const agent = await create('v2-lazy');
  const [call] = await turn(agent, 'MCP_TOOLS');
  const names = visible(call);
  assert(globalTools().length > 0, '服务器工具没有注册，用例前提不成立');
  assert(names.length === 0, `意外可见：${names.join(', ')}`);
  assert(toolSummary(call.tools).includes('manage=true'), '模型看不到 mcp_manage');
  return { visible: names.length };
});

await check('V3 mcp_manage active 后工具进入工具集', async () => {
  const agent = await create('v3-active');
  await turn(agent, 'MCP_TOOLS');
  const calls = await turn(agent, `MCP_MANAGE:${SERVER}:active`);
  const after = calls.at(-1);
  const names = visible(after);
  assert(names.length > 0, '切换后仍然看不到工具');
  assert(
    names.every((name) => name.startsWith(`mcp__${SERVER}__`)),
    '工具前缀不对',
  );
  const transcript = JSON.stringify(after.messages);
  assert(transcript.includes('is now active'), '工具结果未说明已激活');
  assert(transcript.includes(`mcp__${SERVER}__<tool>`), '工具结果未说明工具前缀');
  return { tools: names };
});

await check('V4 隔离：另一个会话仍看不到', async () => {
  const other = await create('v4-other');
  const [call] = await turn(other, 'MCP_TOOLS');
  assert(visible(call).length === 0, '可见性泄漏到其他会话');
  return { visible: 0 };
});

await check('V5 可见性变化写一条更新提醒', async () => {
  const agent = await create('v5-reminder');
  await turn(agent, 'MCP_TOOLS');
  await turn(agent, `MCP_MANAGE:${SERVER}:active`);
  const text = textOf(lastCatalog(agent));
  assert(text.includes('MCP server visibility changed'), '更新提醒未说明可见性变化');
  assert(text.includes(`Now active: \`${SERVER}\``), '更新提醒未列出变为可见的服务器');
  assert(text.includes(`mcp__${SERVER}__`), '更新提醒未给出工具前缀');
  return { chars: text.length };
});

await check('V6 状态不变的步骤不写提醒', async () => {
  const agent = await create('v6-idle');
  await turn(agent, 'MCP_TOOLS');
  const before = catalogs(agent).length;
  await turn(agent, 'MCP_TOOLS');
  assert.equal(catalogs(agent).length, before, '状态未变却写了新提醒');
  return { catalogs: before };
});

await check('V7 压缩后补写完整目录', async () => {
  const compaction = app.get('compaction');
  assert(compaction, 'profile 未挂载 compaction 后端');
  const agent = await create('v7-compact');
  await turn(agent, 'MCP_TOOLS');
  const before = catalogs(agent).length;
  await agent.whenIdle();
  const result = await compaction.compactNow(agent, new AbortController().signal);
  assert(result, '压缩没有生效，会话历史太短');
  const surface = new Set(agent.session.surface.nodes);
  const stillVisible = events(agent).some(
    (event) =>
      event.type === 'user/message' &&
      event.data.source?.kind === 'better-mcp-catalog' &&
      surface.has(event.seq),
  );
  await turn(agent, 'MCP_TOOLS');
  const after = catalogs(agent).length;
  assert(after > before, '压缩后没有补写目录提醒');
  const text = textOf(lastCatalog(agent));
  assert(text.includes('<mcp_servers>'), '补写的不是完整目录');
  return { before, after, stillVisible };
});

await check('V8 inactive 后工具移除并写提醒', async () => {
  const agent = await create('v8-inactive');
  await turn(agent, 'MCP_TOOLS');
  await turn(agent, `MCP_MANAGE:${SERVER}:active`);
  const calls = await turn(agent, `MCP_MANAGE:${SERVER}:inactive`);
  const after = calls.at(-1);
  assert(visible(after).length === 0, '停用后工具仍然可见');
  const text = textOf(lastCatalog(agent));
  assert(text.includes(`Now inactive: \`${SERVER}\``), '提醒未说明已停用');
  assert(text.includes(`Do not call mcp__${SERVER}__`), '提醒未禁止调用前缀工具');
  return { catalogs: catalogs(agent).length };
});

await check('V9 无 Agent 时 mcp_manage 报错', async () => {
  const tool = app.get('tools').get('mcp_manage');
  assert(tool, '缺少 mcp_manage');
  await assert.rejects(
    () =>
      tool.execute({ server: SERVER, command: 'active' }, { signal: new AbortController().signal }),
    /agent session/,
  );
  return { ok: true };
});

for (const handle of handles) await handle.dispose?.();
console.log(JSON.stringify({ results }, null, 2));
process.exit(results.every((result) => result.status === 'PASS') ? 0 : 1);
