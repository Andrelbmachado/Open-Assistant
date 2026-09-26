import { invoke } from "@tauri-apps/api/core";
import { Check, Copy, FolderOpen, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { logsAsText, type LogEntry } from "../utils/appLog";
import { isQAOffline } from "../utils/qaMode";

const LEVELS: { id: string; label: string }[] = [{ id: "todos", label: "Tudo" }, { id: "erro", label: "Erros" }, { id: "aviso", label: "Avisos" }, { id: "info", label: "Info" }];

/**
 * Configurações › Logs: tudo o que o app registrou (erros da IA, imagem, voz, memória, agente e da
 * interface). O agente lê o mesmo arquivo com `read_logs`; "Copiar para uma IA" leva o texto pronto.
 */
export function LogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState("todos");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (isQAOffline()) return;
    try { setEntries(await invoke<LogEntry[]>("logs_read", { limit: 400, level, query })); }
    catch (error) { setMessage(String(error)); }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, query]);

  const shown = [...entries].reverse();
  const errors = entries.filter((entry) => entry.level === "erro").length;

  return <>
    <div className="settings-heading runtime-heading">
      <div><span>Diagnóstico</span><h3>Logs do sistema</h3><p>Erros e avisos do app, da IA, do gerador de imagens, da voz e da memória do PC. A IA do app lê estes logs sozinha (peça "veja os logs e me diga por que falhou"); para outra IA, use "Copiar para uma IA".</p></div>
      <button className="flat-button" onClick={() => void refresh()}><RefreshCw size={14} />Atualizar</button>
    </div>
    <div className="logs-toolbar">
      <div className="segmented">{LEVELS.map((item) => <button key={item.id} className={level === item.id ? "active" : ""} onClick={() => setLevel(item.id)}>{item.label}</button>)}</div>
      <label className="logs-search"><Search size={13} /><input value={query} placeholder="Filtrar (ex.: imagem, memória, ollama)" onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="flat-button" onClick={() => { void navigator.clipboard.writeText(`Logs do Open Assistant (${entries.length} entradas, mais novas no fim):\n\n${logsAsText(entries)}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }} disabled={!entries.length}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copiado" : "Copiar para uma IA"}</button>
      <button className="flat-button" onClick={() => void invoke<string>("logs_folder").catch((error) => setMessage(String(error)))} title="Abrir a pasta dos logs"><FolderOpen size={14} /></button>
      <button className="flat-button" onClick={() => { if (confirm("Apagar todos os logs?")) void invoke("logs_clear").then(refresh).catch((error) => setMessage(String(error))); }} title="Limpar logs"><Trash2 size={14} /></button>
    </div>
    {message && <p className="settings-message">{message}</p>}
    <p className="logs-summary">{entries.length} entradas{errors ? ` · ${errors} ${errors === 1 ? "erro" : "erros"}` : ""} · mais novas em cima</p>
    <div className="logs-list" role="log">
      {!shown.length && <p className="model-empty">Nenhuma entrada{level !== "todos" || query ? " com esse filtro" : ""}.</p>}
      {shown.map((entry, index) => <article key={`${entry.t}-${index}`} className={`log-entry ${entry.level}`}>
        <header><span className={`log-level ${entry.level}`}>{entry.level}</span><b>{entry.source}</b><time>{entry.t}</time></header>
        <pre>{entry.message}</pre>
      </article>)}
    </div>
  </>;
}
