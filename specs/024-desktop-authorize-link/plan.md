# Implementation Plan: 桌面端鉴权链接

**Branch**: `fix/024-desktop-authorize-link` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-desktop-authorize-link/spec.md`

## Summary

桌面宿主只把 `http:`/`https:` 窗口请求交给系统浏览器，面板当前用同源相对地址，在 `dsh-app://app/` 下被解析成 `dsh-app://app/better-mcp/oauth/start?...`，宿主直接拒绝。方案：状态快照为 OAuth 服务器提供完整鉴权地址；面板移除按钮行中的鉴权操作，改为操作行下方一行「点击鉴权 + 完整地址链接」，字号同简介、颜色用宿主警告色；界面文案统一为「鉴权」。

## Technical Context

**Language/Version**: TypeScript 6.0，Node.js 24.9+

**Primary Dependencies**: React 18、Cordis、DSH 0.2.2-rc.3 项目基线、Vitest 4、tsdown、Biome

**Storage**: 无新增存储；沿用 profile 配置与凭据库

**Testing**: 更新源码测试断言；用户免除测试运行

**Target Platform**: DSH Desktop / Web 客户端

**Project Type**: DSH 双端插件

**Constraints**: 鉴权入口保持 a 标签与宿主默认外链行为；地址为完整绝对地址；不新增依赖；样式使用宿主主题变量

**Scale/Scope**: `src/routes.ts`、`src/client/panel.tsx`、`src/client/api.ts`、`src/client/locales.ts`、`src/client/ui.tsx`、`tests/client.test.ts`、`README.md`、`docs/how-it-works.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本：PASS**。不修改任何 `@deepseek-ai/*` 依赖。
- **II. 测试同步：PASS**。同步更新 `tests/client.test.ts` 的入口断言；用户要求不运行测试，构建时仍执行 `test:dist`。
- **III. 文档结构：PASS**。README 更新用户可见入口；`docs/how-it-works.md` 更新机制说明；CHANGELOG 在推送前补充。
- **IV. 质量门禁：PASS（偏离已记录）**。运行 `pnpm format`、`pnpm typecheck`、`pnpm lint` 与 `pnpm build`；按用户要求不运行测试套件。
- **V. 公开引用：PASS**。新增示例地址使用 `http://127.0.0.1:<port>` 占位。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| 跳过 `pnpm check` 与测试运行 | 用户明确要求改好后不测试，直接打包实测 | 测试套件覆盖不到桌面宿主外链行为 |

## Project Structure

### Documentation (this feature)

```text
specs/024-desktop-authorize-link/
├── plan.md
├── spec.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── constants.ts            # 已有鉴权启动路由常量
├── routes.ts               # 快照附加完整鉴权地址
└── client/
    ├── api.ts              # ServerRow 增加 authorizeUrl
    ├── panel.tsx           # 移除按钮行鉴权，新增鉴权行
    ├── locales.ts          # 文案改「鉴权」
    └── ui.tsx              # 鉴权行样式
tests/client.test.ts        # 入口断言同步
README.md                   # 用户可见入口描述
docs/how-it-works.md        # 机制说明
```

## Design

- 服务端：`currentSnapshot()` 用 `originOf(null)` 取 webServer 当前源，为 `auth === 'oauth'` 的行附加 `authorizeUrl = <origin>/better-mcp/oauth/start?server=<name>`。桌面端与 web 端得到同形绝对地址。
- 客户端：`ServerRow.authorizeUrl` 可选；待鉴权且存在地址时渲染 `<p class="better-mcp-auth-line">点击鉴权 <a href={authorizeUrl} target="_blank" rel="noreferrer">{authorizeUrl}</a></p>`，位置在 `.better-mcp-actions` 之后。
- 已鉴权不渲染该行；重新登录走退出登录。
- 样式：字号与行高取 `.better-mcp-description`，颜色 `var(--dsw-alias-state-warn-primary)`，链接继承颜色并换行。
