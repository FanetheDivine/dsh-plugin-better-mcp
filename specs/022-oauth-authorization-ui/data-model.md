# Data Model: OAuth 授权与待授权提示

## 1. 服务器授权状态

来源：现有面板快照 `ServerRow`。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `name` | string | 服务器唯一名称 |
| `auth` | `oauth` / `none` | 只有 `oauth` 参与授权状态 |
| `authorized` | boolean | 凭据库中存在有效授权记录时为 true |

派生：

- `needsAuthorization = auth === 'oauth' && !authorized`。
- `hasPendingAuthorization = any(row.needsAuthorization)`。

## 2. 授权入口

| 属性 | 规则 |
| --- | --- |
| 地址 | 指向插件授权启动 Web 路由，并以服务器名标识本次授权 |
| 导航 | 标准 `<a target="_blank">`，由 DSH 默认外链行为打开 |
| 可访问名称 | 未授权使用「授权」，已授权使用「重新授权」 |
| 视觉状态 | 未授权使用强调样式，已授权使用次要样式 |

## 3. 侧边栏待授权状态

| 状态 | 条件 | 表现 |
| --- | --- | --- |
| 常规 | 没有待授权服务器或状态未知 | 常规图标 |
| 待授权 | 至少一台 OAuth 服务器待授权 | 强调色、阴影呼吸动效 |
| 减少动效 | 待授权且系统偏好减少动态效果 | 保留强调色，关闭持续动效 |

状态来自与配置面板相同的服务器快照，授权完成后恢复常规。

## 4. 会话目录

| 状态 | 规则 |
| --- | --- |
| OAuth 未授权 | 从 `entriesOf` 排除，不生成该服务器目录项 |
| OAuth 已授权 | 按现有 lazy / override 规则生成 active / inactive 目录项 |
| stdio / `auth: none` | 不参与授权判断，保持现有显示规则 |
| 授权成功事件 | 刷新授权状态并向全部在线 Agent `notifyAll()` |

授权状态由服务器管理器维护的内存快照提供；快照在启动挂载、状态读取、授权完成、退出与删除时更新。

## 5. Figma 客户端身份

| 场景 | 规则 |
| --- | --- |
| 用户未指定客户端 | 动态注册 `client_name: Codex` |
| 默认回调 | `http://127.0.0.1:19876/callback`，启动一次性回环监听 |
| 配置为 `app_EMoamEEZ73f0CkXaXp7hrann` | 忽略该 OpenAI 固定标识，动态注册 `client_name: Codex` |
| 用户指定其他客户端 | 保留显式配置；被 Figma 拒绝时显示服务端错误 |

README 示例不配置固定客户端标识。
