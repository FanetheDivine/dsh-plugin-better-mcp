# dsh-plugin-better-mcp

DSH 插件：可视化地对 MCP 进行管理和鉴权；提供 MCP 懒加载能力。

## 功能

- 在面板里新增、编辑、删除本插件配置的 MCP 服务器，每台服务器带一段简介。
- 返回 `401` 的服务器可从面板发起 OAuth 登录，支持动态注册与固定客户端，默认同源回环回调。
- 授权、刷新令牌与客户端密钥存 DSH 凭据库，配置文件不保存秘密。
- 服务器在插件启用时全部挂载；每个会话独立决定哪些服务器的工具进入模型的工具集。
- 懒加载服务器在新会话的首个 Turn 默认隐藏，模型用 `mcp_manage` 按需打开。
- 每个 Turn 结束后，本会话的全部服务器自动变为 inactive，后续 Turn 可重新启用。
- MCP 配置或会话可见性变化后，插件向受影响会话写入目录提醒，列出服务器名称、简介与可见性。
- 侧栏新增 MCP 图标，点击打开本插件的配置页；“插件”页本行的配置页复用同一个面板。
- 插件元数据与面板文案提供中英文。

## 安装

```sh
dsh plugin add dsh-plugin-better-mcp
```

安装会插入 `better-mcp` 行，`servers` 默认为空。重启 DSH 后，侧栏出现 MCP 图标，插件页出现本插件。

## 配置

```yaml
- insert:
    - id: better-mcp
      name: dsh-plugin-better-mcp
      config:
        servers:
          figma:
            description: 读取 Figma 设计稿、组件与样式
            transport: streamable-http
            url: https://mcp.figma.com/mcp
            lazy: true
            auth: oauth
            oauth:
              scopes: ['mcp:connect']
          chrome:
            description: 控制本机 Chrome，打开页面、截图与调试
            transport: stdio
            command: npx
            args: ['-y', 'chrome-devtools-mcp@latest']
            lazy: false
```

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `description` | 必填 | 简介，写入会话的 MCP 目录，帮助模型判断何时打开这台服务器 |
| `transport` | 必填 | `streamable-http` 或 `stdio` |
| `url` | http | 端点地址 |
| `headers` | http | 额外请求头 |
| `command` | stdio | 启动命令 |
| `args` | stdio | 启动参数 |
| `env` | stdio | 额外环境变量 |
| `cwd` | stdio | 工作目录 |
| `auth` | 可选 | `oauth`（http 默认）或 `none`（stdio 默认） |
| `lazy` | 可选 | 默认 `true`：新会话的首个 Turn 默认隐藏这台服务器的工具 |
| `oauth.scopes` | 可选 | 请求的 scope；留空用服务器建议值 |
| `oauth.clientId` | 可选 | 固定客户端标识；留空走动态注册 |
| `oauth.redirectUri` | 可选 | 固定回调地址，必须是 `127.0.0.1` 或 `localhost` 的 http 地址 |
| `oauth.clientSecret` | 兼容 | 旧配置的客户端密钥；面板写入凭据库 |

- 服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`。
- 管理器支持的其它字段（超时、重连策略）原样透传。
- `servers` 是 volatile：保存后立即生效，插件不重启。
- 只改 `description` 或 `lazy` 时，服务器保持连接。

## 会话可见性

服务器始终挂载，可见性按会话决定：

| 状态 | 模型看到的内容 |
| --- | --- |
| active | 该服务器的原生工具 `mcp__<server>__<tool>`，直接调用 |
| inactive | 该服务器的工具不在工具集中，也无法调用 |

- 新会话的首个 Turn 未显式切换时，`lazy: true` 的服务器为 inactive，`lazy: false` 的服务器为 active。
- 模型调用 `mcp_manage` 切换本会话的可见性，其他会话不受影响。
- 每个 Turn 结束后，本会话的全部服务器自动变为 inactive。服务器连接与 `lazy` 配置保持不变。
- 后续 Turn 可重新启用服务器，显式选择与 Turn 结束边界记录在会话日志中。
- 子代理拥有独立的可见性，并按自己的 Turn 结束时间重置。

### 工具

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `mcp_manage` | `server`、`command`（`active` 或 `inactive`） | 切换本会话中一台服务器的可见性 |

返回值说明服务器名、新可见性与连接状态。未连接的服务器设为 active 后，连接成功时工具自动出现。

### 会话提醒

插件按需写入一条 `<system-reminder>` 消息：

| 时机 | 内容 |
| --- | --- |
| 会话第一步 | 完整目录：每台服务器的名称、可见性与简介，以及 `mcp_manage` 用法 |
| 压缩移除了目录消息 | 重新写入完整目录 |
| 主动切换可见性 | 立即写入变化说明与完整目录，列出变为可见与不可见的服务器 |
| Turn 结束后的下一模型步骤 | 写入全部服务器 inactive 的目录更新；已经全部 inactive 时跳过 |
| 新增、删除服务器或修改简介 | 配置生效后立即向全部在线会话写入更新后的完整目录 |

变化后的提醒随下一次模型步骤进入会话历史，空闲会话不会自动发起模型请求。状态不变时插件抑制重复提醒，连续变化在下一步合并为最新目录。

## 面板

侧栏 MCP 图标打开本插件详情中的「已配置的 MCP」面板；“插件”页本行详情复用同一个内联面板。面板只列出本插件配置，随 DSH 亮色与暗色主题切换。

- 按服务器显示简介、连接状态、工具数、地址与授权标记。
- 面板打开时每秒自动同步配置与连接状态，关闭后停止。
- 开关懒加载，即新会话首个 Turn 的默认可见性。
- 重连；授权、重新授权、退出登录。
- 新增表单默认使用 stdio；HTTP 服务器在表单中固定使用 OAuth。
- 新增与编辑在独立表单弹窗中完成，校验错误关联到对应字段。
- 删除服务器前需确认；删除同时清除授权与客户端密钥。

## OAuth

面板点“授权”后：

1. 插件探测端点，读取 `401` 挑战与资源元数据。
2. 读取授权服务器元数据；支持动态注册时自动注册客户端。
3. 用 PKCE S256 打开浏览器授权页。
4. 回调换码后写授权记录，重新挂载服务器。

- 服务器钉死回调地址时，插件在 `127.0.0.1` 或 `localhost` 的指定端口临时监听，10 分钟无回调自动关闭。
- 客户端标识提供 DSH 动态注册与 Codex 公开客户端两个备选项，也可自由输入；客户端密钥在编辑表单里单独填写。
- Figma 不接受 DSH 动态注册客户端时，可选择 Codex 备选项后重试授权。
- 表单使用同源回环回调；`oauth.redirectUri` 仍供 YAML 高级配置使用。
- 访问令牌与刷新令牌存凭据库的 `grant` 记录。
- 客户端密钥存凭据库的 `api-key` 记录。

## 限制

- 动态注册不可用时选择 Codex 备选项或手动填写客户端标识。
- 需要授权而尚未授权的服务器保持未挂载，授权后挂载。
- 可见性只作用于本插件配置的服务器。

## 开发

- [工作机制](./docs/how-it-works.md)
- [已知风险](./docs/known-risks.md)
- [开发说明](./docs/development.md)
