# 已知风险

## 宿主版本

- `@deepseek-ai/dsh-*` 处于 rc 阶段，接口可能在版本间变化。
- 插件依赖的 `dsh-*` 版本应与运行它的 DSH 版本一致。
- 实机测试按 `@deepseek-ai/dsh-agent` 的版本选择宿主，版本不一致时安装到 `~/.dsh-local/dsh-<版本>`。

## 安装 rc 依赖

pnpm 的 minimum release age 策略会拒绝发布时间过短的包。

- `@deepseek-ai/dsh-*` 依赖未列入 `minimumReleaseAgeExclude` 时，`pnpm install` 失败。
- 列入规则见[宪章](../.specify/memory/constitution.md)原则 I。

## 共享宿主实例

插件运行时使用宿主提供的 cordis、schemastery 与 dsh 服务。

- 这些包被打进 bundle 时会产生第二份实例。
- 保持 external 的规则见 [how-it-works.md](./how-it-works.md#依赖复用)。

## OAuth

- 服务器必须返回标准 `401` 与授权元数据；只支持静态 token 的服务器无法登录。
- 没有动态注册端点时必须手动填写客户端标识、密钥与回调地址。
- 钉死回调地址的服务器占用固定回环端口；端口被占用时授权启动失败。
- 授权页可能被浏览器拦截；面板会显示授权地址作为后备。
- 刷新令牌失效后需要重新授权。

## 会话可见性

- 隐藏工具依赖宿主的 `tools.restrict` 与 `agent/pre-step`；宿主调整这两个接口后可见性失效。
- 工具归属按 `mcp__<server>__` 前缀判断；其他来源注册了同前缀的工具时也会被隐藏。
- `mcp_manage` 的选择在下一步写入目录消息后才进入会话日志；之前进程退出会丢失这次选择。
- 宿主缺少 `agents` 或 `sessionProjections` 服务时，所有服务器的工具对所有会话可见，模型没有 `mcp_manage`。
- 目录消息占用上下文，长度随服务器数量与简介长度增长。

## 面板

- 只有本插件配置的服务器可编辑；外部插件管理的服务器只读。
- 配置被更高层覆盖时保存返回 409，配置保持不变。
- 删除服务器会清除授权与客户端密钥，无法撤销。
- 前端依赖宿主的 `sidebar.footer.action` 与 `plugins.row.config` 槽位；宿主调整槽位后入口消失。
- 客户端依赖版本与宿主不一致时，槽位或 locale 服务可能不可用。

## 严格配置

配置中出现未知键或非法值时，插件加载失败。

- 用户在 `cordis.patch.yml` 写错键名会导致插件停用。
- 用 `dsh --profile <profile> --dump-config` 检查最终配置。

## 国际化

- 宿主在注册时捕获的文案（如命令描述）保持注册时的语言，切换语言后仍显示旧语言；槽位渲染的文案随切换更新。
- locale 服务只负责选择、持久化、语言匹配、键回退与 `<html lang>`，复数规则与双向布局由语言包自理。
- 元数据或字典缺当前语言时按回退链取值；缺 `meta.title` 与 `meta.description` 时回落 `package.json` 的字段，可能显示英文包名。
- 规范见 [i18n.md](./i18n.md)。

## Windows 长路径

`node_modules` 嵌套很深，路径可能超过 Windows 的 260 字符上限。

- `git worktree remove` 此时报错 `Filename too long`。
- `finish-worktree.sh` 遇到该错误时用 Node.js `rmSync` 删除目录，再运行 `git worktree prune`。