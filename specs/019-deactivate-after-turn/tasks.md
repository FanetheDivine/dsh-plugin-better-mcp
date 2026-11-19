---
description: "Turn 结束后自动停用 MCP 的实施任务"
---

# Tasks: Turn 结束后自动停用 MCP

**Input**: Design documents from `specs/019-deactivate-after-turn/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)

**Tests**: 项目宪章要求同步测试。每个故事先写失败测试，再完成接线或修正。

## Phase 1: Setup

**Purpose**: 准备 worktree 并保存设计基线

- [x] T001 按 `pnpm-lock.yaml` 安装锁定依赖
- [x] T002 提交 `specs/019-deactivate-after-turn/` 的规格和设计产物

---

## Phase 2: Foundational

**Purpose**: 让会话投影与测试设施识别 Turn 结束边界

**⚠️ CRITICAL**: 两个用户故事都依赖此阶段

- [ ] T003 [P] 在 `src/visibility.ts` 为 CatalogState 增加 `turnEndSeq: number | null`，将投影版本升为 2，并提供结束后清除待定选择与重算限制的方法
- [ ] T004 [P] 在 `tests/helpers.ts` 增加向会话日志提交指定结束原因的 `turn/end` 并发出 `session/event` 的模拟能力
- [ ] T005 运行 `pnpm test:code tests/visibility.test.ts` 验证现有行为并提交 Phase 2 的 `src/visibility.ts` 与 `tests/helpers.ts`

**Checkpoint**: 投影能跨恢复识别 Turn 边界，测试能模拟结束事件

---

## Phase 3: User Story 1 - 下一 Turn 恢复精简工具集 (Priority: P1) 🎯 MVP

**Goal**: 每个 Turn 结束后，当前 Agent 的全部 MCP 服务器自动 inactive

**Independent Test**: 默认 active 与手动 active 的服务器都在结束后隐藏；下一 Turn 可重新启用；全 inactive 时不产生重复提醒

### Tests for User Story 1

- [ ] T006 [US1] 在 `tests/visibility.test.ts` 添加默认 active、手动 active、完成/失败/取消、重新启用、无唤醒消息与幂等提醒测试，并确认接线前测试失败

### Implementation for User Story 1

- [ ] T007 [US1] 在 `src/index.ts` 监听 `session/event` 的 `turn/end`，只调用目标 Agent 的结束重置方法
- [ ] T008 [US1] 运行 `pnpm test:code tests/visibility.test.ts` 验证 US1 并提交 `src/index.ts` 与 `tests/visibility.test.ts`

**Checkpoint**: US1 可独立交付，所有 active 服务器在下一模型步骤前隐藏

---

## Phase 4: User Story 2 - 保持会话相互独立 (Priority: P2)

**Goal**: 一个 Agent 的 Turn 结束不影响其他 Agent，并在恢复后保持重置结果

**Independent Test**: 两个 Agent 分别结束 Turn 时只重置自身；最近目录早于 Turn 结束的新恢复会话仍为 inactive

### Tests for User Story 2

- [ ] T009 [US2] 在 `tests/visibility.test.ts` 添加双 Agent、子代理隔离与下一目录前恢复的测试，必要时修正 `src/visibility.ts` 的边界计算
- [ ] T010 [US2] 运行 `pnpm test:code tests/visibility.test.ts` 验证 US2 并提交本阶段变更

**Checkpoint**: 会话隔离与恢复行为均有回归测试

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 同步文档并完成全部质量门禁

- [ ] T011 [P] 在 `README.md` 说明每个 Turn 结束后全部服务器自动 inactive、可重新启用且连接保持
- [ ] T012 [P] 在 `docs/how-it-works.md` 记录 `turn/end` 投影边界、限制重算与下一步目录提醒机制
- [ ] T013 按 `specs/019-deactivate-after-turn/quickstart.md` 运行 `pnpm format && pnpm check` 与 `pnpm build`
- [ ] T014 审查 `git diff` 和全部测试结果，提交 `README.md`、`docs/how-it-works.md` 与剩余格式化变更

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: 立即开始。
- **Phase 2**: 依赖 Phase 1，阻塞两个故事。
- **Phase 3 US1**: 依赖 Phase 2，可独立交付 MVP。
- **Phase 4 US2**: 依赖 Phase 2；在 US1 后顺序实施，避免修改同一测试文件。
- **Phase 5**: 依赖 US1 与 US2。

### Parallel Opportunities

- T003 与 T004 修改不同文件，可并行。
- T011 与 T012 修改不同文档，可并行。
- US1 与 US2 共用事件接线及测试文件，本任务采用顺序执行。

### Parallel Example

```text
T003: 更新 src/visibility.ts 的投影和重置方法
T004: 更新 tests/helpers.ts 的 Turn 结束模拟
```

## Implementation Strategy

1. 完成设计与依赖准备并提交。
2. 建立 Turn 边界投影与测试模拟并提交。
3. 先完成 US1，验证核心自动 inactive 行为并提交 MVP。
4. 完成 US2 的隔离与恢复回归并提交。
5. 更新文档，运行完整质量门禁，审查并提交最终变更。
