# Contract: Configuration

插件行配置来自 profile 的用户层或补丁层。运行期增删改由宿主 config editor 写入用户层。

## 完整示例

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
              clientId: <client-id>
              redirectUri: http://127.0.0.1:19876/callback
          chrome:
            transport: stdio
            command: npx
            args: ['-y', 'chrome-devtools-mcp@latest']
            lazy: false
            auth: none
        expose:
          enabled: true
          endpoint: /better-mcp/mcp
          groups:
            harness:
              title: DSH harness tools
              include: ['workspace_*', 'session_*']
              exclude: []
            browser:
              title: Browser tools
              include: ['browser_*']
```

## 规则

- 顶层只允许 `servers` 与 `expose`；其他键使插件加载失败。
- `servers` 缺省为空；`expose` 缺省为启用、端点 `/better-mcp/mcp`、单组 `harness`。
- 服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`。
- 传输字段规则见 [data-model.md](../data-model.md#2-serverdefinition)。
- 客户端密钥不写在配置里；固定客户端的密钥经面板写入凭据库。旧配置中的 `oauth.clientSecret` 仍被读取。
- 聚合令牌、访问令牌、刷新令牌不写在配置里。
- 两个字段都是 volatile：保存后就地生效。

## 面板写入

- 新增或更新：`change(current) = { ...current, servers: { ...current.servers, [name]: definition } }`。
- 删除：从 `current.servers` 去掉该键。
- 写入前在宿主侧做完整校验；config editor 拒绝时把原因返回面板。
- 写入成功后若定义来自更高层覆盖，返回 `409`，配置保持不变。