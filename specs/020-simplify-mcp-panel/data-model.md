# Data Model

## 服务器配置

面板只读取插件配置中的服务器。

| 字段 | 规则 |
| --- | --- |
| `name` | 沿用 `^[A-Za-z0-9_-]{1,32}$` |
| `description` | 必填 |
| `transport` | 新增默认 `stdio`，下拉顺序为 stdio、HTTP |
| `auth` | 由传输方式决定：stdio 为 `none`，HTTP 为 `oauth` |
| `lazy` | 沿用默认值与编辑行为 |
| `oauth.scopes` | 保留回填与保存 |
| `oauth.clientId` | 空值表示 DSH 动态注册；非空值表示固定客户端 |
| `oauth.clientSecret` | 只写凭据库，表单不回填 |

表单不再包含 `auth` 与 `redirectUri` 输入状态。后端继续接受已有配置中的 `redirectUri`。

## 客户端标识备选项

| 标签 | 提交值 | 行为 |
| --- | --- | --- |
| DSH | 空字符串 | 授权时动态注册客户端 |
| Codex | `app_EMoamEEZ73f0CkXaXp7hrann` | 授权时使用 Codex 公开客户端标识 |

用户输入的其他非空字符串按固定客户端标识保存。

## 面板行

每行对应一项本插件配置。名称前不显示图标，名称后不显示来源标签。状态、懒加载、重连、授权、编辑与删除仍按配置和授权状态显示。
