import { formatBytes } from "./localCatalog";

export interface LocalModelOperation {
  id: string;
  kind: string;
  state: "running" | "paused" | "cancelled" | "failed" | "completed" | string;
  message: string;
  modelId?: string;
  progressPercent?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
}

export interface LocalOperationDescription {
  phase: string;
  progress?: number;
  speed?: string;
  eta?: string;
}

/** Texto de uma operação local (instalação do Ollama) para a interface. */
export function describeLocalOperation(operation: LocalModelOperation): LocalOperationDescription {
  const paused = operation.state === "paused";
  return {
    phase: paused ? "Pausado — pronto para retomar" : operation.message,
    progress: operation.progressPercent,
    speed: formatSpeed(operation.bytesPerSecond),
    eta: formatEta(operation.etaSeconds),
  };
}

/** Evento `ollama-pull-progress` emitido pelo backend durante `POST /api/pull`. */
export interface PullProgress {
  operationId: string;
  modelId: string;
  state: "running" | "paused" | "cancelled" | "failed" | "completed";
  status: string;
  totalBytes?: number;
  completedBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  error?: string;
}

export interface PullDescription {
  phase: string;
  percent?: number;
  transferred?: string;
  speed?: string;
  eta?: string;
}

function pullPhase(progress: PullProgress): string {
  if (progress.state === "paused") return "Pausado — pronto para retomar";
  if (progress.state === "cancelled") return "Download cancelado";
  if (progress.state === "failed") return progress.error || "Falha no download";
  if (progress.state === "completed") return "Pronto para usar";
  const status = progress.status.toLowerCase();
  if (!status) return "Conectando ao Ollama";
  if (status === "pulling manifest") return "Lendo manifesto";
  if (status.startsWith("pulling ")) return "Baixando";
  if (status.startsWith("verifying")) return "Verificando integridade";
  if (status.startsWith("writing manifest")) return "Gravando manifesto";
  if (status.startsWith("removing")) return "Limpando camadas antigas";
  if (status === "success") return "Concluindo";
  return progress.status;
}

/** Fase, %, bytes, velocidade e tempo restante de um download de modelo. */
export function describePull(progress: PullProgress): PullDescription {
  const { totalBytes, completedBytes } = progress;
  const known = Boolean(totalBytes && totalBytes > 0 && completedBytes !== undefined);
  const phase = pullPhase(progress);
  // Velocidade e ETA só fazem sentido enquanto os bytes estão chegando.
  const running = progress.state === "running" && phase === "Baixando";
  return {
    phase,
    percent: progress.state === "completed" ? 100 : known ? Math.min(100, Math.floor((completedBytes! / totalBytes!) * 100)) : undefined,
    transferred: known ? `${formatBytes(completedBytes!)} de ${formatBytes(totalBytes!)}` : undefined,
    speed: running ? formatSpeed(progress.bytesPerSecond) : undefined,
    eta: running ? formatEta(progress.etaSeconds) : undefined,
  };
}

function formatSpeed(bytesPerSecond: number | undefined): string | undefined {
  if (!bytesPerSecond || bytesPerSecond <= 0) return undefined;
  return `${(bytesPerSecond / 1024 / 1024).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB/s`;
}

function formatEta(seconds: number | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  return `cerca de ${formatDuration(seconds)}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.round(seconds % 60);
  if (hours) return `${hours} h ${minutes} min`;
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
}
