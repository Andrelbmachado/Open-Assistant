import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { adoptWorkflows, assignChatAreas, assignWorkflowAreas, hasWorkspaceArea, isValidWorkspaceLayout, listAreas, setAreaWorkflow, type ViewKind, type WorkspaceArea, type WorkspaceLayoutNode, type WorkspaceSplit } from "../utils/workspaceLayout";
import { DEFAULT_ORBITAL_SKIN, isOrbitalSkin, type OrbitalSkin } from "../utils/orbitalState";
import { DEFAULT_EFFORT, isEffortLevel, type EffortLevel } from "../utils/effort";
import { DEFAULT_EFFORT_SKIN, isEffortSkin, type EffortSkin } from "../utils/effortSkin";
import { DEFAULT_ROBOT_SPEED, restoreRobotSpeed } from "../utils/robotSpeed";
import type { AccessMode, AgentStep } from "../utils/agentRunner";
import type { ChangeSet } from "../utils/fileChanges";
import { NEW_CHAT_TITLE, titleFromMessage } from "../utils/chatTitle";
import { EMPTY_MEMORY, restoreMemory, type MemoryFact, type UserMemory } from "../utils/memory";
import { blankWorkflow, KIND_BY_ID, migrateLegacyCanvas, WORKFLOW_TEMPLATES, withDefaults, type ParamValue, type WorkflowDoc } from "../utils/workflow";
import { DEFAULT_FONT_SCALE, clampFontScale, fontScaleVariables, restoreFontScale, type FontScale, type FontScaleKey } from "../utils/fontScale";

export type { ViewKind, WorkspaceArea, WorkspaceLayoutNode, WorkspaceSplit } from "../utils/workspaceLayout";

export type Theme = "dark" | "light" | "system";
export type SettingsTab = "general" | "memory" | "providers" | "models" | "tools" | "voice" | "mcp" | "runtimes" | "permissions" | "logs";

/** Ação reconhecida sem o modelo (catálogo da skill ou camada semântica). */
export interface ActionCandidate {
  id: string;
  risk: string;
  slots: Record<string, string>;
  label: string;
  score?: number;
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
  /** Arquivos que a IA alterou (cartão "Editou N arquivos" no fim da resposta). */
  changes?: ChangeSet;
  /** Resultado do "Desfazer" do cartão de arquivos. */
  changesNote?: string;
  /** O que a IA aprendeu com a mensagem anterior (aviso "Memória atualizada"). */
  memoryNote?: string[];
  /** Skills/conectores invocados com "/" e "@" nesta mensagem do usuário. */
  invocations?: Invocation[];
  /** Conta resolvida pela calculadora do app (sem modelo). */
  calc?: { expression: string; result: string };
  /** Imagem gerada (ou sendo gerada) por um modelo de imagem local. */
  image?: GeneratedImage;
  /** Pediu uma imagem sem modelo de imagem baixado: mostra o atalho para Configurações. */
  needsImageModel?: boolean;
}

export interface GeneratedImage {
  status: "generating" | "done" | "error" | "cancelled";
  modelId: string;
  prompt: string;
  requestId: string;
  phase?: string;
  step?: number;
  total?: number;
  /** Arquivo em Imagens\Open Assistant. */
  path?: string;
  seed?: number;
  elapsedMs?: number;
  error?: string;
}

export type { FlowConnection, FlowFrame, FlowNode, WorkflowDoc } from "../utils/workflow";

export interface AssistantAgent {
  id: string;
  name: string;
  role: string;
  workspace: "workflow" | "terminal";
  status: string;
  projectId?: string;
  /** Workflow (editor de nodes) deste agente. */
  workflowId?: string;
}

export interface Project {
  id: string;
  name: string;
  /** Pasta do projeto no PC (tela Arquivos mostra a árvore dela). `~` = pasta do usuário. */
  path?: string;
}

/** Pasta padrão do projeto do próprio app: tudo do Open Assistant (código, skills, executável). */
export const APP_PROJECT_PATH = "~\\Desktop\\Assistente pessoal";

export function projectPath(project: Project | undefined): string | undefined {
  return project?.path ?? (project?.id === "open-assistant" ? APP_PROJECT_PATH : undefined);
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  projectId?: string;
  /** Fixada no topo da lista da barra lateral. */
  pinned?: boolean;
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
  /** Modelo de imagem escolhido (id `img-*`). */
  preferredImageModel?: string;
  theme: Theme;
  accent: string;
  /** Tamanho das fontes (títulos, subtítulos, texto corrido); aplicado em --fs-*. */
  fontScale: FontScale;
  orbitalSkin: OrbitalSkin;
  /** Versão do rosto padrão; ao subir, o novo padrão substitui a skin salva. */
  faceVersion: number;
  effort: EffortLevel;
  /** Visual do slider de esforço no Ultra. */
  effortSkin: EffortSkin;
  voice: VoiceSettings;
  /** Permissão do agente: Perguntar / Automático / Somente leitura. */
  access: AccessMode;
  /** Velocidade do robô andando pela tela carregando pastas e janelas (px/s; menu "+"). */
  robotSpeed: number;
  /** Memória do usuário (Configurações › Memória + o que a IA aprendeu); entra em todos os prompts. */
  memory: UserMemory;
  activeChatId: string;
  chats: Chat[];
  projects: Project[];
  /** Projeto mostrado na tela Arquivos. */
  filesProjectId?: string;
  /** Workflows do editor de nodes; cada área de nodes mostra um (`WorkspaceArea.workflowId`). */
  workflows: WorkflowDoc[];
  agents: AssistantAgent[];
  currentAgentId: string;
}

export type Action =
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
  | { type: "fontScale"; key: FontScaleKey; value: number }
  | { type: "resetFontScale" }
  | { type: "setOrbitalSkin"; skin: OrbitalSkin }
  | { type: "setEffort"; effort: EffortLevel }
  | { type: "setEffortSkin"; skin: EffortSkin }
  | { type: "setImageModel"; model: string }
  | { type: "setVoice"; patch: Partial<VoiceSettings> }
  | { type: "setAccess"; access: AccessMode }
  | { type: "setRobotSpeed"; speed: number }
  | { type: "setMemory"; patch: Partial<UserMemory> }
  | { type: "updateFact"; id: string; text: string }
  | { type: "removeFact"; id: string }
  | { type: "addFact"; fact: MemoryFact }
  | { type: "sendMessage"; text: string }
  | { type: "wfAddNode"; workflowId: string; kind: string; x?: number; y?: number }
  | { type: "wfMoveNode"; workflowId: string; id: string; x: number; y: number }
  | { type: "wfSetParam"; workflowId: string; id: string; key: string; value: ParamValue }
  | { type: "wfRenameNode"; workflowId: string; id: string; title: string }
  | { type: "wfRemoveNodes"; workflowId: string; ids: string[] }
  | { type: "wfConnect"; workflowId: string; from: string; to: string }
  | { type: "wfRemoveConnection"; workflowId: string; id: string }
  | { type: "wfAddFrame"; workflowId: string }
  | { type: "wfMoveFrame"; workflowId: string; id: string; x: number; y: number }
  | { type: "wfResizeFrame"; workflowId: string; id: string; width: number; height: number }
  | { type: "wfRemoveFrame"; workflowId: string; id: string }
  | { type: "wfRename"; workflowId: string; name: string }
  | { type: "wfSetSchedule"; workflowId: string; enabled: boolean }
  | { type: "wfRunFinished"; workflowId: string; at: number; memory?: Record<string, string[]> }
  /** Novo workflow (em branco ou montado pela IA/modelo) aberto na área indicada. */
  | { type: "wfCreate"; doc?: WorkflowDoc; areaId?: string }
  /** Substitui um workflow inteiro (a IA editou). */
  | { type: "wfReplace"; doc: WorkflowDoc }
  | { type: "wfOpen"; workflowId: string; areaId: string }
  | { type: "wfDelete"; workflowId: string }
  /** Resultado de automação: vai para a conversa "Automação: <nome>" (criada se preciso), sem trocar a tela. */
  | { type: "postAutomationMessage"; title: string; text: string }
  | { type: "addAgent"; workspace: AssistantAgent["workspace"] }
  | { type: "openAgent"; id: string }
  | { type: "activateArea"; id: string }
  | { type: "splitArea"; id: string; axis: WorkspaceSplit["axis"]; fraction: number; newAreaFirst: boolean }
  | { type: "updateWorkspaceSplit"; id: string; fraction: number }
  | { type: "collapseWorkspaceSplit"; id: string; keep: "first" | "second" }
  | { type: "newProject"; name?: string; path?: string }
  | { type: "setProjectPath"; projectId: string; path: string }
  | { type: "openProjectFiles"; projectId: string }
  | { type: "deleteChat"; chatId: string }
  | { type: "togglePinChat"; chatId: string }
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

/** Workflow de exemplo da primeira abertura: abre um site ao clicar em Executar. */
const INITIAL_WORKFLOW: WorkflowDoc = { ...WORKFLOW_TEMPLATES[0].build(), name: "Fluxo principal" };

/** Workflow ainda do jeito que nasceu (só o gatilho manual): some se nenhuma área o mostra. */
function isPristineWorkflow(doc: WorkflowDoc): boolean {
  return doc.updatedAt === doc.createdAt && doc.nodes.length <= 1 && !doc.connections.length && !doc.frames.length;
}

/** Nome "Workflow N" que ainda não existe. */
function nextWorkflowName(workflows: WorkflowDoc[]): string {
  const names = new Set(workflows.map((doc) => doc.name));
  let index = workflows.length + 1;
  while (names.has(`Workflow ${index}`)) index++;
  return `Workflow ${index}`;
}

/** Aplica uma mudança a um workflow e marca a hora (o que muda some da lista de "intocados"). */
function updateWorkflow(state: AppState, id: string, change: (doc: WorkflowDoc) => WorkflowDoc): AppState {
  let changed = false;
  const workflows = state.workflows.map((doc) => {
    if (doc.id !== id) return doc;
    changed = true;
    return { ...change(doc), updatedAt: Math.max(Date.now(), doc.createdAt + 1) };
  });
  return changed ? { ...state, workflows } : state;
}

/** Área onde um workflow novo abre: a indicada, a ativa (se for de nodes) ou a primeira de nodes. */
function workflowAreaFor(state: AppState, areaId?: string): WorkspaceArea | undefined {
  const areas = listAreas(state.workspaceLayout).filter((area) => area.view === "workflow");
  return areas.find((area) => area.id === areaId) ?? areas.find((area) => area.id === state.activeAreaId) ?? areas[0];
}

const initialState: AppState = {
  layoutVersion: 4,
  activeView: "chat",
  activeAreaId: "chat-area",
  workspaceLayout: {
    id: "root-split", axis: "horizontal", fraction: .64,
    first: { id: "chat-area", view: "chat" },
    second: { id: "workflow-area", view: "workflow", workflowId: INITIAL_WORKFLOW.id },
  },
  secondaryView: "workflow",
  splitEnabled: true,
  splitRatio: 0.64,
  sidebarCollapsed: false,
  settingsOpen: false,
  paletteOpen: false,
  theme: "dark",
  accent: "#b7b7bd",
  fontScale: DEFAULT_FONT_SCALE,
  orbitalSkin: DEFAULT_ORBITAL_SKIN,
  faceVersion: 2,
  effort: DEFAULT_EFFORT,
  effortSkin: DEFAULT_EFFORT_SKIN,
  voice: { language: "pt", speed: 1 },
  access: "Perguntar",
  robotSpeed: DEFAULT_ROBOT_SPEED,
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
  workflows: [INITIAL_WORKFLOW],
  agents: [
    { id: "orchestrator", name: "Orquestrador", role: "Coordena tarefas e ferramentas", workspace: "workflow", status: "Ativo" },
    { id: "reviewer", name: "Code Reviewer", role: "Analisa qualidade e segurança", workspace: "workflow", status: "Disponível" },
    { id: "powershell-agent", name: "PowerShell Runner", role: "Executa automações locais", workspace: "terminal", status: "Disponível" },
  ],
  currentAgentId: "orchestrator",
};

/**
 * Cada área de chat mostra uma conversa própria. Roda depois de toda ação: dividir uma área de chat
 * cria uma conversa nova para a área nova, em vez de duplicar a atual.
 */
function withChatAreas(state: AppState): AppState {
  const created: Chat[] = [];
  const layout = assignChatAreas(state.workspaceLayout, state.activeAreaId, state.activeChatId, new Set(state.chats.map((chat) => chat.id)), () => {
    const chat: Chat = { id: crypto.randomUUID(), title: NEW_CHAT_TITLE, model: state.preferredModel ?? "", messages: [] };
    created.push(chat);
    return chat.id;
  });
  const createdWorkflows: WorkflowDoc[] = [];
  const workflowLayout = assignWorkflowAreas(layout, new Set(state.workflows.map((doc) => doc.id)), () => {
    const doc = blankWorkflow(nextWorkflowName([...state.workflows, ...createdWorkflows]));
    createdWorkflows.push(doc);
    return doc.id;
  });
  // Workflows em branco que nenhuma área mostra mais (a área foi fechada ou trocou de projeto) somem.
  const shown = new Set(listAreas(workflowLayout).map((area) => area.workflowId).filter(Boolean));
  const agentWorkflows = new Set(state.agents.map((agent) => agent.workflowId).filter(Boolean));
  const kept = state.workflows.filter((doc) => shown.has(doc.id) || agentWorkflows.has(doc.id) || !isPristineWorkflow(doc));
  const workflows = createdWorkflows.length || kept.length !== state.workflows.length ? [...kept, ...createdWorkflows] : state.workflows;
  if (workflowLayout === state.workspaceLayout && !created.length && workflows === state.workflows) return state;
  return { ...state, workspaceLayout: workflowLayout, chats: created.length ? [...created, ...state.chats] : state.chats, workflows };
}

/** Conversas abertas em outras áreas não podem ser apagadas por estarem vazias. */
function chatsInOtherAreas(state: AppState): Set<string> {
  return new Set(listAreas(state.workspaceLayout).filter((area) => area.id !== state.activeAreaId && area.view === "chat" && area.chatId).map((area) => area.chatId!));
}

function reducer(state: AppState, action: Action): AppState {
  return withChatAreas(baseReducer(state, action));
}

function baseReducer(state: AppState, action: Action): AppState {
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
    case "fontScale": return { ...state, fontScale: { ...state.fontScale, [action.key]: clampFontScale(action.value) } };
    case "resetFontScale": return { ...state, fontScale: DEFAULT_FONT_SCALE };
    case "setOrbitalSkin": return { ...state, orbitalSkin: action.skin };
    case "setEffort": return { ...state, effort: action.effort };
    case "setEffortSkin": return { ...state, effortSkin: action.skin };
    case "setImageModel": return { ...state, preferredImageModel: action.model };
    case "setVoice": return { ...state, voice: { ...state.voice, ...action.patch } };
    case "setAccess": return { ...state, access: action.access };
    case "setRobotSpeed": return { ...state, robotSpeed: restoreRobotSpeed(action.speed) };
    case "setMemory": return { ...state, memory: { ...state.memory, ...action.patch } };
    case "addFact": return { ...state, memory: { ...state.memory, facts: [...state.memory.facts, action.fact] } };
    case "updateFact": return { ...state, memory: { ...state.memory, facts: state.memory.facts.map((fact) => fact.id === action.id ? { ...fact, text: action.text } : fact) } };
    case "removeFact": return { ...state, memory: { ...state.memory, facts: state.memory.facts.filter((fact) => fact.id !== action.id) } };
    case "wfAddNode": {
      if (!KIND_BY_ID.has(action.kind)) return state;
      return updateWorkflow(state, action.workflowId, (doc) => {
        const id = `${action.kind.split(".").pop()}-${crypto.randomUUID().slice(0, 6)}`;
        const x = action.x ?? 120 + (doc.nodes.length % 4) * 300;
        const y = action.y ?? 110 + Math.floor(doc.nodes.length / 4) * 260;
        return { ...doc, nodes: [...doc.nodes, { id, kind: action.kind, x, y, params: withDefaults(action.kind) }] };
      });
    }
    case "wfMoveNode": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, nodes: doc.nodes.map((node) => node.id === action.id ? { ...node, x: action.x, y: action.y } : node) }));
    case "wfSetParam": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, nodes: doc.nodes.map((node) => node.id === action.id ? { ...node, params: { ...node.params, [action.key]: action.value } } : node) }));
    case "wfRenameNode": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, nodes: doc.nodes.map((node) => node.id === action.id ? { ...node, title: action.title } : node) }));
    case "wfRemoveNodes": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, nodes: doc.nodes.filter((node) => !action.ids.includes(node.id)), connections: doc.connections.filter((connection) => !action.ids.includes(connection.from) && !action.ids.includes(connection.to)) }));
    case "wfConnect": return updateWorkflow(state, action.workflowId, (doc) => {
      if (action.from === action.to || doc.connections.some((connection) => connection.from === action.from && connection.to === action.to)) return doc;
      return { ...doc, connections: [...doc.connections, { id: crypto.randomUUID(), from: action.from, to: action.to }] };
    });
    case "wfRemoveConnection": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, connections: doc.connections.filter((connection) => connection.id !== action.id) }));
    case "wfAddFrame": return updateWorkflow(state, action.workflowId, (doc) => {
      const offset = doc.frames.length * 24;
      return { ...doc, frames: [...doc.frames, { id: crypto.randomUUID(), title: `Frame ${doc.frames.length + 1}`, x: 60 + offset, y: 60 + offset, width: 620, height: 340 }] };
    });
    case "wfMoveFrame": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, frames: doc.frames.map((frame) => frame.id === action.id ? { ...frame, x: action.x, y: action.y } : frame) }));
    case "wfResizeFrame": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, frames: doc.frames.map((frame) => frame.id === action.id ? { ...frame, width: Math.max(260, action.width), height: Math.max(160, action.height) } : frame) }));
    case "wfRemoveFrame": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, frames: doc.frames.filter((frame) => frame.id !== action.id) }));
    case "wfRename": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, name: action.name.trim() || doc.name }));
    case "wfSetSchedule": return updateWorkflow(state, action.workflowId, (doc) => ({ ...doc, scheduleEnabled: action.enabled, lastRunAt: action.enabled ? doc.lastRunAt : undefined }));
    case "wfRunFinished": return { ...state, workflows: state.workflows.map((doc) => doc.id === action.workflowId ? { ...doc, lastRunAt: action.at, memory: action.memory ?? doc.memory } : doc) };
    case "wfCreate": {
      const doc = action.doc ?? blankWorkflow(nextWorkflowName(state.workflows));
      const area = workflowAreaFor(state, action.areaId);
      const workflows = [...state.workflows.filter((item) => item.id !== doc.id), doc];
      if (!area) return { ...state, workflows };
      return { ...state, workflows, workspaceLayout: setAreaWorkflow(state.workspaceLayout, area.id, doc.id), activeAreaId: area.id, activeView: "workflow" };
    }
    case "wfReplace": return state.workflows.some((doc) => doc.id === action.doc.id) ? { ...state, workflows: state.workflows.map((doc) => doc.id === action.doc.id ? { ...action.doc, updatedAt: Date.now() } : doc) } : state;
    case "wfOpen": {
      // Já aberto em outra área: leva o foco para lá (igual às conversas) em vez de mostrar duas vezes.
      const holder = listAreas(state.workspaceLayout).find((area) => area.view === "workflow" && area.workflowId === action.workflowId && area.id !== action.areaId);
      if (holder) return { ...state, activeAreaId: holder.id, activeView: "workflow" };
      return { ...state, workspaceLayout: setAreaWorkflow(state.workspaceLayout, action.areaId, action.workflowId), activeAreaId: action.areaId, activeView: "workflow" };
    }
    case "wfDelete": return { ...state, workflows: state.workflows.filter((doc) => doc.id !== action.workflowId), agents: state.agents.map((agent) => agent.workflowId === action.workflowId ? { ...agent, workflowId: undefined } : agent) };
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
      const opened = { ...state, currentAgentId: agent.id, activeView: view, workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, view) };
      if (view !== "workflow") return opened;
      // Agente de nodes: abre o workflow dele **só nesta área** (as outras áreas de nodes não mudam).
      const existing = agent.workflowId ? state.workflows.find((doc) => doc.id === agent.workflowId) : undefined;
      const doc = existing ?? { ...blankWorkflow(agent.name), updatedAt: Date.now() + 1 };
      return {
        ...opened,
        workflows: existing ? state.workflows : [...state.workflows, doc],
        agents: existing ? state.agents : state.agents.map((item) => item.id === agent.id ? { ...item, workflowId: doc.id } : item),
        workspaceLayout: setAreaWorkflow(opened.workspaceLayout, state.activeAreaId, doc.id),
      };
    }
    case "activateArea": {
      const findArea = (node: WorkspaceLayoutNode): WorkspaceArea | undefined => isArea(node) ? (node.id === action.id ? node : undefined) : findArea(node.first) ?? findArea(node.second);
      const area = findArea(state.workspaceLayout);
      if (!area) return state;
      return { ...state, activeAreaId: area.id, activeView: area.view, activeChatId: area.view === "chat" && area.chatId ? area.chatId : state.activeChatId };
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
      const name = action.name?.trim() || `Novo projeto ${state.projects.length + 1}`;
      return { ...state, projects: [...state.projects, { id, name, path: action.path }], filesProjectId: action.path ? id : state.filesProjectId };
    }
    case "setProjectPath":
      return { ...state, projects: state.projects.map((project) => project.id === action.projectId ? { ...project, path: action.path } : project) };
    case "openProjectFiles":
      return { ...state, filesProjectId: action.projectId, activeView: "files", workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, "files") };
    case "togglePinChat":
      return { ...state, chats: state.chats.map((chat) => chat.id === action.chatId ? { ...chat, pinned: !chat.pinned } : chat) };
    case "deleteChat": {
      const chats = state.chats.filter((chat) => chat.id !== action.chatId);
      if (chats.length === state.chats.length) return state;
      // Apagou a conversa aberta: abre a próxima (ou uma nova, vazia). As áreas que a mostravam recebem outra.
      if (state.activeChatId !== action.chatId) return { ...state, chats };
      const next = chats[0];
      if (next) return { ...state, chats, activeChatId: next.id };
      const id = crypto.randomUUID();
      return { ...state, activeChatId: id, chats: [{ id, title: NEW_CHAT_TITLE, model: state.preferredModel ?? "", messages: [] }] };
    }
    case "newChat": {
      const id = crypto.randomUUID();
      const chats = withoutEmptyChat(state.chats, state.activeChatId, chatsInOtherAreas(state));
      return { ...state, activeChatId: id, activeView: "chat", workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, "chat"), chats: [{ id, title: NEW_CHAT_TITLE, model: state.preferredModel ?? "", messages: [], projectId: action.projectId }, ...chats] };
    }
    case "selectChat": {
      // Conversa já aberta em outra área: vai para aquela área em vez de duplicá-la.
      const holder = listAreas(state.workspaceLayout).find((area) => area.view === "chat" && area.chatId === action.id && area.id !== state.activeAreaId);
      if (holder) return { ...state, activeAreaId: holder.id, activeView: "chat", activeChatId: action.id };
      const chats = action.id === state.activeChatId ? state.chats : withoutEmptyChat(state.chats, state.activeChatId, chatsInOtherAreas(state));
      return { ...state, chats, activeChatId: action.id, activeView: "chat", workspaceLayout: updateAreaView(state.workspaceLayout, state.activeAreaId, "chat") };
    }
    case "sendMessage": {
      const message: ChatMessage = { id: crypto.randomUUID(), sender: "user", text: action.text, time: "agora" };
      return { ...state, chats: state.chats.map((chat) => chat.id === state.activeChatId ? { ...chat, messages: [...chat.messages, message] } : chat) };
    }
    case "postAutomationMessage": {
      const title = `Automação: ${action.title}`;
      const message: ChatMessage = { id: crypto.randomUUID(), sender: "assistant", text: action.text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), source: "Editor de nodes" };
      const existing = state.chats.find((chat) => chat.title === title);
      if (existing) return { ...state, chats: state.chats.map((chat) => chat.id === existing.id ? { ...chat, messages: [...chat.messages, message] } : chat) };
      return { ...state, chats: [...state.chats, { id: crypto.randomUUID(), title, model: state.preferredModel ?? "", messages: [message] }] };
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
function withoutEmptyChat(chats: Chat[], leavingId: string, keep: ReadonlySet<string> = new Set()): Chat[] {
  return chats.filter((chat) => chat.id !== leavingId || chat.messages.length > 0 || keep.has(chat.id));
}

/** Ao abrir o app: some com conversas vazias (exceto a ativa) e nomeia as antigas "Nova conversa". */
function tidyChats(chats: Chat[], activeId: string, layout?: WorkspaceLayoutNode): Chat[] {
  const open = new Set(layout ? listAreas(layout).map((area) => area.chatId).filter(Boolean) : []);
  return chats
    .filter((chat) => chat.messages.length > 0 || chat.id === activeId || open.has(chat.id))
    .map((chat) => {
      const first = chat.messages.find((message) => message.sender === "user");
      return chat.title === NEW_CHAT_TITLE && first ? { ...chat, title: titleFromMessage(first.text) } : chat;
    });
}

/** Respostas que estavam sendo geradas quando o app fechou não voltam a "pensar" para sempre. */
function settleInterruptedMessages(chats: Chat[]): Chat[] {
  return chats.map((chat) => ({ ...chat, messages: chat.messages.map((message) => {
    const settled = message.loading ? { ...message, loading: false, text: message.text || "Resposta interrompida." } : message;
    return settled.image?.status === "generating" ? { ...settled, image: { ...settled.image, status: "cancelled" as const } } : settled;
  }) }));
}

/** Workflows salvos; o canvas antigo (nodes só visuais, sem workflows) vira o "Fluxo principal". */
function restoreWorkflows(restored: Record<string, unknown>): WorkflowDoc[] {
  if (Array.isArray(restored.workflows)) return (restored.workflows as WorkflowDoc[]).filter((doc) => doc && typeof doc.id === "string" && Array.isArray(doc.nodes));
  if (Array.isArray(restored.nodes) && restored.nodes.length) {
    return [migrateLegacyCanvas(restored.nodes as never[], (restored.connections as never[]) ?? [], (restored.frames as never[]) ?? [])];
  }
  return [INITIAL_WORKFLOW];
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

/** Provedor do estado global; restaura do localStorage e aplica tema/cor a cada mudança. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (fallback) => {
    try {
      const stored = localStorage.getItem("open-assistant-state-v2");
      const restored = stored ? JSON.parse(stored) : null;
      if (!restored) return withChatAreas(fallback);
      const layoutIsCurrent = restored.layoutVersion === fallback.layoutVersion
        && isValidWorkspaceLayout(restored.workspaceLayout)
        && hasWorkspaceArea(restored.workspaceLayout, restored.activeAreaId);
      const workflows = restoreWorkflows(restored);
      const layout = adoptWorkflows(layoutIsCurrent ? (restored.workspaceLayout ?? fallback.workspaceLayout) : fallback.workspaceLayout, workflows.map((doc) => doc.id));
      return withChatAreas({ ...fallback, ...restored, layoutVersion: fallback.layoutVersion, activeAreaId: layoutIsCurrent ? (restored.activeAreaId ?? fallback.activeAreaId) : fallback.activeAreaId, activeView: layoutIsCurrent ? (restored.activeView ?? fallback.activeView) : fallback.activeView, workspaceLayout: layout, accent: ["#d8d8dc", "#b7b7bd", "#929299", "#6f6f76", "#f1f1f3"].includes(restored.accent) ? restored.accent : fallback.accent, fontScale: restoreFontScale(restored.fontScale), orbitalSkin: restored.faceVersion === fallback.faceVersion && isOrbitalSkin(restored.orbitalSkin) ? restored.orbitalSkin : fallback.orbitalSkin, faceVersion: fallback.faceVersion, effort: isEffortLevel(restored.effort) ? restored.effort : fallback.effort, effortSkin: isEffortSkin(restored.effortSkin) ? restored.effortSkin : fallback.effortSkin, voice: { ...fallback.voice, ...(restored.voice ?? {}) }, access: ["Perguntar", "Automático", "Somente leitura"].includes(restored.access) ? restored.access : fallback.access, robotSpeed: restoreRobotSpeed(restored.robotSpeed), memory: restoreMemory(restored.memory), chats: layoutIsCurrent ? tidyChats(settleInterruptedMessages(restored.chats ?? fallback.chats), restored.activeChatId ?? fallback.activeChatId, layoutIsCurrent ? restored.workspaceLayout : undefined) : fallback.chats, projects: layoutIsCurrent ? (restored.projects ?? fallback.projects) : fallback.projects, workflows, agents: restored.agents ?? fallback.agents, currentAgentId: restored.currentAgentId ?? fallback.currentAgentId, settingsOpen: false, settingsTab: undefined, settingsFocusModel: undefined, paletteOpen: false });
    } catch { return withChatAreas(fallback); }
  });

  useEffect(() => {
    localStorage.setItem("open-assistant-state-v2", JSON.stringify(state));
    const effective = state.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : state.theme;
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.setProperty("--accent", state.accent);
    for (const [name, value] of Object.entries(fontScaleVariables(state.fontScale))) document.documentElement.style.setProperty(name, value);
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
