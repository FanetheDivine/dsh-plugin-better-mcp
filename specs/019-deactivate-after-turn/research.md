# Research: Turn 结束后自动停用 MCP

## Turn 结束边界

- Decision: 监听 `session/event`，只处理 `turn/end`，通过 `ctx.agents.get(session.id)` 找到对应 Agent。
- Rationale: DSH 0.2.2-rc.3 在 `turn/end` 提交后发布该事件，正常完成、失败与取消都有结束记录。会话 id 与 Agent id 一致，能隔离父子 Agent。
- Alternatives considered: `agent/status` 不能标识单个 Turn；`agent/turn-stopping` 发生在结束提交前，且允许其他监听器延续 Turn。

## 状态记录

- Decision: 在现有目录投影中记录最近 `turn/end` 的 seq，投影版本升为 2。目录早于该边界时，全部服务器按 inactive 计算。
- Rationale: 会话日志是恢复与 fork 的事实来源。无需新增事件类型，也无需在 Turn 结束后写入额外消息。
- Alternatives considered: 只清内存待定选择会在下一 Turn 前恢复会话时还原旧状态；直接追加目录消息会改变现有消息准入流程。

## 工具限制与提醒

- Decision: `turn/end` 监听器清除该 Agent 的待定选择并同步工具限制，不调用 `notify()`。下一 `agent/pre-step` 按现有逻辑生成目录更新。
- Rationale: 宿主在 `agent/pre-step` 前解析工具集，因此结束事件中的同步限制会在下一 Turn 生效。`agent.inject()` 在运行中的驱动里留下待处理输入，可能延续执行。
- Alternatives considered: Turn 结束时调用 `notify()` 会向 inbox 写入消息，不符合空闲会话不主动发起请求的要求。

## 依赖与验证

- Decision: 沿用现有依赖，在 `tests/visibility.test.ts` 覆盖完成、失败、取消、幂等、会话隔离和恢复，并扩充 `tests/helpers.ts` 的 Turn 事件模拟。
- Rationale: 变化集中在可见性投影与入口事件接线，现有测试设施足够验证真实行为。
- Alternatives considered: 新增配置或依赖超出需求范围。
