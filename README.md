# dsh-plugin-better-mcp

DSH 插件：按服务器懒加载 MCP、可视化 OAuth 登录，并把本机工具收集成一个 HTTP MCP 端点。

## 功能

- 每台服务器可独立设置为懒加载，启动时只挂载常驻服务器。
- `mcp_call` 首次命中懒加载服务器时自动挂载、等待连接并执行。
- 返回 `401` 的服务器可从面板发起 OAuth 登录，支持动态注册、固定客户端与固定回环回调。
- 授权、刷新令牌与客户端密钥存 DSH 凭据库，配置文件不保存秘密。
- 侧栏“重启”右侧新增 MCP 图标；点击打开面板，查看状态、切换懒加载、重连、授权、增删改服务器。
- “插件”页本行的配置页复用同一个面板。
- 按组暴露本机工具为一个无状态 HTTP MCP 端点，用 Bearer 令牌鉴权。

## 安装

```sh
dsh plugin add dsh-plugin-better-mcp
```

安装会插入 `better-mcp` 行，`servers` 默认为空。重启 DSH 后，侧栏出现 MCP 图标，插件页出现 `Better MCP`。

## 配置

```yaml
- insert:
    - id: better-mcp
      name: dsh-plugin-better-mcp
      config:
        servers:
          figma:
            transport: streamable-http
            url: https://mcp.figma.com/mcp
            lazy: true
            auth: oauth
            oauth:
              scopes: ['mcp:connect']
          chrome:
            transport: stdio
            command: npx
            args: ['-y', 'chrome-devtools-mcp@latest']
            lazy: false
        expose:
          enabled: true
          endpoint: /better-mcp/mcp
          groups:
            harness:
              title: DSH harness tools
              include: ['workspace_*', 'session_*']
```

### servers

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `transport` | 必填 | `streamable-http` 或 `stdio` |
| `url` | http | 端点地址 |
| `headers` | http | 额外请求头 |
| `command` | stdio | 启动命令 |
| `args` | stdio | 启动参数 |
| `env` | stdio | 额外环境变量 |
| `cwd` | stdio | 工作目录 |
| `auth` | 可选 | `oauth`（http 默认）或 `none`（stdio 默认） |
| `lazy` | 可选 | 默认 `true` |
| `oauth.scopes` | 可选 | 请求的 scope；留空用服务器建议值 |
| `oauth.clientId` | 可选 | 固定客户端标识；留空走动态注册 |
| `oauth.redirectUri` | 可选 | 固定回调地址，必须是 `127.0.0.1` 或 `localhost` |
| `oauth.clientSecret` | 兼容 | 旧配置的客户端密钥；面板改为写入凭据库 |

服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`。管理器支持的其它字段（超时、重连策略）原样透传。

### expose

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关闭时端点返回 404 |
| `endpoint` | `/better-mcp/mcp` | 端点前缀 |
| `groups` | `harness` | 组名到工具筛选规则的映射 |

组的 `include` 用 `*` 通配符；`include` 为空时排除所有 `mcp__` 前缀工具；`exclude` 优先。

`servers` 与 `expose` 都是 volatile：保存后立即生效，插件不重启。

## 面板

侧栏 MCP 图标打开弹窗面板；“插件”页本行详情打开同款内联面板。

- 按服务器显示连接状态、工具数、地址与授权标记。
- 开关懒加载；重连；授权、重新授权、退出登录。
- 新增、编辑、删除本插件管理的服务器；删除同时清除授权、客户端密钥与懒加载状态。
- 显示每组的端点地址与访问令牌；可复制、显示、轮换令牌。

外部插件管理的服务器只显示状态。

## 工具

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `mcp_servers` | 无 | 列出服务器状态、工具数、懒加载与授权标记 |
| `mcp_call` | `server`、`tool`、`arguments?` | 挂载懒加载服务器并调用指定工具 |

已经连接的服务器优先直接用它的原生 `mcp__<server>__<tool>` 工具。

## 聚合 MCP 端点

组地址为 `<endpoint>/<group>`。用面板复制的令牌鉴权：

```sh
curl -s http://127.0.0.1:<port>/better-mcp/mcp/harness \
  -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "dsh-harness": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:<port>/better-mcp/mcp/harness",
      "headers": { "authorization": "Bearer <token>" }
    }
  }
}
```

端点无状态，只接受 `POST`，回包为 JSON。`initialize`、`tools/list`、`tools/call`、`ping` 可用，批量最多 20 条。需要 Agent 会话的工具从外部调用时返回错误。

## OAuth

面板点“授权”后：

1. 插件探测端点，读取 `401` 挑战与资源元数据。
2. 读取授权服务器元数据；支持动态注册时自动注册客户端。
3. 用 PKCE S256 打开浏览器授权页。
4. 回调换码后写授权记录，按懒加载设置重新挂载。

服务器钉死回调地址时，插件在 `127.0.0.1` 或 `localhost` 的指定端口临时监听，10 分钟无回调自动关闭。固定客户端可在编辑表单里填写客户端标识、密钥与回调地址。

秘密存放位置：

- 访问令牌与刷新令牌：凭据库的 `grant` 记录。
- 客户端密钥：凭据库的 `api-key` 记录。
- 聚合端点令牌：凭据引用 `BETTER_MCP_TOKEN`。

## 限制

- 聚合端点是本机 Web 端口上的同源路由，依赖宿主的 Web 载体。
- 需要 Agent 会话的工具（例如写工作目录）从外部 MCP 调用时会失败。
- 懒加载挂载首次调用最多等待 25 秒。
- 动态注册不可用时必须手动填写客户端标识与回调地址。

## 开发

- [工作机制](./docs/how-it-works.md)
- [已知风险](./docs/known-risks.md)
- [开发说明](./docs/development.md)