# Implementation Plan: Workspace 级 MCP 实例

**Branch**: `feat/025-workspace-mcp` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-workspace-mcp/spec.md`

**Status**: Approved

## Open Decisions

<!--
Status values:
- Draft: the current full document is not approved or waived.
- Approved: the user approved the current full document.
- Waived: the user waived the review and accepted the recorded risks.
Record each undecided question with a stable id and its dependencies.
-->
- 无。

## Clarifications

### Session 2026-11-20

- [D-101] Q: 目标宿主版本是否升级为当前实机的 `0.2.2-rc.5`？ -> A: 全部宿主依赖同步升级到 rc.5，新增直接依赖使用相同版本。
- [D-102] Q: 工作区级开关使用什么配置字段？ -> A: `workspace: boolean`，默认 `false`。
- [D-103] Q: 是否注入工作区路径环境变量？ -> A: 不注入；cwd 已足够。该回答触发完整规格重新审查。
- [D-104] Q: 面板如何呈现多个工作区实例？ -> A: 任一实例已连接时主行显示“已连接”；下方仅显示失败工作区信息，并可折叠为“查看报错”。该回答触发完整规格重新审查。
- [D-105] Q: 工作区切换时实例准备失败是否阻止切换？ -> A: 允许切换并保留实例错误；每个失败工作区提供“重连”按钮。
- [D-106] Q: 对宿主已做有损规范化的工具名，首版如何处理？ -> A: 使用宿主生成的名称，普通名称仅替换服务器前缀；这不列为已知风险。
- [D-107] Q: 工作区级配置如何重连？ -> A: 主行提供“全部重连”，每个工作区可单独重连，工作区名称可搜索。
- [D-108] 探索结论：active 注册后使用 MCP Manager 的实时状态订阅等待当前 generation 连接成功；成功前不开放代理，最终失败或取消时释放 active 引用并恢复 inactive。

## Review Record

- 2026-11-20 | Decision: Approved | Scope: current full document and design artifacts | Open items: none | Risks: 等待期间取消与共享实例释放

- 2026-11-20 | Decision: Changes requested | Scope: active 等待 connected 并处理失败 | Open items: none | Risks: 等待期间取消与共享实例释放

- 2026-11-20 | Decision: Approved | Scope: current full document and design artifacts | Open items: none | Risks: 共享代理复杂度；清理超时；其他进程占用目录；resources/instructions 宿主接口耦合

## Summary

为现有服务器定义增加可选的工作区级行为。工作区级 stdio 服务器固定懒加载，模型 active 时才建立所属工作区实例，并等待连接成功后开放工具。inactive 时隐藏当前 Agent 工具，并在无其他 active Agent 时关闭共享实例。实例以所属工作区为 `cwd`。Agent 侧路由保持既有工具名，并隔离工具、状态、MCP instructions 与 resources。目录切换和文件夹缺失触发关闭屏障与占用提醒；Agent 释放本身保留实例。共享服务器继续使用现有挂载路径。

## Technical Context

**Language/Version**: TypeScript 6，Node.js 24.9+，ESM 宿主插件与 React 18 浏览器面板。

**Primary Dependencies**: Cordis、DSH Agent、MCP Manager、Tools、Session、Working Directory、System Prompt 与 MCP Resources 服务。

**Storage**: 服务器开关写入现有 profile 配置；工作区绑定、实例、Agent 引用和限制保存在内存。无新增持久数据库。

**Testing**: Vitest 源码测试与产物测试；`tests/helpers.ts` 模拟宿主；真实 DSH profile 中的并行工作区端到端验证。

**Target Platform**: DSH Desktop/Web `0.2.2-rc.5`。全部直接 `@deepseek-ai/dsh-*` 依赖锁定到 rc.5。

**Project Type**: 单包 DSH 插件，包含宿主运行时与浏览器客户端。

**Performance Goals**: 三个工作区各至少 20 次并行调用均路由到正确实例；重复事件不重复创建实例；无变化的限制不重复注册。

**Constraints**: 仅 stdio 支持工作区级；同一工作区跨 Agent 共享；active 等待连接成功，inactive 在无其他 active Agent 时断连；公开工具名保持 `mcp__<server>__<tool>`；宿主全局 MCP 名称唯一；配置严格校验并保持向后兼容。

**Scale/Scope**: 修改配置、宿主实例管理、工作区绑定、Agent 工具与上下文隔离、面板状态、测试、文档和实机验证。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本：通过**。所有宿主依赖必须锁定到同一发布；新增依赖同步加入 `minimumReleaseAgeExclude`。
- **II. 测试同步：通过**。每项运行行为同步增加真实行为测试；单元测试复用 `tests/helpers.ts`；保留 package-pack 回归；执行真实宿主端到端验证。
- **III. 文档结构：通过**。用户功能更新 `README.md`；配置字段归入 `docs/configuration.md`；机制、风险与文件地图归入对应开发文档；CHANGELOG 在交付阶段更新。
- **IV. 质量门禁：通过**。文件变更后运行 `pnpm format && pnpm check`，交付前运行 `pnpm full-check`。
- **V. 公开引用：通过**。规格与代码仅使用仓库相对路径、公网 URL 或占位符。
- **结论：无宪章偏离，Complexity Tracking 保留为空。**

## Project Structure

### Documentation (this feature)

```text
specs/025-workspace-mcp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── workspace-api.md
└── tasks.md             # /speckit-tasks 生成
```

### Source Code (repository root)

```text
src/
├── index.ts                    # 装配工作区运行时与宿主钩子
├── config.ts                   # workspace 字段与严格校验
├── servers.ts                  # 共享实例、工作区状态与重连接口
├── visibility.ts               # lazy 限制与 Agent 代理同步
├── workspace-names.ts          # 工作区键、内部名与公开名
├── workspace-pool.ts           # 工作区实例、引用与配置对账
├── workspace-bindings.ts       # Agent 与目录切换绑定
├── workspace-notices.ts        # active/inactive/关闭结果提醒
├── workspace-proxy.ts          # 代理定义、差异同步与执行保护
├── workspace-presentation.ts   # instructions 与资源提示过滤
├── workspace-resources.ts      # Agent-local provider 与资源守卫
├── tools.ts                    # mcp_manage 当前工作区状态
├── routes.ts                   # 工作区实例面板 API
└── client/
    ├── api.ts                  # 实例类型与重连参数
    ├── panel.tsx               # 配置主行与工作区实例行
    ├── server-form.tsx         # 工作区开关与帮助
    └── locales.ts              # 中英文文案

tests/
├── helpers.ts                  # workingDirectory、definitions、资源与提示模拟
├── workspace-pool.test.ts       # 实例、引用、并发与对账
├── workspace-notices.test.ts    # 占用、关闭与缺失提醒
├── workspace-proxy.test.ts      # 名称、代理、换代与执行保护
├── workspace-resources.test.ts  # 资源转发与调用守卫
├── workspace-bindings.test.ts   # 创建、切换、回滚与释放
├── config.test.ts              # 新字段与兼容
├── servers.test.ts             # 状态与重连
├── routes.test.ts              # 面板 API
├── client.test.ts              # 开关、实例状态与字典
└── plugin.test.ts              # 宿主接线与卸载
```

**Structure Decision**: 保留单包结构。共享服务器沿用现有管理路径；工作区能力按名称、实例池、绑定、代理、提示与资源分模块，入口只负责装配。

## Complexity Tracking

无宪章偏离。
