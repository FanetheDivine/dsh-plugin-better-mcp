# Implementation Plan: 按会话管理 MCP 可见性

**Branch**: `feat/015-mcp-visibility` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-mcp-visibility/spec.md`

## Summary

服务器在插件启用时全部挂载，按会话决定工具是否进入模型的工具集。

- 模型用唯一工具 `mcp_manage` 切换本会话的服务器可见性。
- 插件用 `agent.ctx.tools.restrict({ deny })` 隐藏不可见服务器的工具。
- 插件在 `agent/pre-step` 写入 system-reminder 目录消息，压缩后补写，变化时写更新消息。
- 显式选择记录在目录消息的 `source` 中，经宿主私有的 session projection 读取。
- 删除聚合端点、`mcp_call`、`mcp_servers` 与 `state.json`。
- 服务器定义新增必填 `description`，修正面板与元数据文案。

设计依据见 [research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript 6，Node.js ≥ 24.9

**Primary Dependencies**: 宿主 `@deepseek-ai/dsh-*@0.2.2-rc.3`：`dsh-tools`、`dsh-agent`、`dsh-mcp-manager`、`dsh-credentials`、`dsh-config-editor`、`dsh-host-webserver`、`dsh-session-projection`（新增）、`dsh-session`（新增）、`dsh-llm`（新增）；React 18

**Storage**: profile 插件行配置；DSH 凭据库；会话日志

**Testing**: vitest，`tests/helpers.ts` 模拟 ctx

**Target Platform**: DSH Host（Node.js）与 Web 客户端

**Project Type**: DSH 插件包

**Performance Goals**: 每步的目录检查只做内存比较；限制只在 deny 集合变化时替换

**Constraints**: 宿主依赖保持 external；类型只做 type-only 导入

**Scale/Scope**: 每个 profile 数台到数十台服务器

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 检查 | 结论 |
| --- | --- | --- |
| I. 宿主依赖版本 | 新增 `dsh-session-projection`、`dsh-session`、`dsh-llm` 锁定 `0.2.2-rc.3` 并列入 `minimumReleaseAgeExclude`；删除 `dsh-home-paths` 时同步移除其条目 | 通过 |
| II. 测试同步 | 新增 `tests/visibility.test.ts` 与 `tests/catalog.test.ts`；更新 config、plugin、routes、servers、client、metadata 测试；删除 aggregate、state 测试；package-pack 测试不变 | 通过 |
| III. 文档结构 | README 更新功能、配置、工具；how-it-works 更新运行时与数据流；known-risks 删除聚合端点、新增可见性风险；development 更新文件地图；CHANGELOG 在 push 时补条目 | 通过 |
| IV. 质量门禁 | 每个阶段运行 `pnpm format && pnpm check`，收尾运行 `pnpm build` | 通过 |
| V. 公开引用 | 新增文件只引用仓库内路径 | 通过 |

Phase 1 设计后复核：结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/015-mcp-visibility/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── mcp-manage.md
│   ├── catalog-message.md
│   └── panel-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.ts          # 装配：挂载全部服务器、注册 mcp_manage、可见性运行时、路由
├── config.ts         # 删除 expose；description 必填
├── constants.ts      # 删除端点与令牌常量
├── types.ts          # 新增 agents、sessionProjections 相关类型
├── credentials.ts    # 删除端点令牌
├── servers.ts        # 删除工具执行与连接等待；结构化状态；全部挂载
├── visibility.ts     # 新增：会话可见性、restrict 维护、目录 projection、pre-step 写入
├── catalog.ts        # 新增：目录摘要与消息渲染
├── tools.ts          # 只保留 mcp_manage
├── routes.ts         # 删除端点；lazy 写回配置
├── oauth.ts、utils.ts
└── client/
    ├── panel.tsx         # 删除端点区块；单一标题；状态翻译；外部服务器无操作
    ├── server-form.tsx   # 简介字段与校验；认证选项翻译
    ├── api.ts            # 删除 rotate；新 ServerRow
    └── locales.ts        # 增删键
删除：src/aggregate.ts、src/state.ts、src/home.ts、tests/aggregate.test.ts、tests/state.test.ts
```

**Structure Decision**: 沿用单包结构。可见性逻辑独立成 `visibility.ts`，消息文本独立成 `catalog.ts`，便于单测。

## Complexity Tracking

无违例。
