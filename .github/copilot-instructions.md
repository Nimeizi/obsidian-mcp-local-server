# Copilot Instructions

Obsidian MCP Bridge is a local-first Obsidian plugin that exposes MCP tools with capability-based access control.

## Core rules

- Prefer Obsidian APIs over direct filesystem operations.
- Prefer `trash` over permanent delete.
- Prefer preview/apply flows for content changes.
- Keep MCP tool names stable and English.
- Keep user-facing settings understandable for non-technical users.
- Respect capability groups and risk levels.

## Current capability groups

- `vault.read`
- `metadata.read`
- `content.write`
- `file.manage`
- `workspace.control`
- `automation.commands`

## When changing behavior

Update docs when needed:

- `README.md`
- `README.zh-CN.md`
- `docs/capabilities.md`
- `AI_USAGE_GUIDE.md`
- `AI_QUICKSTART.md`

## Before finishing

Run:

- `npm run build`
- `node scripts/smoke-test.cjs`
