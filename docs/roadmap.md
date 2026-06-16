# Roadmap

The full vision is an AI-native operating layer — a JARVIS — that understands
goals and executes them autonomously. We get there in phases, each shippable on
its own. This file expands the summary in the README.

## Phase 0 — Foundation *(current)*
- Monorepo, type contracts (`@open-assistant/shared`), CI scaffolding.
- Orchestrator + Event Bus skeleton.
- Model provider abstraction (Ollama + OpenAI + Anthropic stubs).
- Tauri desktop shell with the three-pane layout.

## Phase 1 — Talk & think
- Chat UI with streaming and Markdown/artifacts rendering.
- **Model switching mid-conversation** without losing context.
- Short-term (verbatim) + vector memory online.

## Phase 2 — Act
- Computer control (input, screenshots, OCR) via the Python sidecar.
- Browser automation via Playwright.
- First Skills + the MCP manager and marketplace.

## Phase 3 — Agents
- Master/sub-agent orchestration with concurrent sub-agents.
- Artifacts with version history, editing, and sharing.

## Phase 4 — Voice
- Continuous voice mode, wake word, real-time interruption.
- Whisper STT + Piper/Kokoro TTS, with offline support.

## Phase 5 — Autonomy
- One-time, recurring, and monitoring tasks ("notify me if BTC < $80k").
- Knowledge-graph memory; Projects with isolated memory.

## Phase 6 — Polish
- Packaged installers (Windows/macOS/Linux).
- Skills marketplace and non-technical onboarding.
- Permission/audit UX hardening.

---

## Success criteria

A non-technical user should be able to:

1. Download and install the app.
2. Connect a local or cloud model.
3. Talk naturally by voice or text.
4. Control their computer.
5. Create autonomous agents.
6. Install skills.
7. Connect MCP servers.
8. Manage projects.
9. Generate artifacts.
10. Automate workflows.
11. Use the assistant as their primary digital interface.

The end experience should feel less like a chatbot and more like an intelligent
digital operating system.
