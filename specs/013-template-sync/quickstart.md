# Quickstart: 验证元数据规范与产物测试新鲜度

前置：Node.js 24.9+、pnpm 11，已执行 `pnpm install`。命令在仓库根运行。

## 1. 干净检出上的源码测试

```sh
rm -rf dist
pnpm test:code
pnpm check
```

期望：

- 两条命令都通过。
- 过程不生成 `dist`。
- `check` 的输出依次是类型检查、lint、`vitest run --project code`。

## 2. 产物缺失时的产物测试

```sh
pnpm test:dist
```

期望：

- 失败，提示「产物缺失或已过期」，列出 `dist/client.js` 等路径。
- 提示「请运行 pnpm build」。
- 过程不触发构建，`dist` 仍不存在。

## 3. 构建并自动跑产物测试

```sh
pnpm build
```

期望：

- 生成 `dist/index.mjs`、`dist/client.js`、`dist/index.d.ts`、`dist/client/index.d.ts`。
- 末尾运行 `vitest run --project dist` 并通过。
- 再运行 `pnpm test:dist` 直接通过，不再构建。

## 4. 产物过期

```sh
touch src/index.ts
pnpm test:dist
```

期望：失败，消息列出 `src/index.ts` 晚于产物，并提示 `pnpm build`。重新 `pnpm build` 后通过。

## 5. 元数据校验

```sh
pnpm test:code -- tests/metadata.test.ts
```

期望：通过。

逐项破坏后复跑，均应失败并指出破坏点：

| 破坏 | 期望消息 |
| --- | --- |
| 删除 `locale/en.json` | 目录清单不符 |
| 把 `meta.title` 改名为 `meta.name` | `meta` 键集不符 |
| 中文加 `meta.detail`、英文不加 | 键集不一致 |
| 标题中插入换行 | 标题单行断言 |
| 文案插入零宽空格 | 禁用字符断言 |
| `meta.detail` 写成 `docs/missing.md` | 文件不存在 |
| 删除 `exports["./locale/*.json"]` | 清单声明断言 |

恢复文件后复跑通过。

## 6. 打包回归

```sh
pnpm test:dist
npm pack --dry-run --json
```

期望：

- 产物测试通过。
- tarball 含 `locale/en.json`、`locale/zh.json`、`icon.svg` 与 `dist` 产物。
- tarball 不含 `src/`、`tests/`、`scripts/`、`specs/`、`docs/`。

## 7. 文档核对

- `AGENTS.md` 文档索引含 `docs/i18n.md`。
- `docs/development.md` 的命令表只列 `test:code` 与 `test:dist`，并说明 `build` 末尾跑产物测试。
- 宪章版本为 2.1.0，含原则 VIII「国际化」。
- CHANGELOG 的 Unreleased 记录本次变更。