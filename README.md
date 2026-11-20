# MCP 增强

[![npm](https://img.shields.io/npm/v/dsh-plugin-better-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-plugin-better-mcp)

DSH 插件 `dsh-plugin-better-mcp`：用一个面板管理 MCP 服务器，让模型按需加载工具。

- **可视化管理**：在面板里新增、编辑、删除服务器，随时查看连接状态。
- **一键鉴权**：需要登录的服务器在操作行下方显示「点击鉴权」与完整地址，点击后由 DSH 打开鉴权页。
- **按需加载**：服务器的工具默认收起，模型需要时自己打开，节省上下文。
- **工作区级实例**：stdio MCP 可按工作区独立运行，同一工作区共享实例，适合 Serena 等单项目服务器。
- **连接管理**：按工作区分组查看连接情况，搜索路径，并重连单个或全部实例。

![已配置的 MCP 面板](https://raw.githubusercontent.com/FanetheDivine/dsh-plugin-better-mcp/main/docs/assets/panel.jpg)
