import React, { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, Cpu, Terminal, Users, FileCode, Globe, 
  ShoppingBag, BarChart3, X, Minus, Square,
  Menu, PanelLeft, Search, ArrowLeft, ArrowRight, Code2, Plus, 
  MoreVertical, ChevronRight, Copy, FolderOpen, Sparkles, Command, Check,
  SlidersHorizontal, Settings, Columns2
} from "lucide-react";
import { 
  Project, ChatSession, Agent, Workflow, FileArtifact, 
  AppSettings, AgentTerminal, WorkspaceAreaKind, ModelConfig, ChatMessage 
} from "./types";
import Sidebar, { getProjectIcon } from "./components/Sidebar.tsx";
import ChatPanel from "./components/ChatPanel.tsx";
import WorkflowCanvas from "./components/WorkflowCanvas.tsx";
import TerminalPanel from "./components/TerminalPanel.tsx";
import AgentsPanel from "./components/AgentsPanel.tsx";
import FilesPanel from "./components/FilesPanel.tsx";
import BrowserPanel from "./components/BrowserPanel.tsx";
import MarketplacePanel from "./components/MarketplacePanel.tsx";
import DashboardPanel from "./components/DashboardPanel.tsx";
import SettingsDialog from "./components/SettingsDialog.tsx";

// Initial Mock Datasets matching Swift's MockData structures
const INITIAL_MODELS: ModelConfig[] = [
  // OpenAI Models
  { id: "gpt-4.5-preview", name: "GPT-4.5 Preview", provider: "openai", company: "OpenAI", apiModel: "gpt-4.5-preview", description: "Maior capacidade da OpenAI para tarefas ultra complexas", latency: "2.1s", status: "connected", contextWindow: 128000, strength: 85 },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", company: "OpenAI", apiModel: "gpt-4o", description: "Multimodal de alta inteligência e resposta veloz", latency: "1.1s", status: "connected", contextWindow: 128000, strength: 75 },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", company: "OpenAI", apiModel: "gpt-4o-mini", description: "Rápido, eficiente e de baixo custo computacional", latency: "0.6s", status: "connected", contextWindow: 128000, strength: 60 },
  { id: "o1", name: "o1", provider: "openai", company: "OpenAI", apiModel: "o1", description: "Raciocínio profundo e cadeias lógicas matemáticas", latency: "3.4s", status: "connected", contextWindow: 200000, strength: 95 },
  { id: "o3-mini", name: "o3-mini", provider: "openai", company: "OpenAI", apiModel: "o3-mini", description: "Raciocínio ágil de alta precisão técnica", latency: "1.4s", status: "connected", contextWindow: 200000, strength: 80 },
  { id: "gpt-5.5", name: "GPT 5.5 Turbo", provider: "openai", company: "OpenAI", apiModel: "gpt-5.5-turbo", description: "Excelente para automações e lógica estruturada", latency: "1.2s", status: "connected", contextWindow: 128000, strength: 80 },

  // Anthropic Models
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", provider: "anthropic", company: "Anthropic", apiModel: "claude-3-7-sonnet", description: "Raciocínio híbrido e padrão ouro em programação", latency: "1.6s", status: "connected", contextWindow: 200000, strength: 90 },
  { id: "claude-sonnet-4-5", name: "Claude 4.5 Sonnet", provider: "anthropic", company: "Anthropic", apiModel: "claude-4.5-sonnet", description: "Perfeito para codificação de ponta e design UI/UX", latency: "1.8s", status: "connected", contextWindow: 200000, strength: 85 },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", company: "Anthropic", apiModel: "claude-3-5-sonnet", description: "Líder consolidado em tarefas de engenharia", latency: "1.5s", status: "connected", contextWindow: 200000, strength: 80 },
  { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic", company: "Anthropic", apiModel: "claude-3-5-haiku", description: "Velocidade instantânea com alto nível de inteligência", latency: "0.5s", status: "connected", contextWindow: 200000, strength: 65 },

  // Google Models
  { id: "gemini-2-0-flash", name: "Gemini 2.0 Flash", provider: "google", company: "Google", apiModel: "gemini-2.0-flash", description: "Velocidade ultrarrápida de última geração e multimodal", latency: "0.8s", status: "connected", contextWindow: 1000000, strength: 75 },
  { id: "gemini-2-0-pro", name: "Gemini 2.0 Pro", provider: "google", company: "Google", apiModel: "gemini-2.0-pro-exp", description: "Raciocínio avançado e análise densa de código", latency: "2.0s", status: "connected", contextWindow: 2000000, strength: 90 },
  { id: "gemini-1-5-pro", name: "Gemini 1.5 Pro", provider: "google", company: "Google", apiModel: "gemini-1.5-pro", description: "Janela de contexto gigante de 2M tokens", latency: "1.9s", status: "connected", contextWindow: 2000000, strength: 85 },
  { id: "gemini-1-5-flash", name: "Gemini 1.5 Flash", provider: "google", company: "Google", apiModel: "gemini-1.5-flash", description: "Modelo versátil, leve e de alta velocidade", latency: "0.7s", status: "connected", contextWindow: 1000000, strength: 65 },

  // Meta / Local Models
  { id: "llama-3-3-local", name: "Llama 3.3 70B (Local)", provider: "local", company: "Meta / Local", apiModel: "llama3.3:70b", description: "Modelo offline potente rodando via Ollama local", latency: "0.4s", status: "local-active", contextWindow: 128000, strength: 75 },
  { id: "deepseek-r1-local", name: "DeepSeek R1 (Local)", provider: "local", company: "Meta / Local", apiModel: "deepseek-r1:32b", description: "Raciocínio aberto com cadeias de pensamento em sandbox", latency: "0.9s", status: "local-active", contextWindow: 64000, strength: 85 },
  { id: "llama-3-1-8b-local", name: "Llama 3.1 8B (Local)", provider: "local", company: "Meta / Local", apiModel: "llama3.1:8b", description: "Execução instantânea local com baixíssimo consumo", latency: "0.2s", status: "local-active", contextWindow: 32000, strength: 55 }
];

const INITIAL_PROJECTS: Project[] = [
  { id: "proj-1", name: "Automação de Deploys", chatIds: ["chat-1"], agentIds: ["agent-1"], dashboardIds: [], symbol: "⚡", iconColor: "cyan", isPinned: true, isArchived: false },
  { id: "proj-2", name: "Organizador de Arquivos", chatIds: ["chat-2"], agentIds: ["agent-2"], dashboardIds: [], symbol: "📁", iconColor: "blue", isPinned: false, isArchived: false }
];

const INITIAL_AGENTS: Agent[] = [
  {
    id: "agent-1",
    name: "Design Researcher",
    role: "Analista UX/UI & Front-end",
    modelId: "claude-sonnet-4-5",
    status: "idle",
    lastActive: "Há 5 min",
    permissions: ["read_workspace_files", "access_network_interfaces"],
    tools: ["web_browser", "file_reader"],
    prompt: "Você é o Design Researcher. Seu foco é inspecionar o código visual e sugerir melhorias estéticas de layout seguindo design minimalista e brutalista.",
    isSystem: true,
    isPinned: true,
    isArchived: false
  },
  {
    id: "agent-2",
    name: "File Organizer Agent",
    role: "Assistente de Diretórios",
    modelId: "llama-3-3-local",
    status: "idle",
    lastActive: "Há 12 min",
    permissions: ["read_workspace_files", "write_workspace_files"],
    tools: ["file_reader", "file_writer", "directory_lister"],
    prompt: "Você organiza caminhos e arquivos de diretórios locais de forma autônoma e segura.",
    isSystem: true,
    isPinned: false,
    isArchived: false
  },
  {
    id: "agent-3",
    name: "MCP Bridge Controller",
    role: "Injetor de Skills",
    modelId: "gpt-5.5",
    status: "running",
    lastActive: "Ativo agora",
    permissions: ["run_terminal_commands", "modify_automation_workflows"],
    tools: ["mcp_skill_injector", "shell_executor"],
    prompt: "Você gerencia integrações de ferramentas de terceiros no sandbox local do macOS.",
    isSystem: false,
    isPinned: false,
    isArchived: false
  }
];

const INITIAL_CHATS: ChatSession[] = [
  {
    id: "chat-1",
    title: "Análise Estética Brutalista",
    modelId: "claude-sonnet-4-5",
    date: "12 de Julho",
    isPinned: true,
    isArchived: false,
    messages: [
      {
        id: "msg-1",
        sender: "user",
        text: "Pode sugerir uma estrutura brutalista para o meu portfólio?",
        timestamp: "19:00"
      },
      {
        id: "msg-2",
        sender: "assistant",
        modelUsed: "Claude 4.5 Sonnet",
        responseTime: "1.4",
        text: "Claro! Preparei um plano de ação estético e o arquivo de especificações em CSS brutalista para o seu portfólio. Aqui está:",
        timestamp: "19:01",
        blocks: [
          {
            id: "blk-1",
            type: "actionPlan",
            title: "Especificação do Portfólio",
            steps: [
              { id: "step-1", title: "Definir tipografia display mono", description: "Usar JetBrains Mono em tamanho grande", done: true },
              { id: "step-2", title: "Configurar cores de alto contraste", description: "Bordas pretas grossas com fundo amarelo/neon", done: true },
              { id: "step-3", title: "Montar esqueleto de seções", description: "Divs simples e margens assimétricas", done: false }
            ]
          },
          {
            id: "blk-2",
            type: "code",
            title: "styles.css brutalista",
            language: "css",
            code: `:root {\n  --bg-color: #f3f4f6;\n  --text-color: #000000;\n  --accent: #ff0055;\n}\n\nbody {\n  font-family: 'JetBrains Mono', monospace;\n  background: var(--bg-color);\n  color: var(--text-color);\n  padding: 3rem;\n}\n\n.card {\n  border: 4px solid #000000;\n  box-shadow: 8px 8px 0px #000000;\n  padding: 1.5rem;\n  background: #ffffff;\n  transition: transform 0.1s;\n}\n\n.card:hover {\n  transform: translate(-2px, -2px);\n  box-shadow: 10px 10px 0px #000000;\n}`
          }
        ]
      }
    ]
  },
  {
    id: "chat-2",
    title: "Sincronizador de Arquivos Locais",
    modelId: "llama-3-3-local",
    date: "10 de Julho",
    isPinned: false,
    isArchived: false,
    messages: [
      {
        id: "msg-3",
        sender: "user",
        text: "Pode verificar a integridade dos arquivos locais?",
        timestamp: "15:00"
      },
      {
        id: "msg-4",
        sender: "assistant",
        modelUsed: "Llama 3.3 (Local)",
        responseTime: "0.2",
        text: "Encontrei uma discrepância no arquivo de visualização. Executei o diff das correções sugeridas para você revisar:",
        timestamp: "15:01",
        blocks: [
          {
            id: "blk-3",
            type: "fileDiff",
            title: "Corrigir index.html",
            filePath: "index.html",
            diffInfo: {
              filePath: "index.html",
              addedCount: 2,
              removedCount: 1,
              lines: [
                { id: "dl-1", type: "neutral", text: "  <head>" },
                { id: "dl-2", type: "remove", text: "    <title>Open Assistant Prototype</title>" },
                { id: "dl-3", type: "add", text: "    <title>Open Assistant - macOS Console</title>" },
                { id: "dl-4", type: "add", text: "    <link rel=\"stylesheet\" href=\"styles.css\" />" },
                { id: "dl-5", type: "neutral", text: "  </head>" }
              ]
            }
          }
        ]
      }
    ]
  }
];

const INITIAL_WORKFLOW: Workflow = {
  id: "wf-1",
  name: "Pipeline de Análise e Visualização",
  description: "Dispara ações de IA sempre que arquivos do workspace sofrem mudanças.",
  isActive: true,
  nodes: [
    { id: "node-1", name: "Disparador de Mudança", type: "trigger", x: 60, y: 160, status: "idle", description: "Dispara ao detectar modificações em arquivos.", config: { path: "./src/" }, allowSelfEdit: true, requiresApproval: false },
    { id: "node-2", name: "Analisador Visual", type: "watcher", x: 260, y: 160, status: "idle", description: "Mapeia layouts buscando inconsistências.", config: { focus: "CSS" }, allowSelfEdit: true, requiresApproval: false },
    { id: "node-3", name: "Agente de Design", type: "agent", x: 460, y: 160, status: "idle", description: "Processa revisões estéticas de layout.", config: { agentName: "Design Researcher" }, temperature: 0.7, allowSelfEdit: true, requiresApproval: false },
    { id: "node-4", name: "Gerador de Correção", type: "writer", x: 660, y: 160, status: "idle", description: "Grava arquivos modificados com as melhorias.", config: { target: "styles.css" }, allowSelfEdit: true, requiresApproval: true }
  ],
  connections: [
    { id: "conn-1", fromId: "node-1", toId: "node-2" },
    { id: "conn-2", fromId: "node-2", toId: "node-3" },
    { id: "conn-3", fromId: "node-3", toId: "node-4" }
  ],
  frames: [
    { id: "frame-1", name: "Análise Estética", kind: "parallel", x: 30, y: 100, width: 840, height: 210, config: {}, nodeIds: ["node-1", "node-2", "node-3", "node-4"], isEnabled: true }
  ]
};

const INITIAL_FILES: FileArtifact[] = [
  {
    id: "file-1",
    name: "brutalist-ui-2026.txt",
    type: "TXT",
    size: "1.2 KB",
    createdBy: "Design Researcher",
    date: "12 de Julho",
    path: "./workspace/brutalist-ui-2026.txt",
    content: "CONCEITO DO DESIGN BRUTALISTA DE SOFTWARE (2026)\n\n1. Tipografia Gigante e Crua: JetBrains Mono ou Courier de alta legibilidade.\n2. Cores Saturadas: Neon, amarelos fluorescentes, azuis profundos.\n3. Sem bordas arredondadas delicadas: Bordas duras e grossas de 2px ou 3px.\n4. Sombras duras e sólidas (box-shadow: 8px 8px 0px #000).\n5. Negativação de margens e hierarquias limpas de dados sem firulas desnecessárias."
  },
  {
    id: "file-2",
    name: "index.html",
    type: "HTML",
    size: "420 Bytes",
    createdBy: "File Organizer Agent",
    date: "11 de Julho",
    path: "./workspace/index.html",
    content: "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>Open Assistant - macOS Console</title>\n  <link rel=\"stylesheet\" href=\"styles.css\" />\n</head>\n<body>\n  <div class=\"card\">\n    <h1>⚡ Brutalist Concept</h1>\n    <p>Visual compilado gerado por inteligência local.</p>\n  </div>\n</body>\n</html>"
  },
  {
    id: "file-3",
    name: "styles.css",
    type: "CSS",
    size: "640 Bytes",
    createdBy: "Design Researcher",
    date: "12 de Julho",
    path: "./workspace/styles.css",
    content: ":root {\n  --bg-color: #f3f4f6;\n  --text-color: #000000;\n}\n\nbody {\n  font-family: 'JetBrains Mono', monospace;\n  background: var(--bg-color);\n  color: var(--text-color);\n  padding: 3rem;\n}\n\n.card {\n  border: 4px solid #000000;\n  box-shadow: 8px 8px 0px #000000;\n  padding: 1.5rem;\n  background: #ffffff;\n}"
  }
];

const INITIAL_TERMINALS: AgentTerminal[] = [
  {
    id: "term-1",
    agentId: "agent-1",
    agentName: "Design Researcher",
    status: "idle",
    lastUpdated: "Ativo",
    logs: [
      { id: "log-1", timestamp: "19:00:02", type: "info", text: "Iniciando sandbox para o agente de design UX/UI" },
      { id: "log-2", timestamp: "19:00:15", type: "success", text: "Carregando módulo de análise visual do CSS local" },
      { id: "log-3", timestamp: "19:01:04", type: "info", text: "Mudanças estéticas compiladas com sucesso no arquivo styles.css" }
    ]
  },
  {
    id: "term-2",
    agentId: "agent-2",
    agentName: "File Organizer Agent",
    status: "idle",
    lastUpdated: "Ativo",
    logs: [
      { id: "log-4", timestamp: "15:00:10", type: "info", text: "Varrendo diretório de workspace buscando arquivos desorganizados..." },
      { id: "log-5", timestamp: "15:00:44", type: "warning", text: "Aviso: Encontrado arquivo redundante temp.log no root" },
      { id: "log-6", timestamp: "15:01:02", type: "success", text: "Arquivo index.html sincronizado com referências CSS brutalistas" }
    ]
  }
];

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    username: "André Machado",
    language: "Português (BR)",
    theme: "Dark Slate",
    defaultModel: "claude-sonnet-4-5"
  },
  apiKeys: {
    openai: "",
    anthropic: "",
    google: "",
    groq: "",
    openrouter: "",
    customProvider: "",
    customUrl: ""
  },
  localRuntime: {
    status: "connected",
    port: "3000",
    modelsInstalled: ["llama3.3", "qwen2.5-coder"],
    ollamaPort: 11434,
    openClawPort: 8000,
    defaultLocalModelTag: "llama3.3",
    showVisualInstall: true,
    allowLocalMCPBridge: true,
    localOnlyMode: false,
    runtimeStatePath: "~/.open-assistant/runtime.json"
  },
  skills: [
    { id: "fs-skill", name: "File System Automation", description: "Permite que agentes criem ou reescrevam arquivos locais.", permissions: ["write_files"], enabled: true },
    { id: "shell-skill", name: "Command Exec Control", description: "Permite executar scripts e compilar repositórios locais.", permissions: ["execute_shell"], enabled: false },
    { id: "vision-skill", name: "Vision UI Verification", description: "Permite analisar a tela para verificar falhas visuais.", permissions: ["view_screen"], enabled: true }
  ],
  appearance: {
    accentColor: "#55FCFF",
    blurIntensity: "normal",
    density: "normal",
    floatingAssistantEnabled: true,
    floatingAssistantCompact: true,
    floatingAssistantAutoShow: true,
    floatingAssistantOpacity: 0.95
  },
  fontSize: { global: 12, chat: 12, terminal: 11, code: 12 },
  voice: { language: "pt-BR", ttsProvider: "browser", selectedProfile: "Feminino", automaticallySpeakReplies: false },
  permissions: { readFile: true, writeFile: true, executeCommand: false, alterWorkflow: true, accessNetwork: true }
};

// Screen navigation items in top-right corner without text (Chat, Nodes, Terminal, Agents, Files, Marketplace, Dashboard)
const PANE_NAV_ITEMS: { kind: WorkspaceAreaKind; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { kind: "chat", label: "Chat de IA", icon: MessageSquare },
  { kind: "nodes", label: "Workflow de Nós", icon: Cpu },
  { kind: "terminal", label: "Terminal Logs", icon: Terminal },
  { kind: "agents", label: "Agentes Ativos", icon: Users },
  { kind: "files", label: "Explorador de Arquivos", icon: FileCode },
  { kind: "marketplace", label: "Marketplace Skills", icon: ShoppingBag },
  { kind: "dashboard", label: "Métricas Dashboard", icon: BarChart3 },
];

// Window titles and icons for each window pane header
const PANE_TITLES_INFO: Record<WorkspaceAreaKind, { title: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  chat: {
    title: "Chat de IA",
    icon: MessageSquare
  },
  nodes: {
    title: "Workflow de Nós",
    icon: Cpu
  },
  terminal: {
    title: "Terminal",
    icon: Terminal
  },
  agents: {
    title: "Agentes Ativos",
    icon: Users
  },
  files: {
    title: "Explorador de Arquivos",
    icon: FileCode
  },
  marketplace: {
    title: "Marketplace Skills",
    icon: ShoppingBag
  },
  dashboard: {
    title: "Métricas de Telemetria",
    icon: BarChart3
  },
  browser: {
    title: "Navegador Web",
    icon: Globe
  }
};

// Pane navigation button strip placed in top-right without text
function PaneNavigationIcons({
  currentKind,
  onSelectKind,
  onOpenSettings,
  onClosePane,
  showCloseButton = false,
}: {
  currentKind: WorkspaceAreaKind;
  onSelectKind: (kind: WorkspaceAreaKind) => void;
  onOpenSettings?: () => void;
  onClosePane?: () => void;
  showCloseButton?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 select-none translate-x-1 sm:translate-x-2">
      {PANE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.kind === currentKind;

        return (
          <button
            key={item.kind}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectKind(item.kind);
            }}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
              isActive
                ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
            title={item.label}
          >
            <Icon size={14} />
          </button>
        );
      })}

      {showCloseButton && onClosePane && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClosePane();
          }}
          className="relative z-30 h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors ml-0.5"
          title="Fechar Janela"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Interactive Corner Drag & Click Screen Splitter
// Multi-directional corner screen creation handle (L-shaped, placed right on borders, reveals mini-glow with 50% blur on hover)
type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function CornerScreenCreator({ 
  position,
  onStartDrag, 
  onSplit 
}: { 
  position: CornerPosition;
  onStartDrag: (position: CornerPosition, e: React.PointerEvent) => void;
  onSplit: (position: CornerPosition) => void;
}) {
  const getPositionClasses = () => {
    switch (position) {
      case "top-left":
        return "top-0 left-0 cursor-nwse-resize rounded-tl-2xl";
      case "top-right":
        return "top-0 right-0 cursor-nesw-resize rounded-tr-2xl";
      case "bottom-left":
        return "bottom-0 left-0 cursor-nesw-resize rounded-bl-2xl";
      case "bottom-right":
      default:
        return "bottom-0 right-0 cursor-nwse-resize rounded-br-2xl";
    }
  };

  const renderLShapeSVG = () => {
    switch (position) {
      case "top-left":
        return (
          <svg className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" viewBox="0 0 20 20" fill="none">
            <path d="M 17 3 L 7 3 C 4.8 3 3 4.8 3 7 L 3 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        );
      case "top-right":
        return (
          <svg className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" viewBox="0 0 20 20" fill="none">
            <path d="M 3 3 L 13 3 C 15.2 3 17 4.8 17 7 L 17 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        );
      case "bottom-left":
        return (
          <svg className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" viewBox="0 0 20 20" fill="none">
            <path d="M 3 3 L 3 13 C 3 15.2 4.8 17 7 17 L 17 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        );
      case "bottom-right":
      default:
        return (
          <svg className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" viewBox="0 0 20 20" fill="none">
            <path d="M 17 3 L 17 13 C 17 15.2 15.2 17 13 17 L 3 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        );
    }
  };

  return (
    <div
      onPointerDown={(e) => onStartDrag(position, e)}
      onClick={(e) => {
        e.stopPropagation();
        onSplit(position);
      }}
      className={`absolute z-40 flex items-center justify-center h-6 w-6 select-none opacity-0 hover:opacity-100 transition-all duration-150 group/corner bg-white/10 hover:bg-white/25 backdrop-blur-md shadow-[0_0_16px_rgba(255,255,255,0.5)] ${getPositionClasses()}`}
      title="Arraste para criar uma nova tela seguindo o cursor ou clique para dividir"
    >
      <div className="scale-90 group-hover/corner:scale-100 transition-transform flex items-center justify-center">
        {renderLShapeSVG()}
      </div>
    </div>
  );
}

export interface PaneItem {
  id: string;
  kind: WorkspaceAreaKind;
  chatId?: string;
  initialURL?: string;
}

export interface WorkspaceColumn {
  id: string;
  width: number; // percentage width
  panes: PaneItem[]; // vertically stacked panes
  paneHeights: number[]; // percentage heights (sums to 100)
}

interface GhostPreviewState {
  colIndex: number;
  paneIndex: number;
  direction: "left" | "right" | "top" | "bottom";
  rect: { top: number; left: number; width: number; height: number };
  kind: WorkspaceAreaKind;
}

function getKindPreviewLabel(kind: WorkspaceAreaKind) {
  switch (kind) {
    case "chat": return "Novo Chat";
    case "nodes": return "Novo Fluxo de Nós";
    case "terminal": return "Nova Sessão Terminal";
    case "agents": return "Matriz de Agentes";
    case "files": return "Explorador de Arquivos";
    case "browser": return "Nova Guia do Navegador";
    case "marketplace": return "Marketplace";
    case "dashboard": return "Dashboard";
    default: return "Nova Tela";
  }
}

export default function App() {
  const [currentKind, setCurrentKind] = useState<WorkspaceAreaKind>("chat");
  const [chats, setChats] = useState<ChatSession[]>(INITIAL_CHATS);
  const [activeChatId, setActiveChatId] = useState<string>("chat-1");
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [projects] = useState<Project[]>(INITIAL_PROJECTS);
  const [workflow, setWorkflow] = useState<Workflow>(INITIAL_WORKFLOW);
  const [files, setFiles] = useState<FileArtifact[]>(INITIAL_FILES);
  const [terminals, setTerminals] = useState<AgentTerminal[]>(INITIAL_TERMINALS);
  const [selectedAgentIdInPane, setSelectedAgentIdInPane] = useState<string | null>(null);
  const [activeTerminalName, setActiveTerminalName] = useState<string>("Design Researcher");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);

  // Multi-pane 2D workspace columns (supporting lateral columns and vertically stacked panes)
  const [columns, setColumns] = useState<WorkspaceColumn[]>([
    {
      id: "col-default-1",
      width: 100,
      panes: [{ id: "pane-default-1", kind: "chat", chatId: "chat-1" }],
      paneHeights: [100]
    }
  ]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizingDividerIndex, setResizingDividerIndex] = useState<number | null>(null);
  const [squeezedColIndex, setSqueezedColIndex] = useState<number | null>(null);
  const [squeezedPaneId, setSqueezedPaneId] = useState<string | null>(null);
  const [ghostPreview, setGhostPreview] = useState<GhostPreviewState | null>(null);

  // Close menus on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsAppMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsAppMenuOpen(false);
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Ensure columns widths sum to 100%
  useEffect(() => {
    if (columns.length === 1) {
      if (columns[0].width !== 100) {
        setColumns(prev => [{ ...prev[0], width: 100 }]);
      }
    }
  }, [columns.length]);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  // Helper to create a fresh screen state for any kind
  const createFreshPane = (kind: WorkspaceAreaKind): PaneItem => {
    const newPaneId = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    if (kind === "chat") {
      const newChatId = `chat-${Date.now()}`;
      const newChatCount = chats.length + 1;
      const newChat: ChatSession = {
        id: newChatId,
        title: `Novo Chat ${newChatCount}`,
        modelId: settings.general.defaultModel,
        date: "Hoje",
        isPinned: false,
        isArchived: false,
        messages: [
          {
            id: `msg-${Date.now()}`,
            sender: "system",
            text: "Canal aberto. Como posso auxiliar seu desenvolvimento hoje?",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]
      };
      
      // Update sidebar immediately with the new chat
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChatId);

      return {
        id: newPaneId,
        kind: "chat",
        chatId: newChatId
      };
    }

    if (kind === "browser") {
      return {
        id: newPaneId,
        kind: "browser",
        initialURL: "" // Fresh empty browser tab
      };
    }

    if (kind === "terminal") {
      const newTermId = `term-${Date.now()}`;
      const newTerm: AgentTerminal = {
        id: newTermId,
        agentId: "agent-1",
        agentName: `Terminal ${terminals.length + 1}`,
        status: "idle",
        lastUpdated: "Ativo",
        logs: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            type: "info",
            text: "Nova sessão de terminal isolada inicializada."
          }
        ]
      };
      setTerminals((prev) => [...prev, newTerm]);
      return {
        id: newPaneId,
        kind: "terminal"
      };
    }

    return {
      id: newPaneId,
      kind
    };
  };

  // Perform split creation in horizontal (left/right) or vertical (top/bottom) direction with custom split ratio
  const handleCreateSplit = (
    colIndex: number,
    paneIndex: number,
    direction: "left" | "right" | "top" | "bottom",
    sourceKind: WorkspaceAreaKind,
    splitRatio: number = 0.5
  ) => {
    const freshPane = createFreshPane(sourceKind);
    const clampedRatio = Math.max(0.15, Math.min(0.85, splitRatio));

    if (direction === "top" || direction === "bottom") {
      // Vertical split: add pane into the current column attached to parent pane
      setColumns((prev) => {
        return prev.map((col, cIdx) => {
          if (cIdx !== colIndex) return col;

          const newPanes = [...col.panes];
          const insertIdx = direction === "top" ? paneIndex : paneIndex + 1;
          newPanes.splice(insertIdx, 0, freshPane);

          // Get current height of the parent pane being split
          const curParentHeight = col.paneHeights[paneIndex] ?? (100 / col.panes.length);
          const childHeight = curParentHeight * clampedRatio;
          const remainingParentHeight = curParentHeight * (1 - clampedRatio);

          const newHeights = [...col.paneHeights];
          if (direction === "top") {
            newHeights.splice(paneIndex, 1, childHeight, remainingParentHeight);
          } else {
            newHeights.splice(paneIndex, 1, remainingParentHeight, childHeight);
          }

          return {
            ...col,
            panes: newPanes,
            paneHeights: newHeights
          };
        });
      });
    } else {
      // Horizontal split: add new column attached to parent column
      setColumns((prev) => {
        const updated = [...prev];
        const insertColIdx = direction === "left" ? colIndex : colIndex + 1;
        const curParentWidth = updated[colIndex]?.width ?? (100 / prev.length);

        const childWidth = curParentWidth * clampedRatio;
        const remainingParentWidth = curParentWidth * (1 - clampedRatio);

        const newCol: WorkspaceColumn = {
          id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          width: childWidth,
          panes: [freshPane],
          paneHeights: [100]
        };

        // Update parent col width
        updated[colIndex] = {
          ...updated[colIndex],
          width: remainingParentWidth
        };

        updated.splice(insertColIdx, 0, newCol);
        return updated;
      });
    }
  };

  // Multi-directional corner drag with real-time border-attached mouse tracking preview
  const handleStartCornerDrag = (
    colIndex: number,
    paneIndex: number,
    position: CornerPosition,
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const paneElem = (e.currentTarget.closest(".workspace-pane-card") || e.currentTarget.parentElement) as HTMLElement;
    const paneRect = paneElem 
      ? paneElem.getBoundingClientRect() 
      : { top: 0, left: 0, width: 300, height: 300, right: 300, bottom: 300 };
    
    const currentColumn = columns[colIndex];
    if (!currentColumn) return;
    const currentPane = currentColumn.panes[paneIndex];
    if (!currentPane) return;

    let activeDirection: "left" | "right" | "top" | "bottom" = "right";
    let activeRatio: number = 0.5;
    let hasMoved = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < 4 && !hasMoved) return;
      hasMoved = true;

      const mouseX = moveEvent.clientX;
      const mouseY = moveEvent.clientY;

      const isHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);

      // Boundaries of the parent pane
      const pLeft = paneRect.left;
      const pTop = paneRect.top;
      const pWidth = paneRect.width;
      const pHeight = paneRect.height;
      const pRight = pLeft + pWidth;
      const pBottom = pTop + pHeight;

      let previewTop = pTop;
      let previewLeft = pLeft;
      let previewWidth = pWidth;
      let previewHeight = pHeight;
      let calculatedRatio = 0.5;
      let dir: "left" | "right" | "top" | "bottom";

      if (position === "top-left") {
        if (isHorizontal) {
          // Attached to TOP, BOTTOM, and LEFT borders of parent pane
          dir = "left";
          previewTop = pTop;
          previewHeight = pHeight;
          previewLeft = pLeft;
          previewWidth = Math.max(40, Math.min(pWidth - 40, mouseX - pLeft));
          calculatedRatio = previewWidth / pWidth;
        } else {
          // Attached to LEFT, RIGHT, and TOP borders of parent pane
          dir = "top";
          previewLeft = pLeft;
          previewWidth = pWidth;
          previewTop = pTop;
          previewHeight = Math.max(40, Math.min(pHeight - 40, mouseY - pTop));
          calculatedRatio = previewHeight / pHeight;
        }
      } else if (position === "top-right") {
        if (isHorizontal) {
          // Attached to TOP, BOTTOM, and RIGHT borders of parent pane
          dir = "right";
          previewTop = pTop;
          previewHeight = pHeight;
          const targetLeft = Math.max(pLeft + 40, Math.min(pRight - 40, mouseX));
          previewLeft = targetLeft;
          previewWidth = pRight - targetLeft;
          calculatedRatio = previewWidth / pWidth;
        } else {
          // Attached to LEFT, RIGHT, and TOP borders of parent pane
          dir = "top";
          previewLeft = pLeft;
          previewWidth = pWidth;
          previewTop = pTop;
          previewHeight = Math.max(40, Math.min(pHeight - 40, mouseY - pTop));
          calculatedRatio = previewHeight / pHeight;
        }
      } else if (position === "bottom-left") {
        if (isHorizontal) {
          // Attached to TOP, BOTTOM, and LEFT borders of parent pane
          dir = "left";
          previewTop = pTop;
          previewHeight = pHeight;
          previewLeft = pLeft;
          previewWidth = Math.max(40, Math.min(pWidth - 40, mouseX - pLeft));
          calculatedRatio = previewWidth / pWidth;
        } else {
          // Attached to LEFT, RIGHT, and BOTTOM borders of parent pane
          dir = "bottom";
          previewLeft = pLeft;
          previewWidth = pWidth;
          const targetTop = Math.max(pTop + 40, Math.min(pBottom - 40, mouseY));
          previewTop = targetTop;
          previewHeight = pBottom - targetTop;
          calculatedRatio = previewHeight / pHeight;
        }
      } else {
        // bottom-right
        if (isHorizontal) {
          // Attached to TOP, BOTTOM, and RIGHT borders of parent pane
          dir = "right";
          previewTop = pTop;
          previewHeight = pHeight;
          const targetLeft = Math.max(pLeft + 40, Math.min(pRight - 40, mouseX));
          previewLeft = targetLeft;
          previewWidth = pRight - targetLeft;
          calculatedRatio = previewWidth / pWidth;
        } else {
          // Attached to LEFT, RIGHT, and BOTTOM borders of parent pane
          dir = "bottom";
          previewLeft = pLeft;
          previewWidth = pWidth;
          const targetTop = Math.max(pTop + 40, Math.min(pBottom - 40, mouseY));
          previewTop = targetTop;
          previewHeight = pBottom - targetTop;
          calculatedRatio = previewHeight / pHeight;
        }
      }

      activeDirection = dir;
      activeRatio = Math.max(0.15, Math.min(0.85, calculatedRatio));

      setGhostPreview({
        colIndex,
        paneIndex,
        direction: dir,
        rect: {
          top: previewTop,
          left: previewLeft,
          width: previewWidth,
          height: previewHeight
        },
        kind: currentPane.kind
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setGhostPreview(null);

      if (hasMoved && activeDirection) {
        // Drag release creates screen attached to the parent with exact dragged ratio
        handleCreateSplit(colIndex, paneIndex, activeDirection, currentPane.kind, activeRatio);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleClosePane = (colIndex: number, paneIndex: number) => {
    setColumns((prev) => {
      const targetCol = prev[colIndex];
      if (!targetCol) return prev;

      if (targetCol.panes.length > 1) {
        // Close pane inside the column and rebalance heights
        const newPanes = targetCol.panes.filter((_, idx) => idx !== paneIndex);
        const newHeights = new Array(newPanes.length).fill(100 / newPanes.length);
        return prev.map((col, cIdx) => (cIdx === colIndex ? { ...col, panes: newPanes, paneHeights: newHeights } : col));
      } else if (prev.length > 1) {
        // Close entire column and rebalance widths
        const newCols = prev.filter((_, idx) => idx !== colIndex);
        const equalWidth = 100 / newCols.length;
        return newCols.map((col) => ({ ...col, width: equalWidth }));
      }
      return prev;
    });
  };

  const handleUpdatePaneKind = (colIndex: number, paneIndex: number, kind: WorkspaceAreaKind) => {
    setColumns((prev) =>
      prev.map((col, cIdx) => {
        if (cIdx !== colIndex) return col;
        const updatedPanes = col.panes.map((p, pIdx) => {
          if (pIdx !== paneIndex) return p;
          return { ...p, kind };
        });
        return { ...col, panes: updatedPanes };
      })
    );
  };

  const handleSelectKindFromSidebar = (kind: WorkspaceAreaKind) => {
    setCurrentKind(kind);
    setColumns([
      {
        id: `col-${Date.now()}`,
        width: 100,
        panes: [{ id: `pane-${Date.now()}`, kind, chatId: kind === "chat" ? activeChatId : undefined }],
        paneHeights: [100]
      }
    ]);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        panes: col.panes.map((p) => (p.kind === "chat" ? { ...p, chatId } : p))
      }))
    );
  };

  // Horizontal column resizing with squeeze-to-close for entire column
  const handleStartResizeColumn = (dividerIndex: number, e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startColumns = [...columns];
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const totalWidthTwoCols = startColumns[dividerIndex].width + startColumns[dividerIndex + 1].width;

    let targetSqueezedColIndex: number | null = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaPercent = (deltaPx / containerWidth) * 100;

      let newWidthLeft = startColumns[dividerIndex].width + deltaPercent;
      let newWidthRight = startColumns[dividerIndex + 1].width - deltaPercent;

      // Allow dragging all the way to 1% to enable intuitive squeeze-to-close
      newWidthLeft = Math.max(1, Math.min(totalWidthTwoCols - 1, newWidthLeft));
      newWidthRight = totalWidthTwoCols - newWidthLeft;

      // Squeeze threshold (< 7% or < 9% of pair)
      if (newWidthLeft <= 7 || newWidthLeft / totalWidthTwoCols <= 0.09) {
        targetSqueezedColIndex = dividerIndex;
        setSqueezedColIndex(dividerIndex);
      } else if (newWidthRight <= 7 || newWidthRight / totalWidthTwoCols <= 0.09) {
        targetSqueezedColIndex = dividerIndex + 1;
        setSqueezedColIndex(dividerIndex + 1);
      } else {
        targetSqueezedColIndex = null;
        setSqueezedColIndex(null);
      }

      setColumns((prev) => {
        const updated = [...prev];
        if (updated[dividerIndex] && updated[dividerIndex + 1]) {
          updated[dividerIndex] = { ...updated[dividerIndex], width: newWidthLeft };
          updated[dividerIndex + 1] = { ...updated[dividerIndex + 1], width: newWidthRight };
        }
        return updated;
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setResizingDividerIndex(null);
      setSqueezedColIndex(null);

      // If user released while the column was squeezed, close the whole column and all its windows at once!
      if (targetSqueezedColIndex !== null && startColumns.length > 1) {
        setColumns((prev) => {
          if (prev.length <= 1) return prev;
          const remainingCols = prev.filter((_, idx) => idx !== targetSqueezedColIndex);
          const equalWidth = 100 / remainingCols.length;
          return remainingCols.map((col) => ({ ...col, width: equalWidth }));
        });
      }
    };

    setResizingDividerIndex(dividerIndex);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Vertical pane resizing inside column with squeeze-to-close for individual stacked panes
  const handleStartResizePane = (colIndex: number, dividerIndex: number, e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const targetCol = columns[colIndex];
    if (!targetCol) return;
    const startHeights = [...targetCol.paneHeights];
    const colElem = (e.currentTarget.closest(".workspace-column-container") || e.currentTarget.parentElement) as HTMLElement;
    const colHeight = colElem ? colElem.getBoundingClientRect().height : 600;
    const totalHeightTwoPanes = startHeights[dividerIndex] + startHeights[dividerIndex + 1];

    let targetSqueezedPaneId: string | null = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientY - startY;
      const deltaPercent = (deltaPx / colHeight) * 100;

      let newHeightTop = startHeights[dividerIndex] + deltaPercent;
      let newHeightBottom = startHeights[dividerIndex + 1] - deltaPercent;

      // Allow dragging all the way to 1% to enable intuitive squeeze-to-close
      newHeightTop = Math.max(1, Math.min(totalHeightTwoPanes - 1, newHeightTop));
      newHeightBottom = totalHeightTwoPanes - newHeightTop;

      // Squeeze threshold (< 7% or < 9% of pair)
      if (newHeightTop <= 7 || newHeightTop / totalHeightTwoPanes <= 0.09) {
        targetSqueezedPaneId = targetCol.panes[dividerIndex]?.id || null;
        setSqueezedPaneId(targetSqueezedPaneId);
      } else if (newHeightBottom <= 7 || newHeightBottom / totalHeightTwoPanes <= 0.09) {
        targetSqueezedPaneId = targetCol.panes[dividerIndex + 1]?.id || null;
        setSqueezedPaneId(targetSqueezedPaneId);
      } else {
        targetSqueezedPaneId = null;
        setSqueezedPaneId(null);
      }

      setColumns((prev) => {
        return prev.map((col, cIdx) => {
          if (cIdx !== colIndex) return col;
          const nextHeights = [...col.paneHeights];
          nextHeights[dividerIndex] = newHeightTop;
          nextHeights[dividerIndex + 1] = newHeightBottom;
          return { ...col, paneHeights: nextHeights };
        });
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setSqueezedPaneId(null);

      // If user released while this pane was squeezed, close this pane!
      if (targetSqueezedPaneId !== null) {
        setColumns((prev) => {
          const col = prev[colIndex];
          if (!col) return prev;

          if (col.panes.length > 1) {
            const newPanes = col.panes.filter((p) => p.id !== targetSqueezedPaneId);
            const newHeights = new Array(newPanes.length).fill(100 / newPanes.length);
            return prev.map((c, cIdx) => (cIdx === colIndex ? { ...c, panes: newPanes, paneHeights: newHeights } : c));
          } else if (prev.length > 1) {
            // Only 1 pane in this column and it was squeezed, close the column
            const newCols = prev.filter((_, idx) => idx !== colIndex);
            const equalWidth = 100 / newCols.length;
            return newCols.map((c) => ({ ...c, width: equalWidth }));
          }
          return prev;
        });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Total count of panes across all columns
  const totalPanesCount = columns.reduce((acc, col) => acc + col.panes.length, 0);

  // Create a new empty chat session
  const handleCreateNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newChat: ChatSession = {
      id: newId,
      title: `Conversa com IA ${chats.length + 1}`,
      modelId: settings.general.defaultModel,
      date: "Hoje",
      isPinned: false,
      isArchived: false,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: "system",
          text: "Canal aberto. Como posso auxiliar seu desenvolvimento hoje?",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
  };

  // Sincronizar modificações do arquivo editável do editor
  const handleUpdateFile = (updatedFile: FileArtifact) => {
    setFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? updatedFile : f)));
    
    // Add nice log to design researcher terminal
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminals((prev) =>
      prev.map((t) =>
        t.agentId === "agent-1"
          ? {
              ...t,
              logs: [
                ...t.logs,
                {
                  id: `log-${Date.now()}`,
                  timestamp,
                  type: "success",
                  text: `Arquivo sincronizado localmente: ${updatedFile.path} (${updatedFile.size})`
                }
              ]
            }
          : t
      )
    );
  };

  // Clear agent terminal logs list
  const handleClearTerminal = (terminalId: string) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === terminalId ? { ...t, logs: [] } : t))
    );
  };

  // Send interactive sandbox commands
  const handleSendCommand = (terminalId: string, cmd: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminals((prev) =>
      prev.map((t) => {
        if (t.id !== terminalId) return t;
        
        let replyLog: any = {
          id: `log-reply-${Date.now()}`,
          timestamp,
          type: "info",
          text: `Executando: ${cmd}...`
        };

        if (cmd === "git status") {
          replyLog = {
            id: `log-reply-${Date.now()}`,
            timestamp,
            type: "success",
            text: "No branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean"
          };
        } else if (cmd === "npm run start") {
          replyLog = {
            id: `log-reply-${Date.now()}`,
            timestamp,
            type: "success",
            text: "> open-assistant@0.1.0 dev\n> tsx server.ts\n\nServer running on port 3000..."
          };
        } else {
          replyLog = {
            id: `log-reply-${Date.now()}`,
            timestamp,
            type: "error",
            text: `Erro: Comando '${cmd}' não permitido no ambiente Sandbox.`
          };
        }

        return {
          ...t,
          logs: [
            ...t.logs,
            { id: `log-cmd-${Date.now()}`, timestamp, type: "input", text: cmd },
            replyLog
          ]
        };
      })
    );
  };

  // Execute workflow step-by-step
  const handleRunWorkflowStep = async (nodeId: string) => {
    // 1. Set status to running
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, status: "running", progress: 20 } : n))
    }));

    // Add log entry
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminals((prev) =>
      prev.map((t) =>
        t.agentId === "agent-1"
          ? {
              ...t,
              logs: [
                ...t.logs,
                { id: `log-wf-${Date.now()}`, timestamp, type: "info", text: `Iniciando etapa do workflow: ${nodeId}` }
              ]
            }
          : t
      )
    );

    // 2. Simulate progress ticking
    await new Promise((resolve) => setTimeout(resolve, 300));
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, progress: 60 } : n))
    }));

    await new Promise((resolve) => setTimeout(resolve, 300));

    // 3. Complete step
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, status: "success", progress: 100 } : n))
    }));

    setTerminals((prev) =>
      prev.map((t) =>
        t.agentId === "agent-1"
          ? {
              ...t,
              logs: [
                ...t.logs,
                { id: `log-wf-ok-${Date.now()}`, timestamp, type: "success", text: `Sucesso na etapa do workflow: ${nodeId}` }
              ]
            }
          : t
      )
    );
  };

  // Send message from chat box to Express proxy endpoint
  const handleSendMessage = async (text: string, modelId: string) => {
    // Append user message immediately
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      id: `user-msg-${Date.now()}`,
      sender: "user",
      text,
      timestamp
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, messages: [...c.messages, userMsg], modelId } : c
      )
    );

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          systemInstruction: INITIAL_AGENTS[0].prompt,
          history: activeChat.messages
        })
      });

      if (!response.ok) {
        throw new Error("Falha ao comunicar com o servidor proxy");
      }

      const data = await response.json();

      // Append model output
      const modelMsg: ChatMessage = {
        id: `assistant-msg-${Date.now()}`,
        sender: "assistant",
        text: data.text,
        modelUsed: data.modelUsed || "Gemini AI",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        blocks: data.blocks || []
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, messages: [...c.messages, modelMsg] } : c
        )
      );

    } catch (err: any) {
      console.error(err);
      const errMsg: ChatMessage = {
        id: `err-msg-${Date.now()}`,
        sender: "assistant",
        text: `Erro na comunicação: ${err.message || "Por favor, tente novamente."}`,
        modelUsed: "Error Handling",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        blocks: []
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, messages: [...c.messages, errMsg] } : c
        )
      );
    }
  };

  const handleUpdateAgent = (updatedAgent: Agent) => {
    setAgents((prev) => prev.map((a) => (a.id === updatedAgent.id ? updatedAgent : a)));
  };

  return (
    <div className="relative flex h-full w-full select-none overflow-hidden bg-[#17181c] text-[#eceef4] font-sans antialiased">
      {/* Background ambient layer to accentuate sidebar & panel frosted glass blur */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-blue-900/10 blur-3xl" />
        <div className="absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-emerald-900/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 h-96 w-96 rounded-full bg-purple-900/10 blur-3xl" />
        <div className="absolute top-1/2 right-10 h-96 w-96 rounded-full bg-indigo-900/10 blur-3xl" />
        
        {/* Subtle grid pattern in the background */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`, 
            backgroundSize: '24px 24px' 
          }} 
        />
      </div>

      {/* Outer App Frame */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* Unified Native Windows Title Bar */}
        <header className="h-9 w-full bg-[#16171b] border-b border-white/[0.06] flex items-center justify-between text-zinc-400 select-none z-50 shrink-0 text-xs shadow-sm">
          {/* Left Area: Menu, Sidebar Toggle, Search, Navigation and Active Context Tabs */}
          <div className="flex items-center h-full pl-2 gap-1 min-w-0 flex-1 overflow-hidden mr-2">
            {/* Main App Menu (Hamburger) */}
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                  isAppMenuOpen ? "bg-white/15 text-white" : "hover:bg-white/10 text-zinc-300 hover:text-white"
                }`}
                title="Menu Principal"
              >
                <Menu size={14} />
              </button>

              {/* Menu Context Dropdown */}
              {isAppMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-60 rounded-xl border border-zinc-700/90 bg-[#212227] p-1.5 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 select-none">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Open Assistant
                  </div>

                  <div className="space-y-0.5 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleCreateNewChat();
                        setIsAppMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Plus size={13} className="text-zinc-400" />
                        Novo Chat
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+N</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSidebarCollapsed(!isSidebarCollapsed);
                        setIsAppMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <PanelLeft size={13} className="text-zinc-400" />
                        {isSidebarCollapsed ? "Expandir Sidebar" : "Ocultar Sidebar"}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+B</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(true);
                        setIsAppMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Search size={13} className="text-zinc-400" />
                        Pesquisar Workspace
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+P</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleSplitPane(0);
                        setIsAppMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Columns2 size={13} className="text-zinc-400" />
                        Dividir Janela
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+\</span>
                    </button>

                    <div className="h-px bg-white/10 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(true);
                        setIsAppMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <SlidersHorizontal size={13} className="text-zinc-400" />
                        Configurações
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ctrl+,</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Toggle Button (Collapse sidebar Ctrl+B) */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                !isSidebarCollapsed ? "bg-white/10 text-white" : "hover:bg-white/10 text-zinc-400 hover:text-white"
              }`}
              title={isSidebarCollapsed ? "Expand sidebar Ctrl+B" : "Collapse sidebar Ctrl+B"}
            >
              <PanelLeft size={14} />
            </button>

            {/* Search Quick Command Button */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
              title="Pesquisar ou executar comando (Ctrl+P)"
            >
              <Search size={13} />
            </button>
          </div>

          {/* Right Area: Native Windows Window Controls (Minimize, Maximize/Restore, Close) */}
          <div className="flex items-center h-full shrink-0">
            <button 
              type="button"
              onClick={() => {}} 
              className="h-full w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Minimizar"
            >
              <Minus size={11} strokeWidth={1.5} />
            </button>
            <button 
              type="button"
              onClick={() => setIsMaximized(!isMaximized)} 
              className="h-full w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={isMaximized ? "Restaurar" : "Maximizar"}
            >
              {isMaximized ? (
                <Copy size={10} strokeWidth={1.2} className="rotate-180" />
              ) : (
                <Square size={10} strokeWidth={1.2} />
              )}
            </button>
            <button 
              type="button"
              onClick={() => {}} 
              className="h-full w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#c42b1c] transition-colors cursor-pointer"
              title="Fechar"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Main Body with Translucent Sidebar and Workspace */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Sidebar Translucency with frosted backdrop */}
          {!isSidebarCollapsed && (
            <Sidebar
              currentKind={columns[0]?.panes[0]?.kind || "chat"}
              onSelectKind={handleSelectKindFromSidebar}
              projects={INITIAL_PROJECTS}
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={handleSelectChat}
              onCreateNewChat={handleCreateNewChat}
              onOpenSettings={() => setIsSettingsOpen(true)}
              accentColor={settings.appearance.accentColor}
            />
          )}

          {/* Main Panel Multi-Pane Layout with 2D Columns and Rows */}
          <main ref={containerRef} className="flex-1 overflow-hidden h-full flex flex-row bg-[#1b1c20]/60 p-1.5 gap-1.5 backdrop-blur-sm relative">
            {columns.map((column, colIndex) => {
              const colWidth = `${column.width}%`;
              const isColumnSqueezed = squeezedColIndex === colIndex;

              return (
                <React.Fragment key={column.id}>
                  <div 
                    style={{ width: colWidth }}
                    className={`workspace-column-container relative flex flex-col h-full overflow-hidden shrink-0 gap-1.5 transition-all ${
                      isColumnSqueezed ? "border-2 border-red-500/80 ring-4 ring-red-500/30 opacity-70 scale-[0.98] rounded-2xl" : ""
                    }`}
                  >
                    {isColumnSqueezed && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-950/70 backdrop-blur-sm pointer-events-none rounded-2xl border border-red-500/60 transition-all">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/40 border border-red-400/60 text-red-100 text-xs font-medium shadow-xl">
                          <X size={14} className="text-red-300 animate-pulse" />
                          <span>Solte para fechar coluna ({column.panes.length} {column.panes.length > 1 ? "janelas" : "janela"})</span>
                        </div>
                      </div>
                    )}

                    {column.panes.map((pane, paneIndex) => {
                      const kind = pane.kind;
                      const isPaneSqueezed = squeezedPaneId === pane.id;
                      const paneHeight = column.paneHeights[paneIndex] !== undefined 
                        ? `${column.paneHeights[paneIndex]}%` 
                        : `${100 / column.panes.length}%`;

                      const paneChatSession = chats.find((c) => c.id === (pane.chatId || activeChatId)) || activeChat;

                      return (
                        <React.Fragment key={pane.id}>
                          <div 
                            style={{ height: paneHeight }}
                            className={`workspace-pane-card relative flex flex-col w-full overflow-hidden rounded-2xl border bg-[#212126]/95 backdrop-blur-xl shadow-2xl transition-all group shrink-0 ${
                              isPaneSqueezed
                                ? "border-red-500/90 ring-4 ring-red-500/30 opacity-70 scale-[0.98]"
                                : "border-white/[0.06]"
                            }`}
                          >
                            {isPaneSqueezed && (
                              <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-950/70 backdrop-blur-sm pointer-events-none rounded-2xl border border-red-500/60 transition-all">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/40 border border-red-400/60 text-red-100 text-xs font-medium shadow-xl">
                                  <X size={14} className="text-red-300 animate-pulse" />
                                  <span>Solte para fechar janela</span>
                                </div>
                              </div>
                            )}

                            {/* For chat screen: unified with Chat title bar. For other screens: top bar matching chat canvas background with blank top-left and top-right navigation icons */}
                            {kind === "chat" ? (
                              <div className="flex-1 overflow-hidden h-full bg-transparent">
                                <ChatPanel
                                  session={paneChatSession}
                                  models={INITIAL_MODELS}
                                  onSendMessage={handleSendMessage}
                                  accentColor={settings.appearance.accentColor}
                                  projects={projects}
                                  headerActions={
                                    <PaneNavigationIcons
                                      currentKind="chat"
                                      onSelectKind={(newKind) => handleUpdatePaneKind(colIndex, paneIndex, newKind)}
                                      onOpenSettings={() => setIsSettingsOpen(true)}
                                      onClosePane={() => handleClosePane(colIndex, paneIndex)}
                                      showCloseButton={totalPanesCount > 1}
                                    />
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                {/* Pane Top Window Bar for non-chat screens matching chat title styling: large text, no subtitle, white icons */}
                                {(() => {
                                  let title = "Janela";
                                  let PaneIcon = Cpu;
                                  let showBack = false;

                                  switch (kind) {
                                    case "nodes":
                                      title = "Workflow de Nós";
                                      PaneIcon = Cpu;
                                      break;
                                    case "terminal":
                                      title = `Terminal / ${activeTerminalName || "Design Researcher"}`;
                                      PaneIcon = Terminal;
                                      break;
                                    case "agents": {
                                      const activeAgent = selectedAgentIdInPane ? agents.find((a) => a.id === selectedAgentIdInPane) : null;
                                      if (activeAgent) {
                                        title = activeAgent.name;
                                        showBack = true;
                                      } else {
                                        title = "Agentes Ativos";
                                      }
                                      PaneIcon = Users;
                                      break;
                                    }
                                    case "files":
                                      title = "Explorador de Arquivos";
                                      PaneIcon = FileCode;
                                      break;
                                    case "marketplace":
                                      title = "Marketplace Skills";
                                      PaneIcon = ShoppingBag;
                                      break;
                                    case "dashboard":
                                      title = "Métricas de Telemetria";
                                      PaneIcon = BarChart3;
                                      break;
                                    case "browser":
                                      title = "Navegador Web";
                                      PaneIcon = Globe;
                                      break;
                                    default:
                                      title = "Janela";
                                      PaneIcon = Cpu;
                                      break;
                                  }

                                  return (
                                    <div className="z-20 min-h-[64px] sm:min-h-[72px] bg-[#212126] px-6 pt-5 pb-5 flex items-center justify-between shrink-0 select-none border-b border-white/[0.04]">
                                      {/* Top Left: Window Title with clean white icon and large font matching chat */}
                                      <div className="flex items-center gap-2.5 min-w-0 pr-4">
                                        {showBack && (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedAgentIdInPane(null)}
                                            className="text-white hover:text-blue-300 transition-colors flex items-center gap-1 mr-1 cursor-pointer active:scale-95"
                                            title="Voltar aos Agentes"
                                          >
                                            <ArrowLeft size={22} className="text-white shrink-0" />
                                          </button>
                                        )}
                                        <PaneIcon size={22} className="text-white shrink-0" />
                                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-none truncate">
                                          {title}
                                        </h1>
                                      </div>

                                      {/* Top Right: Icons without text + Close Button */}
                                      <div className="flex items-center shrink-0 mr-2 -translate-y-0.5">
                                        <PaneNavigationIcons
                                          currentKind={kind}
                                          onSelectKind={(newKind) => handleUpdatePaneKind(colIndex, paneIndex, newKind)}
                                          onOpenSettings={() => setIsSettingsOpen(true)}
                                          onClosePane={() => handleClosePane(colIndex, paneIndex)}
                                          showCloseButton={totalPanesCount > 1}
                                        />
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Main Render Route inside Window Pane */}
                                <div className="flex-1 overflow-hidden h-full bg-transparent">
                                  {kind === "nodes" && (
                                    <WorkflowCanvas
                                      workflow={workflow}
                                      onUpdateWorkflow={setWorkflow}
                                      onRunWorkflowStep={handleRunWorkflowStep}
                                      accentColor={settings.appearance.accentColor}
                                    />
                                  )}

                                  {kind === "terminal" && (
                                    <TerminalPanel
                                      terminals={terminals}
                                      onClearTerminal={handleClearTerminal}
                                      onSendCommand={handleSendCommand}
                                      accentColor={settings.appearance.accentColor}
                                      onActiveTerminalNameChange={(name) => setActiveTerminalName(name)}
                                    />
                                  )}

                                  {kind === "agents" && (
                                    <AgentsPanel
                                      agents={agents}
                                      models={INITIAL_MODELS}
                                      onUpdateAgent={handleUpdateAgent}
                                      accentColor={settings.appearance.accentColor}
                                      workflow={workflow}
                                      onUpdateWorkflow={setWorkflow}
                                      onRunWorkflowStep={handleRunWorkflowStep}
                                      activeAgentId={selectedAgentIdInPane}
                                      onActiveAgentIdChange={(agentId) => setSelectedAgentIdInPane(agentId)}
                                    />
                                  )}

                                  {kind === "files" && (
                                    <FilesPanel
                                      files={files}
                                      onUpdateFile={handleUpdateFile}
                                      accentColor={settings.appearance.accentColor}
                                    />
                                  )}

                                  {kind === "browser" && (
                                    <BrowserPanel
                                      initialURL={pane.initialURL !== undefined ? pane.initialURL : "http://localhost:3000/brutalist-preview.html"}
                                      accentColor={settings.appearance.accentColor}
                                    />
                                  )}

                                  {kind === "marketplace" && (
                                    <MarketplacePanel
                                      accentColor={settings.appearance.accentColor}
                                    />
                                  )}

                                  {kind === "dashboard" && (
                                    <DashboardPanel
                                      accentColor={settings.appearance.accentColor}
                                    />
                                  )}
                                </div>
                              </>
                            )}

                            {/* 4-Corner Real-time Screen Creation Buttons (Invisible by default, reveals mini-glow with 50% blur on hover) */}
                            <CornerScreenCreator 
                              position="top-left"
                              onStartDrag={(pos, e) => handleStartCornerDrag(colIndex, paneIndex, pos, e)}
                              onSplit={() => handleCreateSplit(colIndex, paneIndex, "left", kind)} 
                            />
                            <CornerScreenCreator 
                              position="top-right"
                              onStartDrag={(pos, e) => handleStartCornerDrag(colIndex, paneIndex, pos, e)}
                              onSplit={() => handleCreateSplit(colIndex, paneIndex, "right", kind)} 
                            />
                            <CornerScreenCreator 
                              position="bottom-left"
                              onStartDrag={(pos, e) => handleStartCornerDrag(colIndex, paneIndex, pos, e)}
                              onSplit={() => handleCreateSplit(colIndex, paneIndex, "left", kind)} 
                            />
                            <CornerScreenCreator 
                              position="bottom-right"
                              onStartDrag={(pos, e) => handleStartCornerDrag(colIndex, paneIndex, pos, e)}
                              onSplit={() => handleCreateSplit(colIndex, paneIndex, "right", kind)} 
                            />
                          </div>

                          {/* Horizontal divider between vertically stacked panes in the same column */}
                          {paneIndex < column.panes.length - 1 && (
                            <div
                              onPointerDown={(e) => handleStartResizePane(colIndex, paneIndex, e)}
                              className="group/resizer-h relative flex items-center justify-center h-1.5 hover:h-2 active:h-2 cursor-row-resize transition-all shrink-0 z-30 select-none w-full bg-white/5 hover:bg-white/20 active:bg-white/30"
                              title="Arraste para redimensionar altura da tela"
                            >
                              <div className="w-6 h-0.5 rounded-full bg-zinc-600 group-hover/resizer-h:bg-zinc-300 transition-colors" />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Vertical separator divider between adjacent columns */}
                  {colIndex < columns.length - 1 && (
                    <div
                      onPointerDown={(e) => handleStartResizeColumn(colIndex, e)}
                      className={`group/resizer-v relative flex items-center justify-center w-1.5 hover:w-2 active:w-2 cursor-col-resize transition-all shrink-0 z-30 select-none h-full ${
                        resizingDividerIndex === colIndex
                          ? "bg-white/30"
                          : "bg-white/5 hover:bg-white/20 active:bg-white/30"
                      }`}
                      title="Arraste para redimensionar largura da coluna"
                    >
                      <div className="h-6 w-0.5 rounded-full bg-zinc-600 group-hover/resizer-v:bg-zinc-300 transition-colors" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Ghost Preview Layer with White Blur during Real-Time Multi-Directional Drag */}
            {ghostPreview && (
              <div 
                style={{
                  top: `${ghostPreview.rect.top}px`,
                  left: `${ghostPreview.rect.left}px`,
                  width: `${ghostPreview.rect.width}px`,
                  height: `${ghostPreview.rect.height}px`,
                }}
                className="fixed z-50 pointer-events-none rounded-2xl bg-white/15 backdrop-blur-md border-2 border-white/50 shadow-[0_0_35px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center text-white transition-all duration-75 select-none animate-in fade-in zoom-in-95"
              >
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/25 border border-white/40 backdrop-blur-lg shadow-lg font-bold text-xs">
                  <Plus size={13} className="text-white drop-shadow" />
                  <span>{getKindPreviewLabel(ghostPreview.kind)}</span>
                </div>
                <span className="text-[11px] text-white/85 mt-1.5 font-medium tracking-wide">
                  {ghostPreview.direction === "top" || ghostPreview.direction === "bottom" ? "Divisão Vertical" : "Divisão Lateral"}
                </span>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Quick Search & Command Palette Modal Layer */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100"
          onClick={() => setIsSearchOpen(false)}
        >
          <div 
            ref={searchModalRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl border border-zinc-700/80 bg-[#1e1f24] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-[#191a1e]">
              <Search size={16} className="text-zinc-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Pesquisar chats, projetos, agentes ou digitar comandos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <span className="text-[10px] bg-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                ESC
              </span>
            </div>

            {/* Quick Filtered Results */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
              <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Ações Rápidas
              </div>

              <button
                type="button"
                onClick={() => {
                  handleCreateNewChat();
                  setIsSearchOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-zinc-200 hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Plus size={14} className="text-blue-400" />
                  <div>
                    <p className="font-medium text-white">Criar Novo Chat</p>
                    <p className="text-[11px] text-zinc-400">Inicia uma nova sessão de conversa com IA</p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Ctrl+N</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSplitPane(0);
                  setIsSearchOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-zinc-200 hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Columns2 size={14} className="text-purple-400" />
                  <div>
                    <p className="font-medium text-white">Dividir Janela de Trabalho</p>
                    <p className="text-[11px] text-zinc-400">Cria uma nova tela lado a lado</p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Ctrl+\</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSidebarCollapsed(!isSidebarCollapsed);
                  setIsSearchOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-zinc-200 hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <PanelLeft size={14} className="text-emerald-400" />
                  <div>
                    <p className="font-medium text-white">{isSidebarCollapsed ? "Expandir Barra Lateral" : "Recolher Barra Lateral"}</p>
                    <p className="text-[11px] text-zinc-400">Alterna visibilidade da barra de navegação</p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Ctrl+B</span>
              </button>

              {/* Chats Filtered */}
              <div className="pt-2">
                <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Chats Recentes
                </div>
                {chats
                  .filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 4)
                  .map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => {
                        setActiveChatId(chat.id);
                        handleSelectKindFromSidebar("chat");
                        setIsSearchOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-zinc-200 hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <MessageSquare size={13} className="text-zinc-400 shrink-0" />
                        <span className="truncate">{chat.title}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">{chat.lastActive}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Layer */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
        onNavigateToMarketplace={() => handleSelectKindFromSidebar("marketplace")}
        onImmediateColorChange={(color) => {
          setSettings((prev) => ({
            ...prev,
            appearance: { ...prev.appearance, accentColor: color }
          }));
        }}
      />
    </div>
  );
}
