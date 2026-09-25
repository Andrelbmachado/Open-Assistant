import { invoke } from "@tauri-apps/api/core";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { Atom, Bot, Boxes, Cable, Check, ChevronRight, CircleDot, Download, Eye, EyeOff, KeyRound, Mic, Orbit, Palette, Play, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore, type SettingsTab, type Theme } from "../store/store";
import { refreshInstalledModels } from "../store/localModelsStore";
import { isQAOffline } from "../utils/qaMode";
import { createProviderId, type ProviderConfig, validateProviderConfig } from "../utils/providers";
import { ORBITAL_SKIN_LABELS, ORBITAL_SKINS } from "../utils/orbitalState";
import { FacePreview } from "./FacePreview";
import { LocalModelsPanel } from "./LocalModelsPanel";
import { ProviderLogo, ProviderSelect } from "./ProviderSelect";
import { McpPanel } from "./McpPanel";
import { ToolsPanel } from "./ToolsPanel";
import { BUILTIN_PROVIDERS } from "../utils/cloudModels";
import { VoiceSettings } from "./VoiceSettings";

const SKIN_ICONS = { robot: Bot, super: Orbit, tentacles: Sparkles, sphere: CircleDot, atom: Atom } as const;

interface RuntimeStatus { component: "ollama" | "openclaw"; installed: boolean; running: boolean; version?: string; binaryPath?: string; port: number; error?: string }
const builtinProviders: ProviderConfig[] = BUILTIN_PROVIDERS;
const runtimeInfo = {
  ollama: { title: "Ollama", description: "Modelos locais no Windows", url: "https://ollama.com/download/windows" },
  openclaw: { title: "OpenClaw", description: "Runtime local para agentes", url: "https://docs.openclaw.ai/windows" },
};

/** Modal de Configurações; cada aba é um painel (Aparência, Provedores, Modelos, Ferramentas, Voz, MCP, Runtimes, Permissões). */
export function SettingsView() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [provider, setProvider] = useState(builtinProviders[0].id);
  const [customProviders, setCustomProviders] = useState<ProviderConfig[]>(() => { try { return JSON.parse(localStorage.getItem("open-assistant-custom-providers") ?? "[]"); } catch { return []; } });
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const providerConfigs = [...builtinProviders, ...customProviders];

  useEffect(() => { if (state.settingsOpen && state.settingsTab) setTab(state.settingsTab); }, [state.settingsOpen, state.settingsTab]);
  // Veio do seletor de modelos: já seleciona o provedor e explica que falta a chave.
  useEffect(() => {
    if (!state.settingsOpen || state.settingsTab !== "providers") return;
    if (state.settingsFocusModel) setProvider(state.settingsFocusModel);
    if (state.settingsNotice) setMessage(state.settingsNotice);
  }, [state.settingsOpen, state.settingsTab, state.settingsFocusModel, state.settingsNotice]);
  useEffect(() => { if (state.settingsOpen) refreshRuntimes(); }, [state.settingsOpen]);
  useEffect(() => { providerConfigs.forEach((item) => invoke<string | null>("read_credential", { account: item.id }).then((value) => setSaved((old) => ({ ...old, [item.id]: Boolean(value) }))).catch(() => undefined)); }, [customProviders]);
  useEffect(() => { localStorage.setItem("open-assistant-custom-providers", JSON.stringify(customProviders)); }, [customProviders]);

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
      setTimeout(() => { refreshRuntimes(); if (id === "ollama") void refreshInstalledModels(); }, 2500);
    } catch (reason) {
      setMessage(`Não foi possível iniciar ${id}: ${reason}`);
    }
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
    try { await invoke("save_credential", { account: provider, secret }); setSaved((old) => ({ ...old, [provider]: true })); setSecret(""); setMessage(isQAOffline() ? "Credencial fictícia salva apenas na memória QA." : "Chave salva com segurança no Windows."); }
    catch (reason) { setMessage(`Não foi possível salvar: ${reason}`); }
  }

  async function deleteKey(name: string) {
    await invoke("delete_credential", { account: name }).catch(() => undefined);
    setSaved((old) => ({ ...old, [name]: false }));
  }

  function addProvider() {
    const name = window.prompt("Nome do provedor:")?.trim(); if (!name) return;
    const baseUrl = window.prompt("URL base compatível com OpenAI (ex.: https://api.exemplo.com/v1):")?.trim();
    const defaultModel = window.prompt("Modelo padrão:")?.trim();
    const config: ProviderConfig = { id: createProviderId(name), name, kind: "custom", baseUrl, defaultModel: defaultModel ?? "" };
    const error = validateProviderConfig(config); if (error) { setMessage(error); return; }
    if (providerConfigs.some((item) => item.id === config.id)) { setMessage("Já existe um provedor com esse nome."); return; }
    setCustomProviders((items) => [...items, config]); setProvider(config.id); setMessage("Provedor adicionado. Salve uma chave para ativá-lo.");
  }

  function editProvider(config: ProviderConfig) {
    if (config.kind === "builtin") { setMessage("Provedores internos mantêm a configuração oficial; você pode apenas adicionar ou remover sua credencial."); return; }
    const name = window.prompt("Nome do provedor:", config.name)?.trim(); if (!name) return;
    const baseUrl = window.prompt("URL base compatível com OpenAI:", config.baseUrl)?.trim();
    const defaultModel = window.prompt("Modelo padrão:", config.defaultModel)?.trim();
    const next = { ...config, name, baseUrl, defaultModel: defaultModel ?? "" }; const error = validateProviderConfig(next); if (error) { setMessage(error); return; }
    setCustomProviders((items) => items.map((item) => item.id === config.id ? next : item));
  }

  async function removeProvider(config: ProviderConfig) {
    if (config.kind === "builtin") { await deleteKey(config.id); return; }
    if (!window.confirm(`Remover ${config.name} e sua credencial?`)) return;
    await deleteKey(config.id); setCustomProviders((items) => items.filter((item) => item.id !== config.id)); if (provider === config.id) setProvider(builtinProviders[0].id);
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
          <button className={tab === "tools" ? "active" : ""} onClick={() => setTab("tools")}><Boxes size={16} />Ferramentas de IA<ChevronRight size={13} /></button>
          <button className={tab === "voice" ? "active" : ""} onClick={() => setTab("voice")}><Mic size={16} />Voz<ChevronRight size={13} /></button>
          <button className={tab === "mcp" ? "active" : ""} onClick={() => setTab("mcp")}><Cable size={16} />Conectores MCP<ChevronRight size={13} /></button>
          <button className={tab === "runtimes" ? "active" : ""} onClick={() => setTab("runtimes")}><Bot size={16} />Runtimes locais<ChevronRight size={13} /></button>
          <button className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}><ShieldCheck size={16} />Permissões<ChevronRight size={13} /></button>
        </nav>
        <div className="settings-content">
          {tab === "general" && <><div className="settings-heading"><span>Aparência</span><h3>Liquidglass Flat</h3><p>Superfícies precisas e leves, desenhadas para o Windows 11.</p></div><div className="setting-card"><label>Tema</label><div className="segmented">{(["dark", "light", "system"] as Theme[]).map((theme) => <button key={theme} className={state.theme === theme ? "active" : ""} onClick={() => dispatch({ type: "theme", theme })}>{theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}</button>)}</div></div><div className="setting-card"><label>Cor de destaque</label><div className="accent-options">{["#d8d8dc", "#b7b7bd", "#929299", "#6f6f76", "#f1f1f3"].map((color) => <button key={color} className={state.accent === color ? "active" : ""} style={{ background: color }} onClick={() => dispatch({ type: "accent", accent: color })}>{state.accent === color && <Check size={14} />}</button>)}</div></div><div className="setting-card face-card"><div className="face-card-head"><label>Rosto do assistente</label><small>Aparece somente no modo fala.</small></div><div className="segmented orbital-settings">{ORBITAL_SKINS.map((skin) => { const Icon = SKIN_ICONS[skin]; return <button key={skin} className={state.orbitalSkin === skin ? "active" : ""} title={ORBITAL_SKIN_LABELS[skin]} onClick={() => dispatch({ type: "setOrbitalSkin", skin })}><Icon size={15} />{ORBITAL_SKIN_LABELS[skin]}</button>; })}</div><FacePreview skin={state.orbitalSkin} /></div></>}
          {tab === "providers" && <><div className="settings-heading runtime-heading"><div><span>Modelos em nuvem</span><h3>Provedores de IA</h3><p>Chaves ficam no Gerenciador de Credenciais do Windows e só o backend as lê. Com a chave salva, o modelo aparece em + › Modelo de IA › Nuvem.</p></div><button className="flat-button" onClick={addProvider}>Adicionar provedor</button></div><div className="credential-form"><div className="credential-field"><span>Provedor</span><ProviderSelect providers={providerConfigs} value={provider} saved={saved} onChange={setProvider} /></div><label>Chave de API<div className="secret-input"><input type={showSecret ? "text" : "password"} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="sk-••••••••••••••••" /><button onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label><button className="primary-button" onClick={saveKey} disabled={!secret.trim()}><KeyRound size={15} />Salvar credencial</button>{message && <p className="settings-message">{message}</p>}</div><div className="provider-list">{providerConfigs.map((item) => <div key={item.id} className={`provider-row ${provider === item.id ? "selected" : ""}`} onClick={() => setProvider(item.id)}><ProviderLogo provider={item} /><span className="provider-row-meta"><span className={`provider-status ${saved[item.id] ? "on" : ""}`}><i />{saved[item.id] ? "Credencial protegida" : "Sem credencial"}</span>{item.kind === "custom" && <small>{item.defaultModel} · {item.baseUrl}</small>}</span><div className="provider-row-actions">{item.kind === "custom" && <button title="Editar" onClick={(event) => { event.stopPropagation(); editProvider(item); }}>Editar</button>}<button title={item.kind === "custom" ? "Remover provedor" : "Excluir credencial"} aria-label={item.kind === "custom" ? `Remover ${item.name}` : `Excluir credencial de ${item.name}`} disabled={item.kind === "builtin" && !saved[item.id]} onClick={(event) => { event.stopPropagation(); void removeProvider(item); }}><Trash2 size={14} /></button></div></div>)}</div></>}
          {tab === "models" && <LocalModelsPanel />}
          {tab === "tools" && <ToolsPanel />}
          {tab === "voice" && <VoiceSettings />}
          {tab === "mcp" && <McpPanel />}
          {tab === "runtimes" && <><div className="settings-heading runtime-heading"><div><span>Execução local</span><h3>Ollama e OpenClaw</h3><p>O Open Assistant nunca instala runtimes automaticamente.</p></div><button className="flat-button" onClick={refreshRuntimes} disabled={checking}><RefreshCw size={14} className={checking ? "spin" : ""} />Verificar</button></div><div className="runtime-notice"><ShieldCheck size={18} /><div><strong>Você mantém o controle</strong><p>Os botões abaixo apenas abrem a página oficial. O download e a instalação só acontecem quando você decidir.</p></div></div><div className="runtime-list">{(["ollama", "openclaw"] as const).map((id) => { const status = runtimes.find((item) => item.component === id); const info = runtimeInfo[id]; return <article key={id}><span className="runtime-logo">{id === "ollama" ? "OL" : "OC"}</span><div className="runtime-copy"><div><h4>{info.title}</h4><span className={`status-badge ${status?.running ? "running" : status?.installed ? "installed" : "missing"}`}>{status?.running ? "Rodando" : status?.installed ? "Instalado" : "Não instalado"}</span></div><p>{info.description}</p><small>{status?.version ?? (status?.installed ? status.binaryPath : `Porta padrão: ${status?.port ?? "—"}`)}</small></div><div style={{ display: "flex", gap: "8px" }}>{status?.installed && !status?.running && <button className="flat-button" onClick={() => handleStartRuntime(id)} title="Iniciar serviço local"><Play size={14} />Iniciar</button>}<button className="flat-button" onClick={() => openUrl(info.url)}><Download size={14} />{status?.installed ? "Site oficial" : "Baixar manualmente"}</button></div></article>; })}</div>{message && <p className="settings-message">{message}</p>}</>}
          {tab === "permissions" && <><div className="settings-heading"><span>Segurança</span><h3>Permissões dos agentes</h3><p>Defina limites antes de conectar modelos e ferramentas.</p></div><div className="permission-list">{["Ler arquivos do projeto", "Criar e editar arquivos", "Executar comandos no terminal", "Acessar a rede externa", "Alterar workflows"].map((name, index) => <label key={name}><span><strong>{name}</strong><small>{index < 2 ? "Permitido no workspace atual" : "Exigir confirmação"}</small></span><input type="checkbox" defaultChecked={index < 2} /></label>)}</div></>}
        </div>
      </div>
    </section>
  </div>;
}
