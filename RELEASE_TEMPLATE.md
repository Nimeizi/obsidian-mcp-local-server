# Release Template

Use this file as the basis for GitHub Releases.

## Automated release flow

This repository is configured so that:

- pushes and pull requests run CI
- pushing a tag like `v0.2.0` triggers an automated GitHub Release
- the release uploads:
  - `main.js`
  - `manifest.json`

The release workflow also verifies that:

- the git tag version matches `package.json`
- the git tag version matches `manifest.json`

## v0.2.0-alpha

Capability-gated local MCP bridge for Obsidian.

### Highlights

- Added grouped MCP capability model
- Added risk-aware plugin settings
- Added safer note write flow with `prepare -> apply`
- Added file management tools with official trash support
- Added workspace and command tool groups
- Added AI-facing usage docs and quickstart docs
- Added smoke tests and real-vault developer tests

### Capability Groups

- `vault.read`
- `metadata.read`
- `content.write`
- `file.manage`
- `workspace.control`
- `automation.commands`

### Safety Notes

- Requests require bearer token authentication
- Capability groups can be enabled or disabled individually
- Dangerous operations can be globally disabled
- Writes can be scoped to selected vault-relative folders
- Content changes default to a preview/apply flow
- Trash is preferred over permanent delete

### Install

This release is currently source-first.

1. Clone the repository
2. Run:

```bash
npm install
npm run build
```

3. Copy the generated plugin files into:

```text
<Vault>/.obsidian/plugins/obsidian-mcp-bridge/
```

Required files:

- `manifest.json`
- `main.js`

4. Enable the plugin in Obsidian community plugins

### Current Limitations

- This release is still early alpha
- GitHub release assets are not bundled yet
- Settings UX and public docs are still being refined
- Command execution is available, but should be treated as high risk

### Docs

- `README.md`
- `README.zh-CN.md`
- `docs/capabilities.md`
- `AI_USAGE_GUIDE.md`
- `AI_QUICKSTART.md`
