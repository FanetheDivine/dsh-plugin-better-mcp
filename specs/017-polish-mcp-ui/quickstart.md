# Quickstart: MCP 管理界面视觉优化

## 自动检查

```sh
pnpm i
pnpm format
pnpm full-check
```

预期：类型检查、lint、源码测试、构建与产物测试全部通过。

## 实机环境

```sh
bash .dsh/skills/real-device-test/scripts/setup-env.sh "$(pwd)" rdt-ui
```

按脚本输出设置宿主与 `RDT_*` 环境变量，然后运行：

```sh
node "$RDT_PROFILE_DIR/mcp-cases.mjs"
eval "$(bash .dsh/skills/real-device-test/scripts/gui-up.sh "$RDT_PROFILE")"
```

预期：M1–M6 全部通过，GUI 使用隔离 profile。

## 浏览器验收

1. 打开侧栏 MCP 面板，新增两台具有长简介与长地址的测试服务器。
2. 在系统亮色与暗色模式下分别检查列表和新增/编辑表单，并保存截图。
3. 对每台服务器切换懒加载，执行刷新与重连，确认忙态和状态文本。
4. 提交空表单，确认错误关联到名称字段且输入内容保留。
5. 打开删除确认并取消，再确认删除一台测试服务器。
6. 在插件详情配置页重复列表、编辑和主题检查。
7. 在 `1440×1000` 与较窄桌面视口检查换行、滚动和操作可达性。
8. 检查浏览器控制台无界面脚本错误。

截图、浏览器结果与会话日志保存在 `<profile>/shots/` 及隔离 profile 中。界面语义见 [UI 契约](./contracts/ui.md)。
