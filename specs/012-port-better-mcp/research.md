# Research: Better MCP 插件

**Date**: 2026-11-18 | **Plan**: [plan.md](./plan.md)

## R1 配置模型与热更新

**Decision**: `Config` 用 Schemastery 声明 `servers`（字典）与 `expose`（对象）两个字段，两者都 `.volatile()`；`resolveConfig` 负责顶层未知键、服务器名、传输字段与组规则的严格校验，返回冻结结果；`readConfig` 展开热重载引用。

**Rationale**:

- 宿主按 `Config` 校验插件行配置并向面板投影字段；未声明的顶层键会被 `resolveConfig` 拒绝。
- Loader 对 `.volatile()` 字段提交整值并只派发 `loader/volatile-update`，不重挂插件；`servers` 的增删改因此可以热生效。
- 模板已有“schema 宽松、`resolveConfig` 严格”的先例，可在不放弃宿主投影的前提下保持参照实现的宽松配置兼容。

**Verified facts**:

- `loader/volatile-update` 载荷是变更路径数组，且只发给所属 fiber（`@deepseek-ai/cordis-plugin-loader` 类型）。
- `equalExceptVolatile` 把 volatile 字段视为相等；字典下每个键按对应 schema 比较。
- `Schema.intersect([Schema.object({…}), Schema.dict(Schema.any())])` 在保留已声明字段与默认值的同时透传未知字段，用于兼容管理器新增字段。

**Alternatives considered**:

- `Schema.any()` 透传：失去宿主投影与热更新语义。
- 全部非 volatile：每次增删改都会重挂插件，面板会闪断。
- 在客户端 `configForms` 写配置：侧栏入口无法直接使用，且当前 profile 的客户端服务目录未列出该服务。

## R2 服务器定义的持久化

**Decision**: 宿主新增写路由，经 `ctx.configEditor.edit(ctx.fiber.entry, change)` 把完整的 `servers` 写回 profile 插件行配置的用户层；客户端只调用插件自己的 `/api` 路由。

**Rationale**:

- `configuration.md` 明确规定插件在 `apply` 之后改自身配置走 config editor，而不是重写补丁文件。
- config editor 负责校验候选值、串行化写入、拒绝被高层覆盖的值，并在 volatile 字段上就地生效。
- 侧栏面板与插件页配置页共用同一条写路径，行为一致。

**Verified facts**:

- `ctx.fiber.entry` 由 Loader 增强（`Fiber.entry?: Entry`）。
- `configEditor.edit(entry, change)` 返回 Loader 完成 reconcile 后的 Promise。

**Alternatives considered**:

- 客户端 `configForms`：只在插件页可用，侧栏还需另开一条路。
- 直接改 `cordis.patch.yml`：文档禁止，且会破坏用户的注释与表达式。

## R3 密钥与令牌的存放

**Decision**: OAuth 访问令牌与刷新令牌存 `GrantRecord`；预置 clientSecret 存 `ApiKeyRecord`（`kind: 'api-key', key`）；聚合端点令牌存 `BETTER_MCP_TOKEN` 引用。三者的作用域都是 `better-mcp`。配置只保留 `clientId`、`redirectUri`、`authorizationServer`、`scopes` 等非密钥字段；配置里已有的 `oauth.clientSecret` 仍被读取以兼容旧配置，界面不再写入。

**Rationale**:

- 凭据 seam 只有两种记录：`api-key` 与 `grant`；客户端密钥是“插件为该 id 持有的凭据”，用 `api-key` 记录最贴合。
- 用户明确要求避免把令牌写进 MCP 配置；密钥集中到凭据库后配置文件可以公开分享。
- 记录键用 `credentialKey('better-mcp', ...)`，服务器名经小写连字符化加摘要，避免名字折叠。

**Alternatives considered**:

- 把 clientSecret 留在 `servers.<name>.oauth.clientSecret`：与用户要求冲突，且容易随配置泄露。
- 用一个自定义 `grant` 记录存 clientSecret：payload 语义会与授权记录混淆。

## R4 OAuth 流程

**Decision**: 移植参照实现的 MCP 授权流程：探测 `401`、读 `resource_metadata`、读授权服务器元数据、可选动态注册（RFC 7591）、PKCE S256 授权 URL（带 `resource`）、回调换码、过期前刷新、固定回环回调监听（默认 10 分钟 TTL）。

**Rationale**:

- 这是 MCP 授权规范的标准链路，参照实现已在 figma 等服务器上跑通。
- 固定回调端口的服务器（例如 figma 钉死 `127.0.0.1:19876`）只有自行监听才能完成登录。

**Alternatives considered**:

- 使用宿主 `ctx.authorization` 流程注册：能与官方授权 UI 统一，但需要在宿主侧重新实现 MCP 发现与资源参数语义，行为会偏离参照实现。

## R5 聚合 MCP 端点

**Decision**: 移植无状态 MCP Streamable HTTP 处理器：每请求 Bearer 鉴权、JSON 回包、`initialize` / `tools/list` / `tools/call` / `ping`、通知不回包、批量上限 20、组内工具用 `*` 通配符包含与排除。工具集合每次从 `ctx.tools.schemas()` 实时读取，执行走 `ctx.tools.execute`，超时 120 秒。

**Rationale**: 参照实现已验证；无状态让外部客户端无需会话维护；实时读工具表保证新注册工具立即可见。

**Verified facts**:

- `ctx.tools.schemas()` 只投影模型可见字段；`ctx.tools.execute` 接受 `{ calls, signal }` 并返回 `results`。
- `defineTool` 的输出 schema 支持 `{ type: 'json' }`。

## R6 面板架构与双入口

**Decision**: 一个共享的 `McpPanel` 组件；侧栏 `sidebar.footer.action`（id `better-mcp`，order 52，`locale` 命名空间）把它渲染在固定定位的弹窗里；“插件”页 `plugins.row.config`（key `<包名>#<行 id>`）把它内联渲染，`summary` 视图输出一行描述。两处都通过插件 `/api` 路由完成同样的操作。

**Rationale**:

- 用户要求两个入口“效果相同”，共享组件避免两套逻辑。
- 两个槽位都由官方包声明；`sidebar.footer.action` 给 `wide`，`plugins.row.config` 给 `view` 与可选的 `form`。

**Verified facts**:

- `sidebar.footer.action` 是 list 槽位，owner props 只有 `{ wide }`，注册项要求 `id`。
- `plugins.row.config` 是 keyed 槽位，注册项要求 `key`，owner props 有 `view: 'summary' | 'page'`。

**Alternatives considered**:

- 只做侧栏面板，插件页不加：与用户要求不符。
- 配置页使用官方 `SettingsFormModel`：无法表达嵌套的服务器定义与增删操作。

## R7 客户端文案

**Decision**: 用 `ctx.locale.register('dsh-plugin-better-mcp', { zh, en })` 注册字典；侧栏与配置页都以该命名空间注册槽位，组件从 `t` 取文案。

**Rationale**: 跟随宿主语言切换；模板的字典模式已有测试先例。

**Alternatives considered**: 参照实现的文件内联双语文案；不跟随宿主的语言快照，也不参与键集约束。

## R8 依赖与构建

**Decision**: 新增 `@deepseek-ai/dsh-mcp-manager`、`dsh-credentials`、`dsh-home-paths`、`dsh-config-editor`、`dsh-host-webserver`、`dsh-client-ui-sidebar`，全部固定 `0.2.2-rc.3` 并加入 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`；宿主构建保持 external；客户端构建把 `@deepseek-ai/dsh-client-ui-sidebar` 只作类型引入。

**Rationale**: 与运行宿主版本一致；宪章 II 要求宿主实例唯一；宪章 VII 要求版本线统一。

**Verified facts**: 所有六个包在 npm 上都有 `0.2.2-rc.3`。

**Alternatives considered**: 升级到 `0.2.2-rc.4`；用户选择保持 rc.3，与已安装宿主一致。

## R9 测试与验证

**Decision**:

- 单元测试：扩展现有 `makeCtx`，加入 `mcpManager`、`credentials`、`configEditor`、`webServer`、`connection` 的模拟；OAuth 用注入的 `fetch` 或全局 stub；聚合处理器直接喂 `Request`；客户端用 `renderToStaticMarkup`。
- 发布回归：`package-pack` 校验 `dist`、`cordis.patch.yml`、`README.md`、`icon.svg`、`locale/*.json`。
- 实机：按 `.dsh/skills/real-device-test` 建专用 profile，跑装载、工具、配置写入、面板与配置页用例。

**Rationale**: 模板的测试设施已覆盖 `ctx` 与槽位；实机用例覆盖宿主装载与真实 UI。

**Alternatives considered**: 只跑单元测试；无法发现宿主装载与槽位漂移。

## R10 模板转化

**Decision**: 包名改 `dsh-plugin-better-mcp`，版本 `0.1.0`；补丁行 id `better-mcp`；删除 `specs/001`–`011` 与 `changelogs/` 归档，`CHANGELOG.md` 重整为 0.1.0 一条；恢复 CI 发布 job；README、AGENTS、宪章与 docs 按新插件重写；宪章删掉原则 VII 并升 `2.0.0`。

**Rationale**: 宪章 VII 规定的转化顺序；转化完成后仓库不再是模板，模板定位原则失去对象。

**Alternatives considered**: 保留模板标识与旧 spec；与用户选择的“完整模板转化”不符。