# Implementation Plan: OAuth 授权与待授权提示

**Branch**: `fix/022-oauth-authorization-ui` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-oauth-authorization-ui/spec.md`

## Summary

修复 Figma 对 OpenAI 固定客户端标识的误用，Figma 改用 `Codex` 动态客户端注册。配置面板把授权操作改为高亮 `<a target="_blank">`，由新增 Web 启动路由重定向到授权服务器。会话目录排除未授权 OAuth 服务器，授权成功后立即向在线 Agent 注入更新提醒。侧边栏读取同一授权状态，在待授权时显示警告色与阴影呼吸动效，并支持减少动态效果偏好。

## Technical Context

**Language/Version**: TypeScript 6.0，Node.js 24.9+

**Primary Dependencies**: React 18、Cordis、DSH 0.2.2-rc.3 项目基线、Vitest 4、tsdown、Biome

**Storage**: 沿用 DSH 凭据库与 profile 配置；本次无新增存储结构

**Testing**: Vitest 源码测试与产物测试、静态 React 渲染、真实 DSH Desktop 与 Chrome 验证

**Target Platform**: DSH Desktop / Web 客户端，Node.js 宿主进程

**Project Type**: DSH 双端插件

**Performance Goals**: 授权状态每秒串行刷新；轮询不重叠；组件卸载后停止

**Constraints**: 授权使用标准链接与 DSH 默认外链行为；不新增依赖；样式使用宿主主题变量；减少动态效果时停用持续动画

**Scale/Scope**: `src/routes.ts`、授权快照、会话目录与客户端入口、面板、表单、样式及相关测试和文档

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本：PASS**。保持所有 `@deepseek-ai/*` 版本与 `pnpm-workspace.yaml` 不变。
- **II. 测试同步：PASS**。路由、Figma 注册、链接、侧边栏状态和动效均新增真实行为测试；构建后运行 package-pack 等产物回归；执行真实宿主验证。
- **III. 文档结构：PASS**。用户行为写入 README 与 CHANGELOG；机制和风险分别写入对应 docs；规格仅保留在 `specs/`。
- **IV. 质量门禁：PASS**。实施后运行 `pnpm format && pnpm check`，交付前运行 `pnpm full-check`。
- **V. 公开引用：PASS**。新增引用均为公网 URL 或仓库内路径。

## Project Structure

### Documentation (this feature)

```text
specs/022-oauth-authorization-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── oauth-start.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── constants.ts            # OAuth 启动与回调路径
├── routes.ts               # Figma 注册、授权启动、302 与回调
└── client/
    ├── api.ts              # 状态读取与授权链接地址
    ├── index.tsx           # 侧边栏待授权状态
    ├── locales.ts          # 当前客户端配置文案
    ├── panel.tsx           # 高亮授权链接
    ├── server-form.tsx     # 动态注册与自定义客户端输入
    └── ui.tsx              # 链接、图标与减少动效样式

tests/
├── client.test.ts          # 链接、状态、样式与表单行为
├── plugin.test.ts          # Web 路由注册
├── routes.test.ts          # Figma DCR、302、错误与回调
└── package-pack.test.ts    # 发布内容回归
```

**Structure Decision**: 沿用单包宿主与客户端结构。授权启动逻辑在宿主路由内复用；前端只持有链接地址和状态，不复制 OAuth 协议逻辑。

## Constitution Check After Design

- **I–V：PASS**。设计未引入依赖、存储、文档归属或公开引用偏离，测试覆盖所有新增行为。

## Complexity Tracking

无偏离。
