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

**Purpose**: 快照携带完整鉴权地址，面板改为鉴权行，文案统一为「鉴权」

- [X] T002 在 `src/routes.ts` 的 `currentSnapshot()` 中按 webServer 源为 OAuth 行附加 `authorizeUrl`，并在 `src/servers.ts`、`src/client/api.ts` 声明字段、移除相对地址构造
- [X] T003 [US2] 在 `src/client/panel.tsx` 移除按钮行中的鉴权与重新鉴权控件，在操作行下方新增鉴权行
- [X] T004 [US2] 在 `src/client/ui.tsx` 增加鉴权行样式并删除不再使用的 `LinkButton`
- [X] T005 [US3] 在 `src/client/locales.ts` 替换「授权」文案、移除重新鉴权键、新增鉴权行文案
- [X] T006 [US1] 更新 `tests/client.test.ts` 与 `tests/routes.test.ts`：鉴权行位置与完整地址、已鉴权不显示、快照地址为绝对地址

**Checkpoint**: 面板只渲染链接，宿主负责打开行为

---

## Phase 3: 文档

**Purpose**: 用户可见入口与机制说明同步

- [X] T007 更新 `README.md` 与 `docs/how-it-works.md` 的入口描述，补充桌面端地址要求

**Checkpoint**: 文档与新入口一致

---

## Phase 4: 打包与实机验收

**Purpose**: 产出可安装包并装入 desktop profile

- [ ] T008 运行 `pnpm format`、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm exec tsdown`、`pnpm build:types`，把构建产物装入 desktop profile 供用户实测
