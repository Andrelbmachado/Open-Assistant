import { invoke } from "@tauri-apps/api/core";
import { Cable, Check, Download, ImageIcon, LoaderCircle, MessageSquare, Plug, Search, Settings2, ShoppingBag, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store/store";
import { startPull, useLocalModels } from "../store/localModelsStore";
import { installTool, useTools } from "../store/toolsStore";
import { IMAGE_MODELS, imageModelFit } from "../utils/imageCatalog";
import { buildLocalModelOptions, formatBytes } from "../utils/localCatalog";
import { addPreset, MCP_PRESETS, type McpConfig } from "../utils/mcpPresets";
import { resetAgentSetup } from "../utils/agentRunner";
import { isQAOffline } from "../utils/qaMode";
import { PageHeader } from "./PageHeader";

type Tab = "tudo" | "skills" | "mcp" | "texto" | "imagem";
const TABS: { id: Tab; label: string }[] = [{ id: "tudo", label: "Tudo" }, { id: "skills", label: "Skills" }, { id: "mcp", label: "Conectores MCP" }, { id: "texto", label: "Modelos de texto" }, { id: "imagem", label: "Modelos de imagem" }];

interface SkillInfo { id: string; name: string; description: string }
interface ServerStatus { name: string; command: string; args: string[]; disabled: boolean; running: boolean; tools: string[] }
interface McpOverview { servers: ServerStatus[]; configPath: string; hasNpx: boolean; hasUvx: boolean }

interface Item {
  id: string;
  tab: Exclude<Tab, "tudo">;
  name: string;
  by: string;
  description: string;
  icon: ReactNode;
  status: "instalado" | "disponivel" | "baixando" | "pesado" | "falta";
  statusText: string;
  action?: { label: string; icon: ReactNode; run: () => void | Promise<void>; primary?: boolean };
  progress?: number;
}

/**
 * Marketplace: tudo o que dá para ligar no app num lugar só — skills do agente, conectores MCP,
 * modelos de texto (Ollama) e de imagem — com o estado real (instalado, baixando, pesado demais
 * para este PC) e o botão que instala/conecta. Configurações detalhadas continuam em Configurações.
 */
export function MarketplaceView() {
  const { dispatch } = useStore();
  const local = useLocalModels();
  const tools = useTools();
  const [tab, setTab] = useState<Tab>("tudo");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [mcp, setMcp] = useState<McpOverview>();
  const [appData, setAppData] = useState("");
  const [message, setMessage] = useState("");

  async function loadMcp() { if (!isQAOffline()) setMcp(await invoke<McpOverview>("mcp_overview").catch(() => undefined)); }
  useEffect(() => {
    if (isQAOffline()) return;
    void invoke<SkillInfo[]>("list_skills").then(setSkills).catch(() => setSkills([]));
    void invoke<string>("app_data_dir").then(setAppData).catch(() => undefined);
    void loadMcp();
  }, []);

  async function addConnector(presetId: string) {
    const preset = MCP_PRESETS.find((item) => item.id === presetId);
    if (!preset || !mcp) return;
    const config: McpConfig = { mcpServers: Object.fromEntries(mcp.servers.map((server) => [server.name, { command: server.command, args: server.args, ...(server.disabled ? { disabled: true } : {}) }])) };
    const userProfile = mcp.configPath.split("\\AppData\\")[0] ?? "";
    try {
      await invoke("mcp_save_config", { jsonText: JSON.stringify(addPreset(config, preset, userProfile), null, 2) });
      resetAgentSetup();
      setMessage(`${preset.name} adicionado. Ele liga no próximo pedido ao agente (a primeira vez baixa o pacote).`);
      await loadMcp();
    } catch (error) { setMessage(String(error)); }
  }

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const skill of skills) list.push({
      id: `skill-${skill.id}`, tab: "skills", name: skill.name, by: "Skill do agente", description: skill.description, icon: <Wand2 size={18} />,
      status: "instalado", statusText: "Instalada",
      action: { label: "Usar no chat", icon: <MessageSquare size={13} />, run: () => { dispatch({ type: "newChat" }); setMessage(`Digite /${skill.id} no chat para usar a skill.`); } },
    });
    const configured = new Map(mcp?.servers.map((server) => [server.name, server]));
    for (const preset of MCP_PRESETS) {
      const server = configured.get(preset.id);
      const missing = mcp && (preset.runtime === "npx" ? !mcp.hasNpx : !mcp.hasUvx);
      list.push({
        id: `mcp-${preset.id}`, tab: "mcp", name: preset.name, by: preset.company, description: preset.description, icon: <Cable size={18} />,
        status: server ? "instalado" : missing ? "falta" : "disponivel",
        statusText: server ? server.running ? `Rodando · ${server.tools.length} ferramentas` : server.disabled ? "Desligado" : "Configurado" : missing ? `Precisa de ${preset.runtime === "npx" ? "Node.js" : "uv"}` : preset.essential ? "Essencial" : "Disponível",
        action: server ? { label: "Gerenciar", icon: <Settings2 size={13} />, run: () => dispatch({ type: "settings", open: true, tab: "mcp" }) } : { label: "Adicionar", icon: <Plug size={13} />, run: () => addConnector(preset.id), primary: true },
      });
    }
    for (const option of buildLocalModelOptions(local.hardware, local.installed)) {
      const pull = local.pulls[option.id];
      const pulling = pull?.state === "running";
      list.push({
        id: `text-${option.id}`, tab: "texto", name: option.label, by: `${option.family} · Ollama`, description: `${formatBytes(option.sizeBytes)} · ${option.reason}`, icon: <Sparkles size={18} />,
        status: pulling ? "baixando" : option.status === "installed" ? "instalado" : option.status === "incompatible" ? "pesado" : "disponivel",
        statusText: pulling ? pull.status : option.status === "installed" ? "Instalado" : option.status === "incompatible" ? "Pesado para este PC" : option.recommended ? "Recomendado" : "Disponível",
        progress: pulling && pull.totalBytes ? (pull.completedBytes ?? 0) / pull.totalBytes : undefined,
        action: option.status === "installed" ? undefined : pulling ? undefined : { label: "Baixar", icon: <Download size={13} />, run: () => startPull(option.id), primary: option.status !== "incompatible" },
      });
    }
    for (const model of IMAGE_MODELS) {
      const progress = tools.progress[model.id];
      const installing = progress?.state === "running";
      const fit = imageModelFit(model, local.hardware);
      const installed = tools.installed.has(model.id);
      list.push({
        id: `image-${model.id}`, tab: "imagem", name: model.name, by: model.author, description: `${model.sizeGb.toLocaleString("pt-BR")} GB · ${model.description}`, icon: <ImageIcon size={18} />,
        status: installing ? "baixando" : installed ? "instalado" : fit.fit === "heavy" ? "pesado" : "disponivel",
        statusText: installing ? progress.phase : installed ? "Instalado" : fit.fit === "heavy" ? "Pesado para este PC" : model.recommended ? "Recomendado" : model.commercial ? "Uso comercial livre" : "Disponível",
        progress: installing && progress.totalBytes ? (progress.completedBytes ?? 0) / progress.totalBytes : undefined,
        action: installed || installing ? undefined : { label: "Baixar", icon: <Download size={13} />, run: () => installTool(model.id), primary: fit.fit !== "heavy" },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, mcp, local.hardware, local.installed, local.pulls, tools.installed, tools.progress, appData]);

  const text = query.trim().toLowerCase();
  const shown = items.filter((item) => (tab === "tudo" || item.tab === tab) && (!text || `${item.name} ${item.by} ${item.description}`.toLowerCase().includes(text)));
  const count = (id: Tab) => id === "tudo" ? items.length : items.filter((item) => item.tab === id).length;
  const installedCount = items.filter((item) => item.status === "instalado").length;

  return <section className="view page-view marketplace-view">
    <PageHeader eyebrow="Extensões" title="Marketplace" icon={<ShoppingBag size={17} />}>
      <label className="page-search"><Search size={14} /><input value={query} placeholder="Buscar skills, conectores, modelos…" onChange={(event) => setQuery(event.target.value)} /></label>
    </PageHeader>
    <div className="page-scroll">
      <div className="page-tabs" role="tablist">
        {TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}<span>{count(item.id)}</span></button>)}
        <small className="page-tabs-note">{installedCount} instalados</small>
      </div>
      {message && <p className="page-note">{message}</p>}
      {mcp && tab === "mcp" && (!mcp.hasNpx || !mcp.hasUvx) && <div className="page-alert"><TriangleAlert size={18} /><div><strong>Falta instalar</strong><p>{!mcp.hasNpx && "Node.js (para conectores npx). "}{!mcp.hasUvx && "uv (para conectores uvx): winget install astral-sh.uv"}</p></div></div>}
      <div className="market-grid">
        {shown.map((item) => <article key={item.id} className={`page-card market-card ${item.status}`}>
          <header>
            <span className={`market-icon ${item.tab}`}>{item.icon}</span>
            <div><h3>{item.name}</h3><small>{item.by}</small></div>
          </header>
          <p>{item.description}</p>
          {item.progress !== undefined && <div className="meter"><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>}
          <footer>
            <span className={`market-status ${item.status}`}>{item.status === "instalado" ? <Check size={12} /> : item.status === "baixando" ? <LoaderCircle size={12} className="spin" /> : null}{item.statusText}</span>
            {item.action && <button className={`page-button ${item.action.primary ? "primary" : ""}`} onClick={() => void item.action!.run()}>{item.action.icon}{item.action.label}</button>}
          </footer>
        </article>)}
        {!shown.length && <div className="page-empty compact"><Search size={22} /><p>Nada encontrado{text ? ` para "${query}"` : ""}.</p></div>}
      </div>
    </div>
  </section>;
}
