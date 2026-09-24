import { Bot, ChevronDown, Folder, MessageSquare, MessageSquarePlus, Plus, Search, Settings, ShoppingBag, SquarePen, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { useStore, type ViewKind } from "../store/store";

const sections: { id?: ViewKind; title: string; icon: typeof MessageSquarePlus; action: "chat" | "project" | "view" }[] = [
  { title: "Novo Chat", icon: MessageSquarePlus, action: "chat" },
  { id: "agents", title: "Agentes", icon: Bot, action: "view" },
  { id: "terminal", title: "Terminal", icon: TerminalSquare, action: "view" },
  { id: "marketplace", title: "Marketplace", icon: ShoppingBag, action: "view" },
];

export function Sidebar() {
  const { state, dispatch } = useStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const recentChats = state.chats.filter((chat) => !chat.projectId);
  const recentAgents = state.agents.filter((agent) => !agent.projectId);
  return (
    <aside className={`sidebar ${state.sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-main">
        <button className="sidebar-search" onClick={() => dispatch({ type: "palette", open: true })}><Search size={15} /><span>Buscar</span><kbd>Ctrl P</kbd></button>
        <nav className="primary-nav" aria-label="Seções">
          {sections.map(({ id, title, icon: Icon, action }) => {
            const active = action === "chat" ? state.activeView === "chat" : action === "view" && state.activeView === id;
            return <button key={title} className={active ? "active" : ""} onClick={() => action === "chat" ? dispatch({ type: "newChat" }) : dispatch({ type: "view", view: id! })} title={title}>
              <Icon size={17} /><span>{title}</span>{active && <i />}
            </button>;
          })}
        </nav>
        <section className="sidebar-section-group">
          <div className="sidebar-section-heading">
            <button className={`sidebar-section-label collapsible ${projectsOpen ? "open" : ""}`} onClick={() => setProjectsOpen((open) => !open)}><span>Projetos</span><ChevronDown size={13} /></button>
            <button className="section-hover-action" onClick={() => dispatch({ type: "newProject" })} title="Criar projeto" aria-label="Criar projeto"><Plus size={15} /></button>
          </div>
          {projectsOpen && <div className="project-list">
            {state.projects.map((project) => <div className="project-row" key={project.id}>
              <button className="project-row-main" title={project.name}><Folder size={15} /><span>{project.name}</span></button>
              <button className="project-chat-action" onClick={() => dispatch({ type: "newChat", projectId: project.id })} title={`Nova conversa em ${project.name}`} aria-label={`Nova conversa em ${project.name}`}><SquarePen size={14} /></button>
            </div>)}
          </div>}
        </section>
        <section className="sidebar-section-group">
          <div className="sidebar-section-heading">
            <button className={`sidebar-section-label collapsible ${recentOpen ? "open" : ""}`} onClick={() => setRecentOpen((open) => !open)}><span>Recentes</span><ChevronDown size={13} /></button>
          </div>
          {recentOpen && <div className="recent-list">
            {recentChats.map((chat) => <button key={chat.id} className={state.activeChatId === chat.id ? "active" : ""} onClick={() => dispatch({ type: "selectChat", id: chat.id })}><MessageSquare size={13} /><span>{chat.title}</span></button>)}
            {recentAgents.map((agent) => <button key={agent.id} onClick={() => dispatch({ type: "openAgent", id: agent.id })}><Bot size={13} /><span>{agent.name}</span></button>)}
          </div>}
        </section>
      </div>
      <footer className="sidebar-footer">
        {userMenuOpen && <div className="user-menu"><button onClick={() => { dispatch({ type: "settings", open: true }); setUserMenuOpen(false); }}><Settings size={15} /><span>Configurações</span></button></div>}
        <button className="user-row" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}><span className="avatar">AM</span><span><strong>André</strong><small>Workspace local</small></span><span className="online-dot" /></button>
      </footer>
    </aside>
  );
}
