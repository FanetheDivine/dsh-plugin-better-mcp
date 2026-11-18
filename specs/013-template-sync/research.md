# Research: 同步模板的元数据国际化规范与产物测试新鲜度

## 1. 测试入口拆分方式

- Decision: 用 vitest 的 `projects` 拆成 `code` 与 `dist` 两个 project，`test:code` 与 `test:dist` 用 `--project` 选择。
- Rationale: 一个配置文件、一份 alias、一份排除规则；产物测试清单只写一次，两个 project 共享。
- Alternatives considered:
  - 两个独立配置文件：alias 与排除规则要写两遍，容易漂移。
  - `test` 加 `--exclude` 参数：脚本变长，且 `build` 内再拼参数可读性差。
  - 用环境变量在测试内分支：测试入口不明确，CI 难以核对。

## 2. 移除测试内部的隐式构建

- Decision: `client-bundle.test.ts` 与 `package-pack.test.ts` 不再调用 `pnpm build`，改为先 `assertFreshDist()`。
- Rationale: 测试内构建掩盖产物过期问题，还会在 CI 中重复构建；`build` 末尾的 `test:dist` 保证产物测试跑在刚构建的产物上。
- Alternatives considered:
  - 测试内构建但加缓存：仍然把构建时间带进测试，且 `check` 会写入 `dist`。
  - 保持现状：与「`check` 不访问 `dist`」的目标冲突。

## 3. 产物新鲜度判定

- Decision: 全部产物存在，且没有任何构建输入的修改时间晚于最旧产物，判定为新鲜。
- Rationale: 一次构建会写多个产物，取最旧产物才能保证所有产物都晚于源码；实现只依赖 `stat`，无额外状态文件。
- Alternatives considered:
  - 内容哈希清单：能识别内容相同但时间不同，需要构建时写清单并入库，步骤多。
  - 只比较 `dist/index.mjs`：浏览器产物与类型声明过期漏检。
  - 用 git 提交时间：本地未提交改动检测不到。

## 4. 构建输入与产物清单

- Decision: 输入为 `tsdown.config.ts`、`tsconfig.json`、`tsconfig.build.json`、`package.json` 与 `src/` 全部文件；产物为 `dist/client.js`、`dist/index.mjs`、`dist/index.d.ts`、`dist/client/index.d.ts`。
- Rationale: 这些文件决定产物内容；`locale/`、`docs/`、`tests/` 改动不影响产物，纳入会造成误报。
- Alternatives considered:
  - 用 `git ls-files src` 列输入：依赖 git，产物测试也要在无 git 环境可跑。
  - 全仓库递归：locale 文案改动会触发重建，噪音大。

## 5. 元数据校验位置

- Decision: 新增 `tests/metadata.test.ts`，在测试阶段校验 `locale/*.json`、键集、禁用字符、`meta.detail` 与 `package.json` 声明。
- Rationale: 宿主在插件未激活时直接读文件，运行时不经过插件，校验只能放测试；测试失败早于发布。
- Alternatives considered:
  - 运行时加载时校验：插件加载失败影响用户，且停用状态读不到。
  - 只靠打包回归：缺键或键集不一致不会失败。

## 6. `meta.detail` 的处理

- Decision: 声明时断言指向仓库内 `docs/*.md` 且文件存在；未声明时跳过。
- Rationale: 本插件不声明 `detail`，详情页回落 `README.md`；断言保持对未来声明的约束。
- Alternatives considered:
  - 要求必填：与模板的既有行为不符。
  - 不校验：将来写错路径会 404。

## 7. 宪章编号与版本

- Decision: 新增原则 VIII「国际化」，版本 2.0.0 → 2.1.0。
- Rationale: 现有原则为 I–VII；新增原则按 MINOR 递增。
- Alternatives considered:
  - 并入原则 IV 测试同步：国际化还约束资源位置与打包声明，归属不清。
  - 定为 MAJOR：未删除或重新定义既有原则。

## 8. 是否做实机核对

- Decision: 不做实机核对，只跑本地命令与测试。
- Rationale: 运行时代码与元数据文件内容均不改动，行为不变；本次只加测试、脚本与文档。
- Alternatives considered:
  - 按 real-device-test 全量核对：耗时长，且验证对象与既有 0.1.0 实机结果重复。