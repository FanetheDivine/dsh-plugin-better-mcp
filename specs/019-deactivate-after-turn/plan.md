# Implementation Plan: Turn 结束后自动停用 MCP

**Branch**: `feat/019-deactivate-after-turn` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-deactivate-after-turn/spec.md`

## Summary

在每个 Agent 的 `turn/end` 持久事件后，将本插件管理的全部服务器设为 inactive。现有目录投影记录 Turn 结束边界，保证下一 Turn 与会话恢复使用同一状态。工具限制立即重算，目录更新延到下一模型步骤，空闲会话不会被唤醒。

## Technical Context

**Language/Version**: TypeScript 6，Node.js 24.9+

**Primary Dependencies**: DSH 0.2.2-rc.3、Cordis 4.1、Vitest 4.1；无新增依赖

**Storage**: 现有会话日志与 `better-mcp-catalog` 会话投影

**Testing**: Vitest 源码测试、类型检查、Biome、构建与产物测试

**Target Platform**: DSH Desktop / CLI 插件宿主

**Project Type**: DSH 插件

**Performance Goals**: 每个 Turn 结束只处理目标 Agent；计算量为服务器数与工具数的线性扫描

**Constraints**: 不新增会话事件类型；不主动发起模型请求；不修改服务器连接或配置；工具限制先于下一 `agent/pre-step` 生效

**Scale/Scope**: `src/visibility.ts`、`src/index.ts`、对应测试与用户/开发文档

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结果 | 核对 |
| --- | --- | --- |
| I. 宿主依赖版本 | PASS | 沿用锁定的 DSH 0.2.2-rc.3，不变更依赖 |
| II. 测试同步 | PASS | 更新 `tests/helpers.ts` 与 `tests/visibility.test.ts`；运行源码、产物与 package-pack 测试 |
| III. 文档结构 | PASS | 用户行为写入 `README.md`；投影与事件机制写入 `docs/how-it-works.md`；推送或合并时维护 CHANGELOG |
| IV. 质量门禁 | PASS | 实施后运行 `pnpm format && pnpm check`，并运行 `pnpm build` |
| V. 公开引用 | PASS | 新文档只使用仓库内相对路径与公开包名 |

设计后复核：五项全部通过，无需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/019-deactivate-after-turn/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 输出
```

本功能不新增外部接口，无需 `contracts/`。

### Source Code (repository root)

```text
src/
├── index.ts             # 订阅 session/event 的 turn/end
└── visibility.ts        # Turn 边界投影、inactive 计算与限制重算

tests/
├── helpers.ts           # 模拟 Turn 结束事件
└── visibility.test.ts   # 重置、隔离、恢复与提醒测试

README.md                # 用户可见行为
docs/how-it-works.md     # 生命周期与投影机制
```

**Structure Decision**: 在现有可见性模块与入口接线中实现，复用当前目录消息、工具限制和测试设施。
