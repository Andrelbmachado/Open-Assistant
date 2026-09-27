/**
 * Execuções dos workflows (fora do estado persistido): quem está rodando, o estado de cada node e o
 * resultado da última vez. O canvas de cada área lê daqui; o agendador e a IA disparam por aqui.
 */
import { useSyncExternalStore } from "react";
import type { NodeRunInfo, RunResult } from "../utils/workflowEngine";

export interface WorkflowRun {
  running: boolean;
  startedAt: number;
  nodes: Record<string, NodeRunInfo>;
  result?: RunResult;
  /** Quem pediu: você (botão), o agendador, a IA ou o próprio app (fluxos do sistema). */
  trigger: "manual" | "agenda" | "ia" | "sistema";
  /** Conversa que disparou (fluxos do sistema). */
  chatId?: string;
}

let runs: Record<string, WorkflowRun> = {};
const listeners = new Set<() => void>();
const cancels = new Set<string>();

function emit() { for (const listener of listeners) listener(); }

export function useWorkflowRuns(): Record<string, WorkflowRun> {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => runs, () => runs);
}

export function getWorkflowRun(id: string): WorkflowRun | undefined { return runs[id]; }

export function startRun(id: string, trigger: WorkflowRun["trigger"], chatId?: string) {
  cancels.delete(id);
  runs = { ...runs, [id]: { running: true, startedAt: Date.now(), nodes: {}, trigger, chatId } };
  emit();
}

export function updateRunNode(id: string, nodeId: string, info: NodeRunInfo) {
  const run = runs[id];
  if (!run) return;
  runs = { ...runs, [id]: { ...run, nodes: { ...run.nodes, [nodeId]: info } } };
  emit();
}

export function finishRun(id: string, result: RunResult) {
  const run = runs[id];
  if (!run) return;
  runs = { ...runs, [id]: { ...run, running: false, result } };
  emit();
}

export function cancelRun(id: string) { cancels.add(id); }
export function isRunCancelled(id: string) { return cancels.has(id); }
