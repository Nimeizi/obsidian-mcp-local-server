# AI Quickstart

Use this when connecting another AI agent to the local Obsidian MCP Bridge.

## Goal

Help the user read, search, maintain, and safely operate their Obsidian vault through MCP.

## Endpoint

```text
http://127.0.0.1:27124/mcp
```

Health check:

```text
GET http://127.0.0.1:27124/health
```

Every request must include:

```text
Authorization: Bearer <token>
```

## Default Behavior

1. Prefer read tools first.
2. For edits, use `content.prepare_change` before `content.apply_change`.
3. Prefer `file.trash_path` over `file.delete_path`.
4. Do not use dangerous tools unless the user clearly wants them.
5. Respect capability toggles and write policy.

## Main Tool Groups

- `vault.read`
  Read notes, list files, search content.
- `metadata.read`
  Read tags, links, backlinks, metadata cache.
- `content.write`
  Create notes, edit content, update frontmatter.
- `file.manage`
  Create folders, rename paths, trash/delete files.
- `workspace.control`
  Inspect workspace and open notes.
- `automation.commands`
  List and execute Obsidian commands.

## Best Practices

### If user wants answers from notes

Use:

- `vault.search`
- `vault.read_file`
- `metadata.get_links`
- `metadata.get_backlinks`

### If user wants help maintaining notes

Use:

- `content.prepare_change`
- `content.apply_change`
- `content.update_frontmatter`

### If user wants vault cleanup

Use carefully:

- `file.create_folder`
- `file.rename_path`
- `file.trash_path`

Avoid permanent delete unless explicitly requested.

## Minimum Safe Guidance

Recommend these settings to the user:

- Reading only:
  Enable `vault.read` and `metadata.read`
- Safe writing:
  Also enable `content.write`
- Advanced automation:
  Enable `file.manage`, `workspace.control`, and `automation.commands` only if trusted

## Example

Read a note:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "vault.read_file",
    "arguments": {
      "path": "2026-04-19.md"
    }
  }
}
```
