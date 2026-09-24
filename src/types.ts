export type VoiceInteractionState = "idle" | "listening" | "processing" | "speaking" | "error";

export type ModelId = string;

export type Provider = "openai" | "anthropic" | "google" | "local" | "together" | "deepseek" | "perplexity" | "fireworks" | string;

export interface ModelConfig {
  id: ModelId;
  name: string;
  provider: Provider;
  company?: string;
  strength?: number;
  apiModel: string;
  description: string;
  latency: string;
  status: "connected" | "disconnected" | "local-active";
  contextWindow: number;
}

export type ProjectIconColor = "white" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

export interface Project {
  id: string;
  name: string;
  chatIds: string[];
  agentIds: string[];
  dashboardIds: string[];
  symbol: string;
  iconColor: ProjectIconColor;
  isPinned: boolean;
  isArchived: boolean;
}

export type WorkspaceAreaKind = 
  | "chat" 
  | "nodes" 
  | "terminal" 
  | "agents" 
  | "files" 
  | "browser" 
  | "marketplace" 
  | "photoEditor" 
  | "videoEditor" 
  | "dashboard";

export interface WorkspaceArea {
  id: string;
  kind: WorkspaceAreaKind;
  chatId?: string;
  workflowId?: string;
  terminalIds: string[];
  projectId?: string;
  dashboardId?: string;
  documentURL?: string;
}

export type WorkspaceSplitAxis = "horizontal" | "vertical";

export interface WorkspaceSplit {
  id: string;
  axis: WorkspaceSplitAxis;
  fraction: number;
  first: WorkspaceLayoutNode;
  second: WorkspaceLayoutNode;
}

export type WorkspaceLayoutNode = 
  | { type: "leaf"; area: WorkspaceArea }
  | { type: "split"; split: WorkspaceSplit };

export type MessageSender = "user" | "assistant" | "system";

export interface ActionStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

export interface DiffLine {
  id: string;
  type: "add" | "remove" | "neutral";
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface DiffInfo {
  filePath: string;
  addedCount: number;
  removedCount: number;
  lines: DiffLine[];
}

export type BlockType = 
  | "code" 
  | "fileDiff" 
  | "commandRun" 
  | "actionPlan" 
  | "error" 
  | "confirmation" 
  | "dashboard";

export interface InteractiveBlock {
  id: string;
  type: BlockType;
  title: string;
  language?: string;
  code?: string;
  previousCode?: string;
  filePath?: string;
  command?: string;
  diffInfo?: DiffInfo;
  steps?: ActionStep[];
  errorDetails?: string;
  successDetails?: string;
}

export interface ProgressStep {
  id: string;
  type: "header" | "fileAnalysis" | "thought" | "fileEdit" | "textInfo";
  title: string;
  subtitle?: string;
  value?: string;
  isExpanded: boolean;
}

export interface ChangesSummary {
  fileCount: number;
  addedCount: number;
  removedCount: number;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  modelUsed?: string;
  blocks: InteractiveBlock[];
  isProgressMessage?: boolean;
  progressSteps?: ProgressStep[];
  activeProgressStepIndex?: number;
  isProgressActive?: boolean;
  finalChangesSummary?: ChangesSummary;
  responseTime?: string;
  visitedSites?: string[];
  generatedImagePath?: string;
  isModelChange?: boolean;
  modelChangeText?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  modelId: ModelId;
  date: string;
  messages: ChatMessage[];
  isPinned: boolean;
  isArchived: boolean;
}

export type AgentStatus = "running" | "idle" | "paused" | "error" | "completed";

export interface Agent {
  id: string;
  name: string;
  role: string;
  modelId: ModelId;
  status: AgentStatus;
  lastActive: string;
  permissions: string[];
  tools: string[];
  prompt: string;
  isSystem: boolean;
  isPinned: boolean;
  isArchived: boolean;
}

export type RuntimeComponent = "ollama" | "openClaw" | "mcpBridge";

export type RuntimeInstallState = "notInstalled" | "installed" | "running" | "needsAttention" | "installing" | "error";

export interface RuntimeStatus {
  component: RuntimeComponent;
  state: RuntimeInstallState;
  version?: string;
  binaryPath?: string;
  port?: number;
  url?: string;
  models: string[];
  error?: string;
  lastCheckedAt?: string;
}

export type RuntimeLogLevel = "info" | "warning" | "error" | "success" | "command";

export interface RuntimeLogEntry {
  id: string;
  timestamp: string;
  level: RuntimeLogLevel;
  component?: RuntimeComponent;
  nodeId?: string;
  message: string;
}

export type TerminalLogType = "info" | "warning" | "error" | "success" | "input";

export interface TerminalLog {
  id: string;
  timestamp: string;
  type: TerminalLogType;
  text: string;
}

export interface AgentTerminal {
  id: string;
  agentId: string;
  agentName: string;
  status: AgentStatus;
  logs: TerminalLog[];
  lastUpdated: string;
}

export type NodeType = 
  | "trigger" 
  | "watcher" 
  | "reader" 
  | "agent" 
  | "executor" 
  | "writer" 
  | "decision" 
  | "notifier" 
  | "optimizer" 
  | "folder" 
  | "prompt" 
  | "open_program" 
  | "gmail" 
  | "google_drive" 
  | "whatsapp" 
  | "telegram" 
  | "runtime_action";

export type NodeStatus = "idle" | "running" | "success" | "warning" | "error" | "skipped" | "cancelled";

export type RuntimeAction = 
  | "start" 
  | "detectOS" 
  | "checkArchitecture" 
  | "checkDiskSpace" 
  | "checkNetwork" 
  | "checkExistingOllama" 
  | "installOllama" 
  | "startOllama" 
  | "verifyOllamaAPI" 
  | "pullDefaultModel" 
  | "checkNodeJS" 
  | "checkExistingOpenClaw" 
  | "installOpenClaw" 
  | "configureOpenClawWithOllama" 
  | "startOpenClawGateway" 
  | "verifyGateway" 
  | "createMCPBridge" 
  | "registerRuntimeState" 
  | "healthCheck" 
  | "finish" 
  | "missingNode" 
  | "lowDisk" 
  | "portBusy" 
  | "ollamaAPIError" 
  | "openClawGatewayError" 
  | "mcpBridgeWarning";

export interface WorkflowNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  status: NodeStatus;
  description: string;
  config: Record<string, string>;
  temperature?: number;
  allowSelfEdit: boolean;
  runtimeAction?: RuntimeAction;
  progress?: number;
  lastLogLine?: string;
  commandPreview?: string;
  requiresApproval: boolean;
  startedAt?: string;
  finishedAt?: string;
}

export interface NodeConnection {
  id: string;
  fromId: string;
  toId: string;
  fromPort?: number;
  toPort?: number;
}

export type WorkflowFrameKind = "schedule" | "folder" | "file" | "project" | "condition" | "approval" | "parallel";

export interface WorkflowFrame {
  id: string;
  name: string;
  kind: WorkflowFrameKind;
  x: number;
  y: number;
  width: number;
  height: number;
  config: Record<string, string>;
  nodeIds: string[];
  isEnabled: boolean;
  lastRunAt?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  nodes: WorkflowNode[];
  connections: NodeConnection[];
  frames: WorkflowFrame[];
}

export type FileKind = "TXT" | "MD" | "JSON" | "HTML" | "CSS" | "LOG" | "REPORT";

export interface FileArtifact {
  id: string;
  name: string;
  type: FileKind;
  size: string;
  createdBy: string;
  date: string;
  path: string;
  content: string;
  previousContent?: string;
}

export interface SkillSetting {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  enabled: boolean;
}

export interface AppSettings {
  general: {
    username: string;
    language: string;
    theme: string;
    defaultModel: ModelId;
    profileImagePath?: string;
  };
  apiKeys: {
    openai: string;
    anthropic: string;
    google: string;
    groq: string;
    openrouter: string;
    customProvider: string;
    customUrl: string;
  };
  localRuntime: {
    status: string;
    port: string;
    modelsInstalled: string[];
    ollamaPort: number;
    openClawPort: number;
    defaultLocalModelTag: string;
    showVisualInstall: boolean;
    allowLocalMCPBridge: boolean;
    localOnlyMode: boolean;
    runtimeStatePath: string;
  };
  skills: SkillSetting[];
  appearance: {
    accentColor: string;
    blurIntensity: string;
    density: string;
    floatingAssistantEnabled: boolean;
    floatingAssistantCompact: boolean;
    floatingAssistantAutoShow: boolean;
    floatingAssistantOpacity: number;
  };
  fontSize: {
    global: number;
    chat: number;
    terminal: number;
    code: number;
  };
  voice: {
    language: string;
    ttsProvider: string;
    selectedProfile: string;
    automaticallySpeakReplies: boolean;
  };
  permissions: {
    readFile: boolean;
    writeFile: boolean;
    executeCommand: boolean;
    alterWorkflow: boolean;
    accessNetwork: boolean;
  };
}

export interface DashboardMetric {
  id: string;
  title: string;
  value: number;
  unit: string;
  change?: number;
}

export interface DashboardPoint {
  id: string;
  label: string;
  value: number;
}

export interface DashboardDocument {
  id: string;
  projectId?: string;
  title: string;
  subtitle: string;
  metrics: DashboardMetric[];
  points: DashboardPoint[];
  updatedAt: string;
  isPinned: boolean;
  isArchived: boolean;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  price: string;
  downloads: string;
  rating: string;
  publisher: string;
  permissions: string[];
}
