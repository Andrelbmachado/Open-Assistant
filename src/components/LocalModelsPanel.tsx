import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Ban, Check, Download, MessageSquare, Pause, Play, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { dismissPull, refreshInstalledModels, scanHardware, startOllama, startPull, stopPull, useLocalModels } from "../store/localModelsStore";
import { buildLocalModelOptions, formatBytes, OLLAMA_MODEL_PREFIX, type LocalModelOption } from "../utils/localCatalog";
import { describePull, type LocalModelOperation, type PullProgress } from "../utils/localOperation";
import { isQAOffline } from "../utils/qaMode";

interface RuntimeStatus { component: string; installed: boolean; running: boolean; version?: string }

const cardId = (modelId: string) => `model-card-${modelId.replace(/[^a-z0-9]/gi, "-")}`;

function PullBar({ pull }: { pull: PullProgress }) {
  const description = describePull(pull);
  const details = [description.transferred, description.speed, description.eta].filter(Boolean).join(" · ");
  return <div className={`pull-progress ${pull.state}`} aria-live="polite">
    <div className="pull-progress-head"><strong>{description.phase}</strong><span>{description.percent !== undefined ? `${description.percent}%` : ""}</span></div>
    <div className="pull-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={description.percent} aria-label={`Download de ${pull.modelId}`}>
      <i style={{ width: `${description.percent ?? 0}%` }} />
    </div>
    {pull.state !== "failed" && <small>{details || "Aguardando dados do Ollama…"}</small>}
  </div>;
}

/** Aba "Modelos locais": estado do Ollama, hardware e download/uso de modelos do catálogo. */
export function LocalModelsPanel() {
  const { state, dispatch } = useStore();
  const local = useLocalModels();
  const [confirming, setConfirming] = useState<string>();
  const [runtime, setRuntime] = useState<RuntimeStatus>();
  const [installMessage, setInstallMessage] = useState("");
  const options = buildLocalModelOptions(local.hardware, local.installed);
  const installed = options.filter((item) => item.status === "installed");
  const available = options.filter((item) => item.status === "available").sort((a, b) => Number(b.recommended) - Number(a.recommended));
  const incompatible = options.filter((item) => item.status === "incompatible");
  const ollamaOnline = local.ollama === "online";
  const activeModel = state.chats.find((chat) => chat.id === state.activeChatId)?.model;

  function refreshRuntime() {
    invoke<RuntimeStatus[]>("check_local_runtime_status").then((list) => setRuntime(list.find((item) => item.component === "ollama"))).catch(() => undefined);
  }

  useEffect(() => {
    void refreshInstalledModels();
    void scanHardware();
    refreshRuntime();
  }, []);

  useEffect(() => {
    if (isQAOffline()) return;
    let stop: () => void = () => undefined;
    listen<LocalModelOperation>("local-model-operation", (event) => {
      if (event.payload.kind !== "install_runtime") return;
      setInstallMessage(event.payload.message);
      if (event.payload.state === "completed") { refreshRuntime(); void startOllama(); }
    }).then((unlisten) => { stop = unlisten; }).catch(() => undefined);
    return () => stop();
  }, []);

  useEffect(() => {
    if (!state.settingsFocusModel) return;
    document.getElementById(cardId(state.settingsFocusModel))?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state.settingsFocusModel, local.hardwareStatus]);

  function refreshAll() {
    void refreshInstalledModels();
    void scanHardware(true);
    refreshRuntime();
  }

  function openChatWith(modelId: string) {
    dispatch({ type: "setModel", chatId: state.activeChatId, model: `${OLLAMA_MODEL_PREFIX}${modelId}` });
    dispatch({ type: "view", view: "chat" });
    dispatch({ type: "settings", open: false });
    dismissPull(modelId);
  }

  async function installOllama() {
    setInstallMessage("Iniciando a instalação pelo Windows Package Manager…");
    try { await invoke("install_ollama"); }
    catch (reason) { setInstallMessage(`Falha ao iniciar a instalação: ${reason}`); }
  }

  function download(modelId: string) {
    setConfirming(undefined);
    void startPull(modelId);
  }

  function actions(option: LocalModelOption, pull: PullProgress | undefined) {
    if (option.status === "installed" || pull?.state === "completed") {
      const inUse = activeModel === `${OLLAMA_MODEL_PREFIX}${option.id}`;
      return <button className="primary-button use-model-button" onClick={() => openChatWith(option.id)}>{inUse ? <Check size={14} /> : <MessageSquare size={14} />}{inUse ? "Em uso · abrir chat" : "Usar modelo"}</button>;
    }
    if (pull?.state === "running") return <><button className="flat-button" onClick={() => stopPull(option.id, true)}><Pause size={13} />Pausar</button><button className="flat-button" onClick={() => stopPull(option.id, false)}><X size={13} />Cancelar</button></>;
    if (pull?.state === "paused") return <><button className="flat-button" onClick={() => download(option.id)} disabled={!ollamaOnline}><RotateCcw size={13} />Retomar</button><button className="flat-button" onClick={() => dismissPull(option.id)}><X size={13} />Descartar</button></>;
    if (pull?.state === "failed") return <button className="flat-button" onClick={() => download(option.id)} disabled={!ollamaOnline}><RotateCcw size={13} />Tentar novamente</button>;
    if (option.status === "incompatible") return <span className="model-incompatible-tag"><Ban size={13} />Incompatível</span>;
    if (confirming === option.id) return null;
    return <button className="flat-button" onClick={() => setConfirming(option.id)} disabled={!ollamaOnline} title={ollamaOnline ? `Baixar ${option.id}` : "Inicie o Ollama para baixar modelos"}><Download size={14} />Baixar</button>;
  }

  function card(option: LocalModelOption) {
    const pull = local.pulls[option.id];
    const visiblePull = pull && pull.state !== "cancelled" && !(option.status === "installed" && pull.state !== "completed") ? pull : undefined;
    const focused = state.settingsFocusModel === option.id;
    return <article key={option.id} id={cardId(option.id)} className={`model-card ${option.status} ${focused ? "focused" : ""}`} title={option.status === "incompatible" ? option.reason : undefined}>
      <span className="runtime-logo">{option.family.slice(0, 2).toUpperCase()}</span>
      <div className="runtime-copy">
        <div>
          <h4>{option.label}</h4>
          {option.status === "installed" && <span className="status-badge installed">Instalado</span>}
          {option.recommended && <span className="status-badge recommended">Recomendado</span>}
          {option.runsOn === "cpu" && option.status === "available" && <span className="status-badge missing">CPU</span>}
        </div>
        <p><code>{option.id}</code> · {formatBytes(option.sizeBytes)}</p>
        <small>{option.reason}</small>
        {visiblePull && <PullBar pull={visiblePull} />}
        {confirming === option.id && <div className="model-confirm" role="group" aria-label={`Confirmar download de ${option.id}`}>
          <span>Baixar {formatBytes(option.sizeBytes)} para este computador?</span>
          <button className="primary-button" onClick={() => download(option.id)}><Download size={13} />Confirmar download</button>
          <button className="flat-button" onClick={() => setConfirming(undefined)}>Agora não</button>
        </div>}
      </div>
      <div className="model-card-actions">{actions(option, pull)}</div>
    </article>;
  }

  const hardware = local.hardware;
  const gpu = hardware?.gpus[0];
  const ollamaLabel = local.ollama === "online" ? "Ollama rodando" : local.ollama === "checking" || local.ollama === "unknown" ? "Verificando o Ollama…" : runtime && !runtime.installed ? "Ollama não instalado" : "Ollama parado";

  return <>
    <div className="settings-heading runtime-heading"><div><span>IA no seu computador</span><h3>Modelos locais</h3><p>Os modelos rodam no Ollama deste PC. Conversas e arquivos não saem do computador.</p></div><button className="flat-button" onClick={refreshAll} disabled={local.hardwareStatus === "scanning"}><RefreshCw size={14} className={local.hardwareStatus === "scanning" || local.ollama === "checking" ? "spin" : ""} />Atualizar</button></div>
    <div className={`ollama-status ${local.ollama}`} aria-live="polite">
      <i />
      <div><strong>{ollamaLabel}</strong><small>{local.ollama === "online" ? `127.0.0.1:11434${runtime?.version ? ` · ${runtime.version.replace(/^ollama version is /i, "v")}` : ""}` : local.ollamaError ?? "Conectando a 127.0.0.1:11434"}</small></div>
      {local.ollama === "offline" && runtime?.installed !== false && <button className="primary-button" onClick={() => startOllama()}><Play size={13} />Iniciar Ollama</button>}
      {local.ollama === "offline" && runtime?.installed === false && <button className="primary-button" onClick={installOllama}><Download size={13} />Instalar Ollama</button>}
    </div>
    {installMessage && <p className="settings-message">{installMessage}</p>}
    <p className="hardware-summary">
      {hardware ? `${gpu ? `${gpu.name} · ${Math.round(gpu.vramMb / 1024)} GB de VRAM` : "Sem GPU NVIDIA"} · ${Math.round(hardware.ramMb / 1024)} GB de RAM · ${Math.round(hardware.availableDiskMb / 1024)} GB livres`
        : local.hardwareStatus === "failed" ? `Não foi possível ler o hardware: ${local.hardwareError}` : "Lendo GPU, VRAM, RAM e disco…"}
    </p>
    <h5 className="model-section-title">Instalados <span>{installed.length}</span></h5>
    <div className="runtime-list model-list">{installed.length ? installed.map(card) : <p className="model-empty">{ollamaOnline ? "Nenhum modelo baixado ainda. Escolha um abaixo." : "Inicie o Ollama para ver os modelos instalados."}</p>}</div>
    <h5 className="model-section-title">Disponíveis para este PC <span>{available.length}</span></h5>
    <div className="runtime-list model-list">{available.map(card)}</div>
    {incompatible.length > 0 && <><h5 className="model-section-title">Incompatíveis <span>{incompatible.length}</span></h5><div className="runtime-list model-list">{incompatible.map(card)}</div></>}
  </>;
}
