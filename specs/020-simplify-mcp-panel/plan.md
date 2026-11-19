# Implementation Plan: 精简 MCP 管理面板

**Branch**: `feat/020-simplify-mcp-panel` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-simplify-mcp-panel/spec.md`

## Summary

收窄面板为本插件配置管理，精简列表与表单。快照只遍历配置项；前端移除刷新、来源标记和行图标；表单默认 stdio，HTTP 固定 OAuth；客户端标识使用可自由输入的自动完成控件，提供 DSH 动态注册与 Codex 公开标识两个备选项。

## Technical Context

**Language/Version**: TypeScript 6、React 18、Node.js 24

**Primary Dependencies**: DSH 0.2.2-rc.3 客户端槽位与 MCP 管理器、项目内共享控件

**Storage**: 现有 volatile 配置与 DSH 凭据库

**Testing**: Vitest、静态渲染、Playwright 实机验证

**Target Platform**: DSH Web GUI

**Project Type**: DSH 插件，宿主端与浏览器端同包

**Performance Goals**: 保留 1 秒状态轮询，变化后 2 秒内可见

**Constraints**: 中英文键集一致；不引入新 UI 依赖；不改变授权、可见性与凭据存储机制

**Scale/Scope**: 面板、服务器表单、侧栏入口、包图标、快照与对应测试和文档

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I 宿主依赖版本**: 通过。沿用现有 DSH 0.2.2-rc.3 依赖，不调整版本。
- **II 测试同步**: 通过。更新快照、表单、静态渲染与字典测试；增加自动完成实机验证。
- **III 文档结构**: 通过。用户可见行为写入 README，规格与设计只放在本功能目录。
- **IV 质量门禁**: 通过。实现后运行 `pnpm format && pnpm check`，再运行构建与实机验证。
- **V 公开引用**: 通过。图标来源使用公网仓库地址，文档不写本机路径。

设计后复查：五项全部通过。

## Project Structure

### Documentation (this feature)

```text
specs/020-simplify-mcp-panel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── panel.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── servers.ts             # 只生成配置内服务器快照
└── client/
    ├── index.tsx          # 图标侧栏入口
    ├── locales.ts         # 中英文文案
    ├── panel.tsx          # 标题、按钮与服务器行
    ├── server-form.tsx    # stdio 默认值与 OAuth 表单
    └── ui.tsx             # 共享 MCP 图标与自动完成样式
icon.svg                   # 插件包 MCP 图标
tests/
├── client.test.ts
└── servers.test.ts
README.md
```

**Structure Decision**: 在现有客户端组件与服务器管理器内修改，复用面板路由、配置写入和授权流程。

## Complexity Tracking

无。
