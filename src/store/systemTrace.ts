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
const STORAGE_KEY = "open-assistant-system-trace";
/** Histórico das execuções do sistema, guardado entre aberturas do app. */
let history: TraceEntry[] = (() => {
  try { const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : []; }
  catch { return []; }
})();
function persist() { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* sem armazenamento */ } }
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
    persist();
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
