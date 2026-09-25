import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { hasWorkspaceArea, isValidWorkspaceLayout, type ViewKind, type WorkspaceArea, type WorkspaceLayoutNode, type WorkspaceSplit } from "../utils/workspaceLayout";
import { DEFAULT_ORBITAL_SKIN, isOrbitalSkin, type OrbitalSkin } from "../utils/orbitalState";
import { DEFAULT_EFFORT, isEffortLevel, type EffortLevel } from "../utils/effort";
import type { AccessMode, AgentStep } from "../utils/agentRunner";
import { NEW_CHAT_TITLE, titleFromMessage } from "../utils/chatTitle";
import { EMPTY_MEMORY, restoreMemory, type MemoryFact, type UserMemory } from "../utils/memory";

export type { ViewKind, WorkspaceArea, WorkspaceLayoutNode, WorkspaceSplit } from "../utils/workspaceLayout";

export type Theme = "dark" | "light" | "system";
export type SettingsTab = "general" | "memory" | "providers" | "models" | "tools" | "voice" | "mcp" | "runtimes" | "permissions";

/** Ação reconhecida sem o modelo (catálogo da skill ou camada semântica). */
export interface ActionCandidate {
  id: string;
  risk: string;
  slots: Record<string, string>;
  label: string;
  score?: number;
}

/** Pedido de ação no PC feito com "Controlar o PC" desligado: o chat oferece ligar e executar. */
export interface ActionOffer {
  /** Texto original do pedido (reenviado ao agente). */
  request: string;
  /** Opções prováveis quando a frase não era exata ("Você quis dizer…"). */
  candidates?: ActionCandidate[];
  /** Já respondida (botão usado ou dispensado). */
  resolved?: boolean;
}

/** "/skill" ou "@conector" escolhido no compositor. */
export interface Invocation {
  kind: "skill" | "mcp";
  id: string;
  label: string;
}

/** Preferências do modo voz. Ids de modelo vêm de `utils/toolCatalog.ts`. */
export interface VoiceSettings {
  /** Modelo de reconhecimento escolhido; vazio = o recomendado entre os instalados. */
  asrModel?: string;
  /** `system` (Windows) ou uma voz Piper; vazio = a recomendada entre as instaladas. */
  ttsVoice?: string;
  /** `deviceId` do microfone; vazio = padrão do Windows. */
  micDeviceId?: string;
  language: string;
  speed: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  time: string;
  loading?: boolean;
  /** Quem gerou a resposta, por exemplo `Ollama (qwen3.5:9b)`. */
  source?: string;
  tokensPerSecond?: number;
  /** Tokens gerados na resposta (`eval_count` do Ollama / `predicted_n` do BitNet). */
  tokens?: number;
  thinking?: string;
  error?: boolean;
  /** Modelo escolhido quando a resposta foi pedida (ex.: `Ollama: qwen3.5:9b`). */
  model?: string;
  /** Início da geração (epoch ms), para o cronômetro do indicador de raciocínio. */
  startedAt?: number;
  /** Tempo até o primeiro trecho da resposta final. */
  thinkingMs?: number;
  thinkingTokens?: number;
  /** Passos do agente (modo "Controlar o PC"), exibidos acima da resposta. */
  steps?: AgentStep[];
  /** Oferta de ligar "Controlar o PC" para executar o pedido. */
  offer?: ActionOffer;
  /** O que a IA aprendeu com a mensagem anterior (aviso "Memória atualizada"). */
  memoryNote?: string[];
  /** Skills/conectores invocados com "/" e "@" nesta mensagem do usuário. */
  invocations?: Invocation[];
}

export interface WorkflowNode {
  id: string;
  title: string;
  description: string;
  type: "input" | "agent" | "tool" | "output";
  x: number;
  y: number;
}

export interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
  fromPort?: number;
  toPort?: number;
}

export interface WorkflowFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssistantAgent {
  id: string;
  name: string;
  role: string;
  workspace: "workflow" | "terminal";
  status: string;
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  projectId?: string;
}

export interface AppState {
  layoutVersion: number;
  activeView: ViewKind;
  activeAreaId: string;
  workspaceLayout: WorkspaceLayoutNode;
  secondaryView: ViewKind;
  splitEnabled: boolean;
  splitRatio: number;
  sidebarCollapsed: boolean;
  settingsOpen: boolean;
  /** Pedido pontual para abrir Configurações numa aba/modelo específico. */
  settingsTab?: SettingsTab;
  settingsFocusModel?: string;
  /** Aviso mostrado ao abrir Configurações (ex.: "adicione uma chave de API"). */
  settingsNotice?: string;
  paletteOpen: boolean;
  /** Último modelo local escolhido; usado por conversas novas. */
  preferredModel?: string;
  theme: Theme;
  accent: string;
  orbitalSkin: OrbitalSkin;
  /** Versão do rosto padrão; ao subir, o novo padrão substitui a skin salva. */
  faceVersion: number;
  effort: EffortLevel;
  voice: VoiceSettings;
  /** Modo "Controlar o PC": as mensagens vão para o agente com ferramentas. */
  agentMode: boolean;
  /** Permissão do agente: Perguntar / Automático / Somente leitura. */
  access: AccessMode;
  /** Memória do usuário (Configurações › Memória + o que a IA aprendeu); entra em todos os prompts. */
  memory: UserMemory;
  activeChatId: string;
  chats: Chat[];
  projects: Project[];
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  frames: WorkflowFrame[];
  agents: AssistantAgent[];
  currentAgentId: string;
}

type Action =
  | { type: "view"; view: ViewKind }
  | { type: "secondaryView"; view: ViewKind }
  | { type: "toggleSplit" }
  | { type: "splitRatio"; value: number }
  | { type: "sidebar" }
  | { type: "settings"; open: boolean; tab?: SettingsTab; focusModel?: string; notice?: string }
  | { type: "renameChat"; chatId: string; title: string }
  | { type: "palette"; open: boolean }
  | { type: "theme"; theme: Theme }
  | { type: "accent"; accent: string }
  | { type: "setOrbitalSkin"; skin: OrbitalSkin }
  | { type: "setEffort"; effort: EffortLevel }
  | { type: "setVoice"; patch: Partial<VoiceSettings> }
  | { type: "setAgentMode"; on: boolean }
  | { type: "setAccess"; access: AccessMode }
  | { type: "setMemory"; patch: Partial<UserMemory> }
  | { type: "updateFact"; id: string; text: string }
  | { type: "removeFact"; id: string }
  | { type: "addFact"; fact: MemoryFact }
  | { type: "sendMessage"; text: string }
  | { type: "moveNode"; id: string; x: number; y: number }
  | { type: "connectNodes"; from: string; to: string; fromPort?: number; toPort?: number }
  | { type: "removeConnection"; id: string }
  | { type: "addNode"; nodeType: WorkflowNode["type"]; title?: string; description?: string }
  | { type: "removeNode"; id: string }
  | { type: "addFrame" }
  | { type: "moveFrame"; id: string; x: number; y: number }
  | { type: "resizeFrame"; id: string; width: number; height: number }
  | { type: "removeFrame"; id: string }
  | { type: "addAgent"; workspace: AssistantAgent["workspace"] }
  | { type: "openAgent"; id: string }
  | { type: "activateArea"; id: string }
  | { type: "splitArea"; id: string; axis: WorkspaceSplit["axis"]; fraction: number; newAreaFirst: boolean }
  | { type: "updateWorkspaceSplit"; id: string; fraction: number }
  | { type: "collapseWorkspaceSplit"; id: string; keep: "first" | "second" }
  | { type: "newProject" }
  | { type: "newChat"; projectId?: string }
  | { type: "selectChat"; id: string }
  | { type: "addMessage"; chatId: string; message: ChatMessage }
  | { type: "updateMessage"; chatId: string; messageId: string; patch: Partial<Omit<ChatMessage, "id">> }
  | { type: "setModel"; chatId: string; model: string };

function isArea(node: WorkspaceLayoutNode): node is WorkspaceArea { return "view" in node; }
function updateAreaView(node: WorkspaceLayoutNode, id: string, view: ViewKind): WorkspaceLayoutNode {
  if (isArea(node)) return node.id === id ? { ...node, view } : node;
  return { ...node, first: updateAreaView(node.first, id, view), second: updateAreaView(node.second, id, view) };
}
function splitArea(node: WorkspaceLayoutNode, id: string, axis: WorkspaceSplit["axis"], fraction: number, newAreaFirst: boolean): WorkspaceLayoutNode {
  if (isArea(node)) {
    if (node.id !== id) return node;
    const created: WorkspaceArea = { id: crypto.randomUUID(), view: node.view };
    return { id: crypto.randomUUID(), axis, fraction: Math.min(.999, Math.max(.001, fraction)), first: newAreaFirst ? created : node, second: newAreaFirst ? node : created };
  }
  return { ...node, first: splitArea(node.first, id, axis, fraction, newAreaFirst), second: splitArea(node.second, id, axis, fraction, newAreaFirst) };
}
function updateSplit(node: WorkspaceLayoutNode, id: string, fraction: number): WorkspaceLayoutNode {
  if (isArea(node)) return node;
  if (node.id === id) return { ...node, fraction: Math.min(.999, Math.max(.001, fraction)) };
  return { ...node, first: updateSplit(node.first, id, fraction), second: updateSplit(node.second, id, fraction) };
}
function collapseSplit(node: WorkspaceLayoutNode, id: string, keep: "first" | "second"): WorkspaceLayoutNode {
  if (isArea(node)) return node;
  if (node.id === id) return keep === "first" ? node.first : node.second;
  return { ...node, first: collapseSplit(node.first, id, keep), second: collapseSplit(node.second, id, keep) };
}
function firstArea(node: WorkspaceLayoutNode): WorkspaceArea { return isArea(node) ? node : firstArea(node.first); }

const initialState: AppState = {
  layoutVersion: 4,
  activeView: "chat",
  activeAreaId: "chat-area",
  workspaceLayout: {
    id: "root-split", axis: "horizontal", fraction: .64,
    first: { id: "chat-area", view: "chat" },
    second: { id: "workflow-area", view: "workflow" },
  },
  secondaryView: "workflow",
  splitEnabled: true,
  splitRatio: 0.64,
  sidebarCollapsed: false,
  settingsOpen: false,
  paletteOpen: false,
  theme: "dark",
  accent: "#b7b7bd",
  orbitalSkin: DEFAULT_ORBITAL_SKIN,
  faceVersion: 2,
  effort: DEFAULT_EFFORT,
  voice: { language: "pt", speed: 1 },
  agentMode: false,
  access: "Perguntar",
  memory: EMPTY_MEMORY,
  activeChatId: "welcome",
  chats: [
    {
      id: "welcome",
      title: "Conversa inicial",
      model: "",
      messages: [
        {
          id: "hello",
          sender: "assistant",
          text: "Olá! Seu workspace Windows está pronto. Posso ajudar a planejar, programar e coordenar seus agentes locais.",
          time: "agora",
        },
      ],
    },
  ],
  projects: [{ id: "open-assistant", name: "Open Assistant" }],
  nodes: [
    { id: "trigger", title: "Nova mensagem", description: "Entrada do usuário", type: "input", x: 90, y: 140 },
    { id: "agent", title: "Agente principal", description: "Planeja e executa", type: "agent", x: 380, y: 115 },
    { id: "tool", title: "Ferramentas", description: "Terminal e arquivos", type: "tool", x: 675, y: 225 },
    { id: "response", title: "Resposta", description: "Entrega ao usuário", type: "output", x: 955, y: 135 },
  ],
  connections: [
    { id: "trigger-agent", from: "trigger", to: "agent", fromPort: 1, toPort: 0 },
    { id: "agent-tool", from: "agent", to: "tool", fromPort: 3, toPort: 0 },
    { id: "tool-response", from: "tool", to: "response", fromPort: 3, toPort: 0 },
  ],
  frames: [
    { id: "main-frame", title: "Fluxo principal", x: 48, y: 72, width: 1180, height: 390 },
    { id: "tools-frame", title: "Ferramentas locais", x: 620, y: 190, width: 330, height: 245 },
  ],
  agents: [
    { id: "orchestrator", name: "Orquestrador", role: "Coordena tarefas e ferramentas", workspace: "workflow", status: "Ativo" },
    { id: "reviewer", name: "Code Reviewer", role: "Analisa qualidade e segurança", workspace: "workflow", status: "Disponível" },
    { id: "powershell-agent", name: "PowerShell Runner", role: "Executa automações locais", workspace: "terminal", status: "Disponível" },
  ],
  currentAgentId: "orchestrator",
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "view": return { ...state, activeView: action.view, workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, action.view) };
    case "secondaryView": return { ...state, secondaryView: action.view };
    case "toggleSplit": return { ...state, splitEnabled: !state.splitEnabled };
    case "splitRatio": return { ...state, splitRatio: Math.min(0.8, Math.max(0.25, action.value)) };
    case "sidebar": return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case "settings": return { ...state, settingsOpen: action.open, settingsTab: action.open ? action.tab : undefined, settingsFocusModel: action.open ? action.focusModel : undefined, settingsNotice: action.open ? action.notice : undefined };
    case "renameChat": return { ...state, chats: state.chats.map((chat) => chat.id === action.chatId ? { ...chat, title: action.title } : chat) };
    case "palette": return { ...state, paletteOpen: action.open };
    case "theme": return { ...state, theme: action.theme };
    case "accent": return { ...state, accent: action.accent };
    case "setOrbitalSkin": return { ...state, orbitalSkin: action.skin };
    case "setEffort": return { ...state, effort: action.effort };
    case "setVoice": return { ...state, voice: { ...state.voice, ...action.patch } };
    case "setAgentMode": return { ...state, agentMode: action.on };
    case "setAccess": return { ...state, access: action.access };
    case "setMemory": return { ...state, memory: { ...state.memory, ...action.patch } };
    case "addFact": return { ...state, memory: { ...state.memory, facts: [...state.memory.facts, action.fact] } };
    case "updateFact": return { ...state, memory: { ...state.memory, facts: state.memory.facts.map((fact) => fact.id === action.id ? { ...fact, text: action.text } : fact) } };
    case "removeFact": return { ...state, memory: { ...state.memory, facts: state.memory.facts.filter((fact) => fact.id !== action.id) } };
    case "moveNode": return { ...state, nodes: state.nodes.map((node) => node.id === action.id ? { ...node, x: action.x, y: action.y } : node) };
    case "connectNodes": {
      if (action.from === action.to || state.connections.some((connection) => connection.from === action.from && connection.to === action.to && (connection.fromPort ?? 0) === (action.fromPort ?? 0) && (connection.toPort ?? 0) === (action.toPort ?? 0))) return state;
      return { ...state, connections: [...state.connections, { id: crypto.randomUUID(), from: action.from, to: action.to, fromPort: action.fromPort, toPort: action.toPort }] };
    }
    case "removeConnection": return { ...state, connections: state.connections.filter((connection) => connection.id !== action.id) };
    case "addNode": {
      const id = crypto.randomUUID();
      const titles: Record<WorkflowNode["type"], [string, string]> = { input: ["Entrada", "Recebe dados"], agent: ["Agente", "Processa contexto"], tool: ["Ferramenta", "Executa uma ação"], output: ["Saída", "Entrega resultado"] };
      const [defaultTitle, defaultDescription] = titles[action.nodeType];
      const title = action.title ?? defaultTitle;
      const description = action.description ?? defaultDescription;
      return { ...state, nodes: [...state.nodes, { id, title, description, type: action.nodeType, x: 260 + (state.nodes.length % 3) * 220, y: 150 + (state.nodes.length % 2) * 170 }] };
    }
    case "removeNode": return { ...state, nodes: state.nodes.filter((node) => node.id !== action.id), connections: state.connections.filter((connection) => connection.from !== action.id && connection.to !== action.id) };
    case "addFrame": {
      const offset = state.frames.length * 24;
      return { ...state, frames: [...state.frames, { id: crypto.randomUUID(), title: `Frame ${state.frames.length + 1}`, x: 90 + offset, y: 95 + offset, width: 520, height: 300 }] };
    }
    case "moveFrame": return { ...state, frames: state.frames.map((frame) => frame.id === action.id ? { ...frame, x: action.x, y: action.y } : frame) };
    case "resizeFrame": return { ...state, frames: state.frames.map((frame) => frame.id === action.id ? { ...frame, width: Math.max(260, action.width), height: Math.max(160, action.height) } : frame) };
    case "removeFrame": return { ...state, frames: state.frames.filter((frame) => frame.id !== action.id) };
    case "addAgent": {
      const id = crypto.randomUUID();
      const count = state.agents.length + 1;
      const name = action.workspace === "terminal" ? `Agente Terminal ${count}` : `Agente Workflow ${count}`;
      return { ...state, agents: [...state.agents, { id, name, role: action.workspace === "terminal" ? "Executa comandos e automações locais" : "Orquestra nodes e ferramentas", workspace: action.workspace, status: "Disponível" }] };
    }
    case "openAgent": {
      const agent = state.agents.find((item) => item.id === action.id);
      if (!agent) return state;
      const view = agent.workspace;
      return { ...state, currentAgentId: agent.id, activeView: view, workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, view) };
    }
    case "activateArea": {
      const findArea = (node: WorkspaceLayoutNode): WorkspaceArea | undefined => isArea(node) ? (node.id === action.id ? node : undefined) : findArea(node.first) ?? findArea(node.second);
      const area = findArea(state.workspaceLayout);
      return area ? { ...state, activeAreaId: area.id, activeView: area.view } : state;
    }
    case "splitArea": return { ...state, workspaceLayout: splitArea(state.workspaceLayout, action.id, action.axis, action.fraction, action.newAreaFirst) };
    case "updateWorkspaceSplit": return { ...state, workspaceLayout: updateSplit(state.workspaceLayout, action.id, action.fraction) };
    case "collapseWorkspaceSplit": {
      const layout = collapseSplit(state.workspaceLayout, action.id, action.keep);
      const fallback = firstArea(layout);
      const activeStillExists = (() => { const visit = (node: WorkspaceLayoutNode): boolean => isArea(node) ? node.id === state.activeAreaId : visit(node.first) || visit(node.second); return visit(layout); })();
      return { ...state, workspaceLayout: layout, activeAreaId: activeStillExists ? state.activeAreaId : fallback.id, activeView: activeStillExists ? state.activeView : fallback.view };
    }
    case "newProject": {
      const id = crypto.randomUUID();
      return { ...state, projects: [...state.projects, { id, name: `Novo projeto ${state.projects.length + 1}` }] };
    }
    case "newChat": {
      const id = crypto.randomUUID();
      const chats = withoutEmptyChat(state.chats, state.activeChatId);
      return { ...state, activeChatId: id, activeView: "chat", workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, "chat"), chats: [{ id, title: NEW_CHAT_TITLE, model: state.preferredModel ?? "", messages: [], projectId: action.projectId }, ...chats] };
    }
    case "selectChat": {
      const chats = action.id === state.activeChatId ? state.chats : withoutEmptyChat(state.chats, state.activeChatId);
      return { ...state, chats, activeChatId: action.id, activeView: "chat", workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, "chat") };
    }
    case "sendMessage": {
      const message: ChatMessage = { id: crypto.randomUUID(), sender: "user", text: action.text, time: "agora" };
      return { ...state, chats: state.chats.map((chat) => chat.id === state.activeChatId ? { ...chat, messages: [...chat.messages, message] } : chat) };
    }
    case "addMessage": {
      return {
        ...state,
        chats: state.chats.map((chat) => {
          if (chat.id !== action.chatId) return chat;
          // A primeira pergunta dá nome à conversa (o ChatView refina depois com o modelo local).
          const firstQuestion = action.message.sender === "user" && chat.title === NEW_CHAT_TITLE && !chat.messages.some((message) => message.sender === "user");
          return { ...chat, title: firstQuestion ? titleFromMessage(action.message.text) : chat.title, messages: [...chat.messages, action.message] };
        }),
      };
    }
    case "updateMessage": {
      return {
        ...state,
        chats: state.chats.map((chat) =>
          chat.id === action.chatId
            ? {
                ...chat,
                messages: chat.messages.map((m) =>
                  m.id === action.messageId
                    ? { ...m, ...action.patch }
                    : m
                ),
              }
            : chat
        ),
      };
    }
    case "setModel": {
      return {
        ...state,
        preferredModel: /^(Ollama|BitNet|Nuvem): /.test(action.model) ? action.model : state.preferredModel,
        chats: state.chats.map((chat) =>
          chat.id === action.chatId ? { ...chat, model: action.model } : chat
        ),
      };
    }
    default: return state;
  }
}

/** Conversa vazia que o usuário deixou sem usar é apagada para não acumular "Nova conversa". */
function withoutEmptyChat(chats: Chat[], leavingId: string): Chat[] {
  return chats.filter((chat) => chat.id !== leavingId || chat.messages.length > 0);
}

/** Ao abrir o app: some com conversas vazias (exceto a ativa) e nomeia as antigas "Nova conversa". */
function tidyChats(chats: Chat[], activeId: string): Chat[] {
  return chats
    .filter((chat) => chat.messages.length > 0 || chat.id === activeId)
    .map((chat) => {
      const first = chat.messages.find((message) => message.sender === "user");
      return chat.title === NEW_CHAT_TITLE && first ? { ...chat, title: titleFromMessage(first.text) } : chat;
    });
}

/** Respostas que estavam sendo geradas quando o app fechou não voltam a "pensar" para sempre. */
function settleInterruptedMessages(chats: Chat[]): Chat[] {
  return chats.map((chat) => ({ ...chat, messages: chat.messages.map((message) => message.loading ? { ...message, loading: false, text: message.text || "Resposta interrompida." } : message) }));
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

/** Provedor do estado global; restaura do localStorage e aplica tema/cor a cada mudança. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (fallback) => {
    try {
      const stored = localStorage.getItem("open-assistant-state-v2");
      const restored = stored ? JSON.parse(stored) : null;
      if (!restored) return fallback;
      const layoutIsCurrent = restored.layoutVersion === fallback.layoutVersion
        && isValidWorkspaceLayout(restored.workspaceLayout)
        && hasWorkspaceArea(restored.workspaceLayout, restored.activeAreaId);
      return { ...fallback, ...restored, layoutVersion: fallback.layoutVersion, activeAreaId: layoutIsCurrent ? (restored.activeAreaId ?? fallback.activeAreaId) : fallback.activeAreaId, activeView: layoutIsCurrent ? (restored.activeView ?? fallback.activeView) : fallback.activeView, workspaceLayout: layoutIsCurrent ? (restored.workspaceLayout ?? fallback.workspaceLayout) : fallback.workspaceLayout, accent: ["#d8d8dc", "#b7b7bd", "#929299", "#6f6f76", "#f1f1f3"].includes(restored.accent) ? restored.accent : fallback.accent, orbitalSkin: restored.faceVersion === fallback.faceVersion && isOrbitalSkin(restored.orbitalSkin) ? restored.orbitalSkin : fallback.orbitalSkin, faceVersion: fallback.faceVersion, effort: isEffortLevel(restored.effort) ? restored.effort : fallback.effort, voice: { ...fallback.voice, ...(restored.voice ?? {}) }, agentMode: restored.agentMode === true, access: ["Perguntar", "Automático", "Somente leitura"].includes(restored.access) ? restored.access : fallback.access, memory: restoreMemory(restored.memory), chats: layoutIsCurrent ? tidyChats(settleInterruptedMessages(restored.chats ?? fallback.chats), restored.activeChatId ?? fallback.activeChatId) : fallback.chats, projects: layoutIsCurrent ? (restored.projects ?? fallback.projects) : fallback.projects, nodes: restored.nodes ?? fallback.nodes, connections: restored.connections ?? fallback.connections, frames: restored.frames ?? fallback.frames, agents: restored.agents ?? fallback.agents, currentAgentId: restored.currentAgentId ?? fallback.currentAgentId, settingsOpen: false, settingsTab: undefined, settingsFocusModel: undefined, paletteOpen: false };
    } catch { return fallback; }
  });

  useEffect(() => {
    localStorage.setItem("open-assistant-state-v2", JSON.stringify(state));
    const effective = state.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : state.theme;
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.setProperty("--accent", state.accent);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Hook de acesso ao estado global e ao `dispatch`. */
export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore precisa de StoreProvider");
  return value;
}
