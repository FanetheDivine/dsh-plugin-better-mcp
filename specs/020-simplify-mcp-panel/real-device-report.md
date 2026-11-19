# 实机测试报告：0.1.2 feat/020-simplify-mcp-panel

## 环境

- 宿主版本：0.2.2-rc.3
- Profile：`rdt-ui-20261119`
- 浏览器：本机 Chrome，由 Playwright 驱动，暗色主题
- 插件装载：profile 通过 `link:` 装载当前 worktree

## 后端用例

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| 快照范围 | PASS | 单元测试确认其他来源被排除，配置内服务器保留连接状态 |
| HTTP 保存 | PASS | 实时 API 返回 `auth: oauth`、Codex 标识与 `mcp:connect`，无表单回调地址 |
| stdio 保存 | PASS | 实时 API 返回 `transport: stdio` 与 `auth: none` |
| 配置清理 | PASS | 两台临时服务器删除后均从快照消失 |

## 浏览器流程

| 流程 | 结果 | 截图 |
| --- | --- | --- |
| 侧栏与行配置页 | PASS | 点击图标直接进入 `better-mcp` 行配置页，不出现 MCP 弹窗，截图 `020-row-config-page.png` |
| 包详情返回 | PASS | 返回包详情后不显示重复配置面板，截图 `020-package-no-duplicate.png` |
| 面板内容 | PASS | 标题为「已配置的 MCP」；无刷新、行图标和来源标签 |
| stdio 新增表单 | PASS | 默认 stdio 且位于首位，显示命令字段，截图 `020-stdio.png` |
| 表单关闭图标 | PASS | 关闭图标距弹窗右侧 16px，截图 `020-form-close.png` |
| OAuth 客户端备选项 | PASS | 聚焦显示 DSH 与 Codex，向上展开，截图 `020-options-up.png` |
| 备选项滚动 | PASS | 打开前后滚动高度均为 572px，未出现整体滚动条 |
| 鼠标与键盘选择 | PASS | 点击重开、自由输入、Escape、方向键与 Enter 均符合预期 |
| 问号说明 | PASS | 悬停或聚焦显示 Figma 示例，截图 `020-help.png` |
| 配置自动同步 | PASS | 新增后无需刷新即出现在配置页 |
| 宽栏入口 | PASS | 36×36 紧凑 entry，截图 `020-sidebar-wide.png` |
| 窄栏入口 | PASS | `data-rail="rail"`，footer 纵向居中，截图 `020-sidebar-rail.png` |

最终完整回归 35 项与行导航 2 项，共 37 项实机断言通过。结果文件：本报告。截图位于测试 profile 的 `shots` 目录。

## 发现的问题

- 首次实机运行发现选择 Codex 后点击输入框不能重开备选项。已补 `onClick` 打开逻辑并复测通过。
- 用户指出侧栏按钮放置不符合 restart 入口约定。已补紧凑 entry、rail 标记与折叠栏布局并复测通过。
- 首次导航复验缺少 `pluginNavigation` 注入，点击被宿主拒绝。已补注入并复测通过。
- 用户指出关闭图标位置与备选项滚动条问题。已调整标题弹性布局与备选项展开方向并复测通过。
- 用户指出包详情页多出一个配置面板。已移除包详情注册，改为通过页面导航 store 直接进入行配置页并复测通过。

## 产物

- `dist/index.mjs` 与 `dist/client.js`
- 本报告
- 测试 profile 的 `shots` 目录：`020-stdio.png`、`020-presets.png`、`020-help.png`、`020-config-page.png`、`020-row-config-page.png`、`020-package-no-duplicate.png`、`020-form-close.png`、`020-options-up.png`、`020-sidebar-wide.png`、`020-sidebar-rail.png`
