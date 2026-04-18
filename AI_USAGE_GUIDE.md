# Obsidian MCP Bridge Usage Guide

This file is for AI agents or future tooling that need to use this Obsidian vault safely through the local MCP bridge.

## Purpose

This project exposes a local MCP-compatible HTTP server from inside Obsidian so an external AI can:

- read notes
- inspect metadata
- write note content
- manage files and folders
- inspect or control the Obsidian workspace
- list or execute Obsidian commands

The bridge is designed to make these actions controllable through capability groups and risk-based settings.

## Connection

Default endpoint:

```text
http://127.0.0.1:27124/mcp
```

Health check:

```text
GET http://127.0.0.1:27124/health
```

Authentication:

- Every MCP request must include:

```text
Authorization: Bearer <token>
```

- The token is configured in the Obsidian plugin settings UI.

## Protocol

Transport is JSON-RPC over HTTP POST.

Typical flow:

1. Call `initialize`
2. Call `tools/list`
3. Call `tools/call`

## Capability Groups

These groups can be enabled or disabled in the plugin settings.

### `vault.read`

Use for reading vault structure and note content.

Tools:

- `vault.get_active_note`
- `vault.list_files`
- `vault.list_folders`
- `vault.read_file`
- `vault.stat_path`
- `vault.search`
- `vault.recent_files`

### `metadata.read`

Use for understanding note structure and graph relationships.

Tools:

- `metadata.get_file_cache`
- `metadata.get_tags`
- `metadata.get_links`
- `metadata.get_backlinks`

### `content.write`

Use for safe note creation and note editing.

Tools:

- `content.prepare_change`
- `content.apply_change`
- `content.update_frontmatter`

### `file.manage`

Use for structural file operations.

Tools:

- `file.create_folder`
- `file.rename_path`
- `file.trash_path`
- `file.delete_path`

### `workspace.control`

Use for interacting with the running Obsidian UI.

Tools:

- `workspace.get_state`
- `workspace.open_note`

### `automation.commands`

Use for Obsidian command inspection and execution.

Tools:

- `commands.list`
- `commands.execute`

## Risk Model

Each tool belongs to one of these risk levels:

- `safe`
- `confirm`
- `dangerous`

Interpretation:

- `safe`: read-only or low-risk inspection
- `confirm`: mutating but normally acceptable with user consent
- `dangerous`: permanent delete or command execution

## Important Safety Rules

Follow these rules when acting as an AI client:

1. Prefer read-only tools first.
2. For note edits, prefer `content.prepare_change` before applying.
3. Respect the configured `writePolicy`.
4. Prefer `file.trash_path` over `file.delete_path`.
5. Never assume `dangerous` tools are enabled.
6. Avoid bulk changes unless the user explicitly asks for them.
7. Treat file moves, deletes, and command execution as high-risk actions.

## Write Policy

The plugin exposes a write policy in settings:

- `preview_only`
- `confirm_before_apply`
- `direct_apply`

Recommended client behavior:

- If `preview_only`, do not attempt to call `content.apply_change`.
- If `confirm_before_apply`, always show or reason over preview output before apply.
- If `direct_apply` appears in future flows, still prefer preview when practical.

## Recommended AI Behavior

### If the user wants answers based on notes

Use:

- `vault.search`
- `vault.read_file`
- `metadata.get_links`
- `metadata.get_backlinks`

### If the user wants note maintenance

Use:

- `content.prepare_change`
- `content.apply_change`
- `content.update_frontmatter`

### If the user wants vault cleanup or structure work

Use carefully:

- `file.create_folder`
- `file.rename_path`
- `file.trash_path`

Avoid permanent delete unless the user is explicit.

### If the user wants UI-like behavior inside Obsidian

Use:

- `workspace.get_state`
- `workspace.open_note`

### If the user wants command automation

Use:

- `commands.list`
- `commands.execute`

Only execute commands when the user clearly intends that behavior.

## Recommended User Guidance

When guiding a human user, map their needs to plugin presets:

- Read only:
  Enable `vault.read` and `metadata.read`
- Safe writing:
  Enable `vault.read`, `metadata.read`, `content.write`
- Power use:
  Enable all groups, but explain the risks first

## Notes About Deletion

This bridge should prefer Obsidian-native deletion paths.

Preferred:

- `file.trash_path`

Use with extreme caution:

- `file.delete_path`

Direct filesystem deletion outside Obsidian is discouraged because it can leave stale UI state or workspace cache artifacts.

## Example MCP Call

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

Prepare a note change:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "content.prepare_change",
    "arguments": {
      "operation": "append",
      "path": "2026-04-19.md",
      "content": "\n\n## AI Notes\nDraft update."
    }
  }
}
```

Apply the prepared change:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "content.apply_change",
    "arguments": {
      "changeId": "REPLACE_WITH_CHANGE_ID"
    }
  }
}
```

## Current State

This guide matches the grouped-capability version of the plugin (`0.2.x` line), where tools are grouped by domain and gated by risk-aware settings.
