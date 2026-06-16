# Contributing to Open Assistant

Thanks for helping build an open JARVIS. This guide gets you oriented fast.

## Orientation

Read these two first — they are written so you (or an AI agent) can locate
anything without crawling the tree:

1. **README.md → "Repository Map"** — where everything lives.
2. **ARCHITECTURE.md** — how the pieces talk to each other.

## Golden rules

- **Types first.** All cross-package contracts live in `@open-assistant/shared`
  (`packages/shared/src/types`). Import from there; never redefine a contract.
- **Packages are pure logic.** No UI in `packages/*`; no business logic in
  `apps/desktop` beyond wiring.
- **The Python sidecar is a service**, called over RPC — never imported by TS.
- **Permissions are explicit.** Any high-risk action (delete, spend, purchase,
  system change) must request approval.

## Good first contributions

Each is self-contained thanks to the structure:

- **A model provider** — add a file in `packages/models/src/providers/` and
  register it. Implement the `ModelProvider` interface.
- **A Skill** — implement `SkillManifest` (see `types/skill.ts`).
- **A feature screen** — build under `apps/desktop/src/features/<feature>/`.
- **An MCP server entry** — wire it through `packages/mcp`.

## Workflow

1. Fork & branch from `main`.
2. Keep changes scoped to one module when possible.
3. Update the README's Repository Map if you change the structure.
4. Open a PR describing the "why".

## Conventions

- Package names: `@open-assistant/<name>`
- Files: kebab-case · Types: PascalCase · Functions: camelCase
- TypeScript `strict` is on; keep it green.
