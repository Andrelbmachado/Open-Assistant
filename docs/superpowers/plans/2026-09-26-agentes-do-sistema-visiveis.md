# Agentes do sistema visíveis (ROADMAP §11, fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela Agentes ganha as abas "Agentes do sistema" e "Agentes do usuário"; o primeiro agente do sistema, **Memória**, tem um workflow no Node Editor que acende ao vivo quando o chat salva uma memória em `memoria-da-ia.md`, e dá para abrir esse fluxo ao lado do chat.

**Architecture:** Os fluxos do sistema são `WorkflowDoc` fixos no código (`src/utils/systemWorkflows.ts`), feitos de dois kinds novos só de visualização (`trace.start`, `trace.step`). O código real do app continua fazendo o trabalho e, a cada etapa, chama um **rastro** (`src/store/systemTrace.ts`), que escreve no mesmo `workflowRuns` que o canvas já lê: por isso os nodes acendem sem mudar o motor. Esses workflows não são gravados no `state.workflows` (o usuário não consegue apagá-los nem editá-los). O canvas abre esses fluxos só para leitura.

**Tech Stack:** React 19 + TypeScript 5.8, Vitest 3, Tauri 2 (Rust). Testes: `npx vitest run <arquivo>`. Tipos: `npm run build` (roda `tsc`).

**Spec:** `docs/ROADMAP.md` §11 (pedido do André, 2026-09-26). Fases seguintes: `docs/superpowers/plans/2026-09-26-00-indice-roadmap-11-14.md`.

## Global Constraints

- Repositório: worktree `C:\Users\andre\.codex\worktrees\open-assistant-qa\Open Assistant`, branch `feat/agente-local`. Não rode git a partir da pasta espelho `Desktop\Assistente pessoal\Open Assistant Source`.
- Textos da interface em português do Brasil. Comentários no estilo do arquivo (curtos, em português).
- Todo kind novo em `NODE_KINDS` precisa aparecer entre crases em `docs/NODE_EDITOR.md` **e** em `src-tauri/skills/node-editor/SKILL.md` (o teste `workflowDocs.test.ts` cobra).
- Ids dos workflows do sistema começam com `sys-`.
- Mensagens comuns do chat (sem pedido de memória) **não** geram rastro.
- Build do app real: `npm run build:app` (nunca `build:qa`); depois copiar `src-tauri\target\release\open-assistant.exe` para `Desktop\Assistente pessoal\Open Assistant.exe` (se estiver aberto, mover o antigo para `_versoes-anteriores`).
- Testes de ponta a ponta com frases inofensivas (ex.: "lembre que eu gosto de café"), nunca comandos de PC.

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `src/utils/workflow.ts` | campo `traceOnly` no `NodeKindSpec`; kinds `trace.start` e `trace.step` |
| `src/utils/workflowEngine.ts` | recusa executar `trace.*` |
| `src/utils/systemWorkflows.ts` (novo) | catálogo dos workflows e agentes do sistema + `allowedWhenReadOnly` |
| `src/utils/systemWorkflows.test.ts` (novo) | testes do catálogo |
| `src/store/workflowRuns.ts` | gatilho `"sistema"` e `chatId` na execução |
| `src/store/systemTrace.ts` (novo) | rastro ao vivo + histórico + "segurar" rastro até o arquivo ser gravado |
| `src/store/systemTrace.test.ts` (novo) | testes do rastro |
| `src/utils/memoryFlow.ts` (novo) | `learnWithTrace`: detectar + juntar memória relatando cada etapa |
| `src/utils/memoryFlow.test.ts` (novo) | testes |
| `src/components/ChatView.tsx` | usa `learnWithTrace`; botão "Ver fluxo" no aviso "Memória atualizada" |
| `src/store/memoryFile.ts` | fecha o rastro quando `memory_file_write` termina |
| `src/utils/workspaceLayout.ts` | `adoptWorkflows(..., keep)` e `openWorkflowBeside` |
| `src/utils/workspaceLayout.test.ts` | testes novos |
| `src/store/store.tsx` | ids do sistema contam como existentes; ações `openSystemFlow` e `openFlowBeside` |
| `src/components/WorkflowCanvas.tsx` | abre workflow do sistema só para leitura; paleta sem `trace.*`; grupo "Fluxos do sistema" |
| `src/components/AgentsView.tsx` | abas Sistema/Usuário, cartões dos agentes do sistema, execuções recentes |
| `src/refresh.css` | estilos das abas e do aviso "só visualização" |
| `docs/NODE_EDITOR.md`, `src-tauri/skills/node-editor/SKILL.md` | documentar `trace.*` |

---

### Task 1: Kinds `trace.*` e catálogo dos workflows do sistema

**Files:**
- Modify: `src/utils/workflow.ts` (interface `NodeKindSpec` ~linha 27; fim de `NODE_KINDS` ~linha 198; `validateWorkflow` ~linha 283)
- Modify: `src/utils/workflowEngine.ts` (`runNode`, `switch` antes do `default:` ~linha 215)
- Modify: `docs/NODE_EDITOR.md` (seção "3. Catálogo de nodes"), `src-tauri/skills/node-editor/SKILL.md`
- Create: `src/utils/systemWorkflows.ts`
- Test: `src/utils/systemWorkflows.test.ts`

**Interfaces:**
- Produces: `SYS_MEMORY_SAVE = "sys-memoria-salvar"`; `SYSTEM_WORKFLOWS: WorkflowDoc[]`; `SYSTEM_AGENTS: SystemAgent[]` com `{ id, name, role, workflowId }`; `isSystemWorkflow(id?: string): boolean`; `systemWorkflow(id?: string): WorkflowDoc | undefined`; `allowedWhenReadOnly(type: string): boolean`. Os ids dos nodes do fluxo de memória são `mensagem`, `detectar`, `juntar`, `gravar`.

- [ ] **Step 1: Escrever o teste que falha**

`src/utils/systemWorkflows.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { KIND_BY_ID, validateWorkflow } from "./workflow";
import { runWorkflow, type WorkflowHost } from "./workflowEngine";
import { allowedWhenReadOnly, isSystemWorkflow, SYS_MEMORY_SAVE, SYSTEM_AGENTS, SYSTEM_WORKFLOWS, systemWorkflow } from "./systemWorkflows";

describe("system workflows", () => {
  it("are valid, use only trace kinds and have sys- ids", () => {
    for (const doc of SYSTEM_WORKFLOWS) {
      expect(doc.id.startsWith("sys-"), doc.id).toBe(true);
      expect(validateWorkflow(doc), doc.id).toEqual([]);
      for (const node of doc.nodes) expect(KIND_BY_ID.get(node.kind)?.traceOnly, node.id).toBe(true);
    }
    expect(new Set(SYSTEM_WORKFLOWS.map((doc) => doc.id)).size).toBe(SYSTEM_WORKFLOWS.length);
  });

  it("memory flow has the four steps in order", () => {
    const doc = systemWorkflow(SYS_MEMORY_SAVE)!;
    expect(doc.nodes.map((node) => node.id)).toEqual(["mensagem", "detectar", "juntar", "gravar"]);
    expect(doc.connections.map((c) => `${c.from}>${c.to}`)).toEqual(["mensagem>detectar", "detectar>juntar", "juntar>gravar"]);
  });

  it("every system agent points to a system workflow", () => {
    for (const agent of SYSTEM_AGENTS) expect(isSystemWorkflow(agent.workflowId), agent.id).toBe(true);
    expect(isSystemWorkflow("qualquer")).toBe(false);
    expect(isSystemWorkflow(undefined)).toBe(false);
  });

  it("the engine refuses to run trace nodes", async () => {
    const result = await runWorkflow(systemWorkflow(SYS_MEMORY_SAVE)!, {} as WorkflowHost);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("só mostra");
  });

  it("read-only canvas only lets navigation actions through", () => {
    expect(allowedWhenReadOnly("wfOpen")).toBe(true);
    expect(allowedWhenReadOnly("wfCreate")).toBe(true);
    expect(allowedWhenReadOnly("activateArea")).toBe(true);
    for (const type of ["wfAddNode", "wfMoveNode", "wfSetParam", "wfRemoveNodes", "wfConnect", "wfRename", "wfDelete", "wfReplace", "wfSetSchedule"]) expect(allowedWhenReadOnly(type), type).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/systemWorkflows.test.ts`
Expected: FAIL — `Failed to resolve import "./systemWorkflows"`.

- [ ] **Step 3: Kinds `trace.*` em `workflow.ts`**

Na interface `NodeKindSpec`, depois de `produces: string;`:
```ts
  /** Node do sistema: só mostra uma etapa que o código do app faz (não roda no motor, não aparece na paleta). */
  traceOnly?: boolean;
```
No fim de `NODE_KINDS`, depois de `agent.task`:
```ts
  // Sistema (só visualização): etapas que o próprio app executa, acesas ao vivo pelo rastro (`store/systemTrace.ts`).
  { kind: "trace.start", label: "Início do sistema", category: "sistema", description: "Onde um fluxo do próprio app começa (ex.: uma mensagem do chat).", input: false, output: true, mode: "once", traceOnly: true, params: [
    { key: "about", label: "O que faz", type: "longtext", default: "" },
    { key: "code", label: "Onde no código", type: "text", default: "" },
  ], produces: "—" },
  { kind: "trace.step", label: "Etapa do sistema", category: "sistema", description: "Uma etapa que o próprio app executa; acende quando acontece de verdade.", input: true, output: true, mode: "each", traceOnly: true, params: [
    { key: "about", label: "O que faz", type: "longtext", default: "" },
    { key: "code", label: "Onde no código", type: "text", default: "" },
  ], produces: "—" },
```

- [ ] **Step 4: Motor recusa `trace.*`**

Em `workflowEngine.ts`, dentro do `switch` de `runNode`, logo antes de `default:`:
```ts
    case "trace.start":
    case "trace.step":
      throw new Error("Este node é do sistema: ele só mostra o que o app faz e não roda sozinho.");
```

- [ ] **Step 5: Criar `src/utils/systemWorkflows.ts`**

```ts
/**
 * Fluxos do próprio Open Assistant, mostrados no editor de nodes para você ver o sistema funcionando.
 * Não são executados pelo motor: o código real do app acende cada node pelo rastro (`store/systemTrace.ts`).
 * Ficam fora do `state.workflows`, então não podem ser apagados nem editados.
 */
import { buildWorkflow, type WorkflowDoc } from "./workflow";

export const SYS_MEMORY_SAVE = "sys-memoria-salvar";

export interface SystemAgent { id: string; name: string; role: string; workflowId: string }

function systemDoc(id: string, input: Parameters<typeof buildWorkflow>[0]): WorkflowDoc {
  return { ...buildWorkflow(input, 0), id };
}

export const SYSTEM_WORKFLOWS: WorkflowDoc[] = [
  systemDoc(SYS_MEMORY_SAVE, {
    name: "Salvar memória",
    description: "Quando você pede no chat para lembrar de algo, o app detecta o pedido, junta à memória e grava em memoria-da-ia.md.",
    nodes: [
      { id: "mensagem", kind: "trace.start", title: "Mensagem do chat", params: { about: "Sua mensagem, do jeito que foi enviada.", code: "src/components/ChatView.tsx (send)" } },
      { id: "detectar", kind: "trace.step", title: "Detectar pedido de memória", params: { about: "Procura frases como \"lembre que…\", \"me chame de…\", \"não use emojis\".", code: "src/utils/memory.ts (detectMemory)" } },
      { id: "juntar", kind: "trace.step", title: "Juntar à memória", params: { about: "Acrescenta só o que ainda não estava salvo.", code: "src/utils/memory.ts (applyDetected)" } },
      { id: "gravar", kind: "trace.step", title: "Gravar memoria-da-ia.md", params: { about: "Grava o arquivo em %LOCALAPPDATA%\\com.openassistant.windows.", code: "src/store/memoryFile.ts → memory_file_write (Rust)" } },
    ],
    connections: [{ from: "mensagem", to: "detectar" }, { from: "detectar", to: "juntar" }, { from: "juntar", to: "gravar" }],
  }),
];

export const SYSTEM_AGENTS: SystemAgent[] = [
  { id: "sys-agente-memoria", name: "Memória", role: "Guarda o que você pede para lembrar em memoria-da-ia.md.", workflowId: SYS_MEMORY_SAVE },
];

export function systemWorkflow(id?: string): WorkflowDoc | undefined {
  return id ? SYSTEM_WORKFLOWS.find((doc) => doc.id === id) : undefined;
}

export function isSystemWorkflow(id?: string): boolean {
  return Boolean(systemWorkflow(id));
}

/** Num fluxo do sistema o canvas só deixa navegar: trocar de workflow, criar um novo, ativar a área. */
export function allowedWhenReadOnly(type: string): boolean {
  return !type.startsWith("wf") || type === "wfOpen" || type === "wfCreate";
}
```

- [ ] **Step 5b: Validador aceita `trace.start` como começo**

Em `validateWorkflow` (`workflow.ts`, ~linha 283), trocar:
```ts
  if (!doc.nodes.some((node) => node.kind.startsWith("trigger."))) issues.push({ message: "Falta um gatilho (trigger.manual ou trigger.schedule) no começo." });
```
por:
```ts
  if (!doc.nodes.some((node) => node.kind.startsWith("trigger.") || node.kind === "trace.start")) issues.push({ message: "Falta um gatilho (trigger.manual ou trigger.schedule) no começo." });
```

- [ ] **Step 6: Documentar os kinds**

Em `docs/NODE_EDITOR.md`, no fim da seção "## 3. Catálogo de nodes" (antes de "### Textos dinâmicos"), e em `src-tauri/skills/node-editor/SKILL.md`, na lista de kinds, acrescentar:
```md
**Sistema (só visualização)** — aparecem nos fluxos do próprio app (tela Agentes → Agentes do sistema) e acendem quando o app faz aquela etapa. Não estão na paleta e não rodam no motor; a IA não deve usá-los em workflows do usuário.
- `trace.start` — Início do sistema (ex.: a mensagem do chat).
- `trace.step` — Etapa do sistema (ex.: gravar `memoria-da-ia.md`).
```

- [ ] **Step 7: Rodar os testes**

Run: `npx vitest run src/utils/systemWorkflows.test.ts src/utils/workflowDocs.test.ts src/utils/workflowEngine.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/utils/workflow.ts src/utils/workflowEngine.ts src/utils/systemWorkflows.ts src/utils/systemWorkflows.test.ts docs/NODE_EDITOR.md src-tauri/skills/node-editor/SKILL.md
git commit -m "feat: workflows do sistema (kinds trace.*) com o fluxo Salvar memória"
```

---

### Task 2: Rastro ao vivo (`systemTrace`)

**Files:**
- Modify: `src/store/workflowRuns.ts`
- Modify: `src/components/WorkflowCanvas.tsx:406` (rótulo do gatilho no `RunPanel`)
- Create: `src/store/systemTrace.ts`
- Test: `src/store/systemTrace.test.ts`

**Interfaces:**
- Consumes: `systemWorkflow(id)` (Task 1); `startRun`, `updateRunNode`, `finishRun`, `getWorkflowRun` de `workflowRuns.ts`.
- Produces:
  - `interface SystemTrace { step(nodeId: string, sample?: string): void; wait(nodeId: string): void; skip(nodeId: string, message?: string): void; fail(nodeId: string, message: string): void; end(summary: string): void }`
  - `traceSystem(workflowId: string, context?: { chatId?: string }, now?: () => number): SystemTrace`
  - `interface TraceEntry { id: string; workflowId: string; chatId?: string; at: number; ok: boolean; summary: string }`
  - `useTraceHistory(): TraceEntry[]`, `traceHistory(): TraceEntry[]`
  - `holdTrace(key: string, trace: SystemTrace, nodeId: string, timeoutMs?: number): void`, `releaseTrace(key: string): SystemTrace | undefined`
  - `WorkflowRun.trigger` passa a aceitar `"sistema"`; `WorkflowRun.chatId?: string`; `startRun(id, trigger, chatId?)`.

- [ ] **Step 1: Escrever o teste que falha**

`src/store/systemTrace.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorkflowRun } from "./workflowRuns";
import { holdTrace, releaseTrace, traceHistory, traceSystem } from "./systemTrace";
import { SYS_MEMORY_SAVE } from "../utils/systemWorkflows";

function clock(start = 1000) { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; }

describe("traceSystem", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("lights nodes in order and finishes the run", () => {
    const c = clock();
    const trace = traceSystem(SYS_MEMORY_SAVE, { chatId: "chat-1" }, c.now);
    let run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.running).toBe(true);
    expect(run.trigger).toBe("sistema");
    expect(run.chatId).toBe("chat-1");
    expect(run.nodes.gravar.state).toBe("waiting");
    c.tick(5); trace.step("mensagem", "lembre que eu gosto de café");
    trace.wait("gravar");
    run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.nodes.mensagem).toMatchObject({ state: "ok", sample: "lembre que eu gosto de café", ms: 5 });
    expect(run.nodes.gravar.state).toBe("running");
    c.tick(20); trace.end("Memória salva");
    run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.running).toBe(false);
    expect(run.result).toMatchObject({ ok: true, ms: 25 });
    expect(traceHistory()[0]).toMatchObject({ workflowId: SYS_MEMORY_SAVE, chatId: "chat-1", ok: true, summary: "Memória salva" });
  });

  it("fail marks the node and ends the run once", () => {
    const trace = traceSystem(SYS_MEMORY_SAVE);
    trace.fail("gravar", "disco cheio");
    trace.end("não deve contar");
    const run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.nodes.gravar).toMatchObject({ state: "error", message: "disco cheio" });
    expect(run.result).toMatchObject({ ok: false, error: "disco cheio" });
    expect(traceHistory()[0].summary).toBe("disco cheio");
  });

  it("a held trace fails by itself when nobody releases it", () => {
    vi.useFakeTimers();
    const trace = traceSystem(SYS_MEMORY_SAVE);
    holdTrace("k", trace, "gravar", 5000);
    vi.advanceTimersByTime(5001);
    expect(getWorkflowRun(SYS_MEMORY_SAVE)!.nodes.gravar.state).toBe("error");
    expect(releaseTrace("k")).toBeUndefined();
  });

  it("releaseTrace hands the trace back and cancels the timeout", () => {
    vi.useFakeTimers();
    const trace = traceSystem(SYS_MEMORY_SAVE);
    holdTrace("k2", trace, "gravar", 5000);
    expect(releaseTrace("k2")).toBe(trace);
    vi.advanceTimersByTime(6000);
    expect(getWorkflowRun(SYS_MEMORY_SAVE)!.running).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/store/systemTrace.test.ts`
Expected: FAIL — `Failed to resolve import "./systemTrace"`.

- [ ] **Step 3: `workflowRuns.ts` aceita o sistema**

Trocar a interface e `startRun`:
```ts
  /** Quem pediu: você (botão), o agendador, a IA ou o próprio app (fluxos do sistema). */
  trigger: "manual" | "agenda" | "ia" | "sistema";
  /** Conversa que disparou (fluxos do sistema). */
  chatId?: string;
}
```
```ts
export function startRun(id: string, trigger: WorkflowRun["trigger"], chatId?: string) {
  cancels.delete(id);
  runs = { ...runs, [id]: { running: true, startedAt: Date.now(), nodes: {}, trigger, chatId } };
  emit();
}
```

- [ ] **Step 4: Criar `src/store/systemTrace.ts`**

```ts
/**
 * Rastro dos fluxos do sistema: o código real do app avisa aqui cada etapa, e o canvas do workflow do
 * sistema acende os nodes na hora (usa o mesmo `workflowRuns` das execuções normais). Não executa nada.
 */
import { useSyncExternalStore } from "react";
import { finishRun, startRun, updateRunNode } from "./workflowRuns";
import { systemWorkflow } from "../utils/systemWorkflows";

export interface SystemTrace {
  step(nodeId: string, sample?: string): void;
  wait(nodeId: string): void;
  skip(nodeId: string, message?: string): void;
  fail(nodeId: string, message: string): void;
  end(summary: string): void;
}

export interface TraceEntry { id: string; workflowId: string; chatId?: string; at: number; ok: boolean; summary: string }

const MAX_HISTORY = 200;
let history: TraceEntry[] = [];
const listeners = new Set<() => void>();
function emit() { for (const listener of listeners) listener(); }

export function traceHistory(): TraceEntry[] { return history; }

export function useTraceHistory(): TraceEntry[] {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => history, () => history);
}

export function traceSystem(workflowId: string, context: { chatId?: string } = {}, now: () => number = Date.now): SystemTrace {
  const started = now();
  let last = started;
  let done = false;
  startRun(workflowId, "sistema", context.chatId);
  for (const node of systemWorkflow(workflowId)?.nodes ?? []) updateRunNode(workflowId, node.id, { state: "waiting" });
  const elapsed = () => { const at = now(); const ms = at - last; last = at; return ms; };
  const finish = (ok: boolean, summary: string) => {
    if (done) return;
    done = true;
    finishRun(workflowId, { ok, error: ok ? undefined : summary, outputs: {}, memory: {}, ms: now() - started });
    history = [{ id: `${workflowId}-${started}-${history.length}`, workflowId, chatId: context.chatId, at: started, ok, summary }, ...history].slice(0, MAX_HISTORY);
    emit();
  };
  return {
    step: (nodeId, sample) => updateRunNode(workflowId, nodeId, { state: "ok", count: 1, sample: sample?.slice(0, 280), ms: elapsed() }),
    wait: (nodeId) => updateRunNode(workflowId, nodeId, { state: "running" }),
    skip: (nodeId, message) => updateRunNode(workflowId, nodeId, { state: "skipped", message }),
    fail: (nodeId, message) => { updateRunNode(workflowId, nodeId, { state: "error", message, ms: elapsed() }); finish(false, message); },
    end: (summary) => finish(true, summary),
  };
}

/** Rastros esperando uma etapa que acontece depois (ex.: a gravação do arquivo, que tem um atraso de 400 ms). */
const held = new Map<string, { trace: SystemTrace; timer: ReturnType<typeof setTimeout> }>();

export function holdTrace(key: string, trace: SystemTrace, nodeId: string, timeoutMs = 5000) {
  const timer = setTimeout(() => { held.delete(key); trace.fail(nodeId, "A etapa não terminou a tempo."); }, timeoutMs);
  held.set(key, { trace, timer });
}

export function releaseTrace(key: string): SystemTrace | undefined {
  const entry = held.get(key);
  if (!entry) return undefined;
  clearTimeout(entry.timer);
  held.delete(key);
  return entry.trace;
}
```

- [ ] **Step 5: Rótulo "pelo sistema" no painel de execução**

Em `WorkflowCanvas.tsx` (~linha 406), trocar:
```tsx
<small>{run.trigger === "agenda" ? "agendado" : run.trigger === "ia" ? "pela IA" : "manual"}
```
por:
```tsx
<small>{run.trigger === "agenda" ? "agendado" : run.trigger === "ia" ? "pela IA" : run.trigger === "sistema" ? "pelo sistema" : "manual"}
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run src/store/systemTrace.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/workflowRuns.ts src/store/systemTrace.ts src/store/systemTrace.test.ts src/components/WorkflowCanvas.tsx
git commit -m "feat: rastro ao vivo dos fluxos do sistema"
```

---

### Task 3: Salvar memória relata cada etapa

**Files:**
- Create: `src/utils/memoryFlow.ts`
- Test: `src/utils/memoryFlow.test.ts`
- Modify: `src/components/ChatView.tsx:571-574`
- Modify: `src/store/memoryFile.ts` (efeito de gravação, linha do `setTimeout`)

**Interfaces:**
- Consumes: `detectMemory`, `applyDetected`, `UserMemory`, `DetectedMemory` (`memory.ts`); `SystemTrace`, `holdTrace`, `releaseTrace` (Task 2); `SYS_MEMORY_SAVE` (Task 1).
- Produces: `learnWithTrace(memory: UserMemory, text: string, open: () => SystemTrace): { memory: UserMemory; changes: string[] }`; constante `MEMORY_TRACE_KEY = SYS_MEMORY_SAVE`.

- [ ] **Step 1: Escrever o teste que falha**

`src/utils/memoryFlow.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { learnWithTrace } from "./memoryFlow";
import { releaseTrace, type SystemTrace } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "./systemWorkflows";
import { EMPTY_MEMORY } from "./memory";

function recorder() {
  const calls: string[] = [];
  const trace: SystemTrace = {
    step: (id, sample) => calls.push(`step ${id}${sample ? `: ${sample}` : ""}`),
    wait: (id) => calls.push(`wait ${id}`),
    skip: (id) => calls.push(`skip ${id}`),
    fail: (id, message) => calls.push(`fail ${id}: ${message}`),
    end: (summary) => calls.push(`end ${summary}`),
  };
  let opened = 0;
  return { calls, open: () => { opened += 1; return trace; }, opened: () => opened };
}

const empty = () => ({ ...EMPTY_MEMORY, learn: true });

describe("learnWithTrace", () => {
  it("does not open a trace for ordinary messages", () => {
    const rec = recorder();
    const result = learnWithTrace(empty(), "qual a capital da França?", rec.open);
    expect(result.changes).toEqual([]);
    expect(rec.opened()).toBe(0);
  });

  it("reports every step and holds the trace until the file is written", () => {
    const rec = recorder();
    const result = learnWithTrace(empty(), "lembre que eu gosto de café", rec.open);
    expect(result.changes.length).toBe(1);
    expect(rec.calls).toEqual([
      "step mensagem: lembre que eu gosto de café",
      `step detectar: ${result.changes[0]}`,
      `step juntar: ${result.changes[0]}`,
      "wait gravar",
    ]);
    expect(releaseTrace(SYS_MEMORY_SAVE)).toBeDefined();
  });

  it("ends early when the fact was already saved", () => {
    const rec = recorder();
    const first = learnWithTrace(empty(), "lembre que eu gosto de café", recorder().open);
    releaseTrace(SYS_MEMORY_SAVE);
    const again = learnWithTrace(first.memory, "lembre que eu gosto de café", rec.open);
    expect(again.changes).toEqual([]);
    expect(rec.calls.slice(-3)).toEqual(["step juntar: Já estava salvo.", "skip gravar", "end Nada novo: já estava na memória."]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/memoryFlow.test.ts`
Expected: FAIL — `Failed to resolve import "./memoryFlow"`.

- [ ] **Step 3: Criar `src/utils/memoryFlow.ts`**

```ts
/**
 * Aprender com a mensagem do chat relatando cada etapa ao fluxo do sistema "Salvar memória"
 * (`systemWorkflows.ts`). A gravação do arquivo acontece depois, em `store/memoryFile.ts`, que fecha o rastro.
 */
import { applyDetected, detectMemory, type DetectedMemory, type UserMemory } from "./memory";
import { holdTrace, releaseTrace, type SystemTrace } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "./systemWorkflows";

export const MEMORY_TRACE_KEY = SYS_MEMORY_SAVE;

function describeDetected(detected: DetectedMemory): string {
  return [detected.callMe && `Chamar de ${detected.callMe}`, detected.name && `Nome: ${detected.name}`, ...detected.facts].filter(Boolean).join(" · ");
}

export function learnWithTrace(memory: UserMemory, text: string, open: () => SystemTrace): { memory: UserMemory; changes: string[] } {
  const detected = detectMemory(text);
  if (!detected.facts.length && !detected.callMe && !detected.name) return { memory, changes: [] };
  releaseTrace(MEMORY_TRACE_KEY)?.end("Substituído por um pedido mais novo.");
  const trace = open();
  trace.step("mensagem", text);
  trace.step("detectar", describeDetected(detected));
  const learned = applyDetected(memory, detected);
  if (!learned.changes.length) {
    trace.step("juntar", "Já estava salvo.");
    trace.skip("gravar");
    trace.end("Nada novo: já estava na memória.");
    return learned;
  }
  trace.step("juntar", learned.changes.join(" · "));
  trace.wait("gravar");
  holdTrace(MEMORY_TRACE_KEY, trace, "gravar");
  return learned;
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run src/utils/memoryFlow.test.ts src/utils/memory.test.ts`
Expected: PASS.

- [ ] **Step 5: Ligar no chat**

Em `ChatView.tsx`, trocar as linhas 571-574:
```ts
    if (memory.learn && sourceText) {
      const learned = applyDetected(memory, detectMemory(sourceText));
      if (learned.changes.length) { memory = learned.memory; memoryNote = learned.changes; dispatch({ type: "setMemory", patch: learned.memory }); }
    }
```
por:
```ts
    if (memory.learn && sourceText) {
      const learned = learnWithTrace(memory, sourceText, () => traceSystem(SYS_MEMORY_SAVE, { chatId }));
      if (learned.changes.length) { memory = learned.memory; memoryNote = learned.changes; dispatch({ type: "setMemory", patch: learned.memory }); }
    }
```
Imports: trocar `applyDetected, detectMemory, memoryPrompt` por `memoryPrompt` (se `applyDetected`/`detectMemory` não forem usados em outro lugar do arquivo — confira com grep) e acrescentar:
```ts
import { learnWithTrace } from "../utils/memoryFlow";
import { traceSystem } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "../utils/systemWorkflows";
```

- [ ] **Step 6: Fechar o rastro quando o arquivo é gravado**

Em `src/store/memoryFile.ts`, trocar a linha do timer:
```ts
    const timer = setTimeout(() => { lastText.current = text; void invoke("memory_file_write", { text }).catch(() => undefined); }, 400);
```
por:
```ts
    const timer = setTimeout(() => {
      lastText.current = text;
      void invoke("memory_file_write", { text })
        .then(() => { const trace = releaseTrace(MEMORY_TRACE_KEY); trace?.step("gravar", "memoria-da-ia.md atualizado"); trace?.end("Memória salva"); })
        .catch((error) => releaseTrace(MEMORY_TRACE_KEY)?.fail("gravar", String(error)));
    }, 400);
```
E no começo do mesmo efeito, dentro do `if (!ready || isQAOffline()) return;`, fechar o rastro no modo QA para ele não ficar pendurado:
```ts
    if (!ready || isQAOffline()) { const trace = releaseTrace(MEMORY_TRACE_KEY); trace?.skip("gravar", "modo QA: arquivo não gravado"); trace?.end("Memória salva (sem arquivo)"); return; }
```
Imports:
```ts
import { releaseTrace } from "./systemTrace";
import { MEMORY_TRACE_KEY } from "../utils/memoryFlow";
```

- [ ] **Step 7: Tipos e testes**

Run: `npm run build` e `npx vitest run`
Expected: `tsc` sem erros; todos os testes passam.

- [ ] **Step 8: Commit**

```bash
git add src/utils/memoryFlow.ts src/utils/memoryFlow.test.ts src/components/ChatView.tsx src/store/memoryFile.ts
git commit -m "feat: salvar memória acende o fluxo do sistema ao vivo"
```

---

### Task 4: Layout conhece os fluxos do sistema (abrir ao lado do chat)

**Files:**
- Modify: `src/utils/workspaceLayout.ts` (`adoptWorkflows` linha 121; nova função `openWorkflowBeside`)
- Test: `src/utils/workspaceLayout.test.ts`
- Modify: `src/store/store.tsx` (linhas 372 e 630; tipo `Action` linha 186; reducer)

**Interfaces:**
- Consumes: `SYSTEM_WORKFLOWS`, `isSystemWorkflow` (Task 1).
- Produces:
  - `adoptWorkflows(layout, workflowIds: string[], keep: string[] = [])`
  - `openWorkflowBeside(layout: WorkspaceLayoutNode, besideAreaId: string, workflowId: string, ids: { area: string; split: string }): { layout: WorkspaceLayoutNode; areaId: string }`
  - Ações novas: `{ type: "openSystemFlow"; workflowId: string }` (abre na área ativa) e `{ type: "openFlowBeside"; workflowId: string; besideAreaId: string }` (divide a área e abre à direita).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `src/utils/workspaceLayout.test.ts` (dentro do `describe` que já usa `layout` com áreas `a`/`b`; se o `layout` do arquivo tiver outros ids, adapte os ids abaixo aos dele):
```ts
  it("keeps areas that show a pinned (system) workflow", () => {
    const adopted = adoptWorkflows(setAreaWorkflow(layout, "a", "sys-memoria-salvar"), ["migrado"], ["sys-memoria-salvar"]);
    expect(listAreas(adopted).map((area) => area.workflowId)).toContain("sys-memoria-salvar");
  });

  it("opens a workflow beside an area, or reuses the area that already shows it", () => {
    const first = openWorkflowBeside(layout, "a", "sys-memoria-salvar", { area: "novo", split: "s1" });
    expect(first.areaId).toBe("novo");
    const created = listAreas(first.layout).find((area) => area.id === "novo")!;
    expect(created).toMatchObject({ view: "workflow", workflowId: "sys-memoria-salvar" });
    const again = openWorkflowBeside(first.layout, "a", "sys-memoria-salvar", { area: "outro", split: "s2" });
    expect(again.areaId).toBe("novo");
    expect(again.layout).toBe(first.layout);
  });
```
e importar `openWorkflowBeside` no topo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/workspaceLayout.test.ts`
Expected: FAIL — `openWorkflowBeside is not a function` e a área do sistema sendo trocada.

- [ ] **Step 3: Implementar em `workspaceLayout.ts`**

Trocar a assinatura e o `continue` de `adoptWorkflows`:
```ts
export function adoptWorkflows(layout: WorkspaceLayoutNode, workflowIds: string[], keep: string[] = []): WorkspaceLayoutNode {
  const shown = new Set(listAreas(layout).map((area) => area.workflowId).filter((id): id is string => Boolean(id && workflowIds.includes(id))));
  const orphans = workflowIds.filter((id) => !shown.has(id));
  let next = layout;
  for (const area of listAreas(layout).filter((item) => item.view === "workflow")) {
    if (area.workflowId && (workflowIds.includes(area.workflowId) || keep.includes(area.workflowId))) continue;
```
(o resto igual). Acrescentar no fim do arquivo:
```ts
/** Mostra o workflow numa área nova à direita de `besideAreaId` (ex.: o fluxo da memória ao lado do chat). Se alguma área já mostra, usa ela. */
export function openWorkflowBeside(layout: WorkspaceLayoutNode, besideAreaId: string, workflowId: string, ids: { area: string; split: string }): { layout: WorkspaceLayoutNode; areaId: string } {
  const holder = listAreas(layout).find((area) => area.view === "workflow" && area.workflowId === workflowId);
  if (holder) return { layout, areaId: holder.id };
  const visit = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if ("view" in node) return node.id === besideAreaId ? { id: ids.split, axis: "horizontal", fraction: .55, first: node, second: { id: ids.area, view: "workflow", workflowId } } : node;
    return { ...node, first: visit(node.first), second: visit(node.second) };
  };
  return { layout: visit(layout), areaId: ids.area };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/utils/workspaceLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Store**

Em `store.tsx`:
1. Import: `import { isSystemWorkflow, SYSTEM_WORKFLOWS } from "../utils/systemWorkflows";` e `openWorkflowBeside` no import de `../utils/workspaceLayout`.
2. Linha 372: `new Set(state.workflows.map((doc) => doc.id))` → `new Set([...state.workflows.map((doc) => doc.id), ...SYSTEM_WORKFLOWS.map((doc) => doc.id)])`.
3. Linha 630: `adoptWorkflows(<layout>, workflows.map((doc) => doc.id))` → `adoptWorkflows(<layout>, workflows.map((doc) => doc.id), SYSTEM_WORKFLOWS.map((doc) => doc.id))`.
4. No tipo `Action`, depois de `| { type: "wfDelete"; workflowId: string }`:
```ts
  /** Abre um fluxo do sistema (só visualização) na área ativa. */
  | { type: "openSystemFlow"; workflowId: string }
  /** Abre um fluxo do sistema numa área nova ao lado (ex.: ao lado do chat). */
  | { type: "openFlowBeside"; workflowId: string; besideAreaId: string }
```
5. No reducer, depois do `case "wfDelete"`:
```ts
    case "openSystemFlow": {
      if (!isSystemWorkflow(action.workflowId)) return state;
      const holder = listAreas(state.workspaceLayout).find((area) => area.view === "workflow" && area.workflowId === action.workflowId);
      if (holder) return { ...state, activeAreaId: holder.id, activeView: "workflow" };
      const layout = setAreaWorkflow(updateAreaView(state.workspaceLayout, state.activeAreaId, "workflow"), state.activeAreaId, action.workflowId);
      return { ...state, workspaceLayout: layout, activeView: "workflow" };
    }
    case "openFlowBeside": {
      if (!isSystemWorkflow(action.workflowId)) return state;
      const opened = openWorkflowBeside(state.workspaceLayout, action.besideAreaId, action.workflowId, { area: crypto.randomUUID(), split: crypto.randomUUID() });
      return { ...state, workspaceLayout: opened.layout, activeAreaId: opened.areaId, activeView: "workflow" };
    }
```

- [ ] **Step 6: Tipos e testes**

Run: `npm run build` e `npx vitest run`
Expected: sem erros; tudo passa.

- [ ] **Step 7: Commit**

```bash
git add src/utils/workspaceLayout.ts src/utils/workspaceLayout.test.ts src/store/store.tsx
git commit -m "feat: abrir fluxos do sistema numa área (inclusive ao lado do chat)"
```

---

### Task 5: Canvas mostra o fluxo do sistema só para leitura

**Files:**
- Modify: `src/components/WorkflowCanvas.tsx` (linhas ~117-120, cabeçalho ~254-290, paleta ~314-317, menu de projetos ~266)
- Modify: `src/refresh.css` (fim do arquivo)

**Interfaces:**
- Consumes: `systemWorkflow`, `isSystemWorkflow`, `allowedWhenReadOnly`, `SYSTEM_WORKFLOWS` (Task 1); ação `openSystemFlow` (Task 4); `NodeKindSpec.traceOnly` (Task 1).

- [ ] **Step 1: Resolver o doc e proteger o dispatch**

Trocar o começo de `WorkflowCanvas`:
```tsx
  const { state, dispatch } = useStore();
  const runs = useWorkflowRuns();
  const doc: WorkflowDoc | undefined = state.workflows.find((item) => item.id === workflowId);
```
por:
```tsx
  const { state, dispatch: storeDispatch } = useStore();
  const runs = useWorkflowRuns();
  const readOnly = isSystemWorkflow(workflowId);
  const doc: WorkflowDoc | undefined = state.workflows.find((item) => item.id === workflowId) ?? systemWorkflow(workflowId);
  // Fluxo do sistema: pode navegar (zoom, arrastar a vista, trocar de workflow), mas nada é editado.
  const dispatch = useCallback((action: Parameters<typeof storeDispatch>[0]) => { if (!readOnly || allowedWhenReadOnly(action.type)) storeDispatch(action); }, [readOnly, storeDispatch]);
```
Import: `useCallback` do React (se ainda não estiver) e `import { allowedWhenReadOnly, isSystemWorkflow, SYSTEM_WORKFLOWS, systemWorkflow } from "../utils/systemWorkflows";`.

Mover um node num fluxo do sistema também passa por `dispatch({ type: "wfMoveNode" … })`, então fica bloqueado: os nodes não se mexem. É o comportamento desejado.

- [ ] **Step 2: Cabeçalho sem editar/executar**

- Botão de renomear: `{!renaming && <button className="icon-button wf-rename" …` → `{!renaming && !readOnly && <button className="icon-button wf-rename" …`.
- Botão Executar: envolver o `<button className={\`primary-button workflow-run …\`}>…</button>` com `{!readOnly && (…)}`.
- Logo depois de `<div className="view-header-actions">`, acrescentar:
```tsx
        {readOnly && <span className="workflow-readonly-note" title={doc.description}><Eye size={13} />Fluxo do sistema · só visualização — acende quando o app usa</span>}
```
(importar `Eye` de `lucide-react`).
- O `connect-hint` só faz sentido editando: `<span className={\`connect-hint …\`}>` → envolver com `{!readOnly && (…)}`.
- O botão que abre a paleta de nodes (procure `setPaletteOpen(` no JSX do botão "+"): envolver com `{!readOnly && (…)}`.

- [ ] **Step 3: Paleta sem `trace.*`**

Nas duas linhas que filtram `NODE_KINDS` (~314 e ~317), acrescentar `!spec.traceOnly &&` no começo da condição:
```tsx
const first = NODE_KINDS.find((spec) => !spec.traceOnly && `${spec.label} …`
```
```tsx
const items = NODE_KINDS.filter((spec) => !spec.traceOnly && spec.category === category && …
```

- [ ] **Step 4: Grupo "Fluxos do sistema" no menu de projetos**

No menu de projetos, depois do bloco de `state.workflows…map(…)` e antes do botão "Novo workflow em branco", acrescentar:
```tsx
              <span className="oa-menu-label">Fluxos do sistema</span>
              {SYSTEM_WORKFLOWS.filter((item) => item.name.toLowerCase().includes(projectQuery.toLowerCase())).map((item) => <button key={item.id} role="menuitem" className={`oa-menu-item ${item.id === doc.id ? "active" : ""}`} onClick={() => { dispatch({ type: "wfOpen", workflowId: item.id, areaId }); setProjectMenu(false); }}>
                <span className="oa-menu-icon"><Eye size={14} /></span>
                <span className="oa-menu-text"><b>{item.name}</b><small>só visualização</small></span>
                {item.id === doc.id && <Check size={14} className="oa-menu-check" />}
              </button>)}
```
O botão de apagar no rodapé do menu: acrescentar `!readOnly &&` na condição `{state.workflows.length > 1 && …}`.

- [ ] **Step 5: CSS**

No fim de `src/refresh.css`:
```css
/* Fluxo do sistema aberto no editor de nodes (só visualização). */
.workflow-readonly-note { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; color: var(--muted, #9a9aa2); background: color-mix(in srgb, var(--action, #5aa9ff) 12%, transparent); }
```

- [ ] **Step 6: Tipos e testes**

Run: `npm run build` e `npx vitest run`
Expected: sem erros; tudo passa.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkflowCanvas.tsx src/refresh.css
git commit -m "feat: editor de nodes abre fluxos do sistema só para leitura"
```

---

### Task 6: Tela Agentes com abas Sistema / Usuário e botão "Ver fluxo" no chat

**Files:**
- Modify: `src/components/AgentsView.tsx`
- Modify: `src/components/ChatView.tsx:1120` (aviso "Memória atualizada")
- Modify: `src/refresh.css`

**Interfaces:**
- Consumes: `SYSTEM_AGENTS`, `SYSTEM_WORKFLOWS` (Task 1); `useTraceHistory`, `TraceEntry` (Task 2); ações `openSystemFlow`, `openFlowBeside` (Task 4); `SYS_MEMORY_SAVE`.

- [ ] **Step 1: Reescrever `AgentsView.tsx`**

```tsx
import { Bot, Cpu, Eye, Plus, TerminalSquare, Users, Workflow } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useStore } from "../store/store";
import { useTraceHistory } from "../store/systemTrace";
import { SYSTEM_AGENTS, SYSTEM_WORKFLOWS } from "../utils/systemWorkflows";
import { Dropdown } from "./Dropdown";
import { PageHeader } from "./PageHeader";

type AgentsTab = "sistema" | "usuario";

const timeOf = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Agentes: os do usuário (cada um abre o seu canvas ou terminal) e os do próprio sistema (fluxos só para ver). */
export function AgentsView() {
  const { state, dispatch } = useStore();
  const history = useTraceHistory();
  const [tab, setTab] = useState<AgentsTab>("usuario");
  const [newAgentType, setNewAgentType] = useState<"workflow" | "terminal">("workflow");
  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, open: () => void) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } };
  const chatTitle = (chatId?: string) => state.chats.find((chat) => chat.id === chatId)?.title ?? "conversa";
  return <section className="view page-view agents-view">
    <PageHeader eyebrow="Equipe" title="Agentes" icon={<Users size={17} />}>
      {tab === "usuario" && <>
        <Dropdown ariaLabel="Tipo do novo agente" value={newAgentType} onChange={(value) => setNewAgentType(value as "workflow" | "terminal")}
          options={[{ value: "workflow", label: "Canvas de nodes", description: "workflow com IA, arquivos, nuvem", icon: <Workflow size={14} /> }, { value: "terminal", label: "Terminal", description: "PowerShell do agente", icon: <TerminalSquare size={14} /> }]} />
        <button className="page-button primary" onClick={() => dispatch({ type: "addAgent", workspace: newAgentType })}><Plus size={14} />Novo agente</button>
      </>}
    </PageHeader>
    <div className="agents-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "usuario"} className={tab === "usuario" ? "active" : ""} onClick={() => setTab("usuario")}><Users size={13} />Agentes do usuário</button>
      <button role="tab" aria-selected={tab === "sistema"} className={tab === "sistema" ? "active" : ""} onClick={() => setTab("sistema")}><Cpu size={13} />Agentes do sistema</button>
    </div>
    <div className="page-scroll">
      {tab === "usuario" ? <>
        <p className="page-subtitle">Clique num agente para abrir o espaço de trabalho dele nesta área.</p>
        <div className="agent-grid">
          {state.agents.map((agent) => { const workflow = state.workflows.find((doc) => doc.id === agent.workflowId); return <article className="page-card agent-tile" key={agent.id} role="button" tabIndex={0} onClick={() => dispatch({ type: "openAgent", id: agent.id })} onKeyDown={(event) => openWithKeyboard(event, () => dispatch({ type: "openAgent", id: agent.id }))}>
            <header><span className={`market-icon ${agent.workspace === "workflow" ? "mcp" : "texto"}`}>{agent.workspace === "workflow" ? <Workflow size={18} /> : <TerminalSquare size={18} />}</span><div><h3>{agent.name}</h3><small>{agent.workspace === "workflow" ? "Canvas de nodes" : "Terminal"}</small></div></header>
            <p>{agent.role}</p>
            <footer><span className="market-status instalado"><i className="agent-dot" />{agent.status}</span>{workflow && <small className="agent-meta">{workflow.name} · {workflow.nodes.length} nodes</small>}</footer>
          </article>; })}
          {!state.agents.length && <div className="page-empty compact"><Bot size={22} /><p>Nenhum agente ainda.</p></div>}
        </div>
      </> : <>
        <p className="page-subtitle">Os fluxos que o próprio Open Assistant usa. Abra um e use o app: os nodes acendem na hora em que cada etapa acontece.</p>
        <div className="agent-grid">
          {SYSTEM_AGENTS.map((agent) => { const workflow = SYSTEM_WORKFLOWS.find((doc) => doc.id === agent.workflowId); const last = history.find((entry) => entry.workflowId === agent.workflowId); const open = () => dispatch({ type: "openSystemFlow", workflowId: agent.workflowId }); return <article className="page-card agent-tile" key={agent.id} role="button" tabIndex={0} onClick={open} onKeyDown={(event) => openWithKeyboard(event, open)}>
            <header><span className="market-icon mcp"><Eye size={18} /></span><div><h3>{agent.name}</h3><small>Fluxo do sistema</small></div></header>
            <p>{agent.role}</p>
            <footer><span className="market-status instalado"><i className="agent-dot" />{last ? `${last.ok ? "Última vez" : "Falhou"} às ${timeOf(last.at)}` : "Ainda não rodou nesta sessão"}</span>{workflow && <small className="agent-meta">{workflow.name} · {workflow.nodes.length} nodes</small>}</footer>
          </article>; })}
        </div>
        <h3 className="agents-section-title">Execuções recentes</h3>
        {history.length ? <ul className="system-trace-list">
          {history.slice(0, 30).map((entry) => <li key={entry.id} className={entry.ok ? "ok" : "error"}>
            <i className={`node-status-dot ${entry.ok ? "ok" : "error"}`} />
            <b>{SYSTEM_WORKFLOWS.find((doc) => doc.id === entry.workflowId)?.name ?? entry.workflowId}</b>
            <small>{timeOf(entry.at)}{entry.chatId ? ` · ${chatTitle(entry.chatId)}` : ""}</small>
            <span>{entry.summary}</span>
          </li>)}
        </ul> : <div className="page-empty compact"><Eye size={22} /><p>Nada rodou ainda. Peça no chat: "lembre que eu gosto de café".</p></div>}
      </>}
    </div>
  </section>;
}
```

- [ ] **Step 2: Botão "Ver fluxo" no aviso de memória**

Em `ChatView.tsx:1120`, trocar:
```tsx
{message.memoryNote && message.memoryNote.length > 0 && <button className="memory-note" onClick={() => dispatch({ type: "settings", open: true, tab: "memory" })} title={`Aprendi: ${message.memoryNote.join(" · ")} — clique para ver ou apagar`}><Brain size={12} />Memória atualizada</button>}
```
por:
```tsx
{message.memoryNote && message.memoryNote.length > 0 && <span className="memory-note-row">
  <button className="memory-note" onClick={() => dispatch({ type: "settings", open: true, tab: "memory" })} title={`Aprendi: ${message.memoryNote.join(" · ")} — clique para ver ou apagar`}><Brain size={12} />Memória atualizada</button>
  <button className="memory-note" onClick={() => dispatch({ type: "openFlowBeside", workflowId: SYS_MEMORY_SAVE, besideAreaId: state.activeAreaId })} title="Abrir o fluxo do sistema que salvou esta memória, ao lado do chat"><Workflow size={12} />Ver fluxo</button>
</span>}
```
(importar `Workflow` de `lucide-react` se o arquivo ainda não importa; `SYS_MEMORY_SAVE` já foi importado na Task 3.)

- [ ] **Step 3: CSS**

No fim de `src/refresh.css`:
```css
/* Tela Agentes: abas Sistema / Usuário e lista de execuções do sistema. */
.agents-tabs { display: flex; gap: 4px; padding: 0 24px 8px; }
.agents-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 0; background: transparent; color: var(--muted, #9a9aa2); cursor: pointer; }
.agents-tabs button.active { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--text, inherit); }
.agents-section-title { margin: 20px 0 8px; font-size: 13px; font-weight: 600; }
.system-trace-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.system-trace-list li { display: grid; grid-template-columns: auto auto auto 1fr; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; font-size: 12px; }
.system-trace-list li span { color: var(--muted, #9a9aa2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memory-note-row { display: inline-flex; gap: 6px; }
```

- [ ] **Step 4: Tipos e testes**

Run: `npm run build` e `npx vitest run`
Expected: sem erros; tudo passa.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentsView.tsx src/components/ChatView.tsx src/refresh.css
git commit -m "feat: tela Agentes com agentes do sistema e botão Ver fluxo no chat"
```

---

### Task 7: Verificação de ponta a ponta no app real + ROADMAP

**Files:**
- Modify: `docs/ROADMAP.md` (§11: marcar os itens feitos)

- [ ] **Step 1: Build do app real**

Run: `npm run build:app`
Expected: termina sem erro e gera `src-tauri\target\release\open-assistant.exe`.

- [ ] **Step 2: Publicar o exe**

Se o app estiver aberto, mover `Desktop\Assistente pessoal\Open Assistant.exe` para `Desktop\Assistente pessoal\_versoes-anteriores\` e depois copiar o novo exe para `Desktop\Assistente pessoal\Open Assistant.exe`.

- [ ] **Step 3: Testar o fluxo (CDP, como nas sessões anteriores)**

Com o app aberto:
1. Área de chat → trocar uma área para **Agentes** → aba **Agentes do sistema** → aparece o cartão "Memória" com "Ainda não rodou nesta sessão".
2. No chat, enviar: `lembre que eu gosto de café`.
3. Esperado: aparece "Memória atualizada" e "Ver fluxo". Clicar em **Ver fluxo** abre uma área à direita com "Salvar memória"; os 4 nodes ficam verdes; o painel de execução diz "Concluído · pelo sistema".
4. Enviar de novo a mesma frase → no fluxo, "Juntar à memória" diz "Já estava salvo." e "Gravar" fica como pulado.
5. Aba Agentes do sistema → "Execuções recentes" lista as duas execuções, com o título da conversa.
6. Conferir que `%LOCALAPPDATA%\com.openassistant.windows\memoria-da-ia.md` tem "Gosto de café" (ou o texto que o `detectMemory` gerou).
7. No fluxo do sistema, tentar arrastar um node e apertar Delete → nada muda. O botão Executar não aparece.
8. Tirar um print da tela com o chat e o fluxo lado a lado para mostrar ao André.

Depois, apagar o fato de teste pela tela de Memória nas Configurações.

- [ ] **Step 4: Atualizar o ROADMAP**

Em `docs/ROADMAP.md` §11, marcar `[x]` nos itens: abas da tela Agentes, lista dos agentes do sistema, execução ao vivo, workflow Salvar memória, abrir chat + Node Editor lado a lado. O item "trilha por conversa" fica `[x]` com a nota "(parcial: execuções recentes mostram a conversa; filtro por conversa fica para a fase 2)".

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: ROADMAP §11 fase 1 concluída"
```
