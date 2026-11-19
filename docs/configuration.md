# 配置参考

面板覆盖常用字段。需要环境变量、工作目录或固定回调地址时，直接编辑 profile 中 `better-mcp` 行的配置。

## 示例

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

## 字段

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `description` | 必填 | 简介。模型据此判断何时打开这台服务器 |
| `transport` | 必填 | `streamable-http` 或 `stdio` |
| `url` | http | 端点地址 |
| `headers` | http | 额外请求头 |
| `command` | stdio | 启动命令 |
| `args` | stdio | 启动参数 |
| `env` | stdio | 额外环境变量 |
| `cwd` | stdio | 工作目录 |
| `auth` | 可选 | `oauth` 或 `none`。http 默认 `oauth`，stdio 默认 `none` |
| `lazy` | 可选 | 默认 `true`，新会话默认隐藏这台服务器的工具 |
| `oauth.scopes` | 可选 | 请求的授权范围；留空用服务器建议值 |
| `oauth.clientId` | 可选 | 固定客户端标识；留空走动态注册 |
| `oauth.redirectUri` | 可选 | 固定回调地址，必须是 `127.0.0.1` 或 `localhost` 的 http 地址 |
| `oauth.clientSecret` | 兼容 | 旧配置的客户端密钥；面板会把它写入凭据库 |

## 规则

- 服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`。
- DSH MCP 管理器支持的其他字段原样透传，例如超时与重连策略。
- `servers` 保存后立即生效，插件无需重启。
- 配置写错会让插件停用，排查步骤见 [README](../README.md#插件被停用)。
