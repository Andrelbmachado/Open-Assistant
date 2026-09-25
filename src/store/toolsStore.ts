import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { isQAOffline } from "../utils/qaMode";

/** Evento `tool-progress` emitido pelo backend durante uma instalação. */
export interface ToolProgress {
  toolId: string;
  state: "running" | "completed" | "failed" | "cancelled";
  phase: string;
  message?: string;
  completedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  error?: string;
}

interface ToolStatus { id: string; installed: boolean; installing: boolean }

export interface ToolsSnapshot {
  loaded: boolean;
  installed: Set<string>;
  progress: Record<string, ToolProgress>;
  error?: string;
}

let snapshot: ToolsSnapshot = { loaded: false, installed: new Set(), progress: {} };
const listeners = new Set<() => void>();

function update(patch: Partial<ToolsSnapshot> | ((current: ToolsSnapshot) => Partial<ToolsSnapshot>)) {
  snapshot = { ...snapshot, ...(typeof patch === "function" ? patch(snapshot) : patch) };
  listeners.forEach((listener) => listener());
}

function setProgress(progress: ToolProgress) {
  update((current) => {
    const previous = current.progress[progress.toolId];
    // Linhas de log chegam sem bytes; mantém a última barra conhecida da mesma fase.
    const samePhase = previous?.phase === progress.phase;
    const merged: ToolProgress = {
      ...progress,
      completedBytes: progress.completedBytes ?? (samePhase ? previous?.completedBytes : undefined),
      totalBytes: progress.totalBytes ?? (samePhase ? previous?.totalBytes : undefined),
      bytesPerSecond: progress.bytesPerSecond ?? (samePhase ? previous?.bytesPerSecond : undefined),
      message: progress.message ?? (samePhase ? previous?.message : undefined),
    };
    const installed = new Set(current.installed);
    if (progress.state === "completed") installed.add(progress.toolId);
    return { progress: { ...current.progress, [progress.toolId]: merged }, installed };
  });
}

let bridge: Promise<void> | undefined;
function ensureBridge(): Promise<void> {
  if (isQAOffline()) return Promise.resolve();
  bridge ??= listen<ToolProgress>("tool-progress", (event) => setProgress(event.payload)).then(() => undefined).catch(() => undefined);
  return bridge;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void ensureBridge();
  return () => { listeners.delete(listener); };
}

/** Hook: ferramentas instaladas e progresso das instalações. */
export function useTools(): ToolsSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Leitura síncrona do estado das ferramentas. */
export function getToolsSnapshot(): ToolsSnapshot {
  return snapshot;
}

/** Consulta o backend (`tools_status`) e limpa progressos órfãos. */
export async function refreshTools(): Promise<void> {
  if (isQAOffline()) { update({ loaded: true }); return; }
  await ensureBridge();
  try {
    const list = await invoke<ToolStatus[]>("tools_status");
    update((current) => {
      const progress = { ...current.progress };
      // Uma instalação que o backend não conhece mais (app reiniciado) não fica "rodando" para sempre.
      for (const item of list) if (!item.installing && progress[item.id]?.state === "running") delete progress[item.id];
      return { loaded: true, error: undefined, installed: new Set(list.filter((item) => item.installed).map((item) => item.id)), progress };
    });
  } catch (error) {
    update({ loaded: true, error: String(error) });
  }
}

/** Pede ao backend a instalação da receita `toolId`. */
export async function installTool(toolId: string): Promise<void> {
  setProgress({ toolId, state: "running", phase: "Preparando" });
  await ensureBridge();
  try {
    await invoke("tool_install", { toolId });
  } catch (error) {
    setProgress({ toolId, state: "failed", phase: "Falhou", error: String(error) });
  }
}

/** Cancela a instalação em andamento. */
export function cancelTool(toolId: string): Promise<void> {
  return invoke<void>("tool_cancel", { toolId }).catch(() => undefined);
}

/** Apaga a pasta da ferramenta (o backend libera modelos carregados antes). */
export async function removeTool(toolId: string): Promise<void> {
  await invoke("tool_remove", { toolId });
  update((current) => {
    const installed = new Set(current.installed);
    installed.delete(toolId);
    const progress = { ...current.progress };
    delete progress[toolId];
    return { installed, progress };
  });
}

/** Esconde o progresso/erro de uma instalação. */
export function dismissToolProgress(toolId: string) {
  update((current) => {
    const progress = { ...current.progress };
    delete progress[toolId];
    return { progress };
  });
}
