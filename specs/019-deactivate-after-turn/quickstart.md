# Quickstart: Turn 结束后自动停用 MCP

## 自动验证

```sh
pnpm format
pnpm check
pnpm build
```

重点运行：

```sh
pnpm test:code tests/visibility.test.ts
```

测试覆盖：

- 默认 active 与手动 active 的服务器都在 `turn/end` 后隐藏。
- 同一 Turn 内重新启用不受影响，下一 Turn 可再次启用。
- 完成、失败、取消的 Turn 使用相同重置行为。
- 重复结束事件与全 inactive 状态不产生重复目录提醒。
- 两个 Agent 互不影响。
- 会话在下一目录消息前恢复时仍保持 inactive。
- 自动重置不向 inbox 注入消息。

## 实机验证

1. 构建并在专用 DSH profile 加载本插件。
2. 配置一台 `lazy: false` 与一台 `lazy: true` 的服务器。
3. 在第一 Turn 使用两台服务器的工具，确认最终响应后工具均隐藏。
4. 在第二 Turn 确认目录显示两台服务器为 inactive，并重新启用其中一台完成任务。
5. 结束一个子代理 Turn，确认父代理可见性不变。
6. 在第一 Turn 后重启并恢复会话，确认两台服务器仍为 inactive。
