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
          serena:
            description: 读取与编辑当前工作区项目
            transport: stdio
            command: uvx
            args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server']
            workspace: true
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
| `workspace` | 可选 | 仅 stdio，默认 `false`；启用后每个工作区使用独立实例并强制懒加载 |
| `oauth.scopes` | 可选 | 请求的授权范围；留空用服务器建议值 |
| `oauth.clientName` | 可选 | 动态注册身份，默认 `Codex`；选 DSH 时为 `DeepSeek Harness (better-mcp)` |
| `oauth.clientId` | 可选 | 固定客户端标识；留空走动态注册 |
| `oauth.redirectUri` | 可选 | 固定回调地址，必须是 `127.0.0.1` 或 `localhost` 的 http 地址 |
| `oauth.clientSecret` | 兼容 | 旧配置的客户端密钥；面板会把它写入凭据库 |

## 工作区级实例

- 每个工作区按需启动一个实例，同一工作区的 Agent 共享实例。
- 实例以所属工作区的规范化绝对路径为 `cwd`，覆盖定义中的 `cwd`。
- 模型调用 `mcp_manage` active 时连接；inactive 时当前 Agent 的工具立即隐藏。
- 没有其他 active Agent 使用实例时，inactive 会断连；其他 active Agent 会继续占用文件夹。
- 删除文件夹前先将相关工作区服务器 inactive。active 与清理结果会写入 system-reminder。
- 切换工作目录或检测到目录缺失时，实例关闭并写入提醒。
- 面板的「连接情况」按成功和失败分组，支持路径搜索、全部重连和单工作区重连。

## Figma 官方 MCP

- 授权使用注册名 `Codex` 与 `http://127.0.0.1:<系统分配端口>/callback`，无需配置 `oauth.clientId`。
- 配置里的 `app_EMoamEEZ73f0CkXaXp7hrann` 对 Figma 无效，授权启动时改走动态注册。

## 规则

- 服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`。
- DSH MCP 管理器支持的其他字段原样透传，例如超时与重连策略。
- `servers` 保存后立即生效，插件无需重启。
- 配置写错会让插件停用，排查方法见[已知风险](./known-risks.md#严格配置)。
