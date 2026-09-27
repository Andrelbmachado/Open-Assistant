import { invoke } from "@tauri-apps/api/core";
import { Bot, Check, Cpu, Eye, LoaderCircle, Moon, Plug, Plus, ScrollText, TerminalSquare, Users, Workflow, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useStore } from "../store/store";
import { useTraceHistory } from "../store/systemTrace";
import { setProposalStatus, useDreams } from "../store/dreams";
import { DREAM_NOW_EVENT } from "./DreamService";
import type { DreamProposal } from "../utils/dreams";
import { SYSTEM_AGENTS, SYSTEM_WORKFLOWS } from "../utils/systemWorkflows";
import { Dropdown } from "./Dropdown";
import { PageHeader } from "./PageHeader";

type AgentsTab = "sistema" | "usuario";

const timeOf = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Agentes: os do usuário (cada um abre o seu canvas ou terminal) e os do próprio sistema (fluxos só para ver). */
export function AgentsView() {
  const { state, dispatch } = useStore();
  const history = useTraceHistory();
  const dreams = useDreams();
  const [dreamError, setDreamError] = useState<string | null>(null);
  const pending = dreams.proposals.filter((item) => item.status === "pendente");
  const [tab, setTab] = useState<AgentsTab>("usuario");
  const [chatFilter, setChatFilter] = useState("");
  const chatsInHistory = [...new Set(history.map((entry) => entry.chatId).filter((id): id is string => Boolean(id)))];
  const filtered = chatFilter ? history.filter((entry) => entry.chatId === chatFilter) : history;
  const [newAgentType, setNewAgentType] = useState<"workflow" | "terminal">("workflow");
  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, open: () => void) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } };
  const chatTitle = (chatId?: string) => state.chats.find((chat) => chat.id === chatId)?.title ?? "conversa";
  return <section className="view page-view agents-view">
    <PageHeader eyebrow="Equipe" title="Agentes" icon={<Users size={17} />}>
      {tab === "usuario" && <>
        <Dropdown ariaLabel="Tipo do novo agente" value={newAgentType} onChange={(value) => setNewAgentType(value as "workflow" | "terminal")}
          options={[{ value: "workflow", label: "Canvas de nodes", description: "workflow com IA, arquivos, nuvem", icon: <Workflow size={14} /> }, { value: "terminal", label: "Terminal", description: "PowerShell do agente", icon: <TerminalSquare size={14} /> }]} />
        <button className="page-button primary" onClick={() => dispatch({ type: "addAgent", workspace: newAgentType })}><Plus size={14} />Novo agente</button>
      </>}
    </PageHeader>
    <div className="agents-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "usuario"} className={tab === "usuario" ? "active" : ""} onClick={() => setTab("usuario")}><Users size={13} />Agentes do usuário</button>
      <button role="tab" aria-selected={tab === "sistema"} className={tab === "sistema" ? "active" : ""} onClick={() => setTab("sistema")}><Cpu size={13} />Agentes do sistema</button>
    </div>
    <div className="page-scroll">
      {tab === "usuario" ? <>
        <p className="page-subtitle">Clique num agente para abrir o espaço de trabalho dele nesta área.</p>
        <div className="agent-grid">
          {state.agents.map((agent) => { const workflow = state.workflows.find((doc) => doc.id === agent.workflowId); return <article className="page-card agent-tile" key={agent.id} role="button" tabIndex={0} onClick={() => dispatch({ type: "openAgent", id: agent.id })} onKeyDown={(event) => openWithKeyboard(event, () => dispatch({ type: "openAgent", id: agent.id }))}>
            <header><span className={`market-icon ${agent.workspace === "workflow" ? "mcp" : "texto"}`}>{agent.workspace === "workflow" ? <Workflow size={18} /> : <TerminalSquare size={18} />}</span><div><h3>{agent.name}</h3><small>{agent.workspace === "workflow" ? "Canvas de nodes" : "Terminal"}</small></div></header>
            <p>{agent.role}</p>
            <footer><span className="market-status instalado"><i className="agent-dot" />{agent.status}</span>{workflow && <small className="agent-meta">{workflow.name} · {workflow.nodes.length} nodes</small>}</footer>
          </article>; })}
          {!state.agents.length && <div className="page-empty compact"><Bot size={22} /><p>Nenhum agente ainda.</p></div>}
        </div>
      </> : <>
        <p className="page-subtitle">Os fluxos que o próprio Open Assistant usa. Abra um e use o app: os nodes acendem na hora em que cada etapa acontece.</p>
        <div className="agent-grid">
          {SYSTEM_AGENTS.map((agent) => { const workflow = SYSTEM_WORKFLOWS.find((doc) => doc.id === agent.workflowId); const last = history.find((entry) => entry.workflowId === agent.workflowId); const open = () => dispatch({ type: "openSystemFlow", workflowId: agent.workflowId }); return <article className="page-card agent-tile" key={agent.id} role="button" tabIndex={0} onClick={open} onKeyDown={(event) => openWithKeyboard(event, open)}>
            <header><span className="market-icon mcp"><Eye size={18} /></span><div><h3>{agent.name}</h3><small>Fluxo do sistema</small></div></header>
            <p>{agent.role}</p>
            <footer><span className="market-status instalado"><i className="agent-dot" />{last ? `${last.ok ? "Última vez" : "Falhou"} às ${timeOf(last.at)}` : "Ainda não rodou nesta sessão"}</span>{workflow && <small className="agent-meta">{workflow.name} · {workflow.nodes.length} nodes</small>}</footer>
          </article>; })}
        </div>
        <div className="agents-history-head"><h3 className="agents-section-title">Propostas dos sonhos {pending.length > 0 && <span className="dream-count">{pending.length}</span>}</h3>
          <button className="page-button" disabled={dreams.dreaming} onClick={() => { setDreamError(null); window.dispatchEvent(new Event(DREAM_NOW_EVENT)); }}>{dreams.dreaming ? <LoaderCircle size={13} className="spin" /> : <Moon size={13} />}{dreams.dreaming ? "Sonhando…" : "Sonhar agora"}</button>
        </div>
        {(dreamError ?? dreams.lastError) && <p className="node-note error">{dreamError ?? dreams.lastError}</p>}
        {pending.length ? <ul className="dream-list">{pending.map((item) => <DreamRow key={item.id} item={item} onError={setDreamError} onConnector={() => dispatch({ type: "settings", open: true, tab: "mcp" })} />)}</ul>
          : <p className="network-hint">Nenhuma proposta esperando. À noite o app revê o dia e sugere skills e conectores; ou clique em Sonhar agora.</p>}
        <div className="agents-history-head"><h3 className="agents-section-title">Execuções recentes</h3>
          {chatsInHistory.length > 0 && <select aria-label="Filtrar por conversa" value={chatFilter} onChange={(event) => setChatFilter(event.target.value)}>
            <option value="">Todas as conversas</option>
            {chatsInHistory.map((id) => <option key={id} value={id}>{chatTitle(id)}</option>)}
          </select>}
        </div>
        {filtered.length ? <ul className="system-trace-list">
          {filtered.slice(0, 40).map((entry) => <li key={entry.id} className={entry.ok ? "ok" : "error"}>
            <i className={`node-status-dot ${entry.ok ? "ok" : "error"}`} />
            <b>{SYSTEM_WORKFLOWS.find((doc) => doc.id === entry.workflowId)?.name ?? entry.workflowId}</b>
            <small>{timeOf(entry.at)}{entry.chatId ? ` · ${chatTitle(entry.chatId)}` : ""}</small>
            <span>{entry.summary}</span>
          </li>)}
        </ul> : <div className="page-empty compact"><Eye size={22} /><p>Nada rodou ainda. Peça no chat: "lembre que eu gosto de café".</p></div>}
      </>}
    </div>
  </section>;
}

/** Uma proposta dos sonhos: aprovar cria a skill (ou abre os conectores); recusar tira da fila. */
function DreamRow({ item, onError, onConnector }: { item: DreamProposal; onError: (message: string) => void; onConnector: () => void }) {
  const [open, setOpen] = useState(false);
  const approve = async () => {
    if (item.kind === "skill") {
      try { await invoke("skill_create", { id: item.name, description: item.description, body: item.content }); setProposalStatus(item.id, "aprovada"); }
      catch (reason) { onError(String(reason)); }
    } else { setProposalStatus(item.id, "aprovada"); onConnector(); }
  };
  return <li className="dream-row page-card">
    <header>{item.kind === "skill" ? <ScrollText size={16} /> : <Plug size={16} />}<div><b>{item.kind === "skill" ? `/${item.name}` : item.name}</b><small>{item.kind === "skill" ? "Skill nova" : "Conector sugerido"} · {item.description}</small></div></header>
    {open && <pre className="dream-content">{item.content}</pre>}
    <footer><button className="page-button" onClick={() => setOpen((value) => !value)}>{open ? "Esconder" : "Ver detalhes"}</button><span /><button className="page-button" onClick={() => setProposalStatus(item.id, "recusada")}><X size={13} />Recusar</button><button className="page-button primary" onClick={() => void approve()}><Check size={13} />{item.kind === "skill" ? "Criar skill" : "Configurar"}</button></footer>
  </li>;
}
