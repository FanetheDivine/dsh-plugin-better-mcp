# Research: 按会话管理 MCP 可见性

宿主版本：`@deepseek-ai/dsh-agent@0.2.2-rc.3`。结论依据安装目录里对应包的 README 与 `src/`。

## R1 按会话隐藏工具

- **Decision**: 用 `agent.ctx.tools.restrict({ deny })` 为每个 Agent 隐藏不可见服务器的工具。deny 列表取当前全局工具里前缀为 `mcp__<server>__` 的名称。
- **Rationale**:
  - `restrict` 作用于调用方 Agent 的作用域，被拒绝的工具既不进入 schema，也不可执行。
  - Agent 作用域的父级是 preset generation，子代理与父 Agent 互不继承限制。
  - `restrict` 只接受已注册的全局工具名，deny 列表必须按当前工具表实时计算。
- **Alternatives considered**:
  - `tools/pre-execute` 拒绝调用：schema 仍然出现在请求里。
  - 为可见服务器注册代理工具：与原生工具重名，仍需隐藏原生工具。
  - 卸载服务器：影响所有会话，与「服务器始终挂载」冲突。

## R2 限制的更新时机

- **Decision**: 在以下时刻重算并替换 Agent 的限制：
  - `agent/created`：Agent 创建或恢复后、处理输入前。
  - 插件启用时：遍历 `ctx.agents.list()`。
  - `mcp_manage` 执行时：立即更新调用方 Agent。
  - `tools/change`：服务器工具增减后更新所有 Agent。
  - 配置对账后：懒加载默认值或服务器集合变化。
- **Rationale**: agent-loop 在 `agent/pre-step` 之前调用 `tools.resolve()`，在 pre-step 里更新限制会晚一步。
- **Constraint**: 插件自己的 `restrict` 也触发 `tools/change`。deny 集合不变时跳过，避免循环。

## R3 显式选择的持久化

- **Decision**: 目录消息的 `source` 记录会话的显式选择。插件注册一个宿主私有的 session projection，折叠最近一条目录消息的显式选择与 seq。`mcp_manage` 先写入内存待定表，下一步的目录消息把它落入日志。
- **Rationale**:
  - 会话日志是宿主的持久事实源，恢复与 fork 时随日志带走。
  - `session.eventAt()` 与 `snapshotEvents()` 已弃用，projection 是推荐的读取方式。
- **Alternatives considered**: 按会话写 `state.json`。会话删除、fork 时不同步。

## R4 目录消息的写入与补写

- **Decision**: 在 `agent/pre-step` 的 `next()` 之后，向 `decision.messages` 追加一条 user 角色消息，正文以 `<system-reminder>` 包裹。
  - 当前目录的摘要等于最近一条目录消息的摘要，且该消息的 seq 在 `agent.session.surface.nodes` 中：不写。
  - 最近一条目录消息不在 surface 中：写完整目录。
  - 摘要变化且旧消息可见：写更新消息，列出变为可见与不可见的服务器，附完整目录。
  - 没有服务器且会话从未发布过目录：不写。
- **Rationale**: 与 `dsh-tool-skill` 的技能目录一致。压缩会把旧消息移出 surface，下一步自动补写。
- **Message form**: 消息对象按 `UserMessage` 结构直接构造（`id`、`role`、`content`、`source`）并冻结，不在运行时导入 `dsh-llm`。

## R5 懒加载语义

- **Decision**: 所有服务器在启用时挂载。`lazy` 只决定会话的默认可见性：`true` 为不可见。面板的懒加载开关写回配置的 `lazy`。删除 `state.json`、`state.ts` 与 `home.ts`。
- **Rationale**: 用户澄清「lazy 就是默认不可见」「mcp 始终挂载」。

## R6 服务器简介

- **Decision**: `ServerDefinition.description` 为必填非空字符串。交给 `mcpManager.register` 前去掉 `description`、`lazy`、`auth`、`oauth`。
- **Rationale**: 管理器按自己的 schema 校验条目，插件字段不能透传。

## R7 移除聚合端点

- **Decision**: 删除 `aggregate.ts`、`expose` 配置、端点令牌、`/api/better-mcp/endpoint/rotate`、面板端点区块、`mcp_call`、`mcp_servers`。`webServer` 只保留 OAuth 回调路由。

## R8 面板文案

- **Decision**: 服务器行改为返回结构化状态字段，由前端按字典格式化：状态名、连接时间、重试次数、工具数、清理结果。`lastError` 原样显示。
- **Rationale**: 宿主错误文本没有翻译键，状态名与计数可以翻译。

## R9 新增宿主类型依赖

| 包 | 归属 | 用途 |
| --- | --- | --- |
| `@deepseek-ai/dsh-session-projection` | 宿主提供 | `ctx.sessionProjections` 类型 |
| `@deepseek-ai/dsh-session` | 宿主提供 | `SessionEvent` 类型 |
| `@deepseek-ai/dsh-llm` | 宿主提供 | `UserMessage` 与 `MessageSourceMap` 类型 |

三者都只做 type-only 导入，锁定 `0.2.2-rc.3` 并列入 `minimumReleaseAgeExclude`。`@deepseek-ai/dsh-home-paths` 随 `home.ts` 删除。

projection 的 `stateSchema` 只需要 `parse()`，插件用手写对象实现，不引入运行时 zod。
