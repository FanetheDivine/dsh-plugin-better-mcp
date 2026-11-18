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
| `apply(ctx, config)` | 装配运行时并挂载常驻服务器 |
| `Config` | Schemastery schema，宿主据此校验与投影 |

浏览器入口导出 `inject = ['slots', 'locale']` 与 `apply`。

## 宿主运行时

`apply` 按顺序完成：

1. `readConfig` 展开 volatile 引用，`resolveConfig` 校验并冻结结果。
2. 创建 `ServerManager` 与 `PluginRoutes`。
3. 注册 `mcp_servers` 与 `mcp_call`。
4. 注册 `/api/better-mcp/*`、OAuth 回调与聚合端点路由。
5. 挂载 `lazy=false` 的服务器。
6. 监听 `loader/volatile-update`，按新配置对账。

`servers` 与 `expose` 都是 volatile，保存后不重挂插件。

### 懒加载

- 每台服务器是否懒加载：`state.json` 里的值优先，配置的 `lazy` 兜底。
- `mcp_call` 先 `mount`，再 `waitConnected`（25 秒上限），然后解析工具名并执行。
- 面板开关写入 `state.json`，打开时立即 `unmount`，关闭时立即 `mount`。
- 挂载通过 `ctx.mcpManager.register(name, entry)`；连接、重连、工具发现与拆除由管理器负责。

### 定义写入

面板路由经 `ctx.configEditor.edit(ctx.fiber.entry, change)` 写入 profile 用户层。

- 校验在宿主侧完成；非法定义返回 400。
- 配置被更高层覆盖时返回 409。
- 写入触发 volatile 更新；插件串行对账：卸载移除项、重建变更项、挂载新增的常驻项。
- 面板快照会等待对账完成。

### OAuth

1. 探测端点 `initialize`，要求返回 `401`，读 `resource_metadata`。
2. 读受保护资源元数据与授权服务器元数据，失败时尝试 `openid-configuration`。
3. 有 `registration_endpoint` 时动态注册 `client_secret_post` 客户端。
4. 生成 PKCE S256 verifier 与 state，拼授权 URL（带 `resource`）。
5. 回调换码，写授权记录，卸载旧实例并按懒加载重新挂载。
6. 距过期 30 秒内用刷新令牌换新；刷新失败沿用旧令牌并告警。

固定回调地址时，插件在指定回环端口临时监听；10 分钟无回调自动关闭。

### 聚合端点

- 路由注册在 `expose.endpoint` 前缀上，组名取路径第一段。
- 处理器按组构造，工具表每次请求实时读取 `ctx.tools.schemas()`。
- 无状态：只接受 `POST`，回包为 JSON，批量上限 20。
- 鉴权用 `BETTER_MCP_TOKEN`；面板可读取与轮换。

### 秘密存放

| 内容 | 位置 |
| --- | --- |
| 访问令牌、刷新令牌 | 凭据库 `grant` 记录 |
| 客户端密钥 | 凭据库 `api-key` 记录，id 为 `<grantId>-client` |
| 聚合令牌 | 凭据引用 `BETTER_MCP_TOKEN` |

配置文件和 `state.json` 不保存秘密。

## 浏览器运行时

| 注册项 | 作用 |
| --- | --- |
| `locale.register` | 注册 `dsh-plugin-better-mcp` 命名空间的中英文字典 |
| `sidebar.footer.action` | id `better-mcp`、order 52，打开弹窗面板 |
| `plugins.row.config` | 键 `dsh-plugin-better-mcp#better-mcp`，渲染 summary 或内联面板 |

两个入口使用同一个 `McpPanel`，都调用插件自己的 `/api` 路由。

元数据与字典的完整规范见 [i18n.md](./i18n.md)。

## 数据流

```text
面板 / 配置页
  → /api/better-mcp/*
    → configEditor / credentials / state.json
      → loader/volatile-update
        → ServerManager.reconcile
          → mcpManager.register / dispose
```