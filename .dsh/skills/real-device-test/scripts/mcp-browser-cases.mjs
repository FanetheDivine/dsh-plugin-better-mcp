// MCP 插件浏览器用例：侧栏入口、面板、增删服务器写回配置、插件页配置页。
// 用法：在 profile 目录运行 node mcp-browser-cases.mjs；env：RDT_GUI_URL、RDT_REPO、RDT_PLUGIN_TITLE。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const url = process.env.RDT_GUI_URL;
if (!url) throw new Error('RDT_GUI_URL 必填：先 eval $(bash gui-up.sh <profile名>)');
const REPO = process.env.RDT_REPO;
if (!REPO) throw new Error('RDT_REPO 必填：插件仓库绝对路径');
const PLUGIN = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const TITLE = process.env.RDT_PLUGIN_TITLE ?? 'MCP 增强';
const shots = process.env.RDT_SHOTS ?? join(root, 'shots');
mkdirSync(shots, { recursive: true });

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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('dialog', (dialog) => dialog.accept());
await page.goto(url, { waitUntil: 'domcontentloaded' });

const click = async (names) => {
  for (const name of names) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.count()) {
      await button.first().click();
      return true;
    }
  }
  return false;
};

await check('B0 页面加载', async () => {
  await page.waitForTimeout(2500);
  await click(['继续', 'Continue']);
  await page.waitForTimeout(800);
  return { title: await page.title() };
});

await check('B1 侧栏入口与面板', async () => {
  const button = page.getByRole('button', { name: /MCP/ }).first();
  await button.waitFor({ timeout: 15000 });
  await button.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 8000 });
  const text = await dialog.innerText();
  if (!text.includes('MCP')) throw new Error(`unexpected panel text: ${text.slice(0, 120)}`);
  return { hasAdd: text.includes('新增服务器') || text.includes('Add server') };
});

await check('B2 新增服务器写入配置', async () => {
  await click(['新增服务器', 'Add server']);
  const form = page.getByTestId('better-mcp-form');
  await form.waitFor({ timeout: 5000 });
  await form.locator('input').first().fill('ui-smoke');
  await form.locator('textarea').first().fill('UI smoke server');
  await form.locator('select').first().selectOption('streamable-http');
  await form.locator('input').nth(1).fill('https://example.invalid/mcp');
  await form.locator('select').nth(1).selectOption('none');
  await click(['保存', 'Save']);
  await page.getByTestId('better-mcp-server-ui-smoke').waitFor({ timeout: 10000 });
  if (!readFileSync(join(root, 'cordis.patch.yml'), 'utf8').includes('ui-smoke')) {
    throw new Error('profile patch was not updated');
  }
});

await check('B3 删除服务器', async () => {
  const row = page.getByTestId('better-mcp-server-ui-smoke');
  await row.getByRole('button', { name: /删除|Delete/ }).click();
  await row.waitFor({ state: 'detached', timeout: 10000 });
  if (readFileSync(join(root, 'cordis.patch.yml'), 'utf8').includes('ui-smoke')) {
    throw new Error('profile patch still contains ui-smoke');
  }
});

await check('B4 插件页配置入口', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await click(['插件', 'Plugins']);
  await page.waitForTimeout(1500);
  await page.getByText(TITLE, { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const configure = page.getByRole('button', { name: new RegExp(`^配置 ${TITLE}$|^Configure `) });
  await configure.waitFor({ timeout: 15000 });
  await configure.click();
  const panel = page.getByTestId('better-mcp-panel');
  await panel.waitFor({ timeout: 15000 });
  if (!(await panel.innerText()).includes('MCP')) throw new Error('unexpected config page');
});

await page
  .screenshot({ path: join(shots, `${PLUGIN}-panel.png`), fullPage: false })
  .catch(() => undefined);
writeFileSync(join(root, 'mcp-browser-results.json'), JSON.stringify({ results }, null, 2));
await browser.close();
process.exit(results.every((result) => result.status === 'PASS') ? 0 : 1);
