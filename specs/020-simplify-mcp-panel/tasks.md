# Tasks: 精简 MCP 管理面板

**Input**: Design documents from `specs/020-simplify-mcp-panel/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/

**Tests**: 每个用户故事先更新行为测试，再实现。

## Phase 1: Setup

- [x] T001 安装 worktree 依赖并确认基线测试通过，使用 `package.json` 与 `pnpm-lock.yaml`

## Phase 2: Foundational

- [x] T002 [P] 在 `src/client/ui.tsx` 增加共享 VS Code MCP 图标组件，并在 `icon.svg` 使用同一图形与来源声明
- [x] T003 在 `src/client/locales.ts` 增加本次面板、备选项与问号说明的中英文键，保持键集一致

## Phase 3: User Story 1 - 集中查看本插件配置 (P1) 🎯 MVP

**Goal**: 面板只管理本插件配置，移除重复入口与行装饰。

**Independent Test**: 同时提供配置内与外来源服务器，快照只返回配置内项；静态渲染不含刷新、行图标和来源标签。

- [x] T004 [P] [US1] 在 `tests/servers.test.ts` 更新快照测试，断言外部服务器被排除且配置内状态仍保留
- [x] T005 [P] [US1] 在 `tests/client.test.ts` 更新面板、服务器行、侧栏与字典测试
- [x] T006 [US1] 在 `src/servers.ts` 与 `src/client/api.ts` 收窄快照并移除恒定的 `managed` 字段
- [x] T007 [US1] 在 `src/client/panel.tsx` 删除刷新、行图标与来源标签，标题使用「已配置的 MCP」，新增按钮使用「新增 MCP」
- [x] T008 [US1] 在 `src/client/index.tsx` 使用共享 MCP 图标并移除侧栏文字，保留「MCP 服务器」提示与无障碍名称
- [x] T009 [US1] 在 `src/client/ui.tsx` 清理行图标等失效样式并运行本阶段测试

## Phase 4: User Story 2 - 用精简表单新增服务器 (P2)

**Goal**: 默认 stdio，HTTP 固定 OAuth，删除认证方式与回调地址输入项。

**Independent Test**: 新增表单默认 stdio；HTTP 定义固定 `auth: oauth`；stdio 定义固定 `auth: none`；scopes 保持回填与保存。

- [x] T010 [US2] 在 `tests/client.test.ts` 更新表单默认值、校验、字段渲染与提交结构测试
- [x] T011 [US2] 在 `src/client/server-form.tsx` 将传输顺序与默认值改为 stdio，移除 `auth` 和 `redirectUri` 表单状态，HTTP 固定 OAuth
- [x] T012 [US2] 在 `src/client/panel.tsx` 停止提交 `redirectUri`，保留客户端密钥独立写入

## Phase 5: User Story 3 - 选择兼容的 OAuth 客户端 (P3)

**Goal**: 客户端标识支持 DSH 与 Codex 备选、自由输入和 Figma 场景说明。

**Independent Test**: 聚焦输入框即可选择两项；DSH 保存空标识，Codex 保存 `app_EMoamEEZ73f0CkXaXp7hrann`；问号在悬停和聚焦时显示说明。

- [x] T013 [US3] 在 `tests/client.test.ts` 增加备选项、空标识动态注册、固定标识与问号说明测试
- [x] T014 [US3] 在 `src/client/server-form.tsx` 实现自动完成控件与问号说明，支持键盘、Escape 和自由输入
- [x] T015 [P] [US3] 在 `src/client/ui.tsx` 增加自动完成弹层与问号说明的主题样式

## Phase 6: Polish & Cross-cutting

- [x] T016 更新 `README.md` 的面板范围、默认传输、OAuth 字段与客户端备选项说明
- [x] T017 运行 `pnpm format && pnpm check && pnpm build`，修复全部失败
- [x] T018 按 `specs/020-simplify-mcp-panel/quickstart.md` 在实机 GUI 验证并记录结果到 `specs/020-simplify-mcp-panel/real-device-report.md`
- [x] T019 按 restart 入口约定修正 `src/client/index.tsx` 与 `src/client/ui.tsx` 的紧凑 entry、rail 标记和 36×36 触发区，并在 `tests/client.test.ts` 覆盖宽窄栏

## Phase 7: 验收修正

- [x] T020 在 `src/client/ui.tsx` 将弹窗标题设为弹性占位，让关闭图标保持最右侧，并在 `tests/client.test.ts` 覆盖样式
- [x] T021 在 `src/client/ui.tsx` 让客户端备选项向上展开，避免增加表单弹窗整体滚动范围，并在实机验证前后滚动尺寸
- [x] T022 在 `src/client/index.tsx` 使用宿主插件导航打开本插件详情，并在 `plugins.bundle.config` 注册同一面板；更新 `tests/client.test.ts`
- [x] T023 更新 `README.md`、`specs/020-simplify-mcp-panel/quickstart.md` 与实机报告，运行完整检查并复验三项修正

## Phase 8: 行配置页导航

- [x] T024 在 `src/client/index.tsx` 移除包详情面板注册，通过插件页导航 store 直接选择 `better-mcp` 行，并在 `tests/client.test.ts` 覆盖目标页面
- [x] T025 更新 `README.md` 与规格文档，运行检查并实机确认进入行配置页且包详情无重复面板

## Dependencies & Execution Order

- Setup → Foundational → US1 → US2 → US3 → Polish。
- US2 与 US3 共用 `src/client/server-form.tsx`，按顺序执行。
- 每个阶段完成后提交一次；阶段内 `[P]` 任务可并行。

## Parallel Opportunities

- T002 的共享图标可与字典准备并行，但同一代理按文件顺序完成。
- T004 与 T005 使用不同测试文件，可并行。
- T014 与 T015 分别修改表单与样式，可并行。

## Implementation Strategy

先交付 US1 的精简面板，再依次完成表单默认值与 OAuth 客户端备选项。每阶段以对应测试作为验收，最后执行完整质量门禁与实机验证。
