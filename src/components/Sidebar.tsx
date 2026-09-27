import { Bot, Check, ChevronDown, ChevronRight, Cloud, Copy, Download, Folder, MessageSquare, Monitor, MoreHorizontal, Pin, PinOff, Plus, Search, Settings, Share2, ShoppingBag, SquarePen, TerminalSquare, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useStore, type Chat, type ViewKind } from "../store/store";
import { refreshInstalledModels, useLocalModels } from "../store/localModelsStore";
import { useTools } from "../store/toolsStore";
import { isLocalChatModel } from "../utils/localCatalog";
import { connectionStatus, type ConnectionStatus } from "../utils/connectionStatus";
import { parseCloudModel } from "../utils/cloudModels";
import { isQAOffline } from "../utils/qaMode";
import { useDismiss } from "../utils/useDismiss";
import { chatFileName, chatToMarkdown } from "../utils/chatShare";

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
  const userArea = useRef<HTMLElement>(null);
  useDismiss(userMenuOpen, [userArea], () => setUserMenuOpen(false));
  const [recentOpen, setRecentOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  // Fixadas primeiro (na ordem em que estão), depois as outras.
  const recentChats = state.chats.filter((chat) => !chat.projectId).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const recentAgents = state.agents.filter((agent) => !agent.projectId);
  const runtime = runsLocally ? "Rodando neste computador" : "Rodando na nuvem";

  async function createProject() {
    // Projeto = pasta do PC (a tela Arquivos mostra a árvore dela). Sem janela (QA): projeto sem pasta.
    try {
      const path = await invoke<string | null>("fs_pick_folder");
      if (!path) return;
      dispatch({ type: "newProject", name: path.split("\\").filter(Boolean).pop(), path });
    } catch {
      dispatch({ type: "newProject" });
    }
  }

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
            <button className="section-hover-action" onClick={() => void createProject()} title="Criar projeto a partir de uma pasta" aria-label="Criar projeto"><Plus size={15} /></button>
          </div>
          {projectsOpen && <div className="project-list">
            {state.projects.map((project) => <div className={`project-row ${state.activeView === "files" && state.filesProjectId === project.id ? "active" : ""}`} key={project.id}>
              <button className="project-row-main" title={`Ver os arquivos de ${project.name}`} onClick={() => dispatch({ type: "openProjectFiles", projectId: project.id })}><Folder size={15} /><span>{project.name}</span></button>
              <button className="project-chat-action" onClick={() => dispatch({ type: "newChat", projectId: project.id })} title={`Nova conversa em ${project.name}`} aria-label={`Nova conversa em ${project.name}`}><SquarePen size={14} /></button>
            </div>)}
          </div>}
        </section>
        <section className="sidebar-section-group">
          <div className="sidebar-section-heading">
            <button className={`sidebar-section-label collapsible ${recentOpen ? "open" : ""}`} onClick={() => setRecentOpen((open) => !open)}><span>Recentes</span><ChevronDown size={13} /></button>
          </div>
          {recentOpen && <div className="recent-list">
            {recentChats.map((chat) => <ChatRow key={chat.id} chat={chat} active={state.activeChatId === chat.id} />)}
            {recentAgents.map((agent) => <button key={agent.id} className="recent-agent" onClick={() => dispatch({ type: "openAgent", id: agent.id })}><Bot size={13} /><span>{agent.name}</span></button>)}
          </div>}
        </section>
      </div>
      <footer className="sidebar-footer" ref={userArea}>
        {userMenuOpen && <div className="user-menu"><button onClick={() => { dispatch({ type: "settings", open: true }); setUserMenuOpen(false); }}><Settings size={15} /><span>Configurações</span></button></div>}
        <button className="user-row" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}><span className="avatar">{initials}</span><span className="user-name"><strong>{displayName}</strong></span></button>
        <button className={`runtime-location connection-${connection.level}`} title={`${runtime} · ${connection.detail}
Clique para abrir Remoto (computadores conectados)`} aria-label={`${runtime}: ${connection.label}. Abrir Remoto`} onClick={() => dispatch({ type: "view", view: "network" })}>{runsLocally ? <Monitor size={15} /> : <Cloud size={15} />}<i className="connection-line" aria-hidden="true"><b /></i></button>
      </footer>
    </aside>
  );
}

/** Uma conversa da lista, com o menu "⋯": fixar no topo, compartilhar e excluir. */
function ChatRow({ chat, active }: { chat: Chat; active: boolean }) {
  const { dispatch } = useStore();
  const [menu, setMenu] = useState<"main" | "share" | "delete" | null>(null);
  const [done, setDone] = useState<string>();
  const row = useRef<HTMLDivElement>(null);
  useDismiss(menu !== null, [row], () => setMenu(null));

  async function copy() {
    await navigator.clipboard.writeText(chatToMarkdown(chat)).catch(() => undefined);
    flash("Conversa copiada");
  }
  async function save() {
    try {
      const folders = await invoke<{ downloads: string }>("wf_known_folders");
      const path = await invoke<string>("wf_write_file", { folder: folders.downloads, name: chatFileName(chat.title), content: chatToMarkdown(chat), mode: "unique" });
      void invoke("fs_reveal", { path }).catch(() => undefined);
      flash("Salva em Downloads");
    } catch (error) {
      flash(`Não salvou: ${String(error)}`);
    }
  }
  function flash(text: string) {
    setMenu(null);
    setDone(text);
    setTimeout(() => setDone(undefined), 2200);
  }

  return <div ref={row} className={`chat-row ${active ? "active" : ""} ${menu ? "menu-open" : ""}`}>
    <button className="chat-row-main" onClick={() => dispatch({ type: "selectChat", id: chat.id })} title={chat.title}>
      {chat.pinned ? <Pin size={13} className="chat-pin" /> : <MessageSquare size={13} />}
      <span>{done ?? chat.title}</span>
    </button>
    <button className="chat-row-more" onClick={() => setMenu((value) => value ? null : "main")} aria-label={`Opções de ${chat.title}`} aria-expanded={menu !== null} title="Opções"><MoreHorizontal size={15} /></button>
    {menu === "main" && <div className="row-menu" role="menu">
      <button role="menuitem" onClick={() => { dispatch({ type: "togglePinChat", chatId: chat.id }); setMenu(null); }}>{chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{chat.pinned ? "Desafixar" : "Fixar no topo"}</span></button>
      <button role="menuitem" onClick={() => setMenu("share")}><Share2 size={14} /><span>Compartilhar</span><ChevronRight size={13} className="row-menu-next" /></button>
      <i className="row-menu-divider" />
      <button role="menuitem" className="danger" onClick={() => setMenu("delete")}><Trash2 size={14} /><span>Excluir</span></button>
    </div>}
    {menu === "share" && <div className="row-menu" role="menu">
      <button role="menuitem" onClick={() => void copy()}><Copy size={14} /><span>Copiar conversa</span></button>
      <button role="menuitem" onClick={() => void save()}><Download size={14} /><span>Salvar como .md em Downloads</span></button>
    </div>}
    {menu === "delete" && <div className="row-menu confirm" role="alertdialog" aria-label="Confirmar exclusão">
      <p>Excluir "{chat.title}"? Não dá para desfazer.</p>
      <div><button onClick={() => setMenu(null)}>Cancelar</button><button className="danger solid" onClick={() => { dispatch({ type: "deleteChat", chatId: chat.id }); setMenu(null); }}><Check size={13} />Excluir</button></div>
    </div>}
  </div>;
}
