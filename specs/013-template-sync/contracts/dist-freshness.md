# Contract: 产物测试与构建新鲜度

## 命令

| 命令 | 行为 |
| --- | --- |
| `pnpm check` | `typecheck` → `lint` → `test:code`，不读取 `dist` |
| `pnpm test:code` | `vitest run --project code`，不读取 `dist` |
| `pnpm test:dist` | `vitest run --project dist`，产物缺失或过期时失败 |
| `pnpm build` | `tsdown` → `tsc -p tsconfig.build.json` → `test:dist` |
| `pnpm full-check` | `check` → `build` |

约束：

- 产物测试 MUST NOT 调用 `pnpm build`。
- `test:code` MUST NOT 读取 `dist` 下任何文件。
- 移除 `test` 脚本；局部验证用 `test:code` 与 `test:dist`。

## 新鲜度判定

`assertFreshDist(root?: string)`：

- 入参：仓库根，默认取 `tests/support/` 的上两级。
- 产物齐全且新于全部输入时正常返回。
- 其余情况抛出 `Error`，消息含缺失或过期的相对路径与 `pnpm build`。

失败信息示例：

```text
产物缺失或已过期：
- 缺失：dist/client.js
- 晚于产物：src/client/index.tsx
请运行 pnpm build：该命令重建产物，并在末尾运行 test:dist。
```

## 产物测试

| 文件 | 读取 | 断言 |
| --- | --- | --- |
| `tests/client-bundle.test.ts` | `dist/client.js` | 闭包工厂按包名注册、槽位注册、工厂收尾 |
| `tests/package-pack.test.ts` | `npm pack --dry-run`、`dist/client.js` | 发布内容含产物、补丁、图标、字典与 README；开发目录不进包 |

两个文件 MUST 在读取 `dist` 前调用 `assertFreshDist()`。

## 新鲜度检查的用例

| 状态 | 期望 |
| --- | --- |
| 产物晚于输入 | 通过 |
| 源码晚于产物 | 抛错，消息含该源码路径与 `pnpm build` |
| 产物全部缺失 | 抛错，消息含产物路径与 `pnpm build` |
| 缺少任一产物 | 抛错，消息含缺失路径 |