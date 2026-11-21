# Implementation Plan: 工作区级 MCP 在 Turn 结束与 inactive 时可靠释放

**Branch**: `feat/027-workspace-mcp-lifetime` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-workspace-mcp-lifetime/spec.md`

**Status**: Approved

## Open Decisions

<!--
Status values:
- Draft: the current full document is not approved or waived.
- Approved: the user approved the current full document.
- Waived: the user waived the review and accepted the recorded risks.
Record each undecided question with a stable id and its dependencies.
-->

- 无。

## Clarifications

### Session 2026-11-21

- 探索结论：缺陷根因、修复方式与兼容处理见 [research.md](./research.md)。
- [P-001] Q: 是否做实机验证？ -> A: 做，使用 `real-device-test` skill 的隔离 profile 与可报告 PID 的 stdio fixture。
- [P-002] Q: 面板帮助文案是否补充 Turn 结束关闭？ -> A: 补充，中英文同步。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: none | Risks: 关闭只保证直接 stdio 子进程；Turn 结束释放依赖 `turn/end` 事件

## Summary

修复 Turn 结束不释放工作区实例的缺陷：按实例池中的 active 引用释放，不再读取已重置的可见性。inactive 与 Turn 结束不再注入提醒，inactive 的工具结果改为给出实例清理结果。切换工作目录或目录缺失时跳过无实例的提醒。active 提醒补充其他 Agent 占用、关闭延迟与删除前检查。

## Technical Context

**Language/Version**: TypeScript 6，Node.js 24

**Primary Dependencies**: DSH `0.2.2-rc.5` 宿主服务：`mcpManager`、`agents`、`sessionProjections`、`workingDirectory`

**Storage**: 会话日志中的目录消息与工作区提醒

**Testing**: vitest，`tests/helpers.ts` 模拟 `ctx`

**Target Platform**: DSH Desktop 与 Web 宿主

**Project Type**: DSH 插件

**Performance Goals**: Turn 结束释放不阻塞 `session/event` 分发

**Constraints**: 只改工作区级 MCP；共享实例行为不变；关闭只保证直接 stdio 子进程

**Scale/Scope**: 4 个源文件、2 份开发文档、面板帮助文案与对应测试

## Constitution Check

| 原则 | 结论 |
| --- | --- |
| I. 宿主依赖版本 | 通过。不改依赖。 |
| II. 测试同步 | 通过。按 [quickstart.md](./quickstart.md) 单元场景新增或更新测试，并完成其中的实机场景。 |
| III. 文档结构 | 通过。行为变化更新 `docs/configuration.md` 与 `docs/how-it-works.md`；README 的功能描述不变；CHANGELOG 在 push 时补充。 |
| IV. 质量门禁 | 通过。每次文件变更后运行 `pnpm format && pnpm check`。 |
| V. 公开引用 | 通过。文档只引用仓库内路径。 |

设计后复查：通过。

## Design

### 实例池

`src/workspace-pool.ts` 新增按 Agent 释放全部 active 引用的方法：

- 遍历 `activeAgents` 含该 Agent 的实例键。
- 对每个键调用现有 `releaseActive`，返回全部清理结果。
- 引用规则与关闭串行化保持不变。

### Turn 结束

`src/visibility.ts` 的 `deactivateAfterTurn`：

- 清除待定选择并同步工具限制，与现状相同。
- 调用实例池的新方法释放引用；失败只记录告警。
- 不再读取 `isActive` 与当前工作目录，不再排队提醒。

### inactive

`src/tools.ts`：

- inactive 分支不再排队提醒。
- `ManageResult` 增加可选的工作区清理结果。
- `renderManageResult` 对工作区 inactive 追加实例结果行，文案见 [contracts/model-facing-text.md](./contracts/model-facing-text.md)。

### 提醒

`src/workspace-notices.ts`：

- 更新 active 提醒的 `detail`。
- 导出清理说明函数供工具结果复用。
- 删除 `createInactiveWorkspaceNotice`；投影解析继续接受 `inactive` 类型。

`src/index.ts` 的切换与缺失回调跳过 `idle` 结果。

### 文档

- `docs/configuration.md` 工作区级实例一节：Turn 结束关闭、inactive 结果与删除前检查。
- `docs/how-it-works.md` 生命周期、notice 列表与会话可见性表。
- `src/client/locales.ts` 的 `workspaceHint` 中英文补充 Turn 结束关闭。

## Project Structure

### Documentation (this feature)

```text
specs/027-workspace-mcp-lifetime/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── model-facing-text.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.ts               # 切换与缺失回调跳过 idle
├── tools.ts               # inactive 结果与渲染
├── visibility.ts          # Turn 结束按引用释放
├── workspace-notices.ts   # active 提醒与清理说明
├── workspace-pool.ts      # 按 Agent 释放全部 active 引用
└── client/locales.ts      # 工作区级实例帮助文案

tests/
├── visibility.test.ts
├── workspace-pool.test.ts
├── workspace-notices.test.ts
├── plugin.test.ts
└── catalog.test.ts
```

**Structure Decision**: 沿用现有单项目结构，只修改上列文件。

## Complexity Tracking

无。
