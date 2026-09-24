import React, { useState } from "react";
import { 
  Users, Bot, Sliders, Shield, Plus, Pin, Play, Pause, Save, 
  ArrowLeft, ArrowRight, Cpu, Sparkles, FolderTree, Layers, Network, 
  Terminal, CheckCircle2, ChevronRight, Search, Filter, Settings, 
  Activity, Boxes, Code2, Globe, Eye, MoreHorizontal, Check
} from "lucide-react";
import { Agent, ModelConfig, Workflow, WorkflowNode } from "../types";
import WorkflowCanvas from "./WorkflowCanvas";

interface AgentsPanelProps {
  agents: Agent[];
  models: ModelConfig[];
  onUpdateAgent: (agent: Agent) => void;
  accentColor: string;
  workflow?: Workflow;
  onUpdateWorkflow?: (workflow: Workflow) => void;
  onRunWorkflowStep?: (nodeId: string) => Promise<void>;
  onOpenAgentWorkflow?: (agentId: string) => void;
  activeAgentId?: string | null;
  onActiveAgentIdChange?: (agentId: string | null) => void;
}

// Pre-defined node workflows for each agent
const DEFAULT_AGENT_WORKFLOWS: Record<string, Workflow> = {
  "agent-1": {
    id: "wf-agent-1",
    name: "Pipeline de Análise Visual & Front-end",
    description: "Inspeciona código estético e gera correções de interface em tempo real.",
    isActive: true,
    nodes: [
      { id: "node-1-1", name: "Disparador de Mudança", type: "trigger", x: 60, y: 150, status: "idle", description: "Dispara ao detectar modificações no diretório de estilos.", config: { path: "./src/" }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-1-2", name: "Analisador Visual", type: "watcher", x: 280, y: 150, status: "idle", description: "Mapeia regras CSS e componentes buscando inconsistências.", config: { focus: "CSS" }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-1-3", name: "Agente Design Researcher", type: "agent", x: 500, y: 150, status: "idle", description: "Processa heurísticas estéticas e gera novas diretrizes.", config: { agentName: "Design Researcher" }, temperature: 0.7, allowSelfEdit: true, requiresApproval: false },
      { id: "node-1-4", name: "Gerador de Correção", type: "writer", x: 720, y: 150, status: "idle", description: "Grava os seletores e variáveis atualizadas no styles.css.", config: { target: "styles.css" }, allowSelfEdit: true, requiresApproval: true }
    ],
    connections: [
      { id: "conn-1-1", fromId: "node-1-1", toId: "node-1-2" },
      { id: "conn-1-2", fromId: "node-1-2", toId: "node-1-3" },
      { id: "conn-1-3", fromId: "node-1-3", toId: "node-1-4" }
    ],
    frames: [
      { id: "frame-1", name: "Pipeline Estético UX", kind: "parallel", x: 30, y: 90, width: 890, height: 220, config: {}, nodeIds: ["node-1-1", "node-1-2", "node-1-3", "node-1-4"], isEnabled: true }
    ]
  },
  "agent-2": {
    id: "wf-agent-2",
    name: "Pipeline de Organização de Diretórios",
    description: "Varre e organiza a estrutura de arquivos e dependências do workspace.",
    isActive: true,
    nodes: [
      { id: "node-2-1", name: "Monitor de Workspace", type: "trigger", x: 60, y: 150, status: "idle", description: "Escuta eventos de criação e movimentação de arquivos.", config: { path: "./workspace" }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-2-2", name: "Classificador de Tipos", type: "reader", x: 280, y: 150, status: "idle", description: "Identifica extensões, metadados e possíveis duplicações.", config: { rules: "auto-sort" }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-2-3", name: "Agente Organizador", type: "agent", x: 500, y: 150, status: "idle", description: "Determina hierarquia ideal e remove artefatos temporários.", config: { agentName: "File Organizer Agent" }, temperature: 0.2, allowSelfEdit: true, requiresApproval: false },
      { id: "node-2-4", name: "Sincronizador em Disco", type: "writer", x: 720, y: 150, status: "idle", description: "Aplica renomeações e reorganiza pastas com segurança.", config: { safeMode: true }, allowSelfEdit: true, requiresApproval: false }
    ],
    connections: [
      { id: "conn-2-1", fromId: "node-2-1", toId: "node-2-2" },
      { id: "conn-2-2", fromId: "node-2-2", toId: "node-2-3" },
      { id: "conn-2-3", fromId: "node-2-3", toId: "node-2-4" }
    ],
    frames: [
      { id: "frame-2", name: "Indexação e Limpeza de Arquivos", kind: "sequence", x: 30, y: 90, width: 890, height: 220, config: {}, nodeIds: ["node-2-1", "node-2-2", "node-2-3", "node-2-4"], isEnabled: true }
    ]
  },
  "agent-3": {
    id: "wf-agent-3",
    name: "Pipeline de Ponte MCP e Execução de Ferramentas",
    description: "Injeta ferramentas externas e gerencia execuções seguras em sandbox.",
    isActive: true,
    nodes: [
      { id: "node-3-1", name: "Receptor de Requisições", type: "trigger", x: 60, y: 150, status: "idle", description: "Escuta chamadas de ferramentas e prompts do sistema.", config: { port: 3000 }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-3-2", name: "Validador de Permissão", type: "decision", x: 280, y: 150, status: "idle", description: "Checa privilégios de acesso e permissões de sandbox.", config: { mode: "strict" }, allowSelfEdit: true, requiresApproval: false },
      { id: "node-3-3", name: "Ponte de Injeção MCP", type: "agent", x: 500, y: 150, status: "idle", description: "Roteia dados entre LLM e extensões externas de tooling.", config: { agentName: "MCP Bridge Controller" }, temperature: 0.1, allowSelfEdit: true, requiresApproval: false },
      { id: "node-3-4", name: "Executor em Sandbox", type: "executor", x: 720, y: 150, status: "idle", description: "Roda comandos isolados com captura de logs em tempo real.", config: { sandbox: "isolated" }, allowSelfEdit: true, requiresApproval: true }
    ],
    connections: [
      { id: "conn-3-1", fromId: "node-3-1", toId: "node-3-2" },
      { id: "conn-3-2", fromId: "node-3-2", toId: "node-3-3" },
      { id: "conn-3-3", fromId: "node-3-3", toId: "node-3-4" }
    ],
    frames: [
      { id: "frame-3", name: "Ponte MCP e Execução Segura", kind: "parallel", x: 30, y: 90, width: 890, height: 220, config: {}, nodeIds: ["node-3-1", "node-3-2", "node-3-3", "node-3-4"], isEnabled: true }
    ]
  }
};

export default function AgentsPanel({
  agents,
  models,
  onUpdateAgent,
  accentColor,
  workflow: defaultWorkflow,
  onUpdateWorkflow,
  onRunWorkflowStep,
  activeAgentId: propActiveAgentId,
  onActiveAgentIdChange
}: AgentsPanelProps) {
  // State for active view: null = Cards Matrix, string (agentId) = Active Agent's Node Workflow Canvas
  const [internalActiveAgentId, setInternalActiveAgentId] = useState<string | null>(null);
  const activeAgentIdInFlow = propActiveAgentId !== undefined ? propActiveAgentId : internalActiveAgentId;

  const setActiveAgentIdInFlow = (id: string | null) => {
    setInternalActiveAgentId(id);
    if (onActiveAgentIdChange) {
      onActiveAgentIdChange(id);
    }
  };

  const [activeTabInsideAgent, setActiveTabInsideAgent] = useState<"flow" | "config">("flow");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "running" | "idle">("all");
  
  // Custom per-agent workflows map
  const [agentWorkflows, setAgentWorkflows] = useState<Record<string, Workflow>>(() => {
    return {
      ...DEFAULT_AGENT_WORKFLOWS,
      ...(defaultWorkflow ? { "agent-1": defaultWorkflow } : {})
    };
  });

  const activeAgent = agents.find((a) => a.id === activeAgentIdInFlow) || null;

  // Filtered agents for the matrix
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.prompt.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" ? true :
      filterStatus === "running" ? agent.status === "running" :
      agent.status === "idle";

    return matchesSearch && matchesStatus;
  });

  const handleToggleAgentStatus = (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation();
    onUpdateAgent({
      ...agent,
      status: agent.status === "running" ? "idle" : "running",
      lastActive: agent.status === "running" ? "Pausado" : "Ativo agora"
    });
  };

  const handleTogglePin = (e: React.MouseEvent, agent: Agent) => {
    e.stopPropagation();
    onUpdateAgent({
      ...agent,
      isPinned: !agent.isPinned
    });
  };

  const handleUpdateCurrentAgentWorkflow = (newWf: Workflow) => {
    if (!activeAgentIdInFlow) return;
    setAgentWorkflows((prev) => ({
      ...prev,
      [activeAgentIdInFlow]: newWf
    }));
    if (onUpdateWorkflow) {
      onUpdateWorkflow(newWf);
    }
  };

  const handleLocalRunWorkflowStep = async (nodeId: string) => {
    if (onRunWorkflowStep) {
      await onRunWorkflowStep(nodeId);
    } else {
      // Local fallback simulation
      if (!activeAgentIdInFlow) return;
      const currentWf = agentWorkflows[activeAgentIdInFlow] || DEFAULT_AGENT_WORKFLOWS["agent-1"];
      const updatedNodes = currentWf.nodes.map((n) => 
        n.id === nodeId ? { ...n, status: "running" as const } : n
      );
      handleUpdateCurrentAgentWorkflow({ ...currentWf, nodes: updatedNodes });

      setTimeout(() => {
        const finishedNodes = currentWf.nodes.map((n) => 
          n.id === nodeId ? { ...n, status: "success" as const } : n
        );
        handleUpdateCurrentAgentWorkflow({ ...currentWf, nodes: finishedNodes });
      }, 1200);
    }
  };

  const getAgentWorkflow = (agentId: string): Workflow => {
    if (agentWorkflows[agentId]) {
      return agentWorkflows[agentId];
    }
    return {
      id: `wf-${agentId}`,
      name: `Pipeline de ${agents.find(a => a.id === agentId)?.name || "Agente"}`,
      description: "Fluxo de nós interativo autônomo.",
      isActive: true,
      nodes: [
        { id: `node-${agentId}-1`, name: "Gatilho de Eventos", type: "trigger", x: 60, y: 150, status: "idle", description: "Dispara ações do agente.", config: { path: "./" }, allowSelfEdit: true, requiresApproval: false },
        { id: `node-${agentId}-2`, name: "Processador Cognitivo", type: "agent", x: 320, y: 150, status: "idle", description: "Executa raciocínio inteligente.", config: {}, allowSelfEdit: true, requiresApproval: false },
        { id: `node-${agentId}-3`, name: "Ação em Workspace", type: "writer", x: 580, y: 150, status: "idle", description: "Aplica alterações geradas.", config: {}, allowSelfEdit: true, requiresApproval: false }
      ],
      connections: [
        { id: `c-${agentId}-1`, fromId: `node-${agentId}-1`, toId: `node-${agentId}-2` },
        { id: `c-${agentId}-2`, fromId: `node-${agentId}-2`, toId: `node-${agentId}-3` }
      ],
      frames: []
    };
  };

  const getAgentVisual = (agent: Agent) => {
    if (agent.name.toLowerCase().includes("design")) {
      return {
        icon: Sparkles,
        color: "from-purple-500/20 to-blue-500/10",
        border: "border-purple-500/30",
        textGlow: "text-purple-300"
      };
    }
    if (agent.name.toLowerCase().includes("file") || agent.name.toLowerCase().includes("organizer")) {
      return {
        icon: FolderTree,
        color: "from-blue-500/20 to-cyan-500/10",
        border: "border-blue-500/30",
        textGlow: "text-blue-300"
      };
    }
    return {
      icon: Cpu,
      color: "from-emerald-500/20 to-teal-500/10",
      border: "border-emerald-500/30",
      textGlow: "text-emerald-300"
    };
  };

  // --------------------------------------------------------------------------
  // RENDER 1: INSIDE AGENT VIEW (Node Workflow Canvas & Configuration)
  // --------------------------------------------------------------------------
  if (activeAgent) {
    const currentWf = getAgentWorkflow(activeAgent.id);
    const visual = getAgentVisual(activeAgent);
    const Icon = visual.icon;
    const model = models.find((m) => m.id === activeAgent.modelId);

    return (
      <div className="flex h-full flex-col bg-[#1e2025] text-zinc-100 overflow-hidden relative">
        {/* Agent Node Canvas Floating Top Navigation */}
        <div className="sticky top-3 z-20 mx-5 mt-3 mb-1 flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#1c1d22]/90 backdrop-blur-xl border border-white/10 shadow-2xl shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveAgentIdInFlow(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-zinc-200 hover:text-white transition-all border border-white/10 cursor-pointer shadow-sm group active:scale-95"
            >
              <ArrowLeft size={13} className="text-zinc-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar aos Agentes</span>
            </button>

            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold ${
              activeAgent.status === "running"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                activeAgent.status === "running" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              }`} />
              {activeAgent.status === "running" ? "Ativo" : "Inativo"}
            </span>
          </div>

          {/* Right: Mode Tabs (Workflow vs Settings) & Run/Pause */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/30 p-0.5 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setActiveTabInsideAgent("flow")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTabInsideAgent === "flow"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Cpu size={13} />
                <span>Fluxo</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTabInsideAgent("config")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTabInsideAgent === "config"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sliders size={13} />
                <span>Parâmetros</span>
              </button>
            </div>

            <button
              type="button"
              onClick={(e) => handleToggleAgentStatus(e, activeAgent)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 ${
                activeAgent.status === "running"
                  ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                  : "bg-white text-zinc-950 hover:bg-zinc-200 border border-white"
              }`}
            >
              {activeAgent.status === "running" ? (
                <>
                  <Pause size={12} fill="currentColor" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play size={12} fill="currentColor" />
                  <span>Iniciar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Area inside Agent */}
        <div className="flex-1 overflow-hidden h-full">
          {activeTabInsideAgent === "flow" ? (
            <WorkflowCanvas
              workflow={currentWf}
              onUpdateWorkflow={handleUpdateCurrentAgentWorkflow}
              onRunWorkflowStep={handleLocalRunWorkflowStep}
              accentColor={accentColor}
              cardIcon={visual.icon}
              cardColor={visual.color}
              cardBorder={visual.border}
            />
          ) : (
            <div className="h-full overflow-y-auto p-8 max-w-4xl mx-auto space-y-6">
              <div className="border border-white/10 rounded-2xl bg-[#23252b] p-6 space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white">Configurações do Agente</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Defina as instruções de sistema, privilégios de sandbox e ferramentas disponíveis.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Nome do Agente</label>
                    <input
                      type="text"
                      value={activeAgent.name}
                      onChange={(e) => onUpdateAgent({ ...activeAgent, name: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#1a1b20] px-3.5 py-2 text-xs text-white outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Função / Especialidade</label>
                    <input
                      type="text"
                      value={activeAgent.role}
                      onChange={(e) => onUpdateAgent({ ...activeAgent, role: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#1a1b20] px-3.5 py-2 text-xs text-white outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-zinc-300">Modelo de Linguagem (LLM)</label>
                    <select
                      value={activeAgent.modelId}
                      onChange={(e) => onUpdateAgent({ ...activeAgent, modelId: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#1a1b20] px-3.5 py-2 text-xs text-white outline-none focus:border-white/30"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id} className="bg-zinc-900">
                          {m.name} ({m.provider})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-zinc-300">Instruções de Sistema (Prompt)</label>
                    <textarea
                      rows={5}
                      value={activeAgent.prompt}
                      onChange={(e) => onUpdateAgent({ ...activeAgent, prompt: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#1a1b20] p-3.5 text-xs text-white outline-none focus:border-white/30 font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTabInsideAgent("flow")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold hover:bg-zinc-200 transition-colors shadow-sm"
                  >
                    <Check size={14} />
                    <span>Salvar e Voltar ao Fluxo</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER 2: AGENTS MATRIX OF CARDS VIEW (Side by Side Grid)
  // --------------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col bg-[#1e2025] text-zinc-100 overflow-hidden relative">
      {/* Floating Action & Search Bar */}
      <div className="sticky top-3 z-20 mx-5 mt-3 mb-1 flex flex-wrap items-center justify-between gap-3 bg-[#1c1d22]/90 backdrop-blur-xl p-2.5 rounded-2xl border border-white/10 shadow-2xl shrink-0">
        {/* Left: Quick search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar agentes por nome ou função..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 py-1.5 pl-8 pr-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/25 transition-colors font-sans"
          />
        </div>

        {/* Right: Status Filter & New Agent Action */}
        <div className="flex items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center bg-black/30 p-0.5 rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterStatus === "all" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("running")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterStatus === "running" ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              Ativos
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("idle")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterStatus === "idle" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Inativos
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const newId = `agent-${Date.now()}`;
              const newAgent: Agent = {
                id: newId,
                name: `Novo Agente ${agents.length + 1}`,
                role: "Especialista em Automação",
                modelId: "claude-sonnet-4-5",
                status: "running",
                lastActive: "Ativo agora",
                permissions: ["read_workspace_files", "write_workspace_files"],
                tools: ["file_reader", "web_browser"],
                prompt: "Você é um agente autônomo focado em acelerar tarefas do workspace.",
                isSystem: false,
                isPinned: false,
                isArchived: false
              };
              onUpdateAgent(newAgent);
              setActiveAgentIdInFlow(newId);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer active:scale-95"
          >
            <Plus size={13} />
            <span>Novo Agente</span>
          </button>
        </div>
      </div>

      {/* Cards Matrix Grid (Side by side) */}
      <div className="flex-1 overflow-y-auto p-5 pt-3">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Users size={32} className="text-zinc-600 mb-2" />
            <p className="text-sm font-semibold text-zinc-300">Nenhum agente encontrado</p>
            <p className="text-xs text-zinc-500 mt-1">Tente ajustar seus termos de pesquisa ou filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => {
              const visual = getAgentVisual(agent);
              const Icon = visual.icon;
              const isRunning = agent.status === "running";

              return (
                <div
                  key={agent.id}
                  onClick={() => setActiveAgentIdInFlow(agent.id)}
                  className={`group relative flex flex-col justify-between rounded-2xl border bg-gradient-to-b from-[#25272e] to-[#1f2026] p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer ${
                    isRunning 
                      ? "border-white/10 hover:border-white/20 ring-1 ring-white/5" 
                      : "border-white/[0.06] opacity-80 hover:opacity-100"
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${visual.color} border ${visual.border} shadow-sm group-hover:scale-105 transition-transform`}>
                          <Icon size={16} className={visual.textGlow} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                            {agent.name}
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-medium">{agent.role}</p>
                        </div>
                      </div>

                      {/* Status Toggle & Pin */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleAgentStatus(e, agent)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                            isRunning
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                              : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                          }`}
                          title={isRunning ? "Pausar Agente" : "Ativar Agente"}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                          }`} />
                          {isRunning ? "Ativo" : "Inativo"}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(e, agent)}
                          className={`p-1 rounded-lg transition-colors ${
                            agent.isPinned ? "text-amber-400 hover:bg-white/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                          }`}
                          title={agent.isPinned ? "Desafixar" : "Fixar no topo"}
                        >
                          <Pin size={12} fill={agent.isPinned ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>

                    {/* Agent Description Only */}
                    <div className="mt-3">
                      <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed bg-[#17181c]/70 p-2.5 rounded-xl border border-white/5 font-sans">
                        {agent.prompt}
                      </p>
                    </div>
                  </div>

                  {/* Compact Card Action Footer */}
                  <div className="mt-3.5 pt-2.5 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 font-mono">{agent.lastActive}</span>
                    <div className="flex items-center gap-1 text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors">
                      <span>Ver fluxo</span>
                      <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
