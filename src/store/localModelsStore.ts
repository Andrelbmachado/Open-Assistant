import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { LOCAL_MODEL_CATALOG, type InstalledModel } from "../utils/localCatalog";
import type { HardwareProfile } from "../utils/localModels";
import type { PullProgress } from "../utils/localOperation";
import { isQAOffline } from "../utils/qaMode";

export type OllamaStatus = "unknown" | "checking" | "online" | "offline";
export type HardwareStatus = "idle" | "scanning" | "ready" | "failed";

export interface LocalModelsSnapshot {
  ollama: OllamaStatus;
  ollamaError?: string;
  installed: InstalledModel[];
  hardware?: HardwareProfile;
  hardwareStatus: HardwareStatus;
  hardwareError?: string;
  /** Último estado de download por id exato do modelo. */
  pulls: Record<string, PullProgress>;
}

let snapshot: LocalModelsSnapshot = { ollama: "unknown", installed: [], hardwareStatus: "idle", pulls: {} };
const listeners = new Set<() => void>();

function update(patch: Partial<LocalModelsSnapshot> | ((current: LocalModelsSnapshot) => Partial<LocalModelsSnapshot>)) {
  snapshot = { ...snapshot, ...(typeof patch === "function" ? patch(snapshot) : patch) };
  listeners.forEach((listener) => listener());
}

function setPull(progress: PullProgress) {
  update((current) => {
    const previous = current.pulls[progress.modelId];
    // Pausa/cancelamento chegam sem bytes; mantém o último total conhecido na tela.
    const merged: PullProgress = {
      ...progress,
      totalBytes: progress.totalBytes ?? previous?.totalBytes,
      completedBytes: progress.completedBytes ?? previous?.completedBytes,
    };
    return { pulls: { ...current.pulls, [progress.modelId]: merged } };
  });
}

let bridge: Promise<void> | undefined;
function ensureEventBridge(): Promise<void> {
  if (isQAOffline()) return Promise.resolve();
  bridge ??= listen<PullProgress>("ollama-pull-progress", (event) => {
    setPull(event.payload);
    if (event.payload.state === "completed") void refreshInstalledModels();
  }).then(() => undefined).catch(() => undefined);
  return bridge;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void ensureEventBridge();
  return () => { listeners.delete(listener); };
}

/** Hook: estado do Ollama, modelos instalados, hardware e downloads. */
export function useLocalModels(): LocalModelsSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Leitura síncrona do estado (fora de componentes). */
export function getLocalModelsSnapshot(): LocalModelsSnapshot {
  return snapshot;
}

// Modo QA offline: nada de processo ou rede, apenas uma simulação determinística.
const qaInstalled: InstalledModel[] = [{ name: "qwen3.5:9b", sizeBytes: 6_594_474_711 }];
const qaTimers = new Map<string, ReturnType<typeof setInterval>>();

let refreshing: Promise<void> | undefined;
/** Relê `/api/tags` pelo Rust; marca o Ollama como online/offline. */
export function refreshInstalledModels(): Promise<void> {
  if (refreshing) return refreshing;
  if (isQAOffline()) {
    update({ ollama: "online", installed: [...qaInstalled] });
    return Promise.resolve();
  }
  if (snapshot.ollama !== "online") update({ ollama: "checking" });
  refreshing = invoke<InstalledModel[]>("ollama_list_models")
    .then((installed) => update({ ollama: "online", ollamaError: undefined, installed }))
    .catch((error) => update({ ollama: "offline", ollamaError: String(error), installed: [] }))
    .finally(() => { refreshing = undefined; });
  return refreshing;
}

let scanning: Promise<void> | undefined;
/** Lê GPU/VRAM, RAM e disco uma vez (ou de novo com `force`). */
export function scanHardware(force = false): Promise<void> {
  if (scanning) return scanning;
  if (!force && snapshot.hardwareStatus === "ready") return Promise.resolve();
  update({ hardwareStatus: "scanning" });
  scanning = invoke<HardwareProfile>("scan_hardware")
    .then((hardware) => update({ hardware, hardwareStatus: "ready", hardwareError: undefined }))
    .catch((error) => update({ hardwareStatus: "failed", hardwareError: String(error) }))
    .finally(() => { scanning = undefined; });
  return scanning;
}

/** Começa (ou retoma) o download de um modelo do Ollama; progresso chega por evento. */
export async function startPull(modelId: string): Promise<void> {
  setPull({ operationId: "", modelId, state: "running", status: "" });
  if (isQAOffline()) { simulateQAPull(modelId); return; }
  await ensureEventBridge();
  try {
    await invoke<string>("ollama_pull_model", { modelId });
  } catch (error) {
    setPull({ operationId: "", modelId, state: "failed", status: "", error: String(error) });
  }
}

/** Pausa (`pause`) ou cancela um download em andamento. */
export async function stopPull(modelId: string, pause: boolean): Promise<void> {
  if (isQAOffline()) {
    clearInterval(qaTimers.get(modelId));
    qaTimers.delete(modelId);
    const current = snapshot.pulls[modelId];
    if (current) setPull({ ...current, state: pause ? "paused" : "cancelled" });
    return;
  }
  try {
    await invoke("ollama_stop_pull", { modelId, pause });
  } catch {
    // O download já terminou no backend; a próxima atualização da lista mostra o resultado.
    void refreshInstalledModels();
  }
}

/** Esconde o cartão de progresso de um download terminado/cancelado. */
export function dismissPull(modelId: string) {
  update((current) => {
    const pulls = { ...current.pulls };
    delete pulls[modelId];
    return { pulls };
  });
}

/** Inicia `ollama serve` e aguarda o servidor responder por até ~10 s. */
export async function startOllama(): Promise<void> {
  update({ ollama: "checking", ollamaError: undefined });
  try {
    await invoke("start_runtime", { component: "ollama" });
  } catch (error) {
    update({ ollama: "offline", ollamaError: String(error) });
    return;
  }
  let lastError = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const installed = await invoke<InstalledModel[]>("ollama_list_models");
      update({ ollama: "online", ollamaError: undefined, installed });
      return;
    } catch (error) {
      lastError = String(error);
    }
  }
  update({ ollama: "offline", ollamaError: lastError || "O Ollama não respondeu após a inicialização." });
}

function simulateQAPull(modelId: string) {
  const totalBytes = LOCAL_MODEL_CATALOG.find((model) => model.id === modelId)?.sizeBytes ?? 1_000_000_000;
  let completedBytes = snapshot.pulls[modelId]?.completedBytes ?? 0;
  clearInterval(qaTimers.get(modelId));
  qaTimers.set(modelId, setInterval(() => {
    completedBytes = Math.min(totalBytes, completedBytes + totalBytes / 10);
    const done = completedBytes >= totalBytes;
    setPull({ operationId: "qa", modelId, state: done ? "completed" : "running", status: done ? "success" : `pulling ${modelId}`, totalBytes, completedBytes, bytesPerSecond: 28 * 1024 * 1024, etaSeconds: done ? undefined : Math.ceil((totalBytes - completedBytes) / (28 * 1024 * 1024)) });
    if (done) {
      clearInterval(qaTimers.get(modelId));
      qaTimers.delete(modelId);
      if (!qaInstalled.some((model) => model.name === modelId)) qaInstalled.push({ name: modelId, sizeBytes: totalBytes });
      void refreshInstalledModels();
    }
  }, 350));
}
