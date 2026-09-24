import React, { useState } from "react";
import { 
  MessageSquare, Cpu, Terminal, Users, 
  ShoppingBag, Plus, Settings, Folder, FolderOpen,
  Code2, FolderTree, Layers, Boxes, ChevronRight, ChevronDown, FileText
} from "lucide-react";
import { Project, ChatSession, WorkspaceAreaKind } from "../types";

interface SidebarProps {
  currentKind: WorkspaceAreaKind;
  onSelectKind: (kind: WorkspaceAreaKind) => void;
  projects: Project[];
  chats: ChatSession[];
  activeChatId?: string;
  onSelectChat: (id: string) => void;
  onCreateNewChat: () => void;
  onOpenSettings: () => void;
  accentColor: string;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
}

// Icon mapper for project symbols (replaces all emojis with icons)
export function getProjectIcon(symbol: string, size = 13, className = "text-zinc-400") {
  switch (symbol?.toLowerCase()) {
    case "code":
    case "code2":
    case "⚡":
      return <Code2 size={size} className={className} />;
    case "folder":
    case "foldertree":
    case "📁":
      return <FolderTree size={size} className={className} />;
    case "layers":
      return <Layers size={size} className={className} />;
    case "boxes":
    default:
      return <Boxes size={size} className={className} />;
  }
}

export default function Sidebar({
  currentKind,
  onSelectKind,
  projects,
  chats,
  activeChatId,
  onSelectChat,
  onCreateNewChat,
  onOpenSettings,
  accentColor,
  selectedProjectId,
  onSelectProject
}: SidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    "proj-1": true,
    "proj-2": true
  });

  const toggleProject = (projId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projId]: !prev[projId] }));
    if (onSelectProject) {
      onSelectProject(selectedProjectId === projId ? null : projId);
    }
  };
  
  const menuItems: { kind: WorkspaceAreaKind; label: string; icon: any }[] = [
    { kind: "chat", label: "Chats de IA", icon: MessageSquare },
    { kind: "nodes", label: "Workflows de Nós", icon: Cpu },
    { kind: "terminal", label: "Terminais Logs", icon: Terminal },
    { kind: "agents", label: "Agentes Ativos", icon: Users },
    { kind: "marketplace", label: "Marketplace Skills", icon: ShoppingBag }
  ];

  return (
    <aside className="relative flex h-full w-[240px] flex-col border-r border-white/5 bg-[#17181c]/80 backdrop-blur-2xl p-3 text-white select-none shrink-0 z-20 shadow-2xl">
      {/* Header Profile - Windows styled */}
      <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1 border-b border-white/5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 font-bold text-white text-xs border border-white/10 shadow-sm">
          OA
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-semibold tracking-tight text-white truncate">Open Assistant</h1>
          <p className="text-[9px] text-zinc-400 font-mono">Workspace</p>
        </div>
      </div>

      {/* Main Sections */}
      <div className="flex-1 space-y-4 overflow-y-auto py-3">
        {/* Workspace Modules */}
        <div>
          <h3 className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Módulos do Painel</h3>
          <div className="mt-1 space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentKind === item.kind;
              return (
                <button
                  key={item.kind}
                  onClick={() => onSelectKind(item.kind)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                    isActive 
                      ? "bg-white/10 text-white font-semibold shadow-sm" 
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-zinc-100" : "text-zinc-400"} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Projects list - Clean Icons without emojis */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Meus Projetos</h3>
          </div>
          <div className="mt-1 space-y-1">
            {projects.map((proj) => {
              const isExpanded = !!expandedProjects[proj.id];
              const projectChats = chats.filter(c => proj.chatIds.includes(c.id));
              const isSelected = selectedProjectId === proj.id;

              return (
                <div key={proj.id} className="space-y-0.5">
                  <div
                    onClick={() => toggleProject(proj.id)}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer group ${
                      isSelected ? "bg-white/10 text-white font-semibold" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                      )}
                      {getProjectIcon(proj.symbol, 13, isSelected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200")}
                      <span className="truncate">{proj.name}</span>
                    </div>
                    <span className="text-[9px] rounded bg-white/5 px-1.5 py-0.5 text-zinc-400 font-mono">
                      {projectChats.length}
                    </span>
                  </div>

                  {/* Project Nested Chats */}
                  {isExpanded && projectChats.length > 0 && (
                    <div className="pl-5 pr-1 space-y-0.5">
                      {projectChats.map((pChat) => {
                        const isChatActive = activeChatId === pChat.id && currentKind === "chat";
                        return (
                          <button
                            key={pChat.id}
                            onClick={() => {
                              onSelectKind("chat");
                              onSelectChat(pChat.id);
                            }}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors truncate ${
                              isChatActive 
                                ? "bg-white/15 text-white font-medium shadow-sm" 
                                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                          >
                            <FileText size={10} className={isChatActive ? "text-white shrink-0" : "text-zinc-500 shrink-0"} />
                            <span className="truncate">{pChat.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Standalone Chats History */}
        {currentKind === "chat" && (
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Histórico de Chats</h3>
              <button 
                onClick={onCreateNewChat}
                className="rounded p-0.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
                title="Novo Chat"
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="mt-1 max-h-[160px] overflow-y-auto space-y-0.5">
              {chats.map((chat) => {
                const isActive = activeChatId === chat.id;
                return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isActive ? "bg-white/10 text-white font-semibold" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="truncate pr-2">{chat.title}</span>
                    {chat.isPinned && <span className="text-[8px] rounded bg-white/10 px-1 text-zinc-200 font-bold">Fixado</span>}
                  </button>
                );
              })}
              {chats.length === 0 && (
                <p className="px-2.5 py-1.5 text-[10px] text-zinc-500 italic">Sem chats salvos</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="border-t border-white/5 pt-3">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-all duration-200"
        >
          <Settings size={14} className="text-zinc-400" />
          <span>Configurações</span>
        </button>
      </div>
    </aside>
  );
}
