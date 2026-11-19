# Implementation Plan: MCP 状态与会话同步

**Branch**: `fix/018-mcp-state-sync` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-mcp-state-sync/spec.md`

## Summary

共享 MCP 面板增加 1 秒串行状态轮询和快照序号，持续展示异步连接结果。配置对账与可见性变化复用现有目录渲染，通过 `agent.inject()` 写入受影响会话；注入队列与下一步入口共同完成去重和最新目录合并。

## Technical Context

**Language/Version**: TypeScript 6，React 18，Node.js 24.9+

**Primary Dependencies**: 现有 DSH 0.2.2-rc.3 服务、Vitest 4、Biome 2；无新增依赖

**Storage**: 现有会话日志与 Agent 持久化待处理队列；无新增存储

**Testing**: Vitest 源码测试、虚拟计时器、模拟宿主与 Agent、真实 DSH 端到端验证

**Target Platform**: DSH Desktop / Web 插件宿主与浏览器客户端

**Project Type**: 单包 DSH 插件，包含宿主与 React 客户端

**Performance Goals**: 状态变化后 2 秒内显示；轮询间隔 1 秒；自动请求保持串行

**Constraints**: 面板卸载后停止刷新；空闲会话不被唤醒；不新增路由或会话事件类型；保留现有工具限制与目录投影

**Scale/Scope**: 一个面板实例的全部服务器，以及全部在线 Agent 的目录同步

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本**: 通过。沿用锁定的 DSH 0.2.2-rc.3，不修改依赖。
- **II. 测试同步**: 通过。更新面板与可见性测试、模拟 Agent，并按真实宿主流程验证。
- **III. 文档结构**: 通过。README 记录用户行为，工作机制记录刷新与注入流程，已知风险更新持久化时机。
- **IV. 质量门禁**: 通过。实施后运行 `pnpm format && pnpm check`，交付前运行 `pnpm full-check`。
- **V. 公开引用**: 通过。全部产物只使用仓库内相对路径与公网信息。

设计后复核：五项全部通过。复用现有快照、目录消息与宿主队列，没有新增依赖或外部契约。

## Project Structure

### Documentation (this feature)

```text
specs/018-mcp-state-sync/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 输出
```

### Source Code (repository root)

```text
src/
├── index.ts                 # 对账后的在线会话目录注入
├── visibility.ts            # 可见性变化注入、队列去重与步骤合并
├── client/panel.tsx         # 串行轮询、快照序号与卸载清理
tests/
├── helpers.ts               # 模拟 Agent 待处理队列与 inject
├── client.test.ts           # 轮询行为测试
├── visibility.test.ts       # 注入、隔离、去重与连续变化测试
README.md                    # 面板自动刷新和会话提醒行为
docs/
├── how-it-works.md          # 数据流与消息时机
└── known-risks.md           # 注入与持久化边界
```

**Structure Decision**: 沿用单包结构。状态路由、目录格式和公开工具契约保持不变。
