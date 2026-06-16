# Getting started (developers)

> Pre-alpha. These steps describe the intended workflow as the scaffold fills in.

## Prerequisites

- **Node** ≥ 20 and **pnpm** ≥ 9
- **Rust** (stable) + [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)
- **Python** ≥ 3.11
- **[Ollama](https://ollama.com)** (for local-first mode)

## Setup

```bash
# 1. JS workspace
pnpm install

# 2. Python sidecar
cd services/python && pip install -e . && cd ../..

# 3. (optional) a local model
ollama pull qwen2.5

# 4. copy env template if you'll use cloud providers
cp .env.example .env
```

## Run

```bash
pnpm dev          # launches the desktop app (Tauri) in dev mode
```

## Where to start reading

1. `README.md` → **Repository Map**
2. `ARCHITECTURE.md`
3. `packages/shared/src/types/` — the contracts

## Project layout (short)

| You want to… | Go to |
|---|---|
| Add a model provider | `packages/models/src/providers/` |
| Add an agent role | `packages/agents/src/` |
| Add a Skill | implement `SkillManifest` (`packages/shared/src/types/skill.ts`) |
| Add an MCP server | `packages/mcp/src/manager.ts` |
| Build a UI screen | `apps/desktop/src/features/<feature>/` |
| Add voice models | `services/python/open_assistant_sidecar/voice/` |
