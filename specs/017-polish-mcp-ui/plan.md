# Implementation Plan: MCP 管理界面视觉优化

**Branch**: `fix/017-polish-mcp-ui` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-polish-mcp-ui/spec.md`

## Summary

以 DSH 插件管理页为参照，使用宿主主题变量、分隔式服务器列表、统一控件和独立滚动的表单弹层。保留服务器管理、OAuth、懒加载与配置保存链路，通过单元测试和真实宿主的亮暗主题截图共同验收。

## Technical Context

**Language/Version**: TypeScript 6、React 18.3

**Primary Dependencies**: DSH 0.2.2-rc.3 槽位与字典服务、React DOM、现有插件 API

**Storage**: 沿用现有 `servers` 配置与凭据库

**Testing**: Vitest、Playwright、本机 Chrome、隔离 DSH profile

**Target Platform**: DSH Web 桌面界面

**Performance Goals**: 主题切换即时生效；列表与弹层仅渲染现有快照数据

**Constraints**: 使用 `--dsw-alias-*` 等宿主主题 token；自行实现控件；保留现有客户端模块包装与测试选择器

**Scale/Scope**: 侧栏弹窗与插件详情配置页；服务器列表、反馈区域、新增/编辑与删除确认

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本 — PASS**：沿用 `0.2.2-rc.3` 的锁定依赖，包版本与依赖清单保持现状。
- **II. 测试同步 — PASS**：更新 `tests/client.test.ts` 覆盖语义、状态和校验关联；运行完整测试与真实宿主浏览器用例；包内容测试继续覆盖发布产物。
- **III. 文档结构 — PASS**：`README.md` 记录用户可见的面板行为；界面设计只写入本功能规格目录；实现机制沿用现有开发文档。
- **IV. 质量门禁 — PASS**：实施期间运行 `pnpm format && pnpm check`，交付前运行 `pnpm full-check`。
- **V. 公开引用 — PASS**：跟踪文件只使用仓库相对路径、公网 URL 与占位符；实机截图和日志保留在隔离 profile。

设计后复核：五项均为 PASS，无偏离。

## Project Structure

### Documentation (this feature)

```text
specs/017-polish-mcp-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/client/
├── index.tsx           # 侧栏入口、配置页与焦点返回
├── panel.tsx           # 服务器列表、状态、操作与弹层协调
├── server-form.tsx     # 字段、校验关联与表单内容
├── ui.tsx              # 主题化样式、按钮、开关与弹层
├── api.ts              # 现有面板路由调用
└── locales.ts          # 中英文界面文案
tests/
└── client.test.ts      # 客户端结构、交互语义与样式契约
README.md               # 用户可见的面板行为
```

**Structure Decision**: 在现有客户端目录增加共享 `ui.tsx`，由面板与表单复用宿主风格的控件和样式；宿主状态与路由代码保持现状。
