# Tasks: Better MCP 插件

**Input**: Design documents from `specs/012-port-better-mcp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 宪章 IV 要求代码变更同步测试，因此每个实现阶段包含测试任务。

**Organization**: 任务按用户故事分组，基础阶段完成后各故事可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事
- 文件路径相对仓库根

## Path Conventions

- 宿主代码：`src/`
- 浏览器代码：`src/client/`
- 测试：`tests/`
- 设计产物：`specs/012-port-better-mcp/`

---

## Phase 1: Setup（项目脚手架）

**Purpose**: 把仓库标识与构建配置改为本插件，清掉模板示例代码。

- [x] T001 改写 `package.json`：`name` 为 `dsh-plugin-better-mcp`、`version` 为 `0.1.0`、`description`、`keywords`、`icon`、`exports`（`.`、`./client`、`./locale/*.json`、`./icon`）、`files`（`dist`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README.md`）、`dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-sidebar` 并移除模板注入项
- [x] T002 改写 `tsdown.config.ts` 的 `CLIENT_ID` 为 `dsh-plugin-better-mcp`，确认浏览器构建只保留平台种子 external
- [x] T003 在 `package.json` 增加 `devDependencies`：`@deepseek-ai/dsh-mcp-manager@0.2.2-rc.3`、`@deepseek-ai/dsh-credentials@0.2.2-rc.3`、`@deepseek-ai/dsh-home-paths@0.2.2-rc.3`、`@deepseek-ai/dsh-config-editor@0.2.2-rc.3`、`@deepseek-ai/dsh-host-webserver@0.2.2-rc.3`、`@deepseek-ai/dsh-client-ui-sidebar@0.2.2-rc.3`
- [x] T004 在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 增加 T003 六个包的 `0.2.2-rc.3` 条目，并运行 `pnpm install`
- [x] T005 [P] 新增 `icon.svg`（MCP 节点图标，与侧栏图标一致）与 `locale/en.json`、`locale/zh.json`（`meta.title`、`meta.description`）
- [x] T006 [P] 删除模板示例源码 `src/demo-tool.ts`、`src/events.ts` 与 `src/client/demo-dock.tsx`、`src/client/config-page.tsx`、`src/client/config-form.ts`
- [x] T007 [P] 改写 `cordis.patch.yml`：插入 `id: better-mcp`、`name: dsh-plugin-better-mcp`、`config.servers` 留空、`config.expose` 使用 `harness` 默认组

---

## Phase 2: Foundational（阻塞所有故事）

**Purpose**: 配置、状态、凭据、服务器管理与入口装配。

**⚠️ CRITICAL**: 本阶段完成前不开始用户故事实现。

- [x] T010 改写 `src/constants.ts`：`PLUGIN_NAME = 'dsh-plugin-better-mcp'`、`PLUGIN_ROW_ID = 'better-mcp'`、回调路径、默认端点、`TOKEN_REF = 'BETTER_MCP_TOKEN'`、pending TTL 10 分钟、连接超时 25 秒、批量上限 20
- [x] T011 改写 `src/types.ts`：再导出 `Context`、`Events`、`Volatile`、`ToolDefinition`、`ToolRunContext`，并以 type-only 引入 `@deepseek-ai/dsh-mcp-manager`、`dsh-credentials`、`dsh-config-editor`、`cordis-plugin-loader` 的类型增强；声明本地 `HostFetchRoute`、`WebRoute`、`ManagedStatusView`
- [x] T012 改写 `src/utils.ts`：`isRecord`、`asString`、`jsonResponse`、`globToRegExp`、`SERVER_NAME_PATTERN`（`^[A-Za-z0-9_-]{1,32}$`）、`grantId`（小写连字符化 + SHA-256 前 8 位）
- [x] T013 改写 `src/config.ts`：`Config` schema（`servers` 字典、`expose` 对象，两者 `.volatile()`）；`ServerSchema` 用 `Schema.intersect([Schema.object({…已声明字段}), Schema.dict(Schema.any())])` 透传管理器字段；`resolveConfig` 校验顶层键、服务器名、传输字段冲突、组规则与端点路径；`readConfig` 展开 volatile 引用；结果冻结
- [x] T014 新增 `tests/config.test.ts`：默认值、未知顶层键、非法服务器名、stdio/http 字段冲突、`clientSecret` 兼容读取、volatile 引用展开、冻结结果
- [x] T015 改写 `src/state.ts`：`readState`（容忍缺失/损坏）、`setLazy`（临时文件 + rename），路径 `<dsh home>/plugin-data/better-mcp/state.json`
- [x] T016 新增 `tests/state.test.ts`：无文件默认空、损坏文件回退、写入原子性、并发写后读到的值
- [x] T017 新增 `src/credentials.ts`：`readGrant`、`writeGrant`、`deleteGrant`、`readClientSecret`、`writeClientSecret`、`deleteClientSecret`、`endpointToken`、`rotateEndpointToken`，键用 `credentialKey('better-mcp', grantId(name))` 与 `…-client`
- [x] T018 新增 `tests/credentials.test.ts`：grant 读写删、clientSecret 读写删、端点令牌首次创建与轮换、记录 payload 不合法时视为未授权
- [x] T019 新增 `src/servers.ts`：`serialized` 串行链、`entryOf`（剔除 `lazy`/`auth`/`oauth`、按需注入 Bearer）、`mount`、`unmount`、`waitConnected`、`publicToolName`、`executeTool`、`describeStatus`、`snapshot`
- [x] T020 新增 `tests/servers.test.ts`：重复挂载只注册一次、卸载幂等、等待连接的成功/失败/401/超时、工具名规范化与缺失工具、执行结果映射、快照排序与 managed 标记
- [x] T021 改写 `src/index.ts`：导出 `name`、`inject = ['tools', 'mcpManager', 'credentials']`、`Config`、`apply`；`apply` 先 `readConfig`，再装配运行时状态（mounts、chains、pending、endpointHandlers、settings）
- [x] T022 新增 `tests/helpers.ts` 扩展：在模拟 `ctx` 中加入 `mcpManager`（list/register）、`credentials`（resolve/set/readRecord/modifyRecord/deleteRecord）、`configEditor`（edit）、`webServer`（register）、`connection.fetch`（register）与可按服务器设置状态、挂载记录、配置写入记录

---

## Phase 3: User Story 1 - 按服务器懒加载（P1）🎯 MVP

**Goal**: 启动只挂载常驻服务器；`mcp_call` 按需挂载；面板可切换懒加载与重连。

**Independent Test**: 配置两台懒加载服务器，启动后都未连接；`mcp_call` 调用其中一台后连接并返回结果；`mcp_servers` 显示状态、工具数与 lazy 标记。

- [x] T030 [US1] 在 `src/index.ts` 实现启动挂载：遍历配置，跳过懒加载，挂载失败只告警
- [x] T031 [US1] 新增 `src/tools.ts` 的 `mcp_servers` 与 `mcp_call`（参数、描述、输出 schema、render 与 `contracts/tools.md` 一致）
- [x] T032 [US1] 在 `src/routes.ts` 实现 `GET /api/better-mcp/status`、`POST /api/better-mcp/lazy`、`POST /api/better-mcp/restart`，错误码按 `contracts/api.md`
- [x] T033 [US1] 在 `src/index.ts` 监听 `loader/volatile-update`：重新读取配置，对新增/变更/移除的服务器执行挂载、重建、卸载
- [x] T034 [P] [US1] 新增 `tests/tools.test.ts`：两个工具的描述与参数、`mcp_call` 的空值/未知服务器/缺失工具/成功/错误结果、`mcp_servers` 渲染文本
- [x] T035 [P] [US1] 新增 `tests/routes.test.ts` 的懒加载部分：status 快照、lazy 开关挂载与卸载、restart、400/409 分支
- [x] T036 [US1] 新增 `tests/plugin.test.ts` 的装配部分：启动挂载只含常驻、volatile 更新后的对账、未知配置键让加载失败、卸载释放全部挂载

**Checkpoint**: 懒加载链路可独立验证。

---

## Phase 4: User Story 2 - 可视化 OAuth（P1）

**Goal**: 401 服务器可从面板发起授权，令牌入库并自动挂载；支持固定客户端与回环回调、刷新、退出。

**Independent Test**: 对返回标准 401 的服务器发起授权，完成登录后自动连接；退出登录后卸载；配置文件无令牌。

- [x] T040 [US2] 新增 `src/oauth.ts`：`challengeParams`、`probeAuthorization`、`discover`、`registerClient`、`authorizationUrl`、`exchangeCode`、`refresh`、`normalizeTokenResponse`（含 client_secret_basic/post 选择、PKCE S256、`resource` 参数）
- [x] T041 [P] [US2] 新增 `tests/oauth.test.ts`：challenge 解析、发现失败分支、动态注册、PKCE URL、换码与刷新、错误响应截断
- [x] T042 [US2] 在 `src/index.ts` 实现 `accessTokenOf`：距过期 30 秒内刷新，刷新失败沿用旧令牌并告警
- [x] T043 [US2] 在 `src/routes.ts` 实现 `GET /api/better-mcp/oauth/start`、`POST /api/better-mcp/oauth/signout`、`POST /api/better-mcp/oauth/client`，客户端密钥写凭据库
- [x] T044 [US2] 实现回调完成逻辑：`pending` 表、10 分钟 TTL、`exchangeCode`、写授权、卸载并按懒加载重挂
- [x] T045 [US2] 在 `src/routes.ts` 注册 `GET /better-mcp/oauth/callback`（webServer exact 路由）与固定回环监听器（`127.0.0.1`/`localhost`，一次回调后关闭，TTL 清理）
- [x] T046 [US2] 新增 `tests/oauth-routes.test.ts`：start 的 400/502 分支、client 写入与清除、callback 成功/失败/过期 state、监听器绑定失败
- [x] T047 [US2] 在 `src/index.ts` 插件卸载时关闭回环监听、清空 pending

**Checkpoint**: 授权链路可独立验证。

---

## Phase 5: User Story 3 - 聚合 MCP 端点（P1）

**Goal**: 按组暴露工具，Bearer 鉴权，支持 initialize/tools/list/tools/call 与令牌轮换。

**Independent Test**: 用令牌请求某组，返回组内工具清单并可执行；错误令牌 401；轮换后旧令牌失效。

- [x] T050 [US3] 新增 `src/aggregate.ts`：`toolInGroup`、`createGroupHandler`、JSON-RPC 分发、批量上限、CORS 与鉴权、内容映射、120 秒执行超时
- [x] T051 [P] [US3] 新增 `tests/aggregate.test.ts`：组匹配规则、鉴权 401/500、OPTIONS/405、通知 202、解析错误、未知方法、tools/list 与 tools/call、错误工具回包
- [x] T052 [US3] 在 `src/routes.ts` 注册 `expose.endpoint` 前缀路由：组名解析、未知组 404、关闭 404、每组复用处理器
- [x] T053 [US3] 在 `src/routes.ts` 实现 `POST /api/better-mcp/endpoint/rotate`
- [x] T054 [US3] 在 `src/index.ts` 处理 `expose.endpoint` 变更：释放旧前缀路由并按新路径注册
- [x] T055 [P] [US3] 在 `tests/routes.test.ts` 增加端点部分：组路由、404、关闭、令牌轮换后旧令牌失效

**Checkpoint**: 聚合端点可独立验证。

---

## Phase 6: User Story 4 - 侧栏面板与插件页入口（P2）

**Goal**: 侧栏图标打开面板；面板与配置页都能查看状态、切换懒加载、重连、授权、增删改服务器，并管理聚合端点与令牌。

**Independent Test**: 侧栏点图标打开面板并新增服务器；插件页本行出现同样的面板并能编辑与删除同一台服务器。

- [x] T060 新增 `src/client/locales.ts`：`NS`、`zh`、`en`、`LocaleNamespaceMap` 增强，键集覆盖 `contracts/ui.md`
- [x] T061 新增 `src/client/api.ts`：status/lazy/restart/servers/remove/oauth start/signout/client/rotate 调用与错误归一
- [x] T062 新增 `src/client/panel.tsx`：状态点、徽标、开关、服务器行、聚合端点区、令牌显示/复制/轮换、错误与重试、弹窗遮罩
- [x] T063 新增 `src/client/server-form.tsx`：新增/编辑表单、传输切换清空字段、名称与 `command`/`url` 校验、保存与删除
- [x] T064 改写 `src/client/index.ts`：注册字典、`sidebar.footer.action`（`id: better-mcp`、order 52）与 `plugins.row.config`（key `<包名>#<行 id>`），`inject = ['slots','locale']`
- [x] T065 实现配置页的 `summary` 与 `page` 视图，`page` 内联共享面板
- [x] T066 [P] [US4] 改写 `tests/client.test.ts`：服务声明、字典键集一致、两个槽位注册参数、面板渲染关键文案、配置页 summary/page、表单校验
- [x] T067 [P] [US4] 改写 `tests/client-bundle.test.ts`：`dist/client.js` 的注册 id、`inject` 与导出契约

**Checkpoint**: 双入口可独立验证。

---

## Phase 7: User Story 5 - 模板转化交付（P2）

**Goal**: 仓库成为可安装、可构建、可发布的真实插件。

**Independent Test**: 干净 clone 上安装、构建、检查通过；按 README 安装后宿主能加载。

- [x] T070 [US5] 重写 `README.md`：三能力、安装、配置表、工具、面板入口、聚合端点连接方式、限制；示例不含令牌
- [x] T071 [P] [US5] 重写 `AGENTS.md`：项目标识、文档索引、写作规范与开发流程沿用，删除模板措辞
- [x] T072 [P] [US5] 重写 `.specify/memory/constitution.md`：删除原则 VII（模板定位）与模板转化条目，版本升 `2.0.0`
- [x] T073 [P] [US5] 重写 `docs/how-it-works.md`、`docs/known-risks.md`、`docs/development.md`：宿主/客户端数据流、OAuth 与端口风险、文件地图与实机测试流程
- [x] T074 [US5] 删除 `specs/001-*` 至 `specs/011-*` 与 `changelogs/*`，把 `CHANGELOG.md` 重整为 0.1.0 一条
- [x] T075 [US5] 恢复 `.github/workflows/ci.yml` 的发布 job：恢复 `if: startsWith(github.ref, 'refs/tags/')`，删除 `if: false`
- [x] T076 [P] [US5] 改写 `tests/package-pack.test.ts`：发布内容含 `dist`、`cordis.patch.yml`、`README.md`、`icon.svg`、`locale/*.json`；不含 `src`、`tests`、`scripts`、`specs`
- [x] T077 [US5] 改写 `scripts/release-archive.mjs` 与 `tests/release-archive.test.mjs` 以匹配新的 CHANGELOG 结构

**Checkpoint**: 仓库可作为插件交付。

---

## Phase 8: Polish（收尾与验证）

**Purpose**: 跨故事的质量门禁与实机验证。

- [x] T080 [P] 运行 `pnpm format && pnpm check`，修复类型、lint 与测试问题
- [x] T081 [P] 按 `quickstart.md` 手工验收：懒加载、OAuth、聚合端点、双入口
- [x] T082 扩展 `.dsh/skills/real-device-test` 用例：装载、工具调用、懒加载挂载、配置写入、面板与配置页；更新 `scripts/run-test.mjs`、`scripts/browser-test.mjs`
- [x] T083 在专用 profile 运行实机用例并记录报告；修复发现的宿主漂移
- [x] T084 更新 `README.md`、`docs/known-risks.md` 与 `CHANGELOG.md` 的最终内容
- [x] T085 运行 `pnpm full-check` 与 `npm pack --dry-run`，确认发布内容与版本 0.1.0

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖。
- **Foundational (Phase 2)**: 依赖 Setup；阻塞全部故事。
- **US1–US4**: 依赖 Foundational；彼此可并行，但 US2 依赖 US1 的挂载基础，US3 独立，US4 依赖 US1–US3 的路由。
- **US5**: 依赖 Setup 的包标识，可与 US1–US4 并行推进文档与转化。
- **Polish**: 依赖全部故事完成。

### User Story Dependencies

| 故事 | 依赖 |
| --- | --- |
| US1 | Foundational |
| US2 | US1（挂载与快照） |
| US3 | Foundational |
| US4 | US1–US3（路由与工具） |
| US5 | Setup |

### Within Each User Story

- 测试先于实现，先确认失败。
- 模块实现先于接线。
- 接线先于 UI 或端到端验证。

### Parallel Opportunities

- T005/T006/T007（Setup 文档与资源）可并行。
- T014/T016/T018/T020（各模块测试）可并行。
- US3 与 US1/US2 的后端工作可并行。
- US5 文档任务（T070–T073、T076）可并行。
- US4 的 `tests/client.test.ts` 与 `tests/client-bundle.test.ts` 可并行。

---

## Implementation Strategy

### MVP First（US1）

1. Phase 1 + Phase 2。
2. US1：懒加载、`mcp_servers`、`mcp_call`、状态/开关/重连路由。
3. 独立验证后再进入 OAuth 与聚合端点。

### Incremental Delivery

1. Setup + Foundational → 可构建骨架。
2. US1 → 懒加载 MVP。
3. US2 → 授权。
4. US3 → 聚合端点。
5. US4 → 双入口面板与增删改。
6. US5 → 仓库转化与发布准备。
7. Polish → 实机验证与质量门禁。

---

## Notes

- `[P]` 任务在不同文件、无未完成依赖时可并行。
- 每个阶段对应一个 commit（宪章开发流程）。
- 涉及宿主装载、OAuth 或 UI 的变更在实机上验证后才算完成。
- 配置文件、状态文件与日志不得出现任何令牌或客户端密钥。