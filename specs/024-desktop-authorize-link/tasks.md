---
description: "桌面端鉴权链接实施任务"
---

# Tasks: 桌面端鉴权链接

**Input**: Design documents from `/specs/024-desktop-authorize-link/`

**Prerequisites**: plan.md, spec.md

**Tests**: 同步更新入口断言；用户要求不运行测试套件。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 固化需求与设计

- [X] T001 完成 `spec.md`、`plan.md` 与需求清单，记录 10 项已确认决策

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 让状态快照携带完整鉴权地址

- [ ] T002 在 `src/routes.ts` 的 `currentSnapshot()` 中按 webServer 源为 OAuth 行附加 `authorizeUrl`，并在 `src/client/api.ts` 的 `ServerRow` 声明可选字段、移除相对地址构造

**Checkpoint**: 桌面端与 web 端的快照都返回同形绝对地址

---

## Phase 3: User Story 1 + 2 - 鉴权入口改造 (Priority: P1)

**Goal**: 鉴权入口从按钮行移到操作行下方，成为文字加完整地址链接

**Independent Test**: 静态渲染待鉴权服务器，断言按钮行无鉴权控件、下方出现 `<a href="http://127.0.0.1:<port>/better-mcp/oauth/start?server=...">`；已鉴权服务器不出现该行

- [ ] T003 [US2] 在 `src/client/panel.tsx` 移除按钮行中的鉴权与重新鉴权控件，新增鉴权行
- [ ] T004 [US2] 在 `src/client/ui.tsx` 增加鉴权行样式并删除不再使用的 `LinkButton`
- [ ] T005 [US1] 更新 `tests/client.test.ts` 的入口断言：按钮行无鉴权、鉴权行位置与完整地址、已鉴权不显示

**Checkpoint**: 面板只渲染链接，宿主负责打开行为

---

## Phase 4: User Story 3 + 4 - 文案与文档 (Priority: P1)

**Goal**: 界面文案统一为「鉴权」，文档同步新入口

- [ ] T006 [US3] 在 `src/client/locales.ts` 替换「授权」文案、移除重新鉴权键、新增鉴权行文案
- [ ] T007 [US4] 更新 `README.md` 与 `docs/how-it-works.md` 的入口描述

**Checkpoint**: 界面与文档不再出现「授权」，web 流程描述保持准确

---

## Phase 5: 打包与实机验收

**Purpose**: 产出可安装包并装入 desktop profile

- [ ] T008 运行 `pnpm format`、`pnpm typecheck`、`pnpm lint`、`pnpm build`，把构建产物装入 desktop profile 供用户实测
