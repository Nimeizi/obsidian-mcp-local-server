# AI Development Guide

This repository is designed to be maintained by both humans and AI coding agents.

Read these files before making meaningful changes:

1. `README.md`
2. `CONTRIBUTING.md`
3. `docs/capabilities.md`
4. `AI_USAGE_GUIDE.md`

## Project Intent

Build a local-first Obsidian plugin that exposes MCP-compatible capabilities with clear safety boundaries.

Priorities:

1. Obsidian-native behavior over filesystem shortcuts
2. Safe defaults over hidden power
3. Clear UX for non-technical users
4. Stable MCP tool contracts for external AI clients

## Must-Follow Rules

- Prefer Obsidian `Vault`, `FileManager`, `workspace`, and metadata APIs over raw filesystem operations.
- Do not directly delete vault files from disk when an Obsidian API can handle the action.
- Prefer `trash` flows over permanent delete.
- For content mutations, prefer preview/apply flows instead of immediate writes.
- Keep MCP tool names stable and in English.
- Keep human-facing UI copy understandable and concise.
- Treat capability gating as part of the product, not a temporary workaround.

## Capability Model

Current capability groups:

- `vault.read`
- `metadata.read`
- `content.write`
- `file.manage`
- `workspace.control`
- `automation.commands`

When adding or changing tools:

- assign the correct capability group
- assign the correct risk level: `safe`, `confirm`, or `dangerous`
- make sure settings UI can explain the new behavior to users

## Safe Change Patterns

Use these defaults unless there is a strong reason not to:

- Read before write
- Preview before apply
- Trash before delete
- Narrow capability before broad capability
- Local scope before vault-wide scope

## UI And Product Expectations

- Settings should help a normal Obsidian user understand what will be exposed.
- Risky options should be clearly labeled.
- Recommended presets should remain easy to understand.
- English tool identifiers can stay technical, but UI text should stay human-friendly.

## Docs Update Checklist

If behavior changes materially, update the relevant docs in the same change:

- `README.md`
- `README.zh-CN.md`
- `docs/capabilities.md`
- `AI_USAGE_GUIDE.md`
- `AI_QUICKSTART.md`
- `RELEASE_TEMPLATE.md` if release messaging changes

## Testing Expectations

Before finishing work:

1. Run `npm run build`
2. Run `node scripts/smoke-test.cjs`
3. If touching live-vault behavior, use `scripts/real-vault-test.cjs` carefully and clean up after the test

## Release Expectations

- Keep `package.json` and `manifest.json` versions aligned.
- GitHub Actions publish release assets from tags like `v0.2.0`.
- Do not create a release tag unless the current branch is ready for public consumption.

## Preferred Contribution Style

- Make focused changes
- Preserve backward compatibility where practical
- Explain safety tradeoffs clearly
- Avoid unnecessary architectural churn
