# 工作机制

## 插件的组成

插件是一个 npm 包，包含宿主半与浏览器半。

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包元数据、`dsh.bundle.patch`、`dsh.client`、发布内容 |
| `cordis.patch.yml` | 插入 `better-mcp` 行；`servers` 默认为空 |
| `src/index.ts` | 宿主入口 |
| `src/client/index.tsx` | 浏览器入口 |
| `tsdown.config.ts` | 两组构建配置 |

## 入口契约

宿主 loader 识别四个导出。

| 导出 | 含义 |
| --- | --- |
| `name` | `better-mcp`，与补丁行 `id` 一致 |
| `inject` | `tools`、`mcpManager`、`credentials` |
| `apply(ctx, config)` | 装配运行时、挂载全部服务器、接入会话可见性 |
| `Config` | Schemastery schema，宿主据此校验与投影 |

- `src/index.ts` 只导出这四个宿主入口。
- `inject` 列出 `apply` 必需的宿主服务。
- `agents`、`sessionProjections`、`workingDirectory`、`mcpResources` 与 `systemPrompt` 经 `ctx.inject` 按需接入；缺少会话服务时插件只提供面板与 OAuth。
- 需要热重载的 `Config` 字段用 `.volatile()` 标记。
- 宿主类型经 `src/types.ts` 以 type-only 方式导入。

浏览器入口导出 `inject = ['slots', 'locale', 'pluginNavigation']` 与 `apply`。

## 宿主运行时

`apply` 按顺序完成：

1. `readConfig` 展开 volatile 引用，`resolveConfig` 校验并冻结结果。
2. 创建 `ServerManager`、`WorkspacePool` 与 `PluginRoutes`。
3. 注册 `/api/better-mcp/*`、OAuth 启动重定向与回调路由。
4. 挂载共享服务器；工作区服务器等待 active。
5. 会话服务可用时接入工作区绑定、Agent-local 代理、resources、系统提示与 `VisibilityRuntime`，注册 `mcp_manage`。
6. 监听 `loader/volatile-update`，按新配置对账共享实例和工作区实例。

`servers` 是 volatile，保存后不重挂插件。

### 配置解析

`readConfig` 先把 `.volatile()` 引用展开为普通值，再交给 `resolveConfig` 做严格校验：

- 配置解析是 `apply` 的第一步。
- 缺省或 `null` 的键使用默认值。
- 未知键与非法值抛错，插件加载失败。
- 每台服务器必须有非空 `description`。
- 解析结果冻结后返回。

配置错误在加载时暴露，最容易排查。

### 挂载

- 挂载通过 `ctx.mcpManager.register(name, entry)`；连接、重连、工具发现与拆除由管理器负责。
- 共享服务器使用配置名注册；工作区服务器跳过启动挂载，由 `WorkspacePool` 按需注册内部名称。
- 交给管理器的条目去掉 `description`、`lazy`、`workspace`、`auth`、`oauth`。
- OAuth 服务器挂载时注入 `Authorization: Bearer`；未授权时跳过挂载并告警。
- 对账时只改 `description` 或共享服务器的 `lazy` 时保持连接。

### 工作区实例

`WorkspacePool` 以服务器配置名与规范化当前工作目录为实例键。内部注册名由可读前缀和稳定哈希组成，避免宿主全局名称冲突。

生命周期：

- Agent 创建时只建立目录绑定，不启动实例。
- `mcp_manage` active 检查目录并注册实例；同键并发获取只注册一次。
- inactive 立即移除当前 Agent 的代理与 resources。没有其他 active Agent 时关闭实例，否则保留并提醒共享占用。
- Turn 结束的自动 inactive 使用同一引用规则。
- Agent 释放只移除引用，保留实例供后续会话使用。
- 目录切换在提交新目录后释放旧绑定。旧工作区没有其他绑定 Agent 时，等待全部旧实例清理完成再让切换工具返回。
- 下一步与 active 前检查目录是否存在，缺失时关闭对应实例。

关闭通过 `mcpManager.watch()` 等待内部名称消失。清理失败或超时只记录状态，不回滚已提交目录，也不作为删除文件夹的许可。

`WorkspaceProxyRuntime` 从根工具定义发现内部工具，在 Agent scope 注册公开名代理。代理直接调用捕获的 target，并委托内容投影与 finalize；执行前校验绑定、active、目录、target 身份和 generation。

`WorkspaceResourceRuntime` 在 Agent scope 以公开配置名注册 provider，转发三种资源请求到内部实例。资源调用守卫拒绝直接访问内部名称。

`WorkspacePresentationRuntime` 过滤其他工作区的 instructions，并将内部显示名还原为公开配置名。资源服务器提示只显示当前 Agent 的 active 公开名称。

`WorkspaceBindings` 管理目录引用与关闭屏障。active、inactive、共享占用、目录切换、目录缺失和清理结果以 notice 形式并入 catalog 的 `<system-reminder>`，由会话投影确认并去重。

### 会话可见性

可见性由 `src/visibility.ts` 的 `VisibilityRuntime` 维护。

| 机制 | 实现 |
| --- | --- |
| 隐藏工具 | `agent.ctx.tools.restrict({ deny })`，deny 为不可见服务器的 `mcp__<server>__` 工具 |
| 工作区工具 | Agent-local 公开代理按 active 路由同步；全部内部工具始终 deny |
| 工具归属 | 按最长服务器名匹配 `mcp__<server>__` 前缀 |
| 默认值 | 会话首个 Turn 未显式选择时取 `!lazy` |
| 显式选择 | `mcp_manage` 写入内存待定表，下一步的目录消息把它记入 `source.overrides` |
| Turn 结束 | 目录消息早于最近 `turn/end` 时全部服务器按 inactive 计算；工作区实例异步释放 active 引用 |
| 读取历史 | 宿主私有投影 `better-mcp-catalog` 折叠最近一条目录消息与最近 `turn/end` 的 seq |

限制在以下时刻重算：

- `agent/created`：会话创建、恢复、清空或压缩后。
- `mcp_manage` 执行时，只处理调用方会话；可见性实际变化后重算限制并注入目录。
- `session/event` 提交 `turn/end` 后，清除目标 Agent 的待定选择并重算限制。完成、失败与取消使用相同处理。
- `tools/change`：合并到一个微任务后重算全部会话。
- 配置或授权状态对账完成后，重算全部在线会话并注入目录。

deny 列表不变时跳过，插件自身的 `restrict` 引起的 `tools/change` 因此不会循环。

宿主在 `agent/pre-step` 之前解析工具集，限制必须在步骤开始前生效。`turn/end` 的处理不调用 `notify`，避免待处理目录延续 Agent 执行。

### 目录消息

`notify` 复用 `catalogFor` 生成目录，通过 `agent.inject()` 把 `nextStep` 消息写入 Agent 待处理队列。队列最后一条待处理目录的 `source.entries` 与 `source.notices` 均相同时跳过注入。

`ServerManager` 在挂载、快照、配置对账、授权完成与退出时从凭据库刷新授权状态内存表。`entriesOf` 排除 `auth: oauth` 且未授权的服务器，目录渲染与工具可见性继续共用现有 lazy 与显式选择。

`catalogFor` 按会话投影与可见区决定消息：

| 条件 | 结果 |
| --- | --- |
| 目录未变，上次的消息在 `session.surface.nodes` 中 | 不写 |
| 上次的消息不在可见区，或从未写过 | 完整目录 |
| 目录变化 | 更新消息与完整目录 |
| 从未写过且没有服务器 | 不写 |

`agent/pre-step` 在 `next()` 之后处理目录：

1. 过滤本来源的目录消息。
2. 按最新配置与可见性追加至多一条 user 角色消息。

配置恢复时也会移除过期的待处理目录。Turn 结束后的下一模型步骤按相同流程写入全 inactive 目录；目录未变时跳过。

目录消息的写入时机：

| 时机 | 内容 |
| --- | --- |
| 会话第一步 | 完整目录：每台服务器的名称、可见性与简介，以及 `mcp_manage` 用法 |
| 压缩移除了目录消息 | 重新写入完整目录 |
| 主动切换可见性 | 立即写入变化说明与完整目录，列出变为可见与不可见的服务器 |
| Turn 结束后的下一模型步骤 | 写入全部服务器 inactive 的目录更新；已经全部 inactive 时跳过 |
| 新增、删除服务器或修改简介 | 配置生效后立即向全部在线会话写入更新后的完整目录 |

- 变化后的消息随下一次模型步骤进入会话历史。
- 状态不变时抑制重复消息。
- 连续变化在下一步合并为最新目录。
- 子代理拥有独立的可见性，并按自己的 Turn 结束时间重置。

- 消息正文以 `<system-reminder>` 包裹，文本由 `src/catalog.ts` 渲染。
- `source.kind` 为 `better-mcp-catalog`，`form` 为 `catalog`。
- `source.entries` 记录完整目录，`source.overrides` 记录显式选择，`source.notices` 记录工作区生命周期提醒。
- 消息进入会话日志，随恢复、fork 与压缩处理。

### 定义写入

面板路由经 `ctx.configEditor.edit(ctx.fiber.entry, change)` 写入 profile 用户层。

- 校验在宿主侧完成；非法定义返回 400。
- 配置被更高层覆盖时返回 409。
- 面板的懒加载开关写回 `servers.<name>.lazy`。
- 写入触发 volatile 更新；插件串行对账：卸载移除项、重建连接参数变化的项、挂载新增项。
- 对账后执行 `VisibilityRuntime.syncAll()` 与 `notifyAll()`，同步全部在线 Agent 的工具限制与目录。
- 面板快照会等待对账完成，并为工作区配置附加按路径排序的实例状态。
- 重连路由支持共享服务器、全部工作区实例与单工作区实例。

### OAuth

1. 探测端点 `initialize`，要求返回 `401`，读 `resource_metadata`。
2. 读受保护资源元数据与授权服务器元数据，失败时尝试 `openid-configuration`。
3. 有 `registration_endpoint` 时动态注册 `client_secret_post` 客户端，身份由 `oauth.clientName` 决定，默认 `Codex`。Figma 官方 MCP 监听 `127.0.0.1:0/callback`，由操作系统分配端口。OpenAI 登录固定标识在该场景由动态注册替代。
4. 生成 PKCE S256 verifier 与 state，拼授权 URL（带 `resource`）。
5. 回调换码，写授权记录，卸载旧实例并重新挂载，随后执行 `VisibilityRuntime.syncAll()` 与 `notifyAll()`。
6. 距过期 30 秒内用刷新令牌换新；刷新失败沿用旧令牌并告警。

配置面板的鉴权行显示完整地址 `<origin>/better-mcp/oauth/start?server=<name>`，由宿主按默认外链行为打开。地址取 Web 服务监听源，桌面端因此得到宿主认可的绝对地址；相对地址在 `dsh-app://` 页面下不会触发外链。该 Web 路由复用授权启动逻辑，成功返回 `302 Location`，失败返回带原始原因的 HTML 错误页。同源 JSON 启动路由继续保留。

回调地址取 `host` 头的来源加回调路径。Web 载体把 fetch 路由的请求 URL 解析到占位来源 `http://x`，真实来源只在 `host` 头里；缺少该头时回落到 Web 服务监听地址。

令牌端点的客户端认证按注册结果选择 `client_secret_post` 或 `client_secret_basic`，注册时没给出结果时优先 `client_secret_post`。授权服务器元数据列出的方式未必都被实现。

Figma 默认回调与显式 `oauth.redirectUri` 都使用临时回环监听；10 分钟无回调自动关闭。注册、授权与换码使用同一个实际回调地址。

### 秘密存放

| 内容 | 位置 |
| --- | --- |
| 访问令牌、刷新令牌 | 凭据库 `grant` 记录 |
| 客户端密钥 | 凭据库 `api-key` 记录，id 为 `<grantId>-client` |

配置文件不保存秘密。

## 浏览器运行时

| 注册项 | 作用 |
| --- | --- |
| `locale.register` | 注册 `dsh-plugin-better-mcp` 命名空间的中英文字典 |
| `sidebar.footer.action` | id `better-mcp`、order 52，打开行配置页并显示待鉴权状态 |
| `plugins.row.config` | 键 `dsh-plugin-better-mcp#better-mcp`，渲染 summary 或内联面板 |

配置页使用 `McpPanel` 调用插件自己的 `/api` 路由。面板与侧栏分别每 1 秒串行读取状态，卸载后停止；面板快照序号防止旧响应覆盖新状态。侧栏存在待鉴权服务器时显示警告色与阴影呼吸，`prefers-reduced-motion` 下停用持续动画。

元数据与字典的完整规范见 [i18n.md](./i18n.md)。

## 数据流

```text
共享 McpPanel / 侧栏
  → 每 1 秒串行读取状态
    → 面板按快照序号接收最新响应
    → 侧栏按待鉴权状态切换高亮

OAuth 回调
  → 写入授权并重新挂载
    → VisibilityRuntime.syncAll / notifyAll
      → agent.inject(nextStep)

面板 / 配置页
  → /api/better-mcp/*
    → configEditor / credentials
      → loader/volatile-update
        → ServerManager.reconcile
          → mcpManager.register / dispose
        → VisibilityRuntime.syncAll / notifyAll
          → agent.inject(nextStep)

模型
  → mcp_manage
    → VisibilityRuntime.setActive
      → 可见性实际变化后
        → agent.ctx.tools.restrict
        → notify 当前 Agent
          → agent.inject(nextStep)

Agent
  → session/event(turn/end)
    → VisibilityRuntime.deactivateAfterTurn
      → 清除待定选择
      → agent.ctx.tools.restrict

Agent
  → agent/pre-step
    → 过滤本来源目录
    → 按最新设置添加至多一条目录消息
      → better-mcp-catalog 投影
```

## 依赖复用

插件运行时使用宿主提供的 cordis、schemastery 与 dsh 服务实例。依赖分为两类，新增依赖时在 plan 中声明归属：

| 归属 | 放在 | 打包 |
| --- | --- | --- |
| 宿主提供 | `devDependencies` | 由 `tsdown.config.ts` 的 `neverBundle` 保持 external |
| 插件自备 | `dependencies` | 列入 `tsdown.config.ts` 的 `alwaysBundle`，打进 `dist`，由 `tests/package-pack.test.ts` 回归发布内容 |

宿主依赖的版本规则见[宪章](../.specify/memory/constitution.md)原则 I。