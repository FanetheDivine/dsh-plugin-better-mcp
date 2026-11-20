# 实机测试报告：0.1.5 feat/026-template-hot-reload

## 环境

- 宿主版本：0.2.2-rc.3（`~/.dsh-local`，全局 `dsh` 0.2.1-rc.5 未改动）
- Profile：`rdt-026-hot`，插件以 `link:` 指向 worktree，`cordis.patch.yml` 含监听 `<repo>/dist` 的 `hmr` 条目
- 浏览器：本机 Chrome，Playwright 无头，视口 1280×1000
- 端口：3310。3210 被另一并行会话的 `rdt-025` GUI 占用

## 后端用例

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| A1 装载 | PASS | 插件激活，加载版本 0.1.5，`dist/index.mjs` 哈希 `2abeb7b3f8e3` 与仓库一致 |
| M1 插件激活 | PASS | `fiber.state` 为 2，行 id 为 `dsh-plugin-better-mcp` |
| M2 工具可见 | PASS | 工具表含 `mcp_manage`，不含 `mcp_servers` 与 `mcp_call` |
| M3 浏览器产物 | PASS | 客户端模块图 33500 字节并包含本插件 |
| M4 默认配置 | PASS | 默认只有 `servers`，没有 `expose` |
| M5 volatile 写入 | PASS | 新增懒加载服务器后 `fiber.uid` 不变 |
| M6 删除定义 | PASS | 删除后配置回空，插件实例不变 |
| B1–B5 | 不适用 | 模板的 `demo_echo` 用例，本插件没有该工具 |

## 浏览器流程

| 流程 | 结果 | 截图 |
| --- | --- | --- |
| B0 页面加载 | PASS | 标题 `DeepSeek Harness` |
| B4 插件页配置入口 | PASS | 行配置面板出现 |
| B1 侧栏面板、B2 新增服务器、B3 删除服务器 | FAIL（既有） | 脚本按弹窗定位，当前界面为行配置页；与本轮改动无关 |

## 热更新验证

| 项目 | 结果 | 依据 |
| --- | --- | --- |
| 后端行为随构建变化 | PASS | 同一会话发送 `MCP_MANAGE:hot-check:inactive`：构建前回复 `Error: No MCP server named 'hot-check'`，构建后回复 `Error: [hot] No MCP server named 'hot-check'` |
| 页面未刷新 | PASS | 页面标记 `window.__hotMarker` 保持 `alive` |
| 宿主进程不变 | PASS | 3310 端口进程号 26068 前后一致 |
| 前端产物自动更新 | PASS | 构建后页面自动取回 `/plugins/??dsh-plugin-better-mcp/client.js&rev=6f0a68e50092`，内容含新文案 |
| 会话连续 | PASS | 两次请求在同一会话内完成 |
| 临时改动还原 | PASS | `src/tools.ts` 与 `src/client/locales.ts` 已还原并重新构建，`git status` 无源码改动 |

截图：`.rdt-shots/026-hot-before.png`、`.rdt-shots/026-hot-after.png`。

## 发现的问题

1. `run-test.mjs` 的 B1–B5 与 `mcp-browser-cases.mjs` 的 B1–B3 仍在用 `demo_echo` 与弹窗定位，与当前插件工具和行配置页不符。既有缺陷，另开分支修复。
2. 并行会话同样在 3210 端口跑实机，`gui-up.sh` 会结束端口占用进程，本轮改用 3310 端口。
3. 并行负载下一次 `pnpm build` 的 `test:dist` 在 5 秒超时，重跑通过。

## 产物

- 报告：本文件
- 截图：`.rdt-shots/026-hot-before.png`、`.rdt-shots/026-hot-after.png`
- profile `rdt-026-hot` 已删除
