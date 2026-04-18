# Contributing

Thanks for your interest in improving Obsidian MCP Bridge.

## Development setup

Requirements:

- Node.js 20+
- Obsidian desktop

Install dependencies:

```bash
npm install
```

Build once:

```bash
npm run build
```

Watch mode:

```bash
npm run dev
```

## Project structure

- `main.ts`
  Main Obsidian plugin source
- `manifest.json`
  Obsidian plugin manifest
- `docs/`
  Human-facing docs
- `examples/`
  Example MCP client configs
- `scripts/`
  Smoke tests and real-vault developer tests

## Testing

Mock smoke test:

```bash
node scripts/smoke-test.cjs
```

Real-vault test:

```bash
node scripts/real-vault-test.cjs
```

The real-vault test should only be used by a local developer who understands it will touch a real Obsidian vault and then clean up test artifacts.

## Design principles

- Prefer Obsidian APIs over raw filesystem manipulation
- Keep tool names stable and English
- Keep user-facing UI understandable for non-technical users
- Prefer capability gating over hidden power
- Prefer `trash` over permanent delete
- Prefer preview/apply for content mutations

## Documentation expectations

If you add a new capability group or MCP tool, update:

- `README.md`
- `README.zh-CN.md`
- `docs/capabilities.md`
- AI-facing docs if behavior changes materially
