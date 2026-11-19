# OAuth 启动与链接契约

## 配置面板授权链接

```html
<a href="/better-mcp/oauth/start?server=figma" target="_blank" rel="noreferrer">授权</a>
```

- `server` 为经过 URL 编码的已配置服务器名。
- 待授权链接使用强调样式。
- 客户端不调用 `window.open`，不在点击回调中请求授权地址。
- 原生链接支持键盘激活、复制地址与 DSH 默认外链打开。

## GET `/better-mcp/oauth/start`

用途：启动 OAuth 并把默认浏览器重定向到授权服务器。

### 成功

- 状态码：`302`
- `Location`：本次授权生成的完整授权地址
- `Cache-Control: no-store`
- 服务端保存 `state` 对应的服务器名、PKCE verifier、回调地址与客户端身份。

### Figma 默认参数

- 动态注册名：`Codex`
- 回调：`http://127.0.0.1:19876/callback`
- 启动授权时监听该回环地址，10 分钟无回调自动关闭。

### 失败

- 服务器不存在或不是 HTTP：状态码 `400`
- 发现、注册或固定回环监听失败：状态码 `502`
- 响应为 HTML 错误页，正文包含原始错误原因。

### 回调

继续使用现有 `GET /better-mcp/oauth/callback`。回调通过 `state` 找到本次服务器，完成换码、凭据写入与服务器重连。状态过期或未知时返回错误。

## 现有 JSON 路由

`GET /api/better-mcp/oauth/start` 保留并复用同一授权启动逻辑，返回 `{ url, scopes, redirectUri }`。配置面板不再依赖该 JSON 结果执行导航。

## 侧边栏状态

侧边栏组件读取 `GET /api/better-mcp/status`，使用 `auth === 'oauth' && !authorized` 判断待授权。组件卸载后停止轮询。
