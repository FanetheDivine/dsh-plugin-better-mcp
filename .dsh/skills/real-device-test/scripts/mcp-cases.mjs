// MCP 插件后端实机用例：装载、工具、浏览器模块、volatile 配置写入与懒加载对账。
// 用法：在 profile 目录运行 node mcp-cases.mjs；env 同 run-test.mjs。
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RDT_REPO;
if (!REPO) throw new Error('RDT_REPO 必填：插件仓库绝对路径');
const PLUGIN = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const dshPkg =
  process.env.RDT_DSH_PKG ??
  join(execSync('npm root -g', { encoding: 'utf8' }).trim(), '@deepseek-ai', 'dsh', 'package.json');

const require = createRequire(dshPkg);
const { createLaunchEnvironmentSnapshot } = await import(
  pathToFileURL(require.resolve('@deepseek-ai/dsh-launch-environment'))
);
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
const results = [];
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

const entry = [...app.loader.entries()].find((candidate) => candidate.options.name === PLUGIN);
let uid;

await check('M1 插件激活', () => {
  assert(entry, `找不到 ${PLUGIN} 行`);
  assert.equal(entry.fiber.state, 2, '插件未激活');
  uid = entry.fiber.uid;
  return { id: entry.options.id };
});

await check('M2 工具可见', () => {
  const names = app
    .get('tools')
    .schemas()
    .map((tool) => tool.name);
  for (const name of ['mcp_servers', 'mcp_call']) assert(names.includes(name), `缺少 ${name}`);
  return { count: names.length };
});

await check('M3 浏览器产物已登记', () => {
  const graph = JSON.stringify(app.get('clientModules').graph());
  assert(graph.includes(PLUGIN), '浏览器模块图中没有本插件');
  return { bytes: graph.length };
});

await check('M4 默认配置与配置服务', async () => {
  assert(app.get('configEditor'), '缺少 configEditor');
  assert.deepEqual(entry.options.config?.servers ?? {}, {});
  assert.equal(entry.options.config?.expose?.enabled, true);
  return entry.options.config?.expose?.endpoint;
});

await check('M5 volatile 写入不重挂', async () => {
  const editor = app.get('configEditor');
  await editor.edit(entry, (current) => ({
    ...current,
    servers: {
      smoke: {
        transport: 'streamable-http',
        url: 'https://example.invalid/mcp',
        lazy: true,
        auth: 'oauth',
        oauth: { scopes: [] },
      },
    },
  }));
  await app.loader.await();
  assert.equal(entry.fiber.state, 2, '写配置后插件未激活');
  assert.equal(entry.fiber.uid, uid, 'volatile 写入重挂了插件');
  assert(
    readFileSync(join(root, 'cordis.patch.yml'), 'utf8').includes('smoke'),
    '补丁未写入 smoke',
  );
  assert.equal(
    app
      .get('mcpManager')
      .list()
      .find((view) => view.name === 'smoke'),
    undefined,
  );
});

await check('M6 删除定义后配置回空', async () => {
  const editor = app.get('configEditor');
  await editor.edit(entry, (current) => ({ ...current, servers: {} }));
  await app.loader.await();
  assert.equal(entry.fiber.uid, uid);
  assert.deepEqual(entry.options.config?.servers ?? {}, {});
});

console.log(JSON.stringify({ results }, null, 2));
process.exit(results.every((result) => result.status === 'PASS') ? 0 : 1);
