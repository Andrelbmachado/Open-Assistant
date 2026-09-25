import { openUrl } from "@tauri-apps/plugin-opener";
import { Ban, Check, Download, ExternalLink, MessageSquare, Mic, RefreshCw, RotateCcw, Trash2, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { refreshInstalledModels, startOllama, startPull, stopPull, useLocalModels } from "../store/localModelsStore";
import { cancelTool, dismissToolProgress, installTool, refreshTools, removeTool, useTools, type ToolProgress } from "../store/toolsStore";
import { BITNET_MODEL, formatBytes, OLLAMA_MODEL_PREFIX } from "../utils/localCatalog";
import { describePull } from "../utils/localOperation";
import { isQAOffline } from "../utils/qaMode";
import { CATEGORY_LABELS, groupByCompany, resolveAsrModel, resolveTtsVoice, TOOL_CATALOG, type ToolCategory, type ToolInfo } from "../utils/toolCatalog";

const toolCardId = (id: string) => `tool-card-${id.replace(/[^a-z0-9]/gi, "-")}`;

function formatSpeed(bytesPerSecond?: number) {
  return bytesPerSecond ? `${formatBytes(bytesPerSecond)}/s` : "";
}

/** Barra de progresso de uma instalação (fase, %, MB/s ou última linha do log). */
export function ToolProgressBar({ progress }: { progress: ToolProgress }) {
  const percent = progress.totalBytes ? Math.min(100, Math.round(((progress.completedBytes ?? 0) / progress.totalBytes) * 100)) : undefined;
  const transferred = progress.totalBytes ? `${formatBytes(progress.completedBytes ?? 0)} de ${formatBytes(progress.totalBytes)}` : "";
  const failed = progress.state === "failed";
  return <div className={`pull-progress ${progress.state}`} aria-live="polite">
    <div className="pull-progress-head"><strong>{failed ? "Falhou" : progress.phase}</strong><span>{percent !== undefined && !failed ? `${percent}%` : ""}</span></div>
    {!failed && <div className={`pull-bar ${percent === undefined ? "indeterminate" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent ?? 35}%` }} /></div>}
    {failed ? <small className="tool-error">{progress.error}</small> : <small>{[transferred, formatSpeed(progress.bytesPerSecond)].filter(Boolean).join(" · ") || progress.message || "Trabalhando…"}</small>}
  </div>;
}

/** Botões de download/cancelamento de uma receita do backend; `children` aparece quando instalada. */
export function RecipeActions({ tool, installed, progress, children }: { tool: ToolInfo; installed: boolean; progress?: ToolProgress; children?: React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  if (progress?.state === "running") return <button className="flat-button" onClick={() => cancelTool(tool.id)}><X size={13} />Cancelar</button>;
  if (installed) return <>
    {children}
    <button className="flat-button icon-only" title={`Remover ${tool.name}`} aria-label={`Remover ${tool.name}`} onClick={async () => {
      if (!window.confirm(`Remover ${tool.name} deste computador?`)) return;
      try { await removeTool(tool.id); } catch (reason) { window.alert(String(reason)); }
    }}><Trash2 size={13} /></button>
  </>;
  if (confirming) return <div className="model-confirm tool-confirm" role="group">
    <span>Baixar {tool.sizeBytes ? formatBytes(tool.sizeBytes) : "a ferramenta"}?</span>
    <button className="primary-button" onClick={() => { setConfirming(false); void installTool(tool.id); }}><Download size={13} />Confirmar</button>
    <button className="flat-button" onClick={() => setConfirming(false)}>Agora não</button>
  </div>;
  if (progress?.state === "failed") return <><button className="flat-button" onClick={() => { dismissToolProgress(tool.id); void installTool(tool.id); }}><RotateCcw size={13} />Tentar de novo</button></>;
  return <button className="flat-button" onClick={() => setConfirming(true)} disabled={isQAOffline()}><Download size={14} />Baixar</button>;
}

const FILTERS: (ToolCategory | "all")[] = ["all", "asr", "tts", "llm", "vision", "agents"];

/** Aba "Ferramentas de IA": catálogo por empresa, filtros por tipo e ações de baixar/usar/remover. */
export function ToolsPanel() {
  const { state, dispatch } = useStore();
  const tools = useTools();
  const local = useLocalModels();
  const [filter, setFilter] = useState<ToolCategory | "all">("all");
  const installedOllama = new Set(local.installed.map((model) => model.name.toLowerCase()));
  const activeModel = state.chats.find((chat) => chat.id === state.activeChatId)?.model;
  const asrInUse = resolveAsrModel(state.voice.asrModel, tools.installed);
  const voiceInUse = resolveTtsVoice(state.voice.ttsVoice, tools.installed);

  useEffect(() => { void refreshTools(); void refreshInstalledModels(); }, []);
  useEffect(() => {
    if (!state.settingsFocusModel) return;
    setFilter("all");
    requestAnimationFrame(() => document.getElementById(toolCardId(state.settingsFocusModel!))?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [state.settingsFocusModel]);

  function useInChat(model: string) {
    dispatch({ type: "setModel", chatId: state.activeChatId, model });
    dispatch({ type: "view", view: "chat" });
    dispatch({ type: "settings", open: false });
  }

  function actions(tool: ToolInfo) {
    const install = tool.install;
    if (install.kind === "unsupported") return <span className="model-incompatible-tag"><Ban size={13} />Windows não suportado</span>;
    if (install.kind === "ollama") {
      const pull = local.pulls[install.model];
      const installed = installedOllama.has(install.model.toLowerCase());
      if (installed) {
        const inUse = activeModel === `${OLLAMA_MODEL_PREFIX}${install.model}`;
        return <button className="primary-button use-model-button" onClick={() => useInChat(`${OLLAMA_MODEL_PREFIX}${install.model}`)}>{inUse ? <Check size={14} /> : <MessageSquare size={14} />}{inUse ? "Em uso" : "Usar no chat"}</button>;
      }
      if (pull?.state === "running") return <button className="flat-button" onClick={() => stopPull(install.model, false)}><X size={13} />Cancelar</button>;
      if (local.ollama !== "online") return <button className="flat-button" onClick={() => startOllama()}>Iniciar Ollama</button>;
      return <button className="flat-button" onClick={() => startPull(install.model)}><Download size={14} />Baixar</button>;
    }
    const installed = tools.installed.has(tool.id);
    let use: React.ReactNode = null;
    if (tool.usage === "voice-input") use = asrInUse === tool.id
      ? <span className="tool-in-use"><Check size={13} />Modo voz</span>
      : <button className="primary-button use-model-button" onClick={() => dispatch({ type: "setVoice", patch: { asrModel: tool.id } })}><Mic size={13} />Usar na voz</button>;
    if (tool.usage === "voice-output") use = voiceInUse === tool.id
      ? <span className="tool-in-use"><Check size={13} />Voz ativa</span>
      : <button className="primary-button use-model-button" onClick={() => dispatch({ type: "setVoice", patch: { ttsVoice: tool.id } })}><Volume2 size={13} />Usar esta voz</button>;
    if (tool.id === "bitnet-2b4t") use = <button className="primary-button use-model-button" onClick={() => useInChat(BITNET_MODEL)}>{activeModel === BITNET_MODEL ? <Check size={14} /> : <MessageSquare size={14} />}{activeModel === BITNET_MODEL ? "Em uso" : "Usar no chat"}</button>;
    return <RecipeActions tool={tool} installed={installed} progress={tools.progress[tool.id]}>{use}</RecipeActions>;
  }

  function card(tool: ToolInfo) {
    const install = tool.install;
    const installed = install.kind === "ollama" ? installedOllama.has(install.model.toLowerCase()) : tools.installed.has(tool.id);
    const recipeProgress = install.kind === "recipe" ? tools.progress[tool.id] : undefined;
    const pull = install.kind === "ollama" ? local.pulls[install.model] : undefined;
    const showRecipeProgress = recipeProgress && (recipeProgress.state === "running" || recipeProgress.state === "failed");
    const showPull = pull && (pull.state === "running" || pull.state === "failed");
    const pullInfo = pull ? describePull(pull) : undefined;
    return <article key={tool.id} id={toolCardId(tool.id)} className={`model-card tool-card ${install.kind === "unsupported" ? "incompatible" : ""} ${state.settingsFocusModel === tool.id ? "focused" : ""}`}>
      <span className="runtime-logo">{tool.company === "Open source" ? "OS" : tool.company.slice(0, 2).toUpperCase()}</span>
      <div className="runtime-copy">
        <div>
          <h4>{tool.name}</h4>
          {installed && <span className="status-badge installed">Instalado</span>}
          {tool.recommended && <span className="status-badge recommended">Recomendado</span>}
          {tool.usage === "installed-only" && install.kind !== "unsupported" && <span className="status-badge" title="Instala o framework; a integração com o chat é a próxima etapa">Framework Python</span>}
        </div>
        <p>{CATEGORY_LABELS[tool.category]}{tool.sizeBytes ? ` · ${formatBytes(tool.sizeBytes)}` : ""}{tool.languages ? ` · ${tool.languages}` : ""}</p>
        <small>{install.kind === "unsupported" ? `${tool.description} ${install.reason}` : tool.description}</small>
        {showRecipeProgress && <ToolProgressBar progress={recipeProgress} />}
        {showPull && pullInfo && <ToolProgressBar progress={{ toolId: tool.id, state: pull.state === "failed" ? "failed" : "running", phase: pullInfo.phase, error: pull.error, completedBytes: pull.completedBytes, totalBytes: pull.totalBytes, bytesPerSecond: pull.bytesPerSecond }} />}
      </div>
      <div className="model-card-actions">
        <button className="flat-button icon-only" title={`Abrir ${tool.repo}`} aria-label={`Site oficial de ${tool.name}`} onClick={() => { if (!isQAOffline()) void openUrl(tool.repo); }}><ExternalLink size={13} /></button>
        {actions(tool)}
      </div>
    </article>;
  }

  const visible = TOOL_CATALOG.filter((tool) => tool.category !== "runtime" && (filter === "all" || tool.category === filter));
  return <>
    <div className="settings-heading runtime-heading"><div><span>NVIDIA · Microsoft · Meta · Google · OpenAI</span><h3>Ferramentas de IA</h3><p>Tudo roda neste PC. Baixe o que quiser usar; nada é instalado sem você clicar.</p></div><button className="flat-button" onClick={() => { void refreshTools(); void refreshInstalledModels(); }}><RefreshCw size={14} />Atualizar</button></div>
    <div className="segmented tool-filters" role="tablist" aria-label="Filtrar por tipo">
      {FILTERS.map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "Todas" : CATEGORY_LABELS[item]}</button>)}
    </div>
    {tools.error && <p className="settings-message">{tools.error}</p>}
    {groupByCompany(visible).map((group) => <section key={group.company} className="tool-company">
      <h5 className="model-section-title">{group.company} <span>{group.tools.length}</span></h5>
      <div className="runtime-list model-list">{group.tools.map(card)}</div>
    </section>)}
  </>;
}
