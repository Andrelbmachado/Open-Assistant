import { invoke } from "@tauri-apps/api/core";
import { Activity, Bot, Cpu, FileText, Gauge, HardDrive, LayoutGrid, LoaderCircle, MemoryStick, MessageSquare, MonitorCog, RefreshCw, RotateCcw, ScrollText, Server, Settings, Sparkles, SquareActivity, TriangleAlert, Wrench, Workflow, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "../store/store";
import { useLocalModels } from "../store/localModelsStore";
import { useTools } from "../store/toolsStore";
import { IMAGE_MODELS } from "../utils/imageCatalog";
import { isQAOffline } from "../utils/qaMode";
import { PageHeader } from "./PageHeader";

interface ProcessUsage { name: string; pid: number; commitGb: number; ramGb: number }
interface MemoryStatus { ramTotalGb: number; ramFreeGb: number; commitTotalGb: number; commitFreeGb: number; gpuName?: string; gpuTotalGb?: number; gpuFreeGb?: number; top: ProcessUsage[]; advice?: string }
interface SystemStatus { memory: MemoryStatus; cpuPercent: number; cpuName: string; cores: number; diskTotalGb: number; diskFreeGb: number; uptimeHours: number; windows: string }

/** Atalhos para as ferramentas do Windows (abrem pelo `start` do Windows, com clique da pessoa). */
const WINDOWS_TOOLS: { label: string; target: string; icon: typeof Settings; hint: string }[] = [
  { label: "Configurações", target: "ms-settings:", icon: Settings, hint: "Configurações do Windows" },
  { label: "Gerenciador de Tarefas", target: "taskmgr", icon: SquareActivity, hint: "Programas e desempenho" },
  { label: "Monitor de Recursos", target: "resmon", icon: Activity, hint: "Memória, disco e rede em detalhe" },
  { label: "Painel de Controle", target: "control", icon: LayoutGrid, hint: "Painel clássico" },
  { label: "Armazenamento", target: "ms-settings:storagesense", icon: HardDrive, hint: "Liberar espaço em disco" },
  { label: "Informações do sistema", target: "msinfo32", icon: MonitorCog, hint: "Hardware e drivers" },
  { label: "Serviços", target: "services.msc", icon: Server, hint: "Serviços do Windows" },
  { label: "Energia", target: "ms-settings:powersleep", icon: Zap, hint: "Energia e suspensão" },
];

function Meter({ label, icon, used, total, unit = "GB", detail }: { label: string; icon: ReactNode; used: number; total: number; unit?: string; detail?: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return <article className="page-card meter-card">
    <header><span className="page-card-icon">{icon}</span><span>{label}</span><b className={percent >= 90 ? "hot" : percent >= 75 ? "warm" : ""}>{percent}%</b></header>
    <div className="meter"><i style={{ width: `${percent}%` }} className={percent >= 90 ? "hot" : percent >= 75 ? "warm" : ""} /></div>
    <small>{unit === "%" ? detail : `${used.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de ${total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}${detail ? ` · ${detail}` : ""}`}</small>
  </article>;
}

/**
 * Painel de controle do Windows: uso de CPU, RAM, memória reservada, placa de vídeo e disco em tempo
 * real, quem mais ocupa memória (com os botões de liberar), atalhos das ferramentas do Windows e o
 * estado do Open Assistant (modelos, workflows, agentes, logs).
 */
export function DashboardView() {
  const { state, dispatch } = useStore();
  const local = useLocalModels();
  const tools = useTools();
  const [status, setStatus] = useState<SystemStatus>();
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();

  async function refresh() {
    if (isQAOffline()) return;
    try { setStatus(await invoke<SystemStatus>("system_status")); } catch (error) { setNote(String(error)); }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function act(label: string, run: () => Promise<string>) {
    setBusy(label);
    try { setNote(await run()); } catch (error) { setNote(String(error)); }
    setBusy(undefined);
    void refresh();
  }

  const memory = status?.memory;
  const oneDrive = memory?.top.find((item) => item.name.toLowerCase() === "onedrive" && item.commitGb >= 4);
  const maxCommit = Math.max(1, ...(memory?.top.map((item) => item.commitGb) ?? [1]));
  const imageModels = IMAGE_MODELS.filter((model) => tools.installed.has(model.id)).length;

  return <section className="view page-view dashboard-view">
    <PageHeader eyebrow="Windows" title="Painel de controle" icon={<Gauge size={17} />}>
      <button className="page-button" onClick={() => void refresh()} title="Atualizar agora"><RefreshCw size={14} />Atualizar</button>
    </PageHeader>
    <div className="page-scroll">
      {!status && <div className="page-empty compact"><LoaderCircle size={20} className="spin" /><p>Lendo o PC…</p></div>}
      {status && memory && <>
        <p className="page-subtitle">{status.windows || "Windows"} · {status.cpuName.trim()} ({status.cores} núcleos){memory.gpuName ? ` · ${memory.gpuName}` : ""} · ligado há {status.uptimeHours.toLocaleString("pt-BR")} h</p>
        {memory.advice && <div className="page-alert">
          <TriangleAlert size={18} />
          <div><strong>Pouca memória livre</strong><p>{memory.advice}</p></div>
          <div className="page-alert-actions">
            <button className="page-button" disabled={Boolean(busy)} onClick={() => void act("app", async () => { const freed = await invoke<string[]>("free_memory"); return freed.length ? `Liberado: ${freed.join("; ")}.` : "O app já não estava segurando modelos parados."; })}>{busy === "app" ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />}Liberar memória do app</button>
            {oneDrive && <button className="page-button primary" disabled={Boolean(busy)} onClick={() => void act("onedrive", () => invoke<string>("restart_memory_hog", { name: "OneDrive" }))}>{busy === "onedrive" ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}Reiniciar OneDrive ({oneDrive.commitGb.toLocaleString("pt-BR")} GB)</button>}
          </div>
        </div>}
        {note && <p className="page-note">{note}</p>}
        <div className="meter-grid">
          <Meter label="Processador" icon={<Cpu size={15} />} used={status.cpuPercent} total={100} unit="%" detail={`${status.cpuPercent.toLocaleString("pt-BR")}% em uso`} />
          <Meter label="Memória RAM" icon={<MemoryStick size={15} />} used={memory.ramTotalGb - memory.ramFreeGb} total={memory.ramTotalGb} detail={`${memory.ramFreeGb.toLocaleString("pt-BR")} GB livres`} />
          <Meter label="Memória reservada" icon={<Gauge size={15} />} used={memory.commitTotalGb - memory.commitFreeGb} total={memory.commitTotalGb} detail="RAM + paginação" />
          {memory.gpuTotalGb !== undefined && memory.gpuTotalGb !== null && <Meter label="Placa de vídeo" icon={<MonitorCog size={15} />} used={(memory.gpuTotalGb ?? 0) - (memory.gpuFreeGb ?? 0)} total={memory.gpuTotalGb ?? 0} detail="VRAM" />}
          <Meter label="Disco C:" icon={<HardDrive size={15} />} used={status.diskTotalGb - status.diskFreeGb} total={status.diskTotalGb} detail={`${status.diskFreeGb.toLocaleString("pt-BR")} GB livres`} />
        </div>
        <div className="page-columns">
          <section className="page-card">
            <h3 className="page-card-title"><MemoryStick size={15} />Quem está usando memória</h3>
            <ul className="usage-list">
              {memory.top.map((item) => <li key={item.name}>
                <span className="usage-name">{item.name}</span>
                <span className="usage-bar"><i style={{ width: `${Math.max(2, (item.commitGb / maxCommit) * 100)}%` }} /></span>
                <span className="usage-value">{item.commitGb.toLocaleString("pt-BR")} GB</span>
              </li>)}
            </ul>
            <p className="page-card-foot">Memória reservada por programa (cópias somadas). É ela que acaba quando a IA diz "out of memory".</p>
          </section>
          <section className="page-card">
            <h3 className="page-card-title"><Bot size={15} />Open Assistant</h3>
            <ul className="stat-list">
              <li><span><Server size={14} />Ollama</span><b className={local.ollama === "online" ? "ok" : "bad"}>{local.ollama === "online" ? "rodando" : local.ollama === "offline" ? "parado" : "verificando"}</b></li>
              <li><span><Sparkles size={14} />Modelos de texto</span><b>{local.installed.length}</b></li>
              <li><span><Sparkles size={14} />Modelos de imagem</span><b>{imageModels}</b></li>
              <li><span><Workflow size={14} />Workflows</span><b>{state.workflows.length}</b></li>
              <li><span><Bot size={14} />Agentes</span><b>{state.agents.length}</b></li>
              <li><span><MessageSquare size={14} />Conversas</span><b>{state.chats.length}</b></li>
            </ul>
            <div className="page-card-actions">
              <button className="page-button" onClick={() => dispatch({ type: "settings", open: true, tab: "logs" })}><ScrollText size={13} />Ver logs</button>
              <button className="page-button" onClick={() => dispatch({ type: "settings", open: true, tab: "models" })}><FileText size={13} />Modelos</button>
            </div>
          </section>
        </div>
        <section className="page-card">
          <h3 className="page-card-title"><Wrench size={15} />Ferramentas do Windows</h3>
          <div className="tool-grid">
            {WINDOWS_TOOLS.map((tool) => <button key={tool.target} className="tool-tile" title={tool.hint} onClick={() => void invoke("fs_open", { path: tool.target })}><tool.icon size={17} /><span><b>{tool.label}</b><small>{tool.hint}</small></span></button>)}
          </div>
        </section>
      </>}
    </div>
  </section>;
}
