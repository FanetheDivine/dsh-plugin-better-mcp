# 开发

## 本地加载

推荐把仓库作为本地包安装：

```sh
pnpm build
dsh plugin add <repo>
```

安装会插入 `better-mcp` 行并链接当前目录；改动后重建并刷新页面。

也可以只在 profile 里指向宿主产物：

```yaml
- insert:
    - id: better-mcp-dev
      name: file:///<repo>/dist/index.mjs
```

前端部分仍由包的 `dsh.client` 声明加载 `dist/client.js`。

## 热更新

在同一文件启用 `hmr` 并监听 `dist`：

```yaml
- id: hmr
  disabled: false
  config:
    root: ["<repo>/dist"]
    ignored: ["**/node_modules"]
```

- 修改补丁后无需重启 DSH，运行中的 profile 会重新应用补丁。
- 插件行指向新路径时同时修改 `id`，确保宿主加载新路径的模块。
- 仓库路径含 `.dsh` 等点目录时，去掉默认的 `**/.*` 忽略规则。

## 前端构建

`tsdown.config.ts` 有两组构建：

| 构建组 | 入口 | 产物 |
| --- | --- | --- |
| 宿主 | `src/index.ts` | `dist/index.mjs` |
| 浏览器 | `src/client/index.tsx` | `dist/client.js` |

- 浏览器组用 banner/footer/intro 包成 `window.__ModuleLoader__.load({ id, factory })` 闭包工厂。
- `PLATFORM_MODULES` 列出宿主冻结模块表提供的模块，构建时保持 external。
- 新增或升级宿主客户端依赖时，核对平台种子表与宿主版本。
- 类型声明由 `tsc -p tsconfig.build.json` 生成。

## 环境要求

- Node.js 24.9 及以上，与 DSH 的运行要求一致；CI 使用 Node 24。
- pnpm 11。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 监听并构建 |
| `pnpm build` | 打包、生成类型声明并运行 `test:dist` |
| `pnpm check` | 依次运行类型检查、lint 和 `test:code` |
| `pnpm full-check` | `check` 加构建 |
| `pnpm typecheck` | 类型检查 |
| `pnpm lint` | biome 检查 |
| `pnpm lint:fix` | biome 检查并自动修复 |
| `pnpm format` | biome 格式化 |
| `pnpm test:code` | 只运行源码测试 |
| `pnpm test:dist` | 只运行产物测试，要求 `dist` 新鲜 |
| `pnpm run release` | 检查、格式化、升版本、归档 CHANGELOG 并推送 tag |

代码质量门禁是 `pnpm check`；`test:code` 与 `test:dist` 用于局部验证。

## CI

`.github/workflows/ci.yml` 有两个 job：

| Job | 触发 | 内容 |
| --- | --- | --- |
| `check` | PR、打 tag | Node 24 上运行 `pnpm run full-check` |
| `publish` | 打 tag | 用 OIDC 发布 npm |

`full-check` 依次运行 `check` 与 `build`：`check` 不读取 `dist`，产物测试在 `build` 末尾执行。

发布前把 npm Trusted Publisher 绑定到本仓库与 `.github/workflows/ci.yml`。

## 测试

| 文件 | 覆盖内容 |
| --- | --- |
| `tests/plugin.test.ts` | 入口契约、启动挂载、volatile 对账、卸载清理 |
| `tests/config.test.ts` | 默认值、严格校验、服务器定义规则、volatile 读取 |
| `tests/state.test.ts` | 懒加载状态读写与损坏回退 |
| `tests/credentials.test.ts` | 授权、客户端密钥、聚合令牌 |
| `tests/oauth.test.ts` | 发现、动态注册、PKCE、换码与刷新 |
| `tests/aggregate.test.ts` | 组匹配、鉴权、JSON-RPC 方法与批量 |
| `tests/servers.test.ts` | 挂载、等待连接、工具名解析、快照与对账 |
| `tests/routes.test.ts` | 面板路由、OAuth 路由、回调与端点接线 |
| `tests/client.test.ts` | 字典、槽位注册、表单校验与静态渲染 |
| `tests/client-bundle.test.ts` | `dist/client.js` 的注册契约与导出（产物测试） |
| `tests/package-pack.test.ts` | npm 包内容与补丁（产物测试） |
| `tests/metadata.test.ts` | 插件元数据的结构、键集、禁用字符与清单声明 |
| `tests/dist-freshness.test.ts` | 产物新鲜度判定的五种状态 |
| `tests/release-archive.test.mjs` | CHANGELOG 归档计划 |
| `tests/worktree-extension.test.ts` | worktree 扩展的创建、复用与清理 |
| `tests/helpers.ts` | 模拟宿主与客户端 `ctx` |
| `tests/support/dist-freshness.ts` | 构建输入与产物清单、`assertFreshDist` |

测试要求见[宪章](../.specify/memory/constitution.md)原则 II。文案与元数据的规范见 [i18n.md](./i18n.md)。

vitest 拆成 `code` 与 `dist` 两个 project。产物测试读取 `dist`，由 `build` 末尾的 `test:dist` 执行；`test:code` 不读取 `dist`。产物缺失或早于构建输入时，产物测试失败并提示运行 `pnpm build`。

## 实机验证

按 [real-device-test](../.dsh/skills/real-device-test/SKILL.md) 建专用 profile，覆盖装载、工具调用、懒加载、配置写入与面板渲染。浏览器用例由 `playwright` 驱动本机 Chrome。

## Spec Kit 流程

DSH 从 `.dsh/skills/` 加载 `speckit-*` skill，在对话框输入 `/` 调用。

- 执行条件见 [AGENTS.md](../AGENTS.md#开发流程) 的开发流程节。
- 分支与 worktree 规则见 `/speckit-worktree-create`。

| 步骤 | 命令 | 产出 |
| --- | --- | --- |
| 1 | `/speckit-specify <需求描述>` | 流程最前：Agent 先同步主工作区 `main` 到 `origin/main`，再创建分支、worktree 与 `spec.md` |
| 2 | `/speckit-clarify` | 写回 spec 的澄清结果 |
| 3 | `/speckit-plan` | `plan.md` 与设计产物 |
| 4 | `/speckit-tasks` | `tasks.md` |
| 5 | `/speckit-analyze` | 跨产物一致性报告 |
| 6 | `/speckit-implement` | 按阶段提交的实现 |
| 7 | `/speckit-worktree-finish` | 基线同步、PR、等待合并与清理；流程最后：Agent 在清理后同步主工作区 `main` 到 `origin/main` |

- `base_ref` 默认为 `origin/main`，必须已包含 `.specify/` 与 `.dsh/skills/`。
- `worktrees/` 已加入 `.gitignore`，biome 与 vitest 也会跳过它。

## 维护 worktree 扩展

扩展源码在 `.specify/extensions/worktree/`，`.dsh/skills/speckit-worktree-*` 由它渲染生成。

修改 `commands/` 或 `extension.yml` 后重新渲染：

1. 把扩展目录复制到仓库外的临时目录。
2. 运行 `specify extension add --dev <临时目录> --force`。

脚本行为由 `tests/worktree-extension.test.ts` 覆盖。

## 文件地图

```text
cordis.patch.yml            # 插件行，dsh plugin add 时插入 profile
icon.svg                    # 插件图标
locale/                     # 插件元数据，规范见 i18n.md
src/
├── index.ts                # 宿主入口：装配、挂载、热更新对账
├── config.ts               # Config schema、默认值、严格校验
├── constants.ts            # 插件标识、路径、超时与批量上限
├── types.ts                # 宿主类型再导出与路由契约
├── utils.ts                # 对象读取、JSON 响应、glob、grantId
├── home.ts                 # DSH 家目录解析
├── state.ts                # 懒加载状态
├── credentials.ts          # 授权、客户端密钥、聚合令牌
├── oauth.ts                # 发现、注册、PKCE、换码与刷新
├── aggregate.ts            # 无状态 MCP 端点处理器
├── servers.ts              # 挂载、连接等待、工具解析与快照
├── routes.ts               # /api 路由、回调与端点注册
├── tools.ts                # mcp_servers 与 mcp_call
└── client/
    ├── index.tsx           # 浏览器入口：字典、侧栏动作、配置页
    ├── panel.tsx           # 共享面板
    ├── server-form.tsx     # 新增/编辑表单
    ├── api.ts              # 插件路由调用
    └── locales.ts          # 中英文字典
dist/
├── index.mjs               # 宿主产物
├── client.js               # 浏览器产物（闭包工厂）
├── index.d.ts              # 宿主类型声明
└── client/                 # 前端类型声明
scripts/release-archive.mjs # 发布时归档 CHANGELOG
tests/                      # vitest 单元测试
├── support/
│   ├── primitives.ts       # 平台组件包解析到源码
│   └── dist-freshness.ts   # 产物新鲜度检查
docs/                       # 开发者文档
specs/<NNN>-<name>/         # 每个需求的 spec、plan、tasks
.dsh/skills/
└── speckit-*/              # Spec Kit 流程 skill
.specify/
├── memory/constitution.md  # 项目宪章
├── templates/              # Spec Kit 模板
├── scripts/bash/           # Spec Kit 脚本
├── extensions.yml          # 扩展钩子
└── extensions/worktree/    # 本地 worktree 扩展
.github/workflows/ci.yml    # CI：check 与 publish
```