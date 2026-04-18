# Capability Model

The plugin exposes MCP tools in grouped capability domains so you can decide what each AI client is allowed to do.

## Capability Groups

- `vault.read`
  Read files, inspect folders, search notes, inspect recent files.
- `metadata.read`
  Read Obsidian metadata cache, tags, links, and backlinks.
- `content.write`
  Prepare/apply note content changes and update frontmatter.
- `file.manage`
  Create folders, rename paths, move items, trash files, permanently delete files.
- `workspace.control`
  Inspect workspace state and open notes in Obsidian.
- `automation.commands`
  List registered commands and execute commands by id.

## Risk Levels

- `safe`
  Read-only or low-risk inspection tools.
- `confirm`
  Mutating tools that should normally require an explicit opt-in.
- `dangerous`
  Permanent delete or command execution. Disabled unless `allowDangerousOperations=true`.

## Write Policy

- `preview_only`
  Content changes may be prepared but not applied.
- `confirm_before_apply`
  Two-step write flow. Prepare first, then apply.
- `direct_apply`
  Reserved for broader direct-write flows in future tools.

## Path Scope

`allowedWriteRoots` limits mutating tools to specific vault-relative folders.

Examples:

- `["Inbox"]`
- `["Inbox", "Projects/AI"]`
- `[""]` for full-vault write access

## Current Grouped Tools

- `vault.get_active_note`
- `vault.list_files`
- `vault.list_folders`
- `vault.read_file`
- `vault.stat_path`
- `vault.search`
- `vault.recent_files`
- `metadata.get_file_cache`
- `metadata.get_tags`
- `metadata.get_links`
- `metadata.get_backlinks`
- `content.prepare_change`
- `content.apply_change`
- `content.update_frontmatter`
- `file.create_folder`
- `file.rename_path`
- `file.trash_path`
- `file.delete_path`
- `workspace.get_state`
- `workspace.open_note`
- `commands.list`
- `commands.execute`
