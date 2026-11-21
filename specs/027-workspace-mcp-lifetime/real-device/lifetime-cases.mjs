// 027 实机用例：Turn 结束与 inactive 释放工作区实例。用法：在 profile 目录运行；env：RDT_REPO。
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RDT_REPO;
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
  .filter((n) => /^profile-boot.*\.js$/.test(n))
  .sort((a, b) => a.length - b.length)) {
  const mod = await import(pathToFileURL(join(lib, file)));
  if (typeof mod.runProfile === 'function') {
    runProfile = mod.runProfile;
    break;
  }
}
process.env.DSH_PROFILE = basename(root);
process.env.DSH_PROFILE_DIR = root;
process.env.DSH_TELEMETRY_DISABLED = '1';
const runtime = await runProfile({
  profile: basename(root),
  environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]),
  patchFiles: [],
  args: ['--no-open', '--port', '0'],
});
const app = runtime.ctx;
const entry = [...app.loader.entries()].find((c) => c.options.name === PLUGIN);
const adapter = app.get('rdtMock');
const results = [];
const handles = [];
const RUN = Date.now().toString(36);
const fixtureLog = join(root, 'fixture-processes.jsonl');
writeFileSync(fixtureLog, '');
const wsRoot = join(root, 'workspaces');
rmSync(wsRoot, { recursive: true, force: true });
const A = join(wsRoot, 'alpha');
const DEL = join(wsRoot, 'delete-me');
const C = join(wsRoot, 'gamma');
for (const d of [A, DEL, C]) mkdirSync(d, { recursive: true });
writeFileSync(join(DEL, 'marker.txt'), 'x');

const check = async (label, fn) => {
  try {
    const detail = await fn();
    results.push({ label, status: 'PASS', detail });
    console.log('PASS', label, JSON.stringify(detail ?? {}));
  } catch (error) {
    results.push({ label, status: 'FAIL', error: error?.stack ?? String(error) });
    console.error('FAIL', label, error);
  }
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, label, timeout = 20000) => {
  const s = Date.now();
  while (Date.now() - s < timeout) {
    const v = await fn();
    if (v) return v;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
};
const create = async (id, cwd) => {
  const h = await app.agents.create({
    sessionId: `${id}-${RUN}`,
    meta: { cwd },
    agentOptions: { provider: 'mock', model: 'mock-model' },
  });
  handles.push(h);
  return h.agent;
};
const turn = async (agent, text) => {
  const from = adapter.calls.length;
  agent.followup(
    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  );
  await agent.whenIdle();
  return adapter.calls.slice(from);
};
const manage = (agent, command) =>
  app
    .get('tools')
    .get('mcp_manage')
    .execute({ server: 'fixture', command }, { agent, signal: new AbortController().signal });
const internalNames = () =>
  app
    .get('mcpManager')
    .list()
    .map((v) => v.name)
    .filter((n) => n.startsWith('bm_'));
const fixtureEvents = () =>
  readFileSync(fixtureLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// Windows 上 SDK 以 TerminateProcess 结束子进程，fixture 来不及写 exit，存活以系统进程表为准。
const alive = () =>
  [
    ...new Set(
      fixtureEvents()
        .filter((e) => e.event === 'start')
        .map((e) => e.pid),
    ),
  ].filter(pidAlive);
const toolResults = (agent) =>
  agent.session.snapshotEvents().filter((e) => e.type === 'tool/result');
const lastManageText = (agent) =>
  JSON.stringify(toolResults(agent).at(-1)?.data?.message?.content ?? '');
const noticeKinds = (agent) =>
  agent.session
    .snapshotEvents()
    .filter((e) => e.type === 'user/message')
    .flatMap((e) => e.data?.source?.notices ?? [])
    .map((n) => `${n.kind}:${n.state}`);

await check('L0 配置工作区 fixture', async () => {
  await app.get('configEditor').edit(entry, (c) => ({
    ...c,
    servers: {
      fixture: {
        description: 'Workspace lifetime fixture',
        transport: 'stdio',
        command: process.execPath,
        args: [join(root, 'workspace-fixture.mjs')],
        env: { RDT_FIXTURE_LOG: fixtureLog },
        workspace: true,
        auth: 'none',
      },
    },
  }));
  await app.loader.await();
  assert.equal(internalNames().length, 0);
  return { configured: true };
});

await check('L5 active 后同一 Turn 内还有后续步骤，Turn 结束仍关闭实例', async () => {
  const agent = await create('l5', C);
  await manage(agent, 'active');
  const calls = await turn(agent, 'MCP_CALL:mcp__fixture__identity|{}');
  assert(calls.length >= 2, `multi-step turn: ${calls.length}`);
  const results = toolResults(agent);
  assert(
    JSON.stringify(results.at(-1)?.data?.message?.content ?? '').includes('pid'),
    'identity tool ran',
  );
  await waitFor(() => internalNames().length === 0, 'instance unregistered after multi-step turn');
  await waitFor(() => alive().length === 0, 'fixture processes exited');
  return { steps: calls.length };
});

let pid1;
await check('L1 单 Agent 在 Turn 内 active，Turn 结束后进程退出', async () => {
  const agent = await create('l1', A);
  await turn(agent, 'MCP_MANAGE:fixture:active');
  // whenIdle 在 turn/end 后返回；释放异步完成。
  // SDK 先起一个版本协商用的 sibling，再起会话进程。
  const started = fixtureEvents()
    .filter((e) => e.event === 'start')
    .map((e) => e.pid);
  assert(started.length >= 1, 'fixture spawned');
  pid1 = started.at(-1);
  await waitFor(() => internalNames().length === 0, 'instance unregistered after turn end');
  await waitFor(() => alive().length === 0, 'fixture processes exited');
  const kinds = noticeKinds(agent);
  assert(kinds.includes('active:active'), `active notice: ${kinds}`);
  assert(!kinds.some((k) => k.startsWith('inactive:')), `no inactive notice: ${kinds}`);
  return { spawned: started, exited: true, notices: kinds };
});

await check('L2 共享 active：一个 Agent Turn 结束保留，另一个 inactive 后关闭', async () => {
  const holder = await create('l2-holder', A);
  await manage(holder, 'active');
  const live = alive();
  assert.equal(live.length, 1, `one live fixture: ${live}`);
  const pid = live[0];
  const worker = await create('l2-worker', A);
  await turn(worker, 'MCP_MANAGE:fixture:active');
  await delay(1500);
  assert.equal(internalNames().length, 1, 'instance retained');
  assert(pidAlive(pid), 'process retained');
  const result = await manage(holder, 'inactive');
  assert.equal(result.state, 'closed');
  assert.equal(result.workspace?.state, 'closed');
  await waitFor(() => !pidAlive(pid), 'process exited after last release');
  return { pid, retainedAfterTurn: true, closedState: result.state };
});

await check('L3 inactive 结果行：retained 与 closed', async () => {
  const a = await create('l3-a', A);
  const b = await create('l3-b', A);
  await manage(a, 'active');
  await manage(b, 'active');
  const tool = app.get('tools').get('mcp_manage');
  const render = (v) =>
    tool.output
      .render({}, v)
      .map((p) => p.text)
      .join('');
  const retained = await manage(a, 'inactive');
  const retainedText = render(retained);
  assert.match(retainedText, /Workspace instance at '.*': retained\./);
  assert.match(retainedText, /other active Agents still occupy/i);
  const closed = await manage(b, 'inactive');
  const closedText = render(closed);
  assert.match(closedText, /Workspace instance at '.*': closed\./);
  assert.equal(internalNames().length, 0);
  assert.equal(
    b.inbox.nextStep.flatMap((m) => m.source?.notices ?? []).filter((n) => n.kind === 'inactive')
      .length,
    0,
  );
  return { retainedText, closedText };
});

await check('L4 Turn 结束后 Windows 可删除工作区目录', async () => {
  const agent = await create('l4', DEL);
  await turn(agent, 'MCP_MANAGE:fixture:active');
  await waitFor(() => internalNames().length === 0, 'closed after turn');
  await waitFor(() => alive().length === 0, 'no live fixture');
  assert.equal(noticeKinds(agent).filter((k) => k.startsWith('inactive:')).length, 0);
  // Agent 自身的工作目录不是进程；删除只受插件 MCP 进程影响。
  rmSync(DEL, { recursive: true });
  assert.throws(() => readFileSync(join(DEL, 'marker.txt')));
  return { deleted: true };
});

for (const h of handles) await h.dispose?.();
await app.get('configEditor').edit(entry, (c) => ({ ...c, servers: {} }));
await app.loader.await();
writeFileSync(join(root, 'lifetime-results.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify(results.map((r) => [r.label, r.status])));
process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
