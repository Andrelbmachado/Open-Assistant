import { Bot, Plus, TerminalSquare, Users, Workflow } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useStore } from "../store/store";
import { Dropdown } from "./Dropdown";
import { PageHeader } from "./PageHeader";

/** Agentes: cada um abre o seu canvas de nodes ou o seu terminal. */
export function AgentsView() {
  const { state, dispatch } = useStore();
  const [newAgentType, setNewAgentType] = useState<"workflow" | "terminal">("workflow");
  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); dispatch({ type: "openAgent", id }); } };
  return <section className="view page-view agents-view">
    <PageHeader eyebrow="Equipe" title="Agentes" icon={<Users size={17} />}>
      <Dropdown ariaLabel="Tipo do novo agente" value={newAgentType} onChange={(value) => setNewAgentType(value as "workflow" | "terminal")}
        options={[{ value: "workflow", label: "Canvas de nodes", description: "workflow com IA, arquivos, nuvem", icon: <Workflow size={14} /> }, { value: "terminal", label: "Terminal", description: "PowerShell do agente", icon: <TerminalSquare size={14} /> }]} />
      <button className="page-button primary" onClick={() => dispatch({ type: "addAgent", workspace: newAgentType })}><Plus size={14} />Novo agente</button>
    </PageHeader>
    <div className="page-scroll">
      <p className="page-subtitle">Clique num agente para abrir o espaço de trabalho dele nesta área.</p>
      <div className="agent-grid">
        {state.agents.map((agent) => { const workflow = state.workflows.find((doc) => doc.id === agent.workflowId); return <article className="page-card agent-tile" key={agent.id} role="button" tabIndex={0} onClick={() => dispatch({ type: "openAgent", id: agent.id })} onKeyDown={(event) => openWithKeyboard(event, agent.id)}>
          <header><span className={`market-icon ${agent.workspace === "workflow" ? "mcp" : "texto"}`}>{agent.workspace === "workflow" ? <Workflow size={18} /> : <TerminalSquare size={18} />}</span><div><h3>{agent.name}</h3><small>{agent.workspace === "workflow" ? "Canvas de nodes" : "Terminal"}</small></div></header>
          <p>{agent.role}</p>
          <footer><span className="market-status instalado"><i className="agent-dot" />{agent.status}</span>{workflow && <small className="agent-meta">{workflow.name} · {workflow.nodes.length} nodes</small>}</footer>
        </article>; })}
        {!state.agents.length && <div className="page-empty compact"><Bot size={22} /><p>Nenhum agente ainda.</p></div>}
      </div>
    </div>
  </section>;
}
