import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { Bot, Check, ChevronRight, Download, Eye, EyeOff, KeyRound, Palette, Play, RefreshCw, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore, type Theme } from "../store/store";
import { isQAOffline } from "../utils/qaMode";
import type { HardwareProfile, ModelRecommendation } from "../utils/localModels";

interface RuntimeStatus { component: "ollama" | "openclaw"; installed: boolean; running: boolean; version?: string; binaryPath?: string; port: number; error?: string }
const providers = ["OpenAI", "Anthropic", "Together AI", "DeepSeek", "Perplexity", "Fireworks"];
const runtimeInfo = {
  ollama: { title: "Ollama", description: "Modelos locais no Windows", url: "https://ollama.com/download/windows" },
  openclaw: { title: "OpenClaw", description: "Runtime local para agentes", url: "https://docs.openclaw.ai/windows" },
};

export function SettingsView() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<"general" | "providers" | "models" | "runtimes" | "permissions">("general");
  const [provider, setProvider] = useState(providers[0]);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [hardware, setHardware] = useState<HardwareProfile>();
  const [recommendation, setRecommendation] = useState<ModelRecommendation>();
  const [operationMessage, setOperationMessage] = useState("");

  useEffect(() => {
    let unlisten: () => void = () => undefined;
    listen<{ state: string; message: string; modelId?: string }>("local-model-operation", (event) => {
      setOperationMessage(event.payload.message || `Operação local: ${event.payload.state}`);
      if (event.payload.state === "completed" && event.payload.modelId) {
        dispatch({ type: "setModel", chatId: state.activeChatId, model: `Ollama: ${event.payload.modelId}` });
        refreshRuntimes();
      }
    }).then((stop) => { unlisten = stop; });
    return () => unlisten();
  }, [state.activeChatId]);

  useEffect(() => { if (state.settingsOpen) refreshRuntimes(); }, [state.settingsOpen]);
  useEffect(() => { providers.forEach((name) => invoke<string | null>("read_credential", { account: name.toLowerCase().replace(" ", "-") }).then((value) => setSaved((old) => ({ ...old, [name]: Boolean(value) }))).catch(() => undefined)); }, []);

  async function refreshRuntimes() {
    setChecking(true);
    try { setRuntimes(await invoke<RuntimeStatus[]>("check_local_runtime_status")); }
    catch { setRuntimes([{ component: "ollama", installed: false, running: false, port: 11434 }, { component: "openclaw", installed: false, running: false, port: 18789 }]); }
    finally { setChecking(false); }
  }

  async function handleStartRuntime(id: "ollama" | "openclaw") {
    try {
      await invoke("start_runtime", { component: id });
      setTimeout(refreshRuntimes, 1000);
      setTimeout(refreshRuntimes, 2500);
    } catch (reason) {
      setMessage(`Não foi possível iniciar ${id}: ${reason}`);
    }
  }

  async function scanComputer() {
    setChecking(true); setOperationMessage("");
    try {
      const [profile, nextRecommendation] = await Promise.all([invoke<HardwareProfile>("scan_hardware"), invoke<ModelRecommendation>("get_local_model_recommendation")]);
      setHardware(profile); setRecommendation(nextRecommendation);
    } catch (reason) { setOperationMessage(`Não foi possível escanear o computador: ${reason}`); }
    finally { setChecking(false); }
  }

  async function installOllama() {
    if (!window.confirm("Instalar o Ollama pelo Windows Package Manager? Essa ação baixará o runtime local.")) return;
    try { await invoke("install_ollama"); setOperationMessage("Instalação do Ollama iniciada. Aguarde a conclusão e clique em Verificar."); }
    catch (reason) { setOperationMessage(`Falha ao iniciar a instalação: ${reason}`); }
  }

  async function downloadRecommendedModel() {
    if (!recommendation?.eligible || !recommendation.modelId) return;
    if (!window.confirm(`Baixar ${recommendation.modelName} (${Math.round((recommendation.downloadSizeMb ?? 0) / 100) / 10} GB) para este computador?`)) return;
    try { await invoke("download_recommended_model", { modelId: recommendation.modelId }); setOperationMessage(`Download de ${recommendation.modelName} iniciado. O modelo será disponibilizado no chat ao concluir.`); }
    catch (reason) { setOperationMessage(`Falha ao iniciar o download: ${reason}`); }
  }

  async function openUrl(url: string) {
    if (isQAOffline()) {
      setMessage("Modo QA offline: abertura de site bloqueada e registrada como simulação.");
      return;
    }
    await openExternalUrl(url);
  }

  async function saveKey() {
    if (!secret.trim()) return;
    try { await invoke("save_credential", { account: provider.toLowerCase().replace(" ", "-"), secret }); setSaved((old) => ({ ...old, [provider]: true })); setSecret(""); setMessage(isQAOffline() ? "Credencial fictícia salva apenas na memória QA." : "Chave salva com segurança no Windows."); }
    catch (reason) { setMessage(`Não foi possível salvar: ${reason}`); }
  }

  async function deleteKey(name: string) {
    await invoke("delete_credential", { account: name.toLowerCase().replace(" ", "-") }).catch(() => undefined);
    setSaved((old) => ({ ...old, [name]: false }));
  }

  if (!state.settingsOpen) return null;
  return <div className="modal-backdrop" onMouseDown={() => dispatch({ type: "settings", open: false })}>
    <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="settings-icon"><Settings2 size={18} /></span><div><h2>Configurações</h2><p>Personalize seu workspace e integrações.</p></div></div><button className="icon-button" onClick={() => dispatch({ type: "settings", open: false })}><X size={18} /></button></header>
      <div className="settings-layout">
        <nav className="settings-nav">
          <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}><Palette size={16} />Aparência<ChevronRight size={13} /></button>
          <button className={tab === "providers" ? "active" : ""} onClick={() => setTab("providers")}><KeyRound size={16} />Provedores<ChevronRight size={13} /></button>
          <button className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}><Bot size={16} />Modelos locais<ChevronRight size={13} /></button>
          <button className={tab === "runtimes" ? "active" : ""} onClick={() => setTab("runtimes")}><Bot size={16} />Runtimes locais<ChevronRight size={13} /></button>
          <button className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}><ShieldCheck size={16} />Permissões<ChevronRight size={13} /></button>
        </nav>
        <div className="settings-content">
          {tab === "general" && <><div className="settings-heading"><span>Aparência</span><h3>Liquidglass Flat</h3><p>Superfícies precisas e leves, desenhadas para o Windows 11.</p></div><div className="setting-card"><label>Tema</label><div className="segmented">{(["dark", "light", "system"] as Theme[]).map((theme) => <button key={theme} className={state.theme === theme ? "active" : ""} onClick={() => dispatch({ type: "theme", theme })}>{theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}</button>)}</div></div><div className="setting-card"><label>Cor de destaque</label><div className="accent-options">{["#d8d8dc", "#b7b7bd", "#929299", "#6f6f76", "#f1f1f3"].map((color) => <button key={color} className={state.accent === color ? "active" : ""} style={{ background: color }} onClick={() => dispatch({ type: "accent", accent: color })}>{state.accent === color && <Check size={14} />}</button>)}</div></div></>}
          {tab === "providers" && <><div className="settings-heading"><span>Modelos em nuvem</span><h3>Provedores de IA</h3><p>As chaves são guardadas pelo Gerenciador de Credenciais do Windows.</p></div><div className="credential-form"><label>Provedor<select value={provider} onChange={(event) => setProvider(event.target.value)}>{providers.map((name) => <option key={name}>{name}</option>)}</select></label><label>Chave de API<div className="secret-input"><input type={showSecret ? "text" : "password"} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="sk-••••••••••••••••" /><button onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label><button className="primary-button" onClick={saveKey} disabled={!secret.trim()}><KeyRound size={15} />Salvar credencial</button>{message && <p className="settings-message">{message}</p>}</div><div className="saved-credentials">{providers.filter((name) => saved[name]).map((name) => <div key={name}><span><Check size={13} /><strong>{name}</strong><small>Credencial protegida</small></span><button onClick={() => deleteKey(name)}><Trash2 size={15} /></button></div>)}</div></>}
          {tab === "models" && <><div className="settings-heading runtime-heading"><div><span>IA no seu computador</span><h3>Modelo local recomendado</h3><p>O scan é local e não envia dados do seu hardware.</p></div><button className="flat-button" onClick={scanComputer} disabled={checking}><RefreshCw size={14} className={checking ? "spin" : ""} />Escanear computador</button></div>{!hardware && <div className="runtime-notice"><ShieldCheck size={18} /><div><strong>Pronto para analisar</strong><p>Vamos verificar GPU, VRAM, CPU, RAM e espaço livre antes de sugerir um único modelo.</p></div></div>}{hardware && <div className="runtime-list"><article><span className="runtime-logo">PC</span><div className="runtime-copy"><h4>{hardware.gpus[0]?.name ?? "GPU não identificada"}</h4><p>{Math.round((hardware.gpus[0]?.vramMb ?? 0) / 1024 * 10) / 10} GB VRAM · {Math.round(hardware.ramMb / 1024)} GB RAM</p><small>{hardware.cpuName} · {Math.round(hardware.availableDiskMb / 1024)} GB livres</small></div></article>{recommendation && <article><span className="runtime-logo">AI</span><div className="runtime-copy"><div><h4>{recommendation.eligible ? recommendation.modelName : "Download bloqueado"}</h4><span className={`status-badge ${recommendation.eligible ? "installed" : "missing"}`}>{recommendation.eligible ? "Recomendado" : "Incompatível"}</span></div><p>{recommendation.reason}</p><small>{recommendation.eligible ? `${Math.round((recommendation.downloadSizeMb ?? 0) / 100) / 10} GB para baixar` : "Nenhum modelo será baixado."}</small></div>{recommendation.eligible && <div style={{ display: "flex", gap: "8px" }}>{!runtimes.find((item) => item.component === "ollama")?.installed ? <button className="flat-button" onClick={installOllama}><Download size={14} />Instalar Ollama</button> : <button className="flat-button" onClick={downloadRecommendedModel}><Download size={14} />Baixar modelo</button>}</div>}</article>}</div>}{[...(hardware?.warnings ?? []), operationMessage].filter(Boolean).map((notice) => <p className="settings-message" key={notice}>{notice}</p>)}</>}
          {tab === "runtimes" && <><div className="settings-heading runtime-heading"><div><span>Execução local</span><h3>Ollama e OpenClaw</h3><p>O Open Assistant nunca instala runtimes automaticamente.</p></div><button className="flat-button" onClick={refreshRuntimes} disabled={checking}><RefreshCw size={14} className={checking ? "spin" : ""} />Verificar</button></div><div className="runtime-notice"><ShieldCheck size={18} /><div><strong>Você mantém o controle</strong><p>Os botões abaixo apenas abrem a página oficial. O download e a instalação só acontecem quando você decidir.</p></div></div><div className="runtime-list">{(["ollama", "openclaw"] as const).map((id) => { const status = runtimes.find((item) => item.component === id); const info = runtimeInfo[id]; return <article key={id}><span className="runtime-logo">{id === "ollama" ? "OL" : "OC"}</span><div className="runtime-copy"><div><h4>{info.title}</h4><span className={`status-badge ${status?.running ? "running" : status?.installed ? "installed" : "missing"}`}>{status?.running ? "Rodando" : status?.installed ? "Instalado" : "Não instalado"}</span></div><p>{info.description}</p><small>{status?.version ?? (status?.installed ? status.binaryPath : `Porta padrão: ${status?.port ?? "—"}`)}</small></div><div style={{ display: "flex", gap: "8px" }}>{status?.installed && !status?.running && <button className="flat-button" onClick={() => handleStartRuntime(id)} title="Iniciar serviço local"><Play size={14} />Iniciar</button>}<button className="flat-button" onClick={() => openUrl(info.url)}><Download size={14} />{status?.installed ? "Site oficial" : "Baixar manualmente"}</button></div></article>; })}</div></>}
          {tab === "permissions" && <><div className="settings-heading"><span>Segurança</span><h3>Permissões dos agentes</h3><p>Defina limites antes de conectar modelos e ferramentas.</p></div><div className="permission-list">{["Ler arquivos do projeto", "Criar e editar arquivos", "Executar comandos no terminal", "Acessar a rede externa", "Alterar workflows"].map((name, index) => <label key={name}><span><strong>{name}</strong><small>{index < 2 ? "Permitido no workspace atual" : "Exigir confirmação"}</small></span><input type="checkbox" defaultChecked={index < 2} /></label>)}</div></>}
        </div>
      </div>
    </section>
  </div>;
}
