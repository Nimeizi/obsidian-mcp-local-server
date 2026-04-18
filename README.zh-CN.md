# Obsidian MCP Bridge

一个面向 Obsidian 的本地优先 MCP 桥接插件，并带有基于能力分组的权限控制。

这个项目会在 Obsidian 内部暴露一个兼容 MCP 的 HTTP 接口，让外部 AI 客户端能够安全地读取笔记、分析元数据、修改内容、管理文件，以及与当前运行中的 Obsidian 工作区交互。

**[English](README.md) | 简体中文**

## 为什么做这个

现在很多 Obsidian + AI 的方案，通常会走向两个极端：

- AI 只能在你手动复制笔记内容之后才能回答
- AI 能直接对整个 vault 做高权限操作，但几乎没有安全控制

Obsidian MCP Bridge 想做的是一个中间层：

- 优先使用 Obsidian 官方 API，而不是直接操作文件系统
- 按能力域开放工具，而不是给 AI 一个“万能权限”
- 默认采用“预览 -> 应用”的内容修改流程
- 删除优先走回收站
- 让人类用户和 AI 都能看懂当前开放了哪些能力

## 当前能力

插件目前按以下能力域开放 MCP 工具：

- `vault.read`
  读取笔记、列出文件、查看文件夹、搜索内容、查看最近文件
- `metadata.read`
  读取标签、链接、反链和 Obsidian 元数据缓存
- `content.write`
  预览笔记修改、应用修改、更新 frontmatter
- `file.manage`
  创建文件夹、重命名路径、删除到回收站、永久删除
- `workspace.control`
  读取当前工作区状态，并打开笔记
- `automation.commands`
  列出命令并执行 Obsidian 命令

完整说明见 [docs/capabilities.md](docs/capabilities.md)。

## 安全模型

这个项目的核心设计就是“可控开放”：

- 所有请求都需要 bearer token
- 每个能力组都可以单独开启或关闭
- 危险操作可以全局禁用
- 写入范围可以限制到指定的 vault 相对目录
- 笔记内容修改默认走 `prepare -> apply`
- 文件删除优先使用 `file.trash_path`，而不是永久删除

## 安装方式

### 环境要求

- Obsidian 桌面版
- Node.js 20+

### 构建

```bash
npm install
npm run build
```

### 安装到 vault

把下面文件复制到你的 vault：

```text
<Vault>/.obsidian/plugins/obsidian-mcp-bridge/
  manifest.json
  main.js
```

然后在 Obsidian 里：

1. 打开 `Settings -> Community plugins`
2. 启用 `Obsidian MCP Bridge`
3. 打开插件设置
4. 配置 token、能力分组、写入策略和允许写入目录

## 接口地址

健康检查：

```text
GET http://127.0.0.1:27124/health
```

MCP 接口：

```text
POST http://127.0.0.1:27124/mcp
```

所有请求都必须带上：

```text
Authorization: Bearer <token>
```

## 面向 AI 的说明文档

仓库里还带了两份给其他 AI / agent 用的说明：

- [AI_USAGE_GUIDE.md](AI_USAGE_GUIDE.md)
- [AI_QUICKSTART.md](AI_QUICKSTART.md)

## 示例与测试

- [examples/gemini-cli.settings.json](examples/gemini-cli.settings.json)
- [scripts/smoke-test.cjs](scripts/smoke-test.cjs)
- [scripts/real-vault-test.cjs](scripts/real-vault-test.cjs)

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。
