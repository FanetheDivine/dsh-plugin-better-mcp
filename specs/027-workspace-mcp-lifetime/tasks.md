---

description: "Task list for reliable workspace MCP release"

---

# Tasks: 工作区级 MCP 在 Turn 结束与 inactive 时可靠释放

**Input**: Design documents from `/specs/027-workspace-mcp-lifetime/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 宪章要求代码与测试同步。各故事先写行为测试并确认失败，再实现。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 不同文件且无未完成依赖，可并行。
- **[Story]**: US1–US3 对应 spec 的三个用户故事。
- 每个 Phase 完成后运行 `pnpm format && pnpm check` 并提交一个 commit。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 准备依赖并提交规格产物

- [X] T001 在 worktree 根目录运行 `pnpm install`，再运行 `pnpm check` 确认基线通过
- [X] T002 提交 `specs/027-workspace-mcp-lifetime/` 下的 spec、plan、research、data-model、contracts、quickstart、checklists 与 tasks

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 实例池提供按 Agent 释放全部 active 引用的原语

**⚠️ CRITICAL**: 本阶段完成前不开始用户故事

- [X] T003 在 `tests/workspace-pool.test.ts` 新增测试：单 Agent 持有两个实例键的 active 引用时全部释放并返回每个键的清理结果；共享键返回 `retained`；没有引用时返回空数组；只释放 `activeAgents`，保留 `boundAgents`
- [X] T004 在 `src/workspace-pool.ts` 新增按 Agent 释放全部 active 引用的方法，遍历 `activeAgents` 含该 Agent 的状态并逐个调用 `releaseActive`，返回 `WorkspaceCleanupResult[]`

**Checkpoint**: 实例池原语可用

---

## Phase 3: User Story 1 - Turn 结束释放工作区实例 (Priority: P1) 🎯 MVP

**Goal**: Turn 结束隐藏工具并按 active 引用释放实例

**Independent Test**: 通过模拟宿主 `ctx._endTurn` 追加 `turn/end` 后，实例关闭且没有新增提醒；共享 active 时实例保留

### Tests for User Story 1

- [X] T005 [US1] 在 `tests/visibility.test.ts` 用 `ctx._endTurn` 改写 Turn 结束测试并确认在当前实现下失败：单 Agent active 后 Turn 结束实例关闭；另一 Agent 同工作区 active 时实例保留且其路由仍可用；Turn 内 active 后 inactive 再 Turn 结束只关闭一次且无告警；Turn 内切换工作目录后 Turn 结束只释放仍持有的引用；Turn 结束不注入 `inactive` 提醒；共享服务器的 Turn 结束隐藏行为不变

### Implementation for User Story 1

- [X] T006 [US1] 修改 `src/visibility.ts` 的 `deactivateAfterTurn`：清除待定选择并同步限制后，调用 T004 的方法释放引用，失败只记录告警；删除对 `isActive`、当前工作目录与 `createInactiveWorkspaceNotice` 的使用

**Checkpoint**: Turn 结束释放可独立验证

---

## Phase 4: User Story 2 - inactive 释放工作区实例 (Priority: P1)

**Goal**: inactive 不再注入提醒，工具结果给出实例清理结果

**Independent Test**: 工作区 inactive 的工具结果包含 `closed`、`retained`、`failed`、`cleanup-unknown` 对应说明，`idle` 无第二行，且没有新增提醒

### Tests for User Story 2

- [X] T007 [P] [US2] 在 `tests/workspace-notices.test.ts` 删除 `createInactiveWorkspaceNotice` 用例，新增导出的清理说明函数用例：`closed`、`retained`（inactive 共享占用）、`failed`、`cleanup-unknown` 文本，后两者明确不得删除
- [X] T008 [P] [US2] 在 `tests/visibility.test.ts` 新增 `mcp_manage` inactive 用例：结果文本第二行为 `Workspace instance at '<workspace>': <state>. <cleanup detail>`，覆盖四种状态；未 active 直接 inactive 时无第二行；inactive 后目录消息不含 `inactive` 提醒；共享服务器 inactive 文本不变
- [X] T009 [P] [US2] 在 `tests/catalog.test.ts` 保留并确认带 `kind: 'inactive'` 的历史目录消息仍能被投影解析

### Implementation for User Story 2

- [X] T010 [US2] 修改 `src/workspace-notices.ts`：导出清理说明函数，删除 `createInactiveWorkspaceNotice`，`WorkspaceNotice['kind']` 保留 `inactive`
- [X] T011 [US2] 修改 `src/tools.ts`：`ManageResult` 增加可选工作区清理结果；inactive 分支不再排队提醒；`renderManageResult` 按 `contracts/model-facing-text.md` 为工作区 inactive 追加实例结果行，`idle` 不追加

**Checkpoint**: inactive 结果可独立验证

---

## Phase 5: User Story 3 - active 提醒说明占用与延迟 (Priority: P2)

**Goal**: active 提醒说明占用、其他 Agent 与关闭延迟；无实例时不发切换与缺失提醒

**Independent Test**: active 后下一步提醒包含 `contracts/model-facing-text.md` 的 active 文案；子代理式切换且旧目录无实例时不注入提醒

### Tests for User Story 3

- [X] T012 [P] [US3] 在 `tests/workspace-notices.test.ts` 断言 active 提醒 `detail` 包含占用文件夹、Turn 结束或 inactive 关闭、其他 Agent 保持占用、关闭可能延迟、删除前 inactive 并确认 closed 五项
- [X] T013 [P] [US3] 在 `tests/workspace-bindings.test.ts` 的入口接线用例中新增：切换工作目录时旧工作区无实例不注入提醒；目录缺失且无实例不注入提醒；旧实例 `closed` 时提醒保持现状由现有用例覆盖
- [X] T014 [P] [US3] 按宪章 II「不复述文案」不新增 `workspaceHint` 文案断言；现有面板测试继续覆盖帮助按钮渲染

### Implementation for User Story 3

- [X] T015 [US3] 修改 `src/workspace-notices.ts` 的 `createActiveWorkspaceNotice` 文案，与 `contracts/model-facing-text.md` 一致
- [X] T016 [US3] 修改 `src/index.ts` 的 `bindings.onCleanup` 与 `bindings.onMissing`，跳过 `state === 'idle'` 的结果
- [X] T017 [P] [US3] 修改 `src/client/locales.ts` 的 `workspaceHint` 中英文，补充 Turn 结束时关闭

**Checkpoint**: 全部用户故事可独立验证

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 文档与实机验证

- [ ] T018 [P] 更新 `docs/configuration.md` 工作区级实例一节：Turn 结束关闭、inactive 工具结果、删除前 inactive 并确认 closed、切换与缺失只在有实例时提醒
- [ ] T019 [P] 更新 `docs/how-it-works.md`：生命周期中的 inactive 与 Turn 结束规则、notice 列表去掉 inactive、会话可见性表的 Turn 结束行
- [ ] T020 运行 `pnpm format && pnpm full-check`
- [ ] T021 按 `real-device-test` skill 与 `quickstart.md` 实机场景，在隔离 profile 用可报告 PID 的 stdio fixture 验证 Turn 结束关闭、共享保留与 inactive 结果，结果写入 `specs/027-workspace-mcp-lifetime/real-device-report.md`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6。
- US2 依赖 Phase 2；与 US1 修改同一测试文件 `tests/visibility.test.ts`，按顺序执行。
- US3 的 T015 与 US2 的 T010 修改同一文件，按顺序执行。
- T021 依赖 T020。

## Parallel Opportunities

- Phase 4：T007、T008、T009 分属不同文件，可并行编写。
- Phase 5：T012、T013、T014 可并行；T017 与 T015、T016 不同文件，可并行。
- Phase 6：T018、T019 可并行。

## Implementation Strategy

1. 完成 Phase 1–3 即修复主缺陷，作为 MVP。
2. Phase 4 让 inactive 结果可见并去掉冗余提醒。
3. Phase 5 更新提醒与面板文案。
4. Phase 6 同步文档并完成实机验证。
