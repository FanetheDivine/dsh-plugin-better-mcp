# Quickstart: 工作区级 MCP 释放验证

## 前置

- 在 worktree 根目录执行 `pnpm install`。
- 单元测试使用 `tests/helpers.ts` 的模拟 `ctx`。

## 命令

```bash
pnpm format && pnpm check
pnpm test:code
```

## 单元场景

1. 单 Agent active 后通过模拟宿主追加 `turn/end`：工具隐藏，实例关闭，不注入提醒。
2. 两个 Agent 同工作区 active，一个 Turn 结束：实例保留，另一个仍有路由。
3. 一个 Turn 内 active 后 inactive，再 Turn 结束：只关闭一次，无错误。
4. Turn 内切换工作目录后 Turn 结束：只释放仍持有的引用。
5. inactive 工具结果：`closed`、`retained`、`failed`、`cleanup-unknown` 各有对应说明，`idle` 无第二行，且不注入提醒。
6. 切换工作目录时旧工作区无实例：不注入提醒；有实例时提醒保持现状。
7. active 提醒包含占用、其他 Agent、关闭延迟与删除前检查。
8. 共享服务器的 active、inactive 与 Turn 结束行为不变。
9. 目录投影仍能解析带 `inactive` 提醒的历史目录消息。

## 实机场景

使用 `real-device-test` skill 的隔离 profile 与可报告 PID 的 stdio fixture：

1. active 后结束 Turn，确认 fixture 进程退出。
2. 两个会话同工作区 active，一个 Turn 结束，确认进程保留；第二个 Turn 结束后退出。
3. inactive 返回结果包含实例状态。

## 预期

- 全部检查与测试通过。
- 实机场景中 Turn 结束后没有残留的 fixture 进程。
