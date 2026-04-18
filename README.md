# Obsidian MCP Bridge

Local-first MCP bridge for Obsidian with capability-based access control.

This repository is being cleaned up for open-source release.

Start here:

- English usage notes: [AI_USAGE_GUIDE.md](AI_USAGE_GUIDE.md)
- English quickstart: [AI_QUICKSTART.md](AI_QUICKSTART.md)
- Capability model: [docs/capabilities.md](docs/capabilities.md)
- Chinese overview: [README.zh-CN.md](README.zh-CN.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Release notes: [OPEN_SOURCE_NOTES.md](OPEN_SOURCE_NOTES.md)

The legacy draft content below is pending cleanup.

一个本地优先的 Obsidian 插件，用 Obsidian 官方插件 API 暴露一个 MCP 兼容的 HTTP 接口，让外部 AI 客户端能直接读取、查询并安全地修改你的笔记库。

## 目标

- 让支持 MCP 的 AI 客户端直接访问你的 Obsidian vault
- 优先使用 Obsidian 官方 `Vault` / `FileManager` API
- 写操作默认走“预览 -> 确认应用”两步，降低 AI 误改风险
- 保持项目足够小，方便你后续继续扩展

## 当前能力

### 读取 / 查询

- `get_current_note`
- `list_notes`
- `read_note`
- `search_notes`
- `recent_notes`
- `resources/list`
- `resources/read`

### 写入 / 修改

- `prepare_note_change`
  - `create`
  - `append`
  - `replace`
  - `insert_under_heading`
- `apply_pending_change`
- `update_frontmatter`

## 安全模型

- 所有请求都要求 `Authorization: Bearer <token>`
- 写入受 `allowedWriteRoots` 限制
- 大部分正文写入先生成 `pending change`
- 应用变更前会检查目标文件是否在预览之后发生变化

## 开发与构建

先安装 Node.js 20+，然后在项目目录执行：

```bash
npm install
npm run build
```

构建完成后会生成 `main.js`。

## 安装到 Obsidian

把下面这些文件复制到你的 vault：

```text
<Vault>/.obsidian/plugins/obsidian-mcp-bridge/
  manifest.json
  main.js
```

然后在 Obsidian 里：

1. 打开 `Settings -> Community plugins`
2. 打开 `Installed plugins`
3. 启用 `Obsidian MCP Bridge`
4. 到插件设置里查看端点、token 和写入白名单

## MCP 端点

- 健康检查：`GET /health`
- MCP JSON-RPC：`POST /mcp`

默认地址：

```text
http://127.0.0.1:27124/mcp
```

## 示例请求

### initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

### read_note

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "read_note",
    "arguments": {
      "path": "Inbox/example.md"
    }
  }
}
```

### 两步写入流程

先预览：

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "prepare_note_change",
    "arguments": {
      "operation": "append",
      "path": "Inbox/example.md",
      "content": "\n\n## AI Summary\n这是一段新的总结。"
    }
  }
}
```

拿到 `changeId` 后再应用：

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "apply_pending_change",
    "arguments": {
      "changeId": "YOUR_CHANGE_ID"
    }
  }
}
```

## Capability Model

能力分组和风险模型说明见：

`docs/capabilities.md`

## 客户端接入建议

第一版建议先在本机桌面客户端里跑通，再考虑公网暴露。你后面如果要接云端 API，一般还需要再加一层安全代理或隧道。

仓库里附了一个 Gemini CLI 示例配置：

`examples/gemini-cli.settings.json`

## 后续最值得加的能力

- 语义检索 / embeddings / RAG
- backlinks / links / tags / frontmatter 查询
- 删除走回收站
- 用户确认弹窗
- 更完整的 Streamable HTTP / SSE MCP 兼容
