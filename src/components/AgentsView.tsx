import { Bot, Cpu, Eye, Plus, TerminalSquare, Users, Workflow } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useStore } from "../store/store";
import { useTraceHistory } from "../store/systemTrace";
import { SYSTEM_AGENTS, SYSTEM_WORKFLOWS } from "../utils/systemWorkflows";
import { Dropdown } from "./Dropdown";
import { PageHeader } from "./PageHeader";

type AgentsTab = "sistema" | "usuario";

const timeOf = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Agentes: os do usuário (cada um abre o seu canvas ou terminal) e os do próprio sistema (fluxos só para ver). */
export function AgentsView() {
  const { state, dispatch } = useStore();
  const history = useTraceHistory();
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
