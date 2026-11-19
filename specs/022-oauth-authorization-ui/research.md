# Research: OAuth 授权与待授权提示

## R1 Figma 客户端身份

**Decision**: Figma 官方 MCP 使用动态客户端注册，注册名为 `Codex`。配置中的 `app_EMoamEEZ73f0CkXaXp7hrann` 对 Figma 视为无效固定客户端，授权启动时改用上述注册流程。表单移除该固定客户端备选项。

**Rationale**:

- Figma 元数据声明授权端点 `https://www.figma.com/oauth/mcp` 与注册端点 `https://api.figma.com/v1/oauth/mcp/register`。
- Figma 只允许 MCP catalog 中的客户端。OpenAI 当前 Codex 实现通过动态注册并发送 `client_name: "Codex"` 连接 MCP。
- Hermes 的公开验证记录显示精确名称 `Codex` 可完成注册，自定义客户端名返回 `403`。
- `app_EMoamEEZ73f0CkXaXp7hrann` 属于 OpenAI 登录场景，作为 Figma `client_id` 会触发客户端不存在错误。

**Alternatives considered**:

- 保留固定 `app_` 标识：与 Figma 当前授权流程不兼容。
- 全局把所有固定客户端替换为动态注册：破坏其他服务器的显式配置。
- 使用第三方插件的 `Claude Code (DSH)` 注册名：有同类 DSH 插件的实测记录，但 OpenAI 当前源码为 `Codex` 提供了更直接的协议证据。

**Evidence**:

- [Figma remote MCP installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [Figma authorization metadata](https://api.figma.com/.well-known/oauth-authorization-server)
- [Figma protected-resource metadata](https://mcp.figma.com/.well-known/oauth-protected-resource)
- [OpenAI Codex OAuth registration](https://raw.githubusercontent.com/openai/codex/main/codex-rs/rmcp-client/src/oauth_client_registration.rs)
- [Hermes Figma 注册验证记录](https://github.com/NousResearch/hermes-agent/pull/73141)
- [同类 DSH 插件的 Figma 注册记录](https://github.com/lcf2212dev/dsh-figma-mcp-oauth#figma-policy-why-clientname-claude-code-dsh)

## R2 直接授权链接

**Decision**: 新增 `GET /better-mcp/oauth/start?server=<name>` Web 路由。路由复用现有授权启动逻辑，成功返回 `302 Location`，失败返回 HTML 错误页。配置面板使用 `<a target="_blank" rel="noreferrer">`，由 DSH 默认外链行为处理导航。

**Rationale**: 链接在渲染时就有真实地址，点击无需等待异步请求，也不会产生空白页、弹窗拦截或无效导航。

**Alternatives considered**:

- 保留 `window.open`：不符合用户明确要求。
- 点击后请求 JSON 再设置链接地址：第一次点击无法直接完成导航，且需要额外准备状态。
- 轮询时提前生成全部授权地址：会重复注册客户端并占用固定回环端口。

## R3 待授权全局状态

**Decision**: 侧边栏组件读取现有面板状态，使用与服务器行相同的 `auth === 'oauth' && !authorized` 条件，并复用串行轮询与停止清理。

**Rationale**: 状态来源一致，修改范围集中在客户端入口。面板与侧边栏可以独立挂载和卸载。

**Alternatives considered**: 新增共享前端状态仓库会增加跨槽位生命周期与测试复杂度，本需求不需要。

## R4 视觉与动效

**Decision**: 待授权链接使用宿主主按钮主题变量；侧边栏待授权状态使用警告色与阴影关键帧。`prefers-reduced-motion: reduce` 下关闭持续动效。

**Rationale**: 两种状态保持一致的警告语义，同时遵循宿主主题和减少动态效果偏好。

**Alternatives considered**: 固定颜色与无限闪烁会破坏主题适配和可访问性。

## R5 会话目录授权过滤

**Decision**: `VisibilityRuntime.entriesOf` 排除 `auth === 'oauth' && !authorized` 的服务器。服务器管理器维护授权状态内存快照；授权完成、退出、删除与状态读取更新快照。路由完成换码和挂载后通知全部在线 Agent 重新生成目录。

**Rationale**: `catalogFor` 是同步调用，不能让模型等待凭据库读取。内存快照保持同步渲染，成功授权通过显式事件触发即时提醒。

**Alternatives considered**: 在 `catalogFor` 中异步读取凭据会改变宿主钩子契约；只在授权页返回后依赖下一次轮询无法满足立即注入。

## R6 宿主兼容性

**Decision**: 沿用当前依赖与宿主服务，不新增依赖。真实 Desktop 验证需记录运行宿主 `0.2.2-rc.5` 与项目依赖基线 `0.2.2-rc.3` 的版本差异。

**Rationale**: 所需 Web 路由、客户端槽位与状态接口均已存在。

**Alternatives considered**: 升级全部宿主依赖超出本次缺陷修复范围。
