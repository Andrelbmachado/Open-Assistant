import { Bot, ChevronDown, Cloud, Folder, MessageSquare, Monitor, Plus, Search, Settings, ShoppingBag, SquarePen, TerminalSquare } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore, type ViewKind } from "../store/store";
import { refreshInstalledModels, useLocalModels } from "../store/localModelsStore";
import { useTools } from "../store/toolsStore";
import { isLocalChatModel } from "../utils/localCatalog";
import { connectionStatus, type ConnectionStatus } from "../utils/connectionStatus";
import { parseCloudModel } from "../utils/cloudModels";
import { isQAOffline } from "../utils/qaMode";

/** Atalhos fixos do topo da barra lateral. `chat` cria uma conversa; `view` troca a área ativa. */
const sections: { id?: ViewKind; title: string; icon: typeof SquarePen; action: "chat" | "project" | "view" }[] = [
  { title: "Novo Chat", icon: SquarePen, action: "chat" },
  { id: "agents", title: "Agentes", icon: Bot, action: "view" },
  { id: "terminal", title: "Terminal", icon: TerminalSquare, action: "view" },
  { id: "marketplace", title: "Marketplace", icon: ShoppingBag, action: "view" },
];

/** Barra lateral: navegação, projetos, conversas recentes e o menu do usuário (Configurações). */
export function Sidebar() {
  const { state, dispatch } = useStore();
  const activeModel = state.chats.find((chat) => chat.id === state.activeChatId)?.model || state.preferredModel;
  // Sem modelo escolhido o app continua local: o chat nunca cai para a nuvem sozinho.
  const runsLocally = !activeModel || isLocalChatModel(activeModel);
  const local = useLocalModels();
  const tools = useTools();
  const cloud = parseCloudModel(activeModel);
  const [cloudKey, setCloudKey] = useState<boolean>();
  useEffect(() => {
    setCloudKey(undefined);
    if (!cloud || isQAOffline()) return;
    invoke<boolean>("has_credential", { account: cloud.providerId }).then(setCloudKey).catch(() => setCloudKey(false));
  }, [cloud?.providerId, state.settingsOpen]);
  // Confere o Ollama de tempos em tempos para o indicador não mentir se ele cair.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshInstalledModels(); }, 30_000);
    return () => clearInterval(timer);
  }, []);
  const connection: ConnectionStatus = connectionStatus({ model: activeModel, ollama: local.ollama, installed: local.installed.map((model) => model.name), bitnetInstalled: tools.installed.has("bitnet-2b4t"), cloudKey, qa: isQAOffline() });
  const displayName = state.memory.name.trim() || "André";
  const initials = state.memory.name.trim() ? displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("pt-BR")).join("") : "AM";
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
            // "Novo Chat" é uma ação, não um lugar: não fica marcado (a conversa aberta já fica).
            const active = action === "view" && state.activeView === id;
            return <button key={title} className={active ? "active" : ""} onClick={() => action === "chat" ? dispatch({ type: "newChat" }) : dispatch({ type: "view", view: id! })} title={title}>
              <Icon size={17} /><span>{title}</span>
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
        <button className="user-row" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}><span className="avatar">{initials}</span><span className="user-name"><strong>{displayName}</strong><small>{runsLocally ? "Rodando neste computador" : "Rodando na nuvem"}</small></span><span className={`runtime-location connection-${connection.level}`} title={connection.detail} aria-label={`${runsLocally ? "IA local" : "IA na nuvem"}: ${connection.label}`}>{runsLocally ? <Monitor size={15} /> : <Cloud size={15} />}<i className="connection-line" aria-hidden="true"><b /></i></span></button>
      </footer>
    </aside>
  );
}
