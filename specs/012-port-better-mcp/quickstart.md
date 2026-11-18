# Quickstart: Better MCP 插件

## 前提

- Node.js >= 24.9，pnpm 11。
- DSH 0.2.2-rc.3（与 `@deepseek-ai/dsh-*` 依赖一致）。
- 至少一台可用的 MCP 服务器；OAuth 用例需要一台返回标准 `401` 的服务器。

## 本地检查

```sh
pnpm install
pnpm check        # 类型检查、lint、单元测试、构建
```

预期：全部通过，`dist/index.mjs`、`dist/client.js` 与类型声明存在。

## 安装到 profile

1. 构建：`pnpm build`。
2. 把插件加入 profile：

```sh
dsh plugin add <repo>
```

3. 在 profile 的 `cordis.patch.yml` 中确认出现 `better-mcp` 行；`servers` 默认为空。
4. 重启 DSH，确认插件页出现 `Better MCP`，侧栏底部出现 MCP 图标。

## 手工验收

### 1. 懒加载

1. 在面板新增一台 `streamable-http` 服务器，懒加载保持开启。
2. 保存后确认它出现在列表，状态为未连接。
3. 让模型调用 `mcp_call`，指定该服务器与一个工具。
4. 预期：服务器自动连接，工具返回内容；`mcp_servers` 显示工具数与 `lazy` 标记。

### 2. OAuth

1. 对返回 `401` 的服务器点“授权”。
2. 在打开的页面完成登录。
3. 预期：回调页显示成功，面板状态变为已连接；`cordis.patch.yml` 与 `state.json` 中没有令牌。
4. 点“退出登录”，预期服务器卸载且授权标记消失。

### 3. 聚合端点

1. 面板复制组地址与访问令牌。
2. 用任意 MCP 客户端以 `POST` 发送：

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

3. 预期：返回组内工具清单；不带令牌返回 `401`。
4. 轮换令牌后，用旧令牌请求预期 `401`。

### 4. 双入口

1. 侧栏点 MCP 图标：出现弹窗面板。
2. 插件页打开本行详情：出现同一组服务器与操作。
3. 在任一入口新增一台服务器，另一入口重试后看到同一结果。

## 实机验证

```sh
bash .dsh/skills/real-device-test/scripts/setup-env.sh <repo> <profile>
cd <profile 目录>
node run-test.mjs
node .dsh/skills/real-device-test/scripts/browser-test.mjs
```

用例覆盖：装载、工具调用、懒加载挂载、配置写入、面板与配置页渲染。结果写入 `results.json` 与 `browser-results.json`。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| 面板不出现 | 插件是否启用；`dsh.client` 是否声明 `platform: web`；刷新页面 |
| 配置写入返回 409 | profile 更高层覆盖了同一字段，或部署只读 |
| OAuth 启动返回 502 | 服务器的授权元数据是否标准；固定回调端口是否被占用 |
| 聚合端点 404 | `expose.enabled`、`expose.endpoint` 与组名 |
| 外部工具调用报错 | 该工具是否需要 Agent 会话（例如工作目录写模式） |