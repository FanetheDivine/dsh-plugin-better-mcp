---

description: "Task list for MCP 管理界面视觉优化"
---

# Tasks: MCP 管理界面视觉优化

**Input**: Design documents from `specs/017-polish-mcp-ui/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/ui.md

**Tests**: 规格与宪章要求单元测试和真实宿主验证。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 固定实机证据、验收范围与设计契约

- [x] T001 确认规格、亮暗主题实机证据与界面契约记录在 specs/017-polish-mcp-ui/spec.md、specs/017-polish-mcp-ui/research.md、specs/017-polish-mcp-ui/contracts/ui.md

**Checkpoint**: 提交规格与设计阶段。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立两个用户故事共用的主题化控件与文案

- [x] T002 在 src/client/ui.tsx 实现使用宿主 token 的共享样式、Button、Switch、Modal 与焦点管理
- [x] T003 [P] 确认 src/client/locales.ts 的现有文案覆盖共享控件、状态反馈、表单与确认操作

**Checkpoint**: 共享控件可供面板和表单使用，提交基础组件阶段。

---

## Phase 3: User Story 1 - 清晰管理 MCP 服务器 (Priority: P1) 🎯 MVP

**Goal**: 两种入口中的列表、状态与操作符合 DSH 管理页风格，并适配亮暗主题。

**Independent Test**: 在真实 DSH 的亮色与暗色模式下打开包含长简介、长地址和错误状态的服务器列表，完成刷新与懒加载切换。

### Tests for User Story 1

- [x] T004 [US1] 在 tests/client.test.ts 添加列表语义、状态分区、懒加载 switch、反馈语义与主题 token 回归测试，并确认测试在当前实现上失败

### Implementation for User Story 1

- [x] T005 [US1] 在 src/client/panel.tsx 与 src/client/locales.ts 实现分隔式服务器列表、状态与诊断分区、统一按钮、带服务器名称的懒加载 switch、加载/空/错误反馈及响应式布局
- [x] T006 [P] [US1] 在 src/client/index.tsx 统一侧栏入口与配置摘要的主题样式，并为主弹层保存和恢复触发按钮焦点

**Checkpoint**: US1 的核心管理与亮暗主题检查通过，提交服务器列表阶段。

---

## Phase 4: User Story 2 - 顺畅新增与编辑服务器 (Priority: P2)

**Goal**: 新增、编辑和删除确认使用一致的宿主风格弹层，长表单与错误反馈清晰可操作。

**Independent Test**: 在两种入口中打开新增和编辑表单，切换传输与认证选项，提交无效字段并检查焦点、输入保留、滚动和亮暗主题。

### Tests for User Story 2

- [ ] T007 [US2] 在 tests/client.test.ts 添加字段错误映射、标签关联、密钥自动完成、弹层名称与表单操作语义回归测试，并确认新增断言在当前实现上失败

### Implementation for User Story 2

- [ ] T008 [P] [US2] 在 src/client/server-form.tsx 实现主题化字段、稳定标签关联、字段级校验错误、首个无效字段聚焦与独立滚动内容
- [ ] T009 [P] [US2] 在 src/client/panel.tsx 与 src/client/locales.ts 接入新增/编辑表单弹层和删除确认弹层，保留保存、授权、删除与取消流程

**Checkpoint**: US2 的两种入口、校验和弹层操作检查通过，提交表单阶段。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 完成用户文档、实机回归与视觉审查

- [ ] T010 [P] 在 README.md 更新面板、表单弹层与亮暗主题的用户行为说明
- [ ] T011 [P] 按 specs/017-polish-mcp-ui/quickstart.md 复测 M1–M6、浏览器核心流程与亮暗/窄视口截图，并将结果写入 specs/017-polish-mcp-ui/real-device-report.md
- [ ] T012 完成 UI/UX 子代理审查，处理审查发现并在 specs/017-polish-mcp-ui/real-device-report.md 记录结论，运行 pnpm format 与 pnpm full-check

**Checkpoint**: 全部验收通过，提交实机验证与文档阶段。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: 无依赖。
- **Foundational**: 依赖 Setup，阻塞两个用户故事。
- **User Story 1**: 依赖 Foundational。
- **User Story 2**: 依赖 Foundational；共享面板集成按 US1 → US2 顺序执行。
- **Polish**: 依赖两个用户故事完成。

### Within Each User Story

- 先添加测试并确认新增断言失败。
- 面板和入口可在接口稳定后并行。
- 表单内容和面板弹层可在 props 契约稳定后并行。
- 每个阶段完成后运行相关测试并提交。

### Parallel Opportunities

- T002 与 T003 使用不同文件。
- US1 的 T005 与 T006 使用不同文件。
- US2 的 T008 与 T009 使用不同文件。
- T010 与 T011 使用不同文件。

---

## Parallel Example: User Story 1

```text
Task: "T005 更新 src/client/panel.tsx 的列表与状态"
Task: "T006 更新 src/client/index.tsx 的入口样式与焦点返回"
```

## Parallel Example: User Story 2

```text
Task: "T008 更新 src/client/server-form.tsx 的字段与校验关联"
Task: "T009 更新 src/client/panel.tsx 的表单与删除弹层"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成规格、共享控件与 US1。
2. 在真实宿主验证服务器列表、刷新、懒加载和亮暗主题。
3. 继续 US2 前确认核心管理流程无回归。

### Incremental Delivery

1. Setup + Foundational：建立主题化控件。
2. US1：交付可读的服务器管理列表。
3. US2：交付完整表单与确认弹层。
4. Polish：完成文档、视觉审查、实机复测与质量门禁。

## Notes

- 每个阶段对应一个 commit。
- 实机截图与日志保存在隔离 profile，不提交本机路径。
