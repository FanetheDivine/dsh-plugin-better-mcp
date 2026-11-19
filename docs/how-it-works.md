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
- `agents` 与 `sessionProjections` 经 `ctx.inject` 按需接入；缺少时插件只提供面板与 OAuth。
- 需要热重载的 `Config` 字段用 `.volatile()` 标记。
- 宿主类型经 `src/types.ts` 以 type-only 方式导入。

浏览器入口导出 `inject = ['slots', 'locale']` 与 `apply`。

## 宿主运行时

`apply` 按顺序完成：

1. `readConfig` 展开 volatile 引用，`resolveConfig` 校验并冻结结果。
2. 创建 `ServerManager` 与 `PluginRoutes`。
3. 注册 `/api/better-mcp/*` 与 OAuth 回调路由。
4. 挂载全部服务器。
5. `agents` 与 `sessionProjections` 可用时，创建 `VisibilityRuntime` 并注册 `mcp_manage`。
6. 监听 `loader/volatile-update`，按新配置对账。

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
- 交给管理器的条目去掉 `description`、`lazy`、`auth`、`oauth`。
- OAuth 服务器挂载时注入 `Authorization: Bearer`；未授权时跳过挂载并告警。
- 对账时只改 `description` 或 `lazy` 的服务器保持连接。

### 会话可见性

可见性由 `src/visibility.ts` 的 `VisibilityRuntime` 维护。

| 机制 | 实现 |
| --- | --- |
| 隐藏工具 | `agent.ctx.tools.restrict({ deny })`，deny 为不可见服务器的 `mcp__<server>__` 工具 |
| 工具归属 | 按最长服务器名匹配 `mcp__<server>__` 前缀 |
| 默认值 | 会话未显式选择时取 `!lazy` |
| 显式选择 | `mcp_manage` 写入内存待定表，下一步的目录消息把它记入 `source.overrides` |
| 读取历史 | 宿主私有投影 `better-mcp-catalog` 折叠最近一条目录消息 |

限制在以下时刻重算：

- `agent/created`：会话创建、恢复、清空或压缩后。
- `mcp_manage` 执行时，只处理调用方会话；可见性实际变化后重算限制并注入目录。
- `tools/change`：合并到一个微任务后重算全部会话。
- 配置对账完成后，重算全部在线会话并注入目录。

deny 列表不变时跳过，插件自身的 `restrict` 引起的 `tools/change` 因此不会循环。

宿主在 `agent/pre-step` 之前解析工具集，限制必须在步骤开始前生效。

### 目录消息

`notify` 复用 `catalogFor` 生成目录，通过 `agent.inject()` 把 `nextStep` 消息写入 Agent 待处理队列。队列最后一条待处理目录的 `source.entries` 相同时跳过注入。

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

配置恢复时也会移除过期的待处理目录。

- 消息正文以 `<system-reminder>` 包裹，文本由 `src/catalog.ts` 渲染。
- `source.kind` 为 `better-mcp-catalog`，`form` 为 `catalog`。
- `source.entries` 记录完整目录，`source.overrides` 记录显式选择。
- 消息进入会话日志，随恢复、fork 与压缩处理。

### 定义写入

面板路由经 `ctx.configEditor.edit(ctx.fiber.entry, change)` 写入 profile 用户层。

- 校验在宿主侧完成；非法定义返回 400。
- 配置被更高层覆盖时返回 409。
- 面板的懒加载开关写回 `servers.<name>.lazy`。
- 写入触发 volatile 更新；插件串行对账：卸载移除项、重建连接参数变化的项、挂载新增项。
- 对账后执行 `VisibilityRuntime.syncAll()` 与 `notifyAll()`，同步全部在线 Agent 的工具限制与目录。
- 面板快照会等待对账完成。

### OAuth

1. 探测端点 `initialize`，要求返回 `401`，读 `resource_metadata`。
2. 读受保护资源元数据与授权服务器元数据，失败时尝试 `openid-configuration`。
3. 有 `registration_endpoint` 时动态注册 `client_secret_post` 客户端。
4. 生成 PKCE S256 verifier 与 state，拼授权 URL（带 `resource`）。
5. 回调换码，写授权记录，卸载旧实例并重新挂载。
6. 距过期 30 秒内用刷新令牌换新；刷新失败沿用旧令牌并告警。

回调地址取 `host` 头的来源加回调路径。Web 载体把 fetch 路由的请求 URL 解析到占位来源 `http://x`，真实来源只在 `host` 头里；缺少该头时回落到 Web 服务监听地址。

令牌端点的客户端认证按注册结果选择 `client_secret_post` 或 `client_secret_basic`，注册时没给出结果时优先 `client_secret_post`。授权服务器元数据列出的方式未必都被实现。

固定回调地址时，插件在指定回环端口临时监听；10 分钟无回调自动关闭。

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
| `sidebar.footer.action` | id `better-mcp`、order 52，打开弹窗面板 |
| `plugins.row.config` | 键 `dsh-plugin-better-mcp#better-mcp`，渲染 summary 或内联面板 |

两个入口使用同一个 `McpPanel`，都调用插件自己的 `/api` 路由。面板每 1 秒串行读取状态，快照序号防止旧响应覆盖新状态。

元数据与字典的完整规范见 [i18n.md](./i18n.md)。

## 数据流

```text
共享 McpPanel
  → 每 1 秒串行读取状态
    → 按快照序号接收最新响应

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