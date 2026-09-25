import { invoke } from "@tauri-apps/api/core";
import { Check, Plus, Power, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { resetAgentSetup } from "../utils/agentRunner";
import { isQAOffline } from "../utils/qaMode";
import { addPreset, MCP_PRESETS, removeServer, toggleServer, type McpConfig } from "../utils/mcpPresets";

interface ServerStatus { name: string; command: string; args: string[]; disabled: boolean; running: boolean; tools: string[]; error?: string }
interface McpOverview { servers: ServerStatus[]; configPath: string; hasNpx: boolean; hasUvx: boolean }

/** Configurações › Conectores MCP: presets de um clique, estado dos servidores e JSON avançado. */
export function McpPanel() {
  const [overview, setOverview] = useState<McpOverview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [editing, setEditing] = useState(false);

  const config: McpConfig = { mcpServers: Object.fromEntries((overview?.servers ?? []).map((server) => [server.name, { command: server.command, args: server.args, ...(server.disabled ? { disabled: true } : {}) }])) };

  async function refresh() {
    if (isQAOffline()) return;
    try { setOverview(await invoke<McpOverview>("mcp_overview")); }
    catch (error) { setMessage(String(error)); }
  }

  useEffect(() => { void refresh(); }, []);

  async function save(next: McpConfig, note: string) {
    try {
      await invoke("mcp_save_config", { jsonText: JSON.stringify(next, null, 2) });
      resetAgentSetup();
      setMessage(note);
      await refresh();
    } catch (error) { setMessage(String(error)); }
  }

  async function startAll() {
    setBusy(true);
    setMessage("Iniciando conectores… a primeira vez baixa os pacotes e pode levar um minuto.");
    try { await invoke("mcp_start"); resetAgentSetup(); setMessage(""); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); await refresh(); }
  }

  const userProfile = overview?.configPath.split("\\AppData\\")[0] ?? "";
  const configured = new Set(overview?.servers.map((server) => server.name));

  return <>
    <div className="settings-heading runtime-heading"><div><span>Model Context Protocol</span><h3>Conectores MCP</h3><p>Ferramentas extras para o agente, no mesmo formato do Claude Desktop. Cada conector ligado aumenta o prompt: ligue só o que usar.</p></div><button className="flat-button" onClick={startAll} disabled={busy || !overview?.servers.length}><RefreshCw size={14} className={busy ? "spin" : ""} />Iniciar ligados</button></div>
    {overview && (!overview.hasNpx || !overview.hasUvx) && <div className="runtime-notice"><TriangleAlert size={18} /><div><strong>Falta instalar</strong><p>{!overview.hasNpx && "Node.js (para npx) · "}{!overview.hasUvx && "uv (para uvx): winget install astral-sh.uv"}</p></div></div>}
    {message && <p className="settings-message">{message}</p>}

    <h5 className="model-section-title">Configurados <span>{overview?.servers.length ?? 0}</span></h5>
    <div className="runtime-list model-list">
      {!overview?.servers.length && <p className="model-empty">Nenhum conector ainda. Adicione os essenciais abaixo.</p>}
      {overview?.servers.map((server) => <article key={server.name} className="model-card tool-card">
        <span className="runtime-logo">MCP</span>
        <div className="runtime-copy">
          <div><h4>{server.name}</h4>{server.running ? <span className="status-badge installed">Rodando</span> : server.disabled ? <span className="status-badge">Desligado</span> : <span className="status-badge">Parado</span>}</div>
          <p><code>{[server.command, ...server.args].join(" ")}</code></p>
          {server.running && <small>{server.tools.length} ferramentas: {server.tools.slice(0, 8).join(", ")}{server.tools.length > 8 ? "…" : ""}</small>}
          {server.error && <small className="tool-error">{server.error}</small>}
        </div>
        <div className="model-card-actions">
          <button className="flat-button" onClick={() => save(toggleServer(config, server.name, !server.disabled), server.disabled ? `${server.name} ligado.` : `${server.name} desligado.`)}><Power size={13} />{server.disabled ? "Ligar" : "Desligar"}</button>
          <button className="flat-button icon-only" title={`Remover ${server.name}`} onClick={() => save(removeServer(config, server.name), `${server.name} removido.`)}><Trash2 size={13} /></button>
        </div>
      </article>)}
    </div>

    <h5 className="model-section-title">Sugeridos</h5>
    <div className="runtime-list model-list">
      {MCP_PRESETS.map((preset) => <article key={preset.id} className="model-card tool-card">
        <span className="runtime-logo">{preset.runtime === "npx" ? "JS" : "PY"}</span>
        <div className="runtime-copy">
          <div><h4>{preset.name}</h4><em className="mcp-company">{preset.company}</em>{preset.essential && <span className="status-badge recommended">Essencial</span>}</div>
          <p>{preset.description}</p>
          <small><code>{[preset.command, ...preset.args].join(" ")}</code></small>
        </div>
        <div className="model-card-actions">
          {configured.has(preset.id)
            ? <span className="tool-in-use"><Check size={13} />Adicionado</span>
            : <button className="flat-button" disabled={!overview} onClick={() => save(addPreset(config, preset, userProfile), `${preset.name} adicionado. Clique em "Iniciar ligados" para testar.`)}><Plus size={13} />Adicionar</button>}
        </div>
      </article>)}
    </div>

    <h5 className="model-section-title">Avançado</h5>
    {!editing
      ? <button className="flat-button" onClick={() => { setJsonText(JSON.stringify(config, null, 2)); setEditing(true); }}>Editar JSON (formato do Claude Desktop)</button>
      : <div className="mcp-json">
        <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} rows={12} aria-label="Configuração MCP em JSON" />
        <div><button className="primary-button" onClick={async () => { try { await save(JSON.parse(jsonText), "Configuração salva."); setEditing(false); } catch (error) { setMessage(`JSON inválido: ${String(error)}`); } }}>Salvar</button><button className="flat-button" onClick={() => setEditing(false)}>Cancelar</button></div>
        <small>Arquivo: {overview?.configPath}</small>
      </div>}
  </>;
}
