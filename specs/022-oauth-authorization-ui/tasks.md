---
description: "OAuth 授权与待授权提示实施任务"
---

# Tasks: OAuth 授权与待授权提示

**Input**: Design documents from `/specs/022-oauth-authorization-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/oauth-start.md

**Tests**: 宪章要求代码与测试同步。各故事先写行为测试，再实现。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 固化需求、设计与验收契约

- [X] T001 完成并校验 `specs/022-oauth-authorization-ui/spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/oauth-start.md` 与 `quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立 Figma 修复和直接链接共用的授权启动入口

- [X] T002 在 `src/constants.ts` 定义授权启动 Web 路径，并在 `src/routes.ts` 提取可按服务器名与来源启动 OAuth 的共用逻辑，保持现有 JSON 路由测试通过

**Checkpoint**: 共用授权启动逻辑可供 Figma 修复与 Web 重定向共同使用

---

## Phase 3: User Story 1 - 完成 Figma 授权 (Priority: P1) 🎯 MVP

**Goal**: Figma 官方 MCP 使用受支持的动态注册客户端完成授权

**Independent Test**: 对含旧 `app_` 配置的 Figma 启动授权，断言注册名为 `Codex`，授权地址使用动态注册返回的客户端标识

### Tests for User Story 1

- [X] T003 [P] [US1] 在 `tests/routes.test.ts` 覆盖 Figma 官方地址的 DCR 注册名、旧 `app_` 标识兼容、动态 client_id 与显式自定义客户端保留
- [X] T004 [P] [US1] 在 `tests/client.test.ts` 覆盖客户端表单仅提供 DSH 动态注册与自由输入，不再输出 Codex 固定 `app_` 备选项

### Implementation for User Story 1

- [X] T005 [US1] 在 `src/routes.ts` 对 `https://mcp.figma.com/mcp` 使用 `client_name: Codex` 动态注册，并仅在 Figma 场景忽略 `app_EMoamEEZ73f0CkXaXp7hrann`
- [X] T006 [US1] 在 `src/client/server-form.tsx` 与 `src/client/locales.ts` 移除 Codex 固定标识备选项，保留动态注册和自由输入说明

**Checkpoint**: Figma 启动授权不再把 OpenAI 固定标识发送给 Figma

---

## Phase 4: User Story 2 - 从配置面板直接授权 (Priority: P1)

**Goal**: 配置面板通过高亮标准链接和 DSH 默认外链行为直接授权

**Independent Test**: 静态渲染含 `<a href="/better-mcp/oauth/start?server=..." target="_blank">`；Web 路由返回授权服务器 302；代码不再调用 `window.open`

### Tests for User Story 2

- [X] T007 [P] [US2] 在 `tests/routes.test.ts` 与 `tests/plugin.test.ts` 覆盖启动 Web 路由注册、302 Location、400/502 错误页与回调路由共存
- [X] T008 [P] [US2] 在 `tests/client.test.ts` 覆盖授权链接语义、URL 编码、待授权高亮、重新授权次要样式和键盘可聚焦性

### Implementation for User Story 2

- [X] T009 [US2] 在 `src/routes.ts` 注册 `GET /better-mcp/oauth/start`，成功返回 302 与 `Cache-Control: no-store`，失败返回含原始原因的 HTML 错误页
- [X] T010 [US2] 在 `src/client/panel.tsx`、`src/client/api.ts` 与 `src/client/ui.tsx` 用高亮 `<a target="_blank" rel="noreferrer">` 替代授权按钮和 `window.open` 流程

**Checkpoint**: 点击一次授权链接即可由 DSH 默认行为打开有效授权页

---

## Phase 5: User Story 3 - 会话目录仅列出可用服务器 (Priority: P1)

**Goal**: 未授权 OAuth 服务器从会话目录排除，授权成功立即注入更新提醒

**Independent Test**: `entriesOf` 排除未授权 OAuth、保留 stdio；授权完成后在线 Agent 收到包含新服务器的目录消息

### Tests for User Story 3

- [X] T011 [P] [US3] 在 `tests/visibility.test.ts` 覆盖未授权过滤、授权后目录出现、退出后移除、stdio 保持与多 Agent 即时提醒；在 `tests/routes.test.ts` 覆盖授权完成触发目录通知

### Implementation for User Story 3

- [X] T012 [US3] 在 `src/servers.ts` 维护授权状态内存快照，在 `src/visibility.ts` 按快照过滤目录，并在 `src/index.ts` 与 `src/routes.ts` 授权完成时同步和 `notifyAll()`

**Checkpoint**: 未授权服务器不进入任何新目录提醒，授权成功后在线 Agent 立即收到一条新提醒

---

## Phase 6: User Story 4 - 识别待授权服务器 (Priority: P2)

**Goal**: 侧边栏实时显示全局待授权状态

**Independent Test**: 部分待授权时图标有高亮数据状态和阴影关键帧；全部已授权时恢复；减少动态效果时动画关闭

### Tests for User Story 4

- [X] T013 [P] [US4] 在 `tests/client.test.ts` 覆盖待授权汇总、侧边栏数据状态、多服务器部分授权、警告色、阴影呼吸和 `prefers-reduced-motion`

### Implementation for User Story 4

- [X] T014 [US4] 在 `src/client/index.tsx` 为侧边栏接入串行状态轮询与卸载清理，在 `src/client/ui.tsx` 添加警告高亮和阴影呼吸样式

**Checkpoint**: 配置面板与侧边栏使用相同待授权条件，授权完成后提示停止

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档、质量门禁、UX 与真实宿主验收

- [X] T015 [P] 更新 `README.md`、`CHANGELOG.md`、`docs/how-it-works.md` 与 `docs/known-risks.md`，记录 Figma 动态注册、直接授权链接、目录过滤与待授权提示
- [X] T016 运行 `pnpm format && pnpm check && pnpm build`，修复全部失败并核对 `tests/package-pack.test.ts` 等发布回归
- [X] T017 按 `specs/022-oauth-authorization-ui/quickstart.md` 完成一次 UI/UX 子代理评审和真实 DSH Desktop 验证，将结果写入 `specs/022-oauth-authorization-ui/validation.md`
- [X] T018 审查 `git diff`、任务完成度与阶段提交，确认 `specs/022-oauth-authorization-ui/spec.md` 的全部验收场景都有验证结果

---

## Phase 8: Dynamic Loopback Callback

- [X] T019 在 `src/routes.ts` 与 `tests/routes.test.ts` 使用 `127.0.0.1:0/callback`，验证系统分配端口及注册、授权、换码地址一致
- [X] T020 新建预置 Figma 的 Web profile 并更新 `specs/022-oauth-authorization-ui/validation.md`，交由用户完成账号授权验收

---

## Phase 9: Acceptance Feedback

- [X] T021 在 `src/routes.ts` 与 `tests/routes.test.ts` 让成功回调页调用 `window.close()`，失败页保留错误信息
- [X] T022 在 `src/config.ts`、`src/client/server-form.tsx` 与 `src/client/locales.ts` 增加 DSH/Codex 动态注册身份，默认 Codex，并实现选项说明与 DSH 帮助提示
- [X] T023 在 `src/client/ui.tsx` 将呼吸投影应用到 SVG 图标，保持按钮背景透明并覆盖减少动效测试
- [X] T024 在新 Web profile 实测身份选择、DSH tooltip、SVG 投影与 Chrome 成功页自动关闭，更新验证报告

---

## Phase 10: Compact Status UI

- [X] T025 在 `src/client/server-form.tsx` 与 `src/client/ui.tsx` 保留帮助圆圈，选择 DSH 或点击圆圈时展开浮窗，支持外部点击与 Escape 关闭
- [X] T026 在 `src/client/ui.tsx` 为侧栏 SVG 增加主题前景色到警告橙色的颜色过渡并增强投影
- [X] T027 在 `src/client/panel.tsx` 合并四类状态标签，将懒加载开关紧随标签并更新测试
- [X] T028 保持当前 Web profile 运行，更新已安装插件并完成真实页面回归

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup → Foundational → US1 → US2 → US3 → US4 → Polish**。
- 每个阶段完成后提交一个 commit。
- US1 与 US2 共用 Phase 2 的授权启动逻辑，按顺序实施以避免路由冲突。

### User Story Dependencies

- **US1**: 仅依赖共用授权启动逻辑，可独立验证 Figma DCR。
- **US2**: 复用 US1 修正后的授权启动行为，独立验证链接与 302。
- **US3**: 使用服务器授权快照和授权完成事件，独立验证目录过滤与即时提醒。
- **US4**: 使用现有状态快照，独立验证侧边栏视觉状态。

### Parallel Opportunities

- T003 与 T004 修改不同测试文件，可并行。
- T007 与 T008 修改不同测试文件，可并行。
- T015 的文档编辑可与只读评审准备并行。

## Parallel Example: User Story 1

```text
Task: "T003 在 tests/routes.test.ts 覆盖 Figma DCR"
Task: "T004 在 tests/client.test.ts 覆盖客户端表单备选项"
```

## Parallel Example: User Story 2

```text
Task: "T007 在 tests/routes.test.ts 与 tests/plugin.test.ts 覆盖 Web 路由"
Task: "T008 在 tests/client.test.ts 覆盖授权链接"
```

## Implementation Strategy

1. 先提交规格与共用授权启动逻辑。
2. 完成 US1，验证 Figma 动态注册，形成 MVP。
3. 完成 US2，验证真实 `<a>` 与 302 直接导航。
4. 完成 US3，验证目录过滤与授权后即时提醒。
5. 完成 US4，验证全局待授权提示与减少动效。
6. 完成文档、全量检查、UX 评审和真实宿主验收。

## Notes

- [P] 任务使用不同文件或无未完成依赖。
- 每个故事先写测试并确认失败，再实现。
- 每个阶段对应一个 commit。
