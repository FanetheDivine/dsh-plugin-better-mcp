# Implementation Plan: Better MCP 插件

**Branch**: `feat/012-port-better-mcp` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-port-better-mcp/spec.md`

## Summary

把模板改造成 `dsh-plugin-better-mcp`：按服务器懒加载、可视化 OAuth、聚合 MCP 端点、侧栏与插件页双入口的管理面板，以及运行期增删改服务器。宿主侧沿用参照实现的协议行为，按模板的 TypeScript 结构重写；配置写回 profile 用户层，令牌与客户端密钥存 DSH 凭据库。

## Technical Context

**Language/Version**: TypeScript 6，ESM；宿主产物 Node >= 24.9，浏览器产物为宿主闭包工厂。

**Primary Dependencies**: `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`、`zod`、`@deepseek-ai/dsh-mcp-manager`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-home-paths`、`@deepseek-ai/dsh-config-editor`、`@deepseek-ai/dsh-host-webserver`（类型）、`@deepseek-ai/dsh-client-ui-sidebar`（类型）。

**Storage**: 服务器定义存 profile 插件行配置；懒加载开关存 `<dsh home>/plugin-data/better-mcp/state.json`；授权、客户端密钥与聚合令牌存 DSH 凭据库。

**Testing**: vitest 单元测试（模拟 `ctx`、`react-dom/server` 渲染、直接调用 HTTP 处理器）；`.dsh/skills/real-device-test` 脚本在专用 profile 做宿主端到端验证；`tests/package-pack.test.ts` 回归发布内容。

**Target Platform**: DSH 0.2.2-rc.3 Desktop（Windows/macOS/Linux）与同源 Web GUI；没有 Web 载体的 headless 宿主只提供工具能力。

**Project Type**: DSH 插件（宿主半 + Web 客户端半）。

**Performance Goals**: 首次 `mcp_call` 在 25 秒内完成挂载；面板操作后 2 秒内看到新状态；`tools/list` 在 200 个工具内 1 秒内返回。

**Constraints**: 配置文件、状态文件与日志不出现令牌或客户端密钥；聚合端点只监听本机 Web 端口；插件不重写 profile 补丁；跟踪文件只含公开引用。

**Scale/Scope**: 每 profile 10–20 台 MCP 服务器；每组工具上限约 200 个；单次 JSON-RPC 批量最多 20 条。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结论 | 依据 |
| --- | --- | --- |
| I. 宿主契约 | 通过 | `src/index.ts` 只导出 `name`、`inject`、`apply`、`Config`；`name` 与补丁行 id 一致；宿主类型经 `src/types.ts` 以 type-only 引入。 |
| II. 依赖归属 | 通过 | 新增 `@deepseek-ai/dsh-*` 全部放 `devDependencies` 并保持 external；`zod`、`schemastery` 用宿主实例；无宿主未提供的运行时依赖；同步更新 `pnpm-workspace.yaml`。 |
| III. 严格配置 | 通过 | `resolveConfig` 是 `apply` 第一步；未知顶层键、非法服务器名、缺字段与非法传输参数抛错；结果冻结。 |
| IV. 测试同步 | 通过 | 每个模块新增单元测试；发布内容由 package-pack 回归；宿主装载与面板在真实 profile 上端到端验证。 |
| V. 文档结构 | 通过 | README（用户）、AGENTS（Agent）、宪章（硬约束）、docs（机制/风险/开发）、代码注释各归其位；行为变化同步 README。 |
| VI. 质量门禁 | 通过 | 每阶段运行 `pnpm format && pnpm check`；合并前通过 `pnpm check`。 |
| VII. 模板定位 | 通过（转化） | 本需求即模板转化：重写宪章与 AGENTS、更新包名/README/补丁、版本 0.1.0、清空旧 spec 与 changelog、恢复发布 job、提示 Trusted Publisher；转化完成后删除原则 VII 并升 MAJOR 版本。 |
| VIII. 公开引用 | 通过 | 示例与文档不含本机盘符路径、凭据或仓库外相对路径；运行时说明用 `127.0.0.1:<port>` 占位。 |

无违反项，Complexity Tracking 留空。

Phase 1 复核：设计产物确认依赖归属、严格配置、测试与文档约束均未变化，无需记录偏离。

## Project Structure

### Documentation (this feature)

```text
specs/012-port-better-mcp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api.md
│   ├── config.md
│   ├── mcp-endpoint.md
│   ├── tools.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.ts            # 导出 name、inject、apply、Config；装配与热更新协调
├── config.ts           # Config schema、默认值、严格校验、服务器定义规范化
├── constants.ts        # 插件名、路径、令牌引用、超时与批量上限
├── types.ts            # 宿主类型再导出与本地路由/状态类型
├── utils.ts            # isRecord、字符串读取、JSON 响应、glob 与名称校验
├── state.ts            # 懒加载状态持久化
├── credentials.ts      # 授权记录、客户端密钥、聚合令牌
├── oauth.ts            # 发现、动态注册、PKCE、换取与刷新令牌
├── aggregate.ts        # 无状态 MCP Streamable HTTP JSON-RPC 处理器
├── servers.ts          # 挂载/卸载/重连/对账、连接等待、工具名解析与执行
├── routes.ts           # /api 路由与 /better-mcp 回调、聚合端点
├── panel.ts            # 面板快照与服务器定义校验（宿主侧）
└── client/
    ├── index.ts        # 客户端入口：字典、侧栏动作、插件页配置页
    ├── panel.tsx       # 共享面板：状态、开关、重连、授权、增删改、聚合端点
    ├── server-form.tsx # 服务器新增/编辑表单（字段、校验、提交转换）
    ├── api.ts          # 插件路由调用与错误归一
    └── locales.ts      # 中英文字典与命名空间

cordis.patch.yml        # 只插入 better-mcp 行，servers 留空
icon.svg                # 插件图标
locale/en.json          # meta.title / meta.description
locale/zh.json
docs/
├── how-it-works.md     # 宿主半、客户端半与数据流
├── known-risks.md      # 宿主漂移、OAuth 限制、端口与密钥风险
└── development.md      # 本地开发、测试、Real device、文件地图
tests/
├── helpers.ts          # 模拟 ctx（tools/mcpManager/credentials/configEditor/webServer/connection）
├── plugin.test.ts      # 入口契约、Config、apply 接线、热更新
├── config.test.ts
├── state.test.ts
├── oauth.test.ts
├── aggregate.test.ts
├── servers.test.ts
├── routes.test.ts
├── tools.test.ts
├── client.test.ts
├── client-bundle.test.ts
├── package-pack.test.ts
└── release-archive.test.mjs
```

**Structure Decision**: 单包双半结构，沿用模板的 `src/` 与 `src/client/` 划分；宿主模块按职责拆分为配置、状态、凭据、OAuth、聚合端点、服务器管理与路由，避免单文件膨胀；客户端把面板拆成入口、共享面板、表单与 API 四块。

## Phases

| 阶段 | 内容 | 提交 |
| --- | --- | --- |
| 转化脚手架 | 包名/版本/补丁/图标/locale/依赖、清空旧 spec 与 changelog、CI 发布 job、README/AGENTS/宪章、docs 骨架 | 1 |
| 宿主核心 | config、state、credentials、oauth、aggregate、servers、panel 快照 | 2 |
| 路由与工具 | `/api` 路由、Web 路由、`mcp_servers` 与 `mcp_call`、热更新对账 | 3 |
| 客户端 | 字典、侧栏动作、共享面板、增删改表单、插件页配置页 | 4 |
| 测试与文档 | 全部单元测试、package-pack、client bundle、README/docs 定稿 | 5 |
| 实机验证 | real-device-test 脚本与用例、报告、修复偏差 | 6 |

## Complexity Tracking

无宪章偏离。