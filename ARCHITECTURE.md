# Architecture

This document explains how Open Assistant is put together: the layers, how a
request flows through them, the agent model, the memory model, and the
boundaries between TypeScript, Rust, and Python. It is meant to be read after the
**Repository Map** in the README.

---

## 1. Layers

```
┌───────────────────────────────────────────────────────────────┐
│  apps/desktop  (Tauri 2)                                       │
│  React + TS UI  ─────────────  Rust shell (window, tray,       │
│                                 sidecar lifecycle, secure IPC) │
└───────────────┬───────────────────────────────────────────────┘
                │ typed IPC
┌───────────────▼───────────────────────────────────────────────┐
│  packages/core  — Orchestrator                                │
│  Planner · Event Bus · Task Engine                            │
└───┬───────────┬───────────┬───────────┬───────────┬───────────┘
    │           │           │           │           │
┌───▼───┐  ┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌───▼─────────┐
│agents │  │ memory  │  │ models │  │ skills │  │ mcp + auto. │
└───┬───┘  └─────────┘  └───┬────┘  └────────┘  └───┬─────────┘
    │                       │                       │
    │                 ┌─────▼───────────────────────▼─────┐
    │                 │  services/python (sidecar)        │
    └────────────────►│  voice (STT/TTS) · desktop control │
                      └────────────────────────────────────┘
```

**Why three runtimes?**

- **Rust (Tauri)** owns the native shell: secure storage, OS windows, the system
  tray, and spawning/monitoring of the Python sidecar. It is thin.
- **TypeScript (packages)** owns all the *logic*: planning, agents, memory,
  model routing, skills, MCP. This is where most contribution happens.
- **Python (sidecar)** owns the things that are simply easier or faster in
  Python: Whisper, TTS engines, OCR, and OS-level input automation. It is a
  service with a typed boundary, **never imported** by TS — only called.

---

## 2. Request lifecycle

A single user request travels like this:

1. **Capture** — the UI (`apps/desktop`) receives text or, via the sidecar,
   transcribed voice. It produces a `ChatMessage`.
2. **Plan** — `core/orchestrator` asks the active model to decompose the goal
   into a plan: which agents, which tools, in what order.
3. **Spawn** — `agents/registry` instantiates the required agents. The master
   agent may spawn sub-agents (`SubAgentSpawn`) for parallelizable work.
4. **Execute** — each agent calls:
   - `models` for reasoning/generation,
   - `memory` for context,
   - `skills` / `mcp` / `automation` for actions.
5. **Stream** — partial output and agent status flow back over the **Event Bus**
   so the UI can render live progress (`AgentStatus`, token streams).
6. **Merge** — sub-agent results are combined into one or more `Artifact`s.
7. **Persist** — the conversation is stored verbatim (Layer 1) and distilled
   into structured memory (Layer 2). See §4.

Every step emits events; nothing blocks the UI thread.

---

## 3. Agent model

Defined by `packages/shared/src/types/agent.ts`, implemented in
`packages/agents`.

- **`AgentDefinition`** — declarative: id, role, system prompt, allowed tools,
  permission scopes, and (optionally) a required model.
- **`BaseAgent`** — the runtime: receives an `AgentContext` (goal, memory
  handle, model handle, tool handles) and returns an `AgentResult`.
- **Sub-agents** — an agent can request `SubAgentSpawn`s. The orchestrator runs
  them (concurrently when independent) and feeds their `AgentResult`s back.
- **Roles** are open-ended; common ones: `research`, `planning`, `coding`,
  `design`, `browser`, `email`, `document`, `financial`, `monitoring`.

```
User goal
   │
   ▼
Master Agent ── spawns ──► Research Agent ─┐
            ── spawns ──► Analysis Agent ─┼─► merge ─► Artifact
            ── spawns ──► Design Agent ───┘
```

The agent layer is intentionally **model-agnostic**: an agent never talks to a
provider SDK directly, only to the `ModelProvider` interface.

---

## 4. Memory model (dual-layer + graph)

The biggest difference from a plain chatbot. Three stores, two visible layers.

### Layer 1 — Verbatim conversation (`memory/short-term`)
Every user message and assistant response, stored exactly as written. This is
the only thing the user sees.

### Layer 2 — Structured knowledge (hidden)
On each turn, a distillation step extracts and stores:

- summaries, facts, decisions, goals, action items,
- entities and the relationships between them.

These go into two stores:

- **Vector memory** (`memory/vector-store`, pgvector) — semantic recall of past
  context. Enables long conversations without resending the full transcript and
  makes **switching models mid-conversation** possible (context is reconstructed
  from memory, not from the model's window).
- **Knowledge graph** (`memory/knowledge-graph`) — people, places, projects, and
  their dependencies, for relational queries ("what depends on X?").

```
turn ──► [Layer 1: append verbatim]
     └─► [distill] ──► facts/entities ──► Vector store
                                     └──► Knowledge graph
```

**Token economics:** instead of feeding an ever-growing transcript to the model,
the orchestrator retrieves only the relevant slices from Layer 2. This is also
why this README and the type contracts are structured the way they are — a model
editing the codebase should read the *map and the contracts*, not every file.

---

## 5. Model provider abstraction

`packages/shared/src/types/model.ts` defines a single interface every backend
implements:

- `listModels()` — what's available from this provider.
- `chat(request)` — streaming chat completion (`AsyncIterable<ChatChunk>`).
- `embeddings(input)` — optional, for memory.

Concrete providers live in `packages/models/src/providers/`:

- `ollama.ts` — local, and any OpenAI-compatible local endpoint.
- `openai.ts`, `anthropic.ts`, … — cloud.

The UI lists providers/models from a **registry**; switching is instant and does
not drop the conversation, because context is rehydrated from memory (§4).

---

## 6. Skills & MCP (extensibility)

Two complementary extension mechanisms, both installable without editing core.

- **Skills** (`packages/skills`) — first-party plugin format defined by
  `SkillManifest` (`types/skill.ts`): declares `actions`, `permissions`,
  `requiredTools`, and `modelRequirements`. The `SkillHost` loads them and
  exposes their actions to agents.
- **MCP** (`packages/mcp`) — connect to any Model Context Protocol server
  (stdio / SSE / HTTP / WebSocket). The `McpManager` handles install, configure,
  enable/disable, and surfaces each server's tools to agents. A visual
  marketplace lives in the UI.

From an agent's perspective, Skills and MCP tools look the same: callable tools
with declared permissions.

---

## 7. Automation boundary

`packages/automation` exposes a clean TS API (`computer.ts`, `browser.ts`).
- **Browser** work uses Playwright and can run from the TS side.
- **OS-level input, screenshots, and OCR** are delegated to the Python sidecar,
  which is better suited to them across Windows/macOS/Linux.

The TS side never does raw OS input itself; it sends a typed command to the
sidecar and awaits a typed result. This keeps the dangerous surface area in one
auditable place.

---

## 8. Security

Cross-cutting, enforced at the orchestrator and tool boundaries:

- **Permission scopes** attached to every agent and skill; least privilege.
- **Approval workflow** — actions classified high-risk (delete, spend, purchase,
  system modification) pause for explicit user confirmation.
- **Sandboxing** for generated code execution.
- **Credential vault** in the Rust shell's secure storage; secrets never enter
  model prompts or logs.
- **Audit log** of every tool invocation.

---

## 9. Boundaries summary

| Boundary | Mechanism | Rule |
|---|---|---|
| UI ↔ Core | Typed IPC (Tauri) | UI holds no business logic |
| Core ↔ Packages | Direct TS imports | All shared types from `@open-assistant/shared` |
| TS ↔ Python | Local RPC/IPC | Sidecar is a service, never imported |
| Agent ↔ Model | `ModelProvider` | No provider SDK calls inside agents |
| Agent ↔ Action | Skill / MCP / Automation tool | Every tool declares permissions |

---

## 10. Where to read next

- Contracts: `packages/shared/src/types/`
- Orchestration: `packages/core/src/orchestrator.ts`
- Agents: `packages/agents/src/`
- Memory: `packages/memory/src/`
- Roadmap & phases: `docs/roadmap.md`
