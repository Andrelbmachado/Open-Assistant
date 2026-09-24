import React, { useState, useRef, useEffect } from "react";
import { 
  Play, RotateCcw, Settings, Plus, Cpu, RefreshCw, Eye, 
  Terminal, ShieldCheck, CheckCircle2, AlertTriangle, HelpCircle, Save,
  PanelRightClose, PanelRightOpen, X, Trash2, ChevronRight, Sliders
} from "lucide-react";
import { Workflow, WorkflowNode, NodeConnection, NodeType, NodeStatus } from "../types";

interface WorkflowCanvasProps {
  workflow: Workflow;
  onUpdateWorkflow: (workflow: Workflow) => void;
  onRunWorkflowStep: (nodeId: string) => Promise<void>;
  accentColor: string;
  cardIcon?: React.ComponentType<{ size?: number; className?: string }>;
  cardColor?: string;
  cardBorder?: string;
}

export default function WorkflowCanvas({
  workflow,
  onUpdateWorkflow,
  onRunWorkflowStep,
  accentColor,
  cardIcon: CardIcon,
  cardColor,
  cardBorder
}: WorkflowCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  const [showNodeSelector, setShowNodeSelector] = useState(false);
  const [showFrameSelector, setShowFrameSelector] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedNode = workflow.nodes.find((n) => n.id === selectedNodeId);

  const handleAddNode = (type: NodeType) => {
    const id = `node-${Date.now()}`;
    const nameMap: Record<string, string> = {
      trigger: "Monitor de Workspace",
      watcher: "Analisador UX/UI",
      reader: "Leitor de Código",
      agent: "Decisor Autónomo",
      writer: "Editor Automático",
      optimizer: "Refinador Prompt",
      decision: "Filtro Condicional"
    };
    
    const descMap: Record<string, string> = {
      trigger: "Dispara ações automáticas ao registrar alterações nos arquivos.",
      watcher: "Varre o código visual do layout buscando bugs e falhas estéticas.",
      reader: "Acessa e lê arquivos do diretório de sandbox local.",
      agent: "Agente inteligente que processa raciocínio cognitivo via LLM.",
      writer: "Escreve, atualiza ou corrige arquivos locais com segurança.",
      optimizer: "Refina e calibra prompts de sistema de forma dinâmica.",
      decision: "Valida condições de permissão e lógica antes de continuar."
    };

    const newNode: WorkflowNode = {
      id,
      name: nameMap[type] || "Novo Agente",
      type,
      x: 150 + (workflow.nodes.length * 40) % 250,
      y: 160 + (workflow.nodes.length * 30) % 180,
      status: "idle",
      description: descMap[type] || "Executa operações de sandbox.",
      config: type === "agent" ? { agentName: "Design Researcher" } : type === "writer" ? { target: "styles.css" } : { path: "./src" },
      allowSelfEdit: true,
      requiresApproval: false
    };

    onUpdateWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, newNode]
    });
    setSelectedNodeId(id);
    setShowNodeSelector(false);
  };

  const handleAddFrame = (kind: any) => {
    const id = `frame-${Date.now()}`;
    const newFrame = {
      id,
      name: `Grupo ${workflow.frames.length + 1}`,
      kind: kind || "parallel",
      x: 100 + (workflow.frames.length * 60) % 300,
      y: 120 + (workflow.frames.length * 40) % 200,
      width: 360,
      height: 220,
      config: {},
      nodeIds: [],
      isEnabled: true
    };

    onUpdateWorkflow({
      ...workflow,
      frames: [...workflow.frames, newFrame]
    });
    setShowFrameSelector(false);
  };

  const handleCreateConnection = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    if (workflow.connections.some((c) => c.fromId === fromId && c.toId === toId)) return;

    const newConnection: NodeConnection = {
      id: `conn-${Date.now()}`,
      fromId,
      toId
    };

    onUpdateWorkflow({
      ...workflow,
      connections: [...workflow.connections, newConnection]
    });
    setLinkingSourceId(null);
  };

  const handleDeleteConnection = (connId: string) => {
    onUpdateWorkflow({
      ...workflow,
      connections: workflow.connections.filter((c) => c.id !== connId)
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.filter((n) => n.id !== nodeId),
      connections: workflow.connections.filter((c) => c.fromId !== nodeId && c.toId !== nodeId)
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  // Mouse event handlers for dragging nodes
  const handleNodeMouseDown = (e: React.MouseEvent, node: WorkflowNode) => {
    e.stopPropagation();
    setDraggedNodeId(node.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setSelectedNodeId(node.id);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggedNodeId || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    // Calculate new position relative to the canvas container
    const x = e.clientX - canvasRect.left - dragOffset.x;
    const y = e.clientY - canvasRect.top - dragOffset.y;

    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.id === draggedNodeId ? { ...n, x, y } : n)),
    });
  };

  const handleCanvasMouseUp = () => {
    setDraggedNodeId(null);
  };

  // Run the entire workflow sequentially
  const handleRunAll = async () => {
    if (isRunningAll) return;
    setIsRunningAll(true);

    // Reset status to idle first
    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => ({ ...n, status: "idle", progress: 0 })),
    });

    // Run each node step-by-step
    for (const node of workflow.nodes) {
      await onRunWorkflowStep(node.id);
      // Wait slightly between steps for animation effect
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    setIsRunningAll(false);
  };

  const handleResetWorkflow = () => {
    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => ({ ...n, status: "idle", progress: 0 })),
    });
  };

  const handleNodeConfigChange = (field: string, value: any) => {
    if (!selectedNodeId) return;
    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.id === selectedNodeId ? { ...n, [field]: value } : n)),
    });
  };

  const handleNodeDetailConfigChange = (key: string, value: string) => {
    if (!selectedNodeId || !selectedNode) return;
    onUpdateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...n.config, [key]: value } } : n)),
    });
  };

  // Render SVG lines connecting nodes
  const renderConnections = () => {
    return workflow.connections.map((conn) => {
      const fromNode = workflow.nodes.find((n) => n.id === conn.fromId);
      const toNode = workflow.nodes.find((n) => n.id === conn.toId);
      if (!fromNode || !toNode) return null;

      // Calculate middle port coordinate positions
      const fromX = fromNode.x + 150; // offset width
      const fromY = fromNode.y + 35;  // offset half-height
      const toX = toNode.x;
      const toY = toNode.y + 35;

      // Draw bezier curved paths
      const dx = Math.abs(toX - fromX) * 0.5;
      const pathData = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

      return (
        <g key={conn.id}>
          <path
            d={pathData}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="3.5"
          />
          <path
            d={pathData}
            fill="none"
            stroke={fromNode.status === "success" ? "#10b981" : fromNode.status === "running" ? "#22d3ee" : "rgba(255, 255, 255, 0.25)"}
            strokeWidth="1.8"
            className={fromNode.status === "running" ? "stroke-dash-pulse animate-dash" : ""}
            style={{
              strokeDasharray: fromNode.status === "running" ? "6, 4" : "none"
            }}
          />
        </g>
      );
    });
  };

  // Icon selector based on node types
  const getNodeIcon = (type: NodeType, status: NodeStatus) => {
    if (status === "running") {
      return <RefreshCw size={14} className="text-cyan-400 animate-spin" />;
    }
    switch (type) {
      case "trigger":
        return <Play size={14} className="text-emerald-400" />;
      case "watcher":
        return <Eye size={14} className="text-amber-400" />;
      case "reader":
        return <Plus size={14} className="text-cyan-400" />;
      case "agent":
        return <Cpu size={14} className="text-indigo-400" />;
      case "optimizer":
        return <Settings size={14} className="text-fuchsia-400" />;
      case "writer":
        return <Save size={14} className="text-pink-400" />;
      default:
        return <HelpCircle size={14} className="text-white/40" />;
    }
  };

  return (
    <div className="flex h-full bg-[#26282e] text-zinc-100 select-none relative">
      {/* Node Workspace Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Floating Canvas Action Controls (Top Right of the Canvas Screen) */}
        <div className="absolute top-3.5 right-4 z-20 flex items-center gap-2 bg-[#1c1d22]/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl">
          {/* Create Node Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNodeSelector(!showNodeSelector);
                setShowFrameSelector(false);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus size={13} className="text-zinc-300" />
              <span>Criar Nó</span>
            </button>
            {showNodeSelector && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-[#1c1d22]/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Tipo de Agente / Nó</div>
                {[
                  { type: "trigger", label: "Monitor de Workspace", desc: "Reage a mudanças locais" },
                  { type: "watcher", label: "Analisador UX/UI", desc: "Garante qualidade visual" },
                  { type: "reader", label: "Leitor de Código", desc: "Lê arquivos sandbox" },
                  { type: "agent", label: "Decisor Autónomo", desc: "Raciocina com IA" },
                  { type: "writer", label: "Editor Automático", desc: "Salva arquivos no disco" },
                  { type: "optimizer", label: "Refinador Prompt", desc: "Melhora instruções" },
                  { type: "decision", label: "Filtro Condicional", desc: "Decisões lógicas" }
                ].map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleAddNode(item.type as NodeType)}
                    className="flex w-full flex-col text-left rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">{item.label}</span>
                    <span className="text-[9px] text-zinc-400">{item.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create Frame Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFrameSelector(!showFrameSelector);
                setShowNodeSelector(false);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus size={13} className="text-zinc-300" />
              <span>Criar Frame</span>
            </button>
            {showFrameSelector && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-white/10 bg-[#1c1d22]/95 backdrop-blur-xl p-1.5 shadow-2xl z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Tipo de Frame</div>
                {[
                  { kind: "parallel", label: "Execução Paralela", desc: "Processa em concorrência" },
                  { kind: "schedule", label: "Agendador Cron", desc: "Roda em tempos fixos" },
                  { kind: "folder", label: "Diretório Ativo", desc: "Agrupa por diretório" },
                  { kind: "approval", label: "Revisão Manual", desc: "Requer aval humano" }
                ].map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => handleAddFrame(item.kind as any)}
                    className="flex w-full flex-col text-left rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">{item.label}</span>
                    <span className="text-[9px] text-zinc-400">{item.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          {/* Resetar Status */}
          <button
            type="button"
            onClick={handleResetWorkflow}
            className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer"
            title="Resetar status de execução de todos os nós para ocioso"
          >
            <RotateCcw size={12} className="text-zinc-400" />
            <span>Resetar Status</span>
          </button>

          {/* Executar Fluxo */}
          <button
            type="button"
            onClick={handleRunAll}
            disabled={isRunningAll}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer ${
              isRunningAll
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-not-allowed"
                : "bg-white text-zinc-950 hover:bg-zinc-200 border border-white"
            }`}
          >
            {isRunningAll ? (
              <>
                <RefreshCw size={12} className="animate-spin text-cyan-300" />
                <span>Executando...</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                <span>Executar Fluxo</span>
              </>
            )}
          </button>

          {/* Floating Minimize/Restore Right Sidebar Icon - Directly to the right of Executar Fluxo */}
          {selectedNode && (
            <button
              type="button"
              onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
              className="flex items-center justify-center h-[30px] w-[30px] text-cyan-400 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer bg-transparent border-none p-0 ml-0.5"
              title={isSidebarMinimized ? "Restaurar barra lateral" : "Minimizar barra lateral"}
            >
              {isSidebarMinimized ? (
                <PanelRightOpen size={18} className="text-cyan-400 hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              ) : (
                <PanelRightClose size={18} className="text-cyan-400 hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              )}
            </button>
          )}
        </div>

        {/* Dynamic Nodes Canvas */}
        <div
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onClick={(e) => {
            setShowNodeSelector(false);
            setShowFrameSelector(false);
            // Click on empty canvas background deselects the node
            if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).classList.contains("grid-bg")) {
              setSelectedNodeId(null);
            }
          }}
          className="flex-1 relative overflow-auto grid-bg cursor-grab active:cursor-grabbing bg-[#26282e]"
          style={{ minWidth: "1200px", minHeight: "800px" }}
        >
          {/* Workflow Grouping Frames */}
          {workflow.frames.map((frame) => (
            <div
              key={frame.id}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
              }}
              className="absolute rounded-xl border border-dashed border-zinc-600/60 bg-zinc-800/30 p-3 pointer-events-none"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                  Frame: {frame.name} ({frame.kind})
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateWorkflow({
                      ...workflow,
                      frames: workflow.frames.filter((f) => f.id !== frame.id)
                    });
                  }}
                  className="pointer-events-auto rounded bg-zinc-700 p-1 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  title="Excluir Frame"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {/* Connectors SVGs overlay */}
          <svg className="absolute inset-0 pointer-events-none h-full w-full">
            {renderConnections()}
          </svg>

          {/* Connection construction help indicator */}
          {linkingSourceId && (
            <div className="absolute top-4 left-4 rounded-lg bg-zinc-800 border border-zinc-600 px-3.5 py-2 text-xs text-white z-20 flex items-center gap-3 shadow-xl">
              <span className="h-2 w-2 rounded-full bg-zinc-300 animate-ping shrink-0" />
              <span>Conectando de <strong>{workflow.nodes.find(n => n.id === linkingSourceId)?.name}</strong>. Clique em outro nó para criar a conexão.</span>
              <button
                onClick={() => setLinkingSourceId(null)}
                className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-600 transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Interactive Drag nodes */}
          {workflow.nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isLinkingTarget = linkingSourceId && linkingSourceId !== node.id;
            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (linkingSourceId && linkingSourceId !== node.id) {
                    handleCreateConnection(linkingSourceId, node.id);
                  } else {
                    setSelectedNodeId(node.id);
                  }
                }}
                style={{ left: node.x, top: node.y }}
                className={`absolute w-[164px] rounded-xl border bg-zinc-800/95 p-3 shadow-lg hover:border-zinc-500 transition-all cursor-pointer ${
                  isSelected 
                    ? "ring-2 ring-cyan-400/80 border-transparent shadow-xl" 
                    : isLinkingTarget
                    ? "ring-2 ring-zinc-500 animate-pulse border-transparent"
                    : "border-zinc-700/80"
                }`}
              >
                {/* Node Title & Action Tools */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {getNodeIcon(node.type, node.status)}
                    <span className="text-[11px] font-semibold truncate text-white">{node.name}</span>
                  </div>

                  {/* Actions buttons on hover/select */}
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinkingSourceId(node.id);
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                      title="Conectar a outro nó"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
                      title="Excluir nó"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-[9px] text-zinc-400 line-clamp-2 leading-tight mb-2">
                  {node.description}
                </p>

                {/* Progress Bar / Status pill */}
                {node.status === "running" && node.progress !== undefined && (
                  <div className="w-full bg-zinc-700 rounded-full h-1 mt-1 overflow-hidden">
                    <div 
                      className="bg-cyan-400 h-full transition-all duration-300"
                      style={{ width: `${node.progress}%` }}
                    />
                  </div>
                )}

                {/* Footer status label */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    {node.type}
                  </span>
                  <span className={`text-[8px] font-bold uppercase rounded-md px-1.5 py-0.5 ${
                    node.status === "success" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" :
                    node.status === "running" ? "bg-cyan-950/60 text-cyan-300 border border-cyan-800/60" :
                    node.status === "error" ? "bg-red-950/60 text-red-300 border border-red-800/60" :
                    "bg-zinc-700/60 text-zinc-400"
                  }`}>
                    {node.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Sidebar Node Configuration & Details Pane */}
      {/* Only rendered when a node is selected AND sidebar is not minimized */}
      {selectedNode && !isSidebarMinimized && (
        <div className="w-[300px] border-l border-white/10 bg-[#16171c] p-4 flex flex-col justify-between overflow-y-auto z-20 shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="space-y-4">
            {/* Header with Title, Card Icon on the right, and Minimize Button */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 overflow-hidden pr-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 border border-white/10 shrink-0 shadow-sm">
                  {getNodeIcon(selectedNode.type, selectedNode.status)}
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-xs font-bold text-white truncate">{selectedNode.name}</h3>
                  <span className="text-[9px] font-mono uppercase text-zinc-400">{selectedNode.type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Selected Card / Agent Icon displayed on the right */}
                {CardIcon ? (
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br ${cardColor || "from-white/10 to-white/5"} border ${cardBorder || "border-white/10"} shadow-sm`}
                    title="Card / Agente Selecionado"
                  >
                    <CardIcon size={14} className="text-cyan-300" />
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 border border-white/10 shadow-sm" title="Ícone do Nó">
                    {getNodeIcon(selectedNode.type, selectedNode.status)}
                  </div>
                )}

                {/* Only Minimize button */}
                <button
                  type="button"
                  onClick={() => setIsSidebarMinimized(true)}
                  className="flex items-center justify-center h-7 w-7 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Minimizar Barra Lateral"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
            </div>

            {/* Description */}
            <p className="text-[11px] text-zinc-300 leading-relaxed bg-[#1d1e24] p-2.5 rounded-xl border border-white/5">
              {selectedNode.description}
            </p>

            {/* Run node action block */}
            <div className="rounded-xl border border-white/10 bg-[#1d1e24] p-3 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Status de Execução</span>
                <span className={`capitalize text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  selectedNode.status === "success" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                  selectedNode.status === "running" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" :
                  selectedNode.status === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                  "bg-zinc-800 text-zinc-400 border border-zinc-700"
                }`}>
                  {selectedNode.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRunWorkflowStep(selectedNode.id)}
                disabled={selectedNode.status === "running"}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 py-2 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={selectedNode.status === "running" ? "animate-spin" : ""} />
                Forçar Execução
              </button>
            </div>

            {/* Node Connections configurator */}
            <div className="space-y-3 border-t border-white/10 pt-3.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Conexões deste Nó</h4>
              
              <div className="space-y-2 text-xs">
                {/* Connection creators */}
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Conectar este nó para:</label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleCreateConnection(selectedNode.id, e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#1d1e24] px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-400 cursor-pointer [&>option]:bg-[#1d1e24] [&>option]:text-white"
                  >
                    <option value="">Selecione um destino...</option>
                    {workflow.nodes
                      .filter((n) => n.id !== selectedNode.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* List connections from this node */}
                <div className="space-y-1 mt-2">
                  <span className="text-[10px] text-zinc-400">Links Ativos:</span>
                  <div className="space-y-1 max-h-[110px] overflow-y-auto">
                    {workflow.connections
                      .filter((c) => c.fromId === selectedNode.id || c.toId === selectedNode.id)
                      .map((conn) => {
                        const fromNode = workflow.nodes.find((n) => n.id === conn.fromId);
                        const toNode = workflow.nodes.find((n) => n.id === conn.toId);
                        return (
                          <div key={conn.id} className="flex items-center justify-between rounded-lg bg-[#1d1e24] p-1.5 text-[10px] font-mono border border-white/5">
                            <span className="truncate max-w-[190px] text-zinc-300">
                              {fromNode?.name === selectedNode.name ? `→ ${toNode?.name}` : `← ${fromNode?.name}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteConnection(conn.id)}
                              className="text-zinc-400 hover:text-red-400 transition-colors p-0.5 cursor-pointer"
                              title="Excluir Conexão"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    {workflow.connections.filter((c) => c.fromId === selectedNode.id || c.toId === selectedNode.id).length === 0 && (
                      <span className="text-[10px] text-zinc-500 italic block py-0.5">Nenhum link conectado.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Node configurations */}
            <div className="space-y-3 border-t border-white/10 pt-3.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Parâmetros</h4>
              
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Nome do Nó</label>
                  <input
                    type="text"
                    value={selectedNode.name}
                    onChange={(e) => handleNodeConfigChange("name", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#1d1e24] px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>

                {selectedNode.temperature !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <label>Temperatura</label>
                      <span className="font-mono">{selectedNode.temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={selectedNode.temperature}
                      onChange={(e) => handleNodeConfigChange("temperature", parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                )}

                {Object.keys(selectedNode.config).map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] capitalize text-zinc-400">{key.replace(/([A-Z])/g, " $1")}</label>
                    <input
                      type="text"
                      value={selectedNode.config[key]}
                      onChange={(e) => handleNodeDetailConfigChange(key, e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#1d1e24] px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 font-mono text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Node button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                <Trash2 size={13} />
                <span>Excluir este Nó</span>
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-3 mt-4">
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 leading-relaxed bg-[#1d1e24] p-2.5 rounded-xl border border-white/5">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <span>Nó isolado com execução monitorada em Sandbox.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
