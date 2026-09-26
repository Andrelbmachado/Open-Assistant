import { invoke } from "@tauri-apps/api/core";
import { isQAOffline } from "./qaMode";

export type LogLevel = "erro" | "aviso" | "info";

export interface LogEntry { t: string; level: LogLevel; source: string; message: string }

/** Grava no log do app (Configurações › Logs). Nunca falha nem trava quem chamou. */
export function appLog(level: LogLevel, source: string, message: string) {
  if (isQAOffline()) return;
  void invoke("logs_write", { level, source, message: message.slice(0, 8000) }).catch(() => undefined);
}

let installed = false;

/** Erros que escapam da interface (exceções e promessas rejeitadas) também vão para o log. */
export function installGlobalErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => appLog("erro", "interface", `${event.message}${event.filename ? ` (${event.filename.split("/").pop()}:${event.lineno})` : ""}`));
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ""}` : String(event.reason);
    appLog("erro", "interface", `Promessa rejeitada: ${reason}`);
  });
}

/** Texto das entradas para copiar e colar numa IA. */
export function logsAsText(entries: LogEntry[]): string {
  return entries.map((entry) => `${entry.t} [${entry.level}] [${entry.source}] ${entry.message}`).join("\n");
}
