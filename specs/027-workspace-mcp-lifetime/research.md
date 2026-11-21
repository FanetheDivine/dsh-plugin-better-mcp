# Research: 工作区级 MCP 在 Turn 结束与 inactive 时可靠释放

## R1 Turn 结束释放的来源

**Decision**: Turn 结束时按实例池中的 active 引用释放。实例池新增按 Agent 释放全部 active 引用的方法，返回每个实例的清理结果。`deactivateAfterTurn` 不再读取可见性，也不再读取当前工作目录。

**Rationale**:

- 宿主的 `session-projection` 服务先于插件订阅 `session/event`。同一个 `turn/end` 事件上，目录投影先写入 `turnEndSeq`，插件读取 `isActive` 时全部服务器已是 inactive，待释放列表为空。
- 实例池的 `activeAgents` 是 active 引用的唯一事实来源，与可见性重置时序无关。
- 每个引用自带实例键，Turn 内切换过工作目录时也释放正确的实例。

**Alternatives Considered**:

- 用 `prepend` 监听在投影之前抓取可见性：依赖宿主监听注册顺序，宿主调整后再次失效。
- 读取 `turn/end` 之前的目录状态：需要回放会话事件，复杂且仍依赖投影实现。

## R2 inactive 与 Turn 结束不再注入提醒

**Decision**: 删除 inactive 与 Turn 结束的 `inactive` 提醒。inactive 的工具结果给出工作区实例的清理结果，文案复用提醒模块的清理说明函数。

**Rationale**:

- 当前 `renderManageResult` 对 inactive 只输出固定一句，模型看不到关闭、保留或失败。
- 清理说明集中在 `workspace-notices.ts` 一处维护，工具结果与切换提醒措辞一致。

**Alternatives Considered**: 保留提醒并同时扩充工具结果会让同一信息出现两次。

## R3 目录切换与缺失时跳过无实例结果

**Decision**: 切换与缺失回调只对 `retained`、`closed`、`failed`、`cleanup-unknown` 注入提醒，跳过 `idle`。

**Rationale**: 子代理启动时会先落在会话所属工作区，再切换到继承目录；旧目录没有实例时池返回 `idle`，当前被映射为「已关闭」提醒，与事实不符。

## R4 持久化兼容

**Decision**: 目录投影继续接受 `inactive` 提醒类型，只停止生成。

**Rationale**: 已有会话日志中的目录消息可能携带该类型；解析拒绝会让整条目录消息失效。

## R5 active 提醒措辞

**Decision**: 提醒说明四点：实例以当前工作区为 cwd 并占用文件夹；本 Agent inactive 或 Turn 结束时关闭；同一工作区其他 Agent 仍 active 时继续运行；关闭可能延迟或无法确认，删除前先 inactive 并确认结果为已关闭。文本见 [contracts/model-facing-text.md](./contracts/model-facing-text.md)。

**Rationale**: 覆盖 FR-009 至 FR-011，并给出删除前可执行的检查方法。
