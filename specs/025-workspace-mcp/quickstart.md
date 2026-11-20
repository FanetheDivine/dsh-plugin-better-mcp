# Quickstart: Workspace 级 MCP 实例

## 前置条件

- Node.js 24.9+ 与 pnpm 11。
- DSH `0.2.2-rc.5`。
- 三个可写入的本地项目目录。
- 一个 stdio MCP fixture，能报告进程 id、cwd、instructions 与 resources，并可模拟失败和延迟关闭。

## 静态与单元验证

```sh
pnpm install
pnpm format
pnpm check
pnpm build
```

重点测试：

1. 配置默认共享，HTTP 拒绝工作区开关，工作区级强制 lazy。
2. active 前不注册实例；延迟 `connecting` 时 active 持续等待，`connected` 后才成功返回并写入删除警告；最终失败或取消时恢复 inactive。
3. 同一工作区并发 active 只注册一次。
4. 单 Agent inactive 等待关闭；共享实例有其他 active Agent 时保留并提醒占用。
5. Turn 结束自动 inactive 使用相同引用和关闭规则。
6. Agent 释放保留实例；目录切换无其他绑定时等待全部旧实例关闭。
7. 文件夹缺失在下一步与 active 前检测并关闭实例。
8. `watch()` 成功、清理失败、超时与后台完成的状态和提醒正确。
9. 过期代理、跨工作区资源调用和内部工具直接调用被拒绝。
10. 工具热更新、图片投影、结构化结果与取消保持宿主行为。
11. instructions、resource 列表与状态只显示当前工作区 active 实例。
12. 连接情况分组、折叠、搜索、全部重连和单工作区重连范围正确。
13. 共享服务器、OAuth 与既有面板路由回归。
14. 构建产物包含新增宿主代码并保持宿主包 external。

## 真实宿主验证

按仓库 `real-device-test` skill 建专用 profile，安装当前 worktree 构建产物。

### 场景 A：active 按需连接

1. 在项目 A 建立会话，确认工作区服务器没有实例。
2. 让 fixture 延迟完成连接，确认 active 调用处于等待状态。
3. 连接成功后检查 active 结果、cwd、公开代理和下一步消息。
4. 分别模拟最终失败与调用取消，确认返回错误且 Agent 恢复 inactive。

预期：active 仅在 `connected` 后成功返回；只建立一个实例；cwd 等于项目 A；system-reminder 说明删除文件夹前必须 inactive；失败或取消时不开放工具。

### 场景 B：inactive 与共享引用

1. 在项目 A 打开第二个 Agent，两边都 active 同一服务器。
2. 第一个 Agent inactive。
3. 第二个 Agent inactive。

预期：第一次只隐藏第一个 Agent 的工具，实例保持且提醒其他 active Agent 仍占用文件夹；第二次关闭实例并报告关闭结果。

### 场景 C：工作区隔离与并行

1. 在项目 A、B、C 分别 active 同一配置。
2. 三个工作区各执行至少 20 次并行调用。

预期：不同工作区使用不同进程和 cwd，同工作区 Agent 复用进程；全部调用路由正确。

### 场景 D：目录切换与删除

1. 在项目 A active 一个或多个工作区服务器。
2. 使用 `working_directory` 切换到项目 B。
3. 检查下一步 system-reminder。
4. 在无其他进程占用时删除项目 A 文件夹。
5. 用延迟关闭与清理失败 fixture 重试。

预期：切换调用等待旧实例关闭；成功后 Windows 可直接删除 A；失败或超时提醒不得删除，并显示服务器与原因。

### 场景 E：共享引用阻止旧实例关闭

1. 两个 Agent 绑定项目 A，其中至少一个保持绑定。
2. 另一个切换到项目 B。

预期：旧实例继续运行；不出现“旧目录全部实例已关闭”的成功提醒。

### 场景 F：文件夹缺失

1. 在 Agent 外部删除工作区目录。
2. 分别验证下一步检查和 active 前检查。

预期：对应实例关闭，代理与 resources 失效，提醒说明缺失路径和关闭结果。

### 场景 G：上下文与资源

1. 让项目 A 与 B 返回不同 instructions、resource 列表和正文。
2. 分别 active 并读取资源。
3. inactive 后再次检查。
4. 尝试用内部名称直接读取资源。

预期：只获得当前工作区 active 实例内容；inactive 后不可见；内部名称调用被拒绝；共享服务器资源正常。

### 场景 H：面板

1. 构造成功、连接中、失败和清理失败实例。
2. 展开与折叠“连接情况”及成功、失败分组。
3. 按名称和路径片段搜索。
4. 执行单工作区“重连”和主行“全部重连”。

预期：成功组只含 connected；其余显示实际状态；搜索过滤两个分组；单实例重连只影响目标；全部重连影响全部现有实例，包括被搜索隐藏的实例；工作区配置没有“已连接”标签。

### 场景 I：Serena 验证

将 fixture 替换为 Serena 工作区级 stdio 配置，在两个项目中分别 active 并请求项目概览。

预期：两个 Serena 进程分别以对应项目为 cwd；结果只反映所属项目；inactive 后无其他 active Agent 的进程关闭。

## 发布回归

```sh
pnpm full-check
```

确认 package-pack 测试仍只发布既有白名单内容，宿主依赖全部为 rc.5，构建产物新鲜度检查通过。
