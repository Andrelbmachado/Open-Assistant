import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Bot, User, CheckCircle2, Play, Copy, Check, 
  Terminal, Sparkles, Code, FileDiff, FileText, ChevronDown, ChevronRight,
  Paperclip, Mic, MicOff, Volume2, Shield, ShieldAlert, X, Activity, BarChart3, HelpCircle,
  Plus, FolderOpen, AudioLines, Sliders, Gauge, Zap
} from "lucide-react";
import { ChatSession, ModelConfig, ChatMessage, InteractiveBlock, ActionStep, Project } from "../types";
import { getProjectIcon } from "./Sidebar.tsx";

const AI_COMPANIES = [
  { id: "openai", name: "OpenAI", providerKey: "openai", subtitle: "GPT-4.5, GPT-4o, o1, o3-mini", icon: "✨" },
  { id: "anthropic", name: "Anthropic", providerKey: "anthropic", subtitle: "Claude 3.7, 3.5 Sonnet & Haiku", icon: "⚡" },
  { id: "google", name: "Google", providerKey: "google", subtitle: "Gemini 2.0 Flash, 2.0 Pro, 1.5", icon: "🌐" },
  { id: "local", name: "Meta / Local", providerKey: "local", subtitle: "Llama 3.3, DeepSeek R1, Ollama", icon: "🦙" }
];

interface ChatPanelProps {
  session: ChatSession;
  models: ModelConfig[];
  onSendMessage: (text: string, modelId: string) => Promise<void>;
  accentColor: string;
  projects?: Project[];
  onOpenProject?: (projectId: string) => void;
  headerActions?: React.ReactNode;
}

export default function ChatPanel({ 
  session, 
  models, 
  onSendMessage, 
  accentColor,
  projects = [],
  onOpenProject,
  headerActions
}: ChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(session.modelId);
  const [isSending, setIsSending] = useState(false);
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
  
  // Interactive Overhaul States
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showConfigMenu, setShowConfigMenu] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("openai");
  const [activeSliderModelId, setActiveSliderModelId] = useState<string | null>(session.modelId);
  const [modelStrengths, setModelStrengths] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    models.forEach(m => {
      map[m.id] = m.strength ?? 75;
    });
    return map;
  });
  const [strengthToast, setStrengthToast] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isDictation, setIsDictation] = useState(false);
  const [hasWriteAccess, setHasWriteAccess] = useState(true); // default true for developer, toggleable
  const [commandStates, setCommandStates] = useState<Record<string, { status: "idle" | "running" | "success" | "error"; output?: string[] }>>({});
  const [localStepsDone, setLocalStepsDone] = useState<Record<string, boolean>>({});

  // Sync company when selectedModelId changes
  useEffect(() => {
    const current = models.find(m => m.id === selectedModelId);
    if (current) {
      if (current.company?.toLowerCase().includes("anthropic") || current.provider === "anthropic") {
        setSelectedCompany("anthropic");
      } else if (current.company?.toLowerCase().includes("google") || current.provider === "google") {
        setSelectedCompany("google");
      } else if (current.company?.toLowerCase().includes("meta") || current.company?.toLowerCase().includes("local") || current.provider === "local") {
        setSelectedCompany("local");
      } else {
        setSelectedCompany("openai");
      }
      setActiveSliderModelId(current.id);
    }
  }, [selectedModelId, models]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<any>(null);
  const configMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (configMenuRef.current && !configMenuRef.current.contains(e.target as Node)) {
        setShowConfigMenu(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, isSending, isRecording]);

  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const activeModel = models.find((m) => m.id === selectedModelId) || models[0];

  // Find if this session belongs to a project
  const parentProject = projects.find(p => p.chatIds.includes(session.id));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && attachedFiles.length === 0 && !isRecording) return;

    let textToSend = inputText;
    if (attachedFiles.length > 0) {
      textToSend += `\n\n[Anexos de arquivos: ${attachedFiles.join(", ")}]`;
    }
    if (isRecording) {
      textToSend = `[Mensagem de áudio transcrita: ${recordingSeconds}s de gravação] "Por favor, compile e valide o layout com base no novo arquivo de estilos CSS."`;
      setIsRecording(false);
    }

    setInputText("");
    setAttachedFiles([]);
    setIsSending(true);
    
    try {
      await onSendMessage(textToSend, selectedModelId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyCode = (id: string, code?: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedBlockId(id);
    setTimeout(() => setCopiedBlockId(null), 2000);
  };

  // Run a mock local terminal command in-app
  const handleRunCommand = (blockId: string, command: string) => {
    setCommandStates(prev => ({
      ...prev,
      [blockId]: { status: "running", output: ["$ " + command, "Iniciando compilador g++ sandbox...", "Carregando módulos de cache..."] }
    }));

    setTimeout(() => {
      setCommandStates(prev => ({
        ...prev,
        [blockId]: { 
          status: "running", 
          output: [
            ...(prev[blockId]?.output || []),
            "⚡ Compilando src/main.tsx...",
            "✔ Transpilação concluída com sucesso em 420ms.",
            "✔ Empacotamento de bundle finalizado: dist/assets/index.js (312 KB)"
          ]
        }
      }));
    }, 800);

    setTimeout(() => {
      setCommandStates(prev => ({
        ...prev,
        [blockId]: { 
          status: "success", 
          output: [
            ...(prev[blockId]?.output || []),
            "🚀 Servidor emulado escutando na porta 3000.",
            "● Estado do sandbox: Saudável.",
            "Sessão finalizada com status 0 (Sucesso)."
          ]
        }
      }));
    }, 1800);
  };

  const toggleStep = (stepId: string) => {
    setLocalStepsDone(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  // Format seconds into minutes/seconds
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Render a specific interactive developer block
  const renderInteractiveBlock = (block: InteractiveBlock) => {
    switch (block.type) {
      case "actionPlan":
      case "action-plan":
        return (
          <div key={block.id} className="my-3 rounded-lg border border-zinc-700 bg-zinc-800/80 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-700/60 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-zinc-300" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{block.title || "Plano de Tarefas"}</h4>
              </div>
              <span className="text-[9px] rounded bg-zinc-700 px-1.5 py-0.5 text-zinc-200 font-bold font-mono">Tarefa Ativa</span>
            </div>
            <ul className="space-y-2.5">
              {block.steps?.map((step) => {
                const isChecked = localStepsDone[step.id] !== undefined ? localStepsDone[step.id] : step.done;
                return (
                  <li 
                    key={step.id} 
                    onClick={() => toggleStep(step.id)}
                    className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer hover:bg-white/[0.04] p-1.5 rounded transition-colors group"
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-all ${
                      isChecked 
                        ? "border-zinc-400 bg-zinc-600 text-white shadow" 
                        : "border-zinc-600 text-zinc-500 group-hover:border-zinc-400"
                    }`}>
                      {isChecked ? "✓" : ""}
                    </span>
                    <div className="flex-1">
                      <p className={`font-semibold transition-colors ${isChecked ? "text-zinc-400 line-through" : "text-zinc-100"}`}>{step.title}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );

      case "commandRun":
      case "command-run":
        const commandState = commandStates[block.id] || { status: "idle" };
        return (
          <div key={block.id} className="my-3 rounded-lg border border-zinc-700 bg-[#16171b] p-3 shadow-inner font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Terminal size={12} className="text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-400">Console Terminal</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleCopyCode(block.id, block.command)}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="Copiar comando"
                >
                  {copiedBlockId === block.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1.5 text-xs mb-2">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 select-none">$</span>
                <code className="text-zinc-200 font-semibold">{block.command}</code>
              </div>
              {commandState.status === "idle" ? (
                <button
                  onClick={() => handleRunCommand(block.id, block.command || "")}
                  className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white"
                >
                  <Play size={8} fill="currentColor" /> Run
                </button>
              ) : (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  commandState.status === "running" ? "bg-zinc-700 text-zinc-200 animate-pulse" : "bg-zinc-700 text-zinc-200"
                }`}>
                  {commandState.status === "running" ? "Executando..." : "Sucesso"}
                </span>
              )}
            </div>

            {/* Simulated Live Outputs */}
            {commandState.status !== "idle" && (
              <div className="mt-2 rounded bg-black/40 p-2 border border-zinc-800 text-[10px] text-zinc-300 max-h-[140px] overflow-y-auto space-y-1">
                {commandState.output?.map((line, idx) => (
                  <div key={idx} className={line.startsWith("$") ? "text-zinc-400" : line.startsWith("✔") ? "text-zinc-200" : "text-zinc-400"}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "fileDiff":
      case "file-diff":
        return (
          <div key={block.id} className="my-3 rounded-lg border border-zinc-700 bg-[#16171b] overflow-hidden shadow-md">
            <div className="flex items-center justify-between bg-zinc-800/80 px-3 py-2 border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <FileDiff size={12} className="text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-200">{block.diffInfo?.filePath || block.filePath || "diff_output.txt"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-emerald-400 font-semibold">+{block.diffInfo?.addedCount || 0}</span>
                <span className="text-red-400 font-semibold">-{block.diffInfo?.removedCount || 0}</span>
              </div>
            </div>
            <div className="p-2.5 font-mono text-[11px] overflow-x-auto max-h-[220px] space-y-0.5 bg-[#121316] leading-relaxed">
              {block.diffInfo?.lines.map((line) => (
                <div 
                  key={line.id} 
                  className={`flex gap-3 px-2 py-0.5 leading-relaxed rounded ${
                    line.type === "add" ? "bg-zinc-800 text-zinc-200" : 
                    line.type === "remove" ? "bg-red-950/40 text-red-300" : 
                    "text-zinc-400"
                  }`}
                >
                  <span className="w-6 shrink-0 select-none text-right opacity-40">
                    {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case "code":
        return (
          <div key={block.id} className="my-3 rounded-lg border border-zinc-700 bg-[#16171b] overflow-hidden font-mono shadow-md">
            <div className="flex items-center justify-between bg-zinc-800/80 px-3 py-2 border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <Code size={12} className="text-zinc-400" />
                <span className="text-xs font-medium text-zinc-300">{block.title} ({block.language || "typescript"})</span>
              </div>
              <button 
                onClick={() => handleCopyCode(block.id, block.code)}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Copiar código"
              >
                {copiedBlockId === block.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={11} />}
              </button>
            </div>
            <pre className="p-3.5 text-[11px] text-zinc-200 overflow-x-auto max-h-[260px] bg-[#121316] leading-relaxed">
              <code>{block.code}</code>
            </pre>
          </div>
        );

      case "dashboard":
        return (
          <div key={block.id} className="my-3 rounded-lg border border-zinc-700 bg-zinc-800/80 p-3 shadow-md">
            <div className="flex items-center justify-between border-b border-zinc-700/60 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <BarChart3 size={13} className="text-zinc-300" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">Métricas de Execução</span>
              </div>
              <span className="text-[8px] uppercase tracking-wider text-zinc-400 font-mono font-bold">● LIVE SANDBOX</span>
            </div>
            
            {/* Charts & Key Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { title: "Velocidade LLM", val: "74.8", unit: "TOK/S", change: "+12%" },
                { title: "Uso de Memória", val: "3.12", unit: "GB", change: "Ollama" },
                { title: "Latência API", val: "220", unit: "MS", change: "Excelente" }
              ].map((m, i) => (
                <div key={i} className="rounded bg-zinc-800 p-2 border border-zinc-700">
                  <div className="text-[8px] text-zinc-400 font-semibold">{m.title}</div>
                  <div className="text-xs font-bold text-white mt-0.5">{m.val} <span className="text-[8px] text-zinc-400 font-normal">{m.unit}</span></div>
                  <div className="text-[8px] text-zinc-400 mt-0.5">{m.change}</div>
                </div>
              ))}
            </div>

            {/* Custom SVG Mini Bar Chart */}
            <div className="mt-3.5 bg-black/30 rounded p-2 border border-zinc-700/60 space-y-1.5">
              <div className="text-[8px] text-zinc-400 font-mono flex justify-between">
                <span>Rendimento do Processamento do Agente</span>
                <span>Max: 100 tok/s</span>
              </div>
              <div className="flex items-end justify-between h-10 px-1 gap-1">
                {[45, 62, 30, 85, 75, 95, 68, 54, 88, 74].map((v, i) => (
                  <div 
                    key={i} 
                    style={{ height: `${v}%` }} 
                    className="flex-1 rounded-sm bg-zinc-500 hover:bg-zinc-400 transition-all cursor-pointer"
                    title={`Passo ${i+1}: ${v}%`}
                  />
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-[#212126] text-zinc-100 overflow-hidden">
      {/* Title Header with seamless blur fade without separating line */}
      <div className="z-20 min-h-[64px] sm:min-h-[72px] flex items-center justify-between bg-gradient-to-b from-[#212126] via-[#212126]/90 to-transparent backdrop-blur-md px-6 pt-5 pb-5 select-none shrink-0">
        <div className="flex items-center min-w-0 pr-4">
          {parentProject ? (
            <div className="flex items-center flex-wrap gap-2 text-xl sm:text-2xl font-bold tracking-tight text-white leading-none">
              <button 
                type="button"
                onClick={() => onOpenProject?.(parentProject.id)}
                className="flex items-center gap-2 hover:text-blue-300 transition-colors cursor-pointer group text-left"
                title={`Abrir projeto ${parentProject.name}`}
              >
                {getProjectIcon(parentProject.symbol, 22, "text-zinc-400 group-hover:text-blue-300 shrink-0")}
                <span className="text-zinc-200 group-hover:text-white font-bold">{parentProject.name}</span>
              </button>
              <span className="text-zinc-600 font-normal">/</span>
              <span className="text-white font-bold truncate">{session.title}</span>
            </div>
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-none truncate">
              {session.title}
            </h1>
          )}
        </div>

        {headerActions && (
          <div className="flex items-center shrink-0 mr-2 -translate-y-0.5">
            {headerActions}
          </div>
        )}
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 space-y-6">
        {session.messages.map((message, index) => {
          const isUser = message.sender === "user";
          
          // Detect model transition to render separator line
          const showModelTransition = index > 0 && !isUser && message.modelUsed && 
            (session.messages[index - 1].sender === "user" || session.messages[index - 1].modelUsed !== message.modelUsed);

          return (
            <div key={message.id} className="space-y-4">
              {/* Transition Separator */}
              {showModelTransition && (
                <div className="flex items-center justify-center my-6">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <div className="mx-4 flex items-center gap-2 rounded-full border border-white/10 bg-[#282a32] px-3 py-1 text-[9px] font-mono tracking-wider text-zinc-300">
                    <Sparkles size={10} className="text-zinc-300" />
                    <span>Transição de Fluxo para: {message.modelUsed}</span>
                  </div>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
              )}

              {isUser ? (
                /* User Prompt: Only the bubble, without user photo/avatar icon */
                <div className="flex w-full justify-end">
                  <div className="max-w-[80%] rounded-xl px-4 py-3 text-xs leading-relaxed shadow-sm bg-[#2f3138] text-white rounded-tr-none border border-white/10">
                    <div className="whitespace-pre-wrap font-sans break-words">{message.text}</div>
                  </div>
                </div>
              ) : (
                /* AI Message: Pure text, NO photo/avatar icon, NO background bubble */
                <div className="flex w-full justify-start">
                  <div className="w-full max-w-[92%] text-xs leading-relaxed text-zinc-200">
                    {/* Header metrics */}
                    {message.modelUsed && (
                      <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-500 mb-2 font-mono">
                        <span>{message.modelUsed}</span>
                        {message.responseTime && (
                          <>
                            <span>•</span>
                            <span>{message.responseTime}s latência</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Pure text response without bubble container */}
                    <div className="whitespace-pre-wrap font-sans break-words leading-relaxed text-zinc-200 text-[13px]">
                      {message.text}
                    </div>

                    {/* Dynamic developer interactive blocks (task spec, terminal, command, code, dashboard) */}
                    {message.blocks && message.blocks.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {message.blocks.map((block) => renderInteractiveBlock(block))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Loading Spinner without Avatar */}
        {isSending && (
          <div className="flex w-full justify-start items-center py-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-sans">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
              <span>O Agente está raciocinando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Waveform when recording voice */}
      {isRecording && (
        <div className="mx-6 mb-2 rounded-xl bg-[#282a32] border border-white/10 p-3 flex items-center justify-between shadow-2xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-full bg-red-500 animate-ping shrink-0" />
            <div>
              <span className="text-xs font-bold text-white">Gravando Áudio (Modo Voz)</span>
              <span className="text-[10px] text-zinc-400 block">Pressione enviar para mandar transcrição</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Visual audio waveform emulator */}
            <div className="flex items-end gap-1 h-5 px-2">
              {[60, 40, 80, 50, 95, 35, 70, 50, 85, 45].map((v, i) => (
                <div 
                  key={i} 
                  className="w-1 rounded bg-white animate-bounce" 
                  style={{ animationDelay: `${i * 0.15}s`, height: `${v}%` }}
                />
              ))}
            </div>
            <span className="text-xs font-mono text-white font-bold">{formatTime(recordingSeconds)}</span>
            <button 
              onClick={() => setIsRecording(false)} 
              className="text-zinc-400 hover:text-red-400"
              title="Cancelar Gravação"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Input Form Bar */}
      <div className="border-t border-white/[0.04] bg-[#212126] p-3.5 backdrop-blur-md">
        {/* Attached files lists chips */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {attachedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-1.5 rounded-lg bg-[#282a32] border border-white/10 px-2.5 py-1 text-[10px] text-zinc-200 font-semibold">
                <FileText size={10} />
                <span>{file}</span>
                <button 
                  onClick={() => setAttachedFiles(prev => prev.filter(f => f !== file))}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          {/* AI Permissions & Model Selector Popover (Company -> Models -> Strength Slider) */}
          <div ref={configMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowConfigMenu(!showConfigMenu)}
              className={`rounded-xl p-2.5 border transition-all flex items-center justify-center ${
                showConfigMenu
                  ? "bg-white/15 border-white/20 text-white shadow-md ring-1 ring-white/20"
                  : "bg-[#282a32] border-white/10 text-zinc-300 hover:text-white hover:bg-[#32343e]"
              }`}
              title="Seleção de Modelos por Empresa e Ajuste de Força"
            >
              <Plus size={15} className={`transition-transform duration-200 ${showConfigMenu ? "rotate-45" : ""}`} />
            </button>

            {/* Hierarchical Flyout Menu: 1. Companies -> 2. Lateral Models Dropdown -> 3. Strength Slider */}
            {showConfigMenu && (() => {
              const getCompanyModels = (companyId: string) => {
                return models.filter(m => {
                  if (m.company) {
                    if (companyId === "openai") return m.company.toLowerCase().includes("openai");
                    if (companyId === "anthropic") return m.company.toLowerCase().includes("anthropic");
                    if (companyId === "google") return m.company.toLowerCase().includes("google");
                    if (companyId === "local") return m.company.toLowerCase().includes("meta") || m.company.toLowerCase().includes("local");
                  }
                  if (companyId === "openai") return m.provider === "openai";
                  if (companyId === "anthropic") return m.provider === "anthropic";
                  if (companyId === "google") return m.provider === "google";
                  if (companyId === "local") return m.provider === "local";
                  return false;
                });
              };

              const currentCompanyModels = getCompanyModels(selectedCompany);
              const activeModel = models.find(m => m.id === (activeSliderModelId || selectedModelId)) || currentCompanyModels[0] || models[0];
              const strengthVal = modelStrengths[activeModel?.id] ?? activeModel?.strength ?? 75;

              const getStrengthMeta = (val: number) => {
                if (val <= 35) {
                  return {
                    label: "Rápido & Econômico",
                    desc: "Baixa latência e respostas diretas. Ideal para consultas simples e edições rápidas.",
                    badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
                    barColor: "from-emerald-500 to-teal-400"
                  };
                }
                if (val <= 65) {
                  return {
                    label: "Equilibrado & Versátil",
                    desc: "Equilíbrio ideal entre velocidade de resposta, raciocínio e precisão técnica.",
                    badgeColor: "text-blue-400 bg-blue-500/10 border-blue-500/30",
                    barColor: "from-blue-500 to-cyan-400"
                  };
                }
                if (val <= 85) {
                  return {
                    label: "Alta Inteligência & Código",
                    desc: "Raciocínio lógico aprofundado, excelente para arquitetura de software e refatoração.",
                    badgeColor: "text-purple-400 bg-purple-500/10 border-purple-500/30",
                    barColor: "from-purple-500 to-indigo-400"
                  };
                }
                return {
                  label: "Potência Máxima & Raciocínio Profundo",
                  desc: "Chain-of-thought completo, máxima dedicação analítica para tarefas complexas.",
                  badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
                  barColor: "from-amber-500 to-orange-400"
                };
              };

              const strengthMeta = getStrengthMeta(strengthVal);

              return (
                <div className="absolute left-0 bottom-full mb-3 w-[660px] max-w-[90vw] rounded-2xl border border-white/10 bg-[#1c1d22]/98 backdrop-blur-2xl shadow-2xl z-50 overflow-hidden text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-150 flex flex-col divide-y divide-white/10">
                  {/* Popover Top Bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-zinc-300" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">Modelos de IA & Potência</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                        Ativo: {models.find(m => m.id === selectedModelId)?.name || selectedModelId}
                      </span>
                    </div>

                    {/* Access Permission Toggle in header */}
                    <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5">
                      <button
                        type="button"
                        onClick={() => setHasWriteAccess(true)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
                          hasWriteAccess
                            ? "bg-white/15 text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                        title="Permite à IA criar e compilar código"
                      >
                        <Shield size={11} className={hasWriteAccess ? "text-emerald-400" : "text-zinc-500"} />
                        <span>Write</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasWriteAccess(false)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
                          !hasWriteAccess
                            ? "bg-amber-950/60 text-amber-300"
                            : "text-zinc-400 hover:text-white"
                        }`}
                        title="Apenas leitura analítica"
                      >
                        <ShieldAlert size={11} className={!hasWriteAccess ? "text-amber-400" : "text-zinc-500"} />
                        <span>Read</span>
                      </button>
                    </div>
                  </div>

                  {/* 3-Column Hierarchy: 1. Companies -> 2. Lateral Models Dropdown -> 3. Strength Slider */}
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10 min-h-[300px] max-h-[420px] overflow-hidden">
                    
                    {/* COLUMN 1: Companies (OpenAI, Anthropic, Google, Meta/Local) */}
                    <div className="p-3 bg-black/20 flex flex-col justify-between overflow-y-auto">
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1.5 mb-2">
                          Empresas
                        </div>
                        {AI_COMPANIES.map(company => {
                          const isCompanyActive = selectedCompany === company.id;
                          const cModels = getCompanyModels(company.id);
                          const hasSelectedInCompany = cModels.some(m => m.id === selectedModelId);

                          return (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => {
                                setSelectedCompany(company.id);
                                const first = cModels[0];
                                if (first && !cModels.some(m => m.id === activeSliderModelId)) {
                                  setActiveSliderModelId(first.id);
                                }
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all group ${
                                isCompanyActive
                                  ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs">{company.icon}</span>
                                  <span className="text-xs font-bold truncate">{company.name}</span>
                                  {hasSelectedInCompany && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                  )}
                                </div>
                                <p className="text-[9px] text-zinc-400 truncate mt-0.5">{cModels.length} modelos</p>
                              </div>
                              <ChevronRight size={14} className={`shrink-0 transition-transform ${isCompanyActive ? "text-white translate-x-0.5" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/5 text-[9px] text-zinc-500 leading-tight px-1">
                        Selecione a empresa para ver seus modelos e calibrar a força.
                      </div>
                    </div>

                    {/* COLUMN 2: Lateral Dropdown with specific models */}
                    <div className="p-3 bg-black/10 flex flex-col justify-between overflow-y-auto">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1.5 mb-2">
                          <span>Modelos ({AI_COMPANIES.find(c => c.id === selectedCompany)?.name})</span>
                          <span className="font-mono text-[9px] text-zinc-500">{currentCompanyModels.length}</span>
                        </div>

                        <div className="space-y-1">
                          {currentCompanyModels.map(model => {
                            const isModelActiveInSlider = (activeSliderModelId || selectedModelId) === model.id;
                            const isModelSelectedInChat = selectedModelId === model.id;
                            const mStrength = modelStrengths[model.id] ?? model.strength ?? 75;

                            return (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setActiveSliderModelId(model.id);
                                  setSelectedModelId(model.id);
                                }}
                                className={`flex w-full items-start justify-between rounded-xl p-2 text-left transition-all ${
                                  isModelActiveInSlider
                                    ? "bg-white/15 text-white border border-white/15 shadow-sm"
                                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-semibold">{model.name}</span>
                                    {isModelSelectedInChat && (
                                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        Ativo
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-zinc-400 line-clamp-1 mt-0.5">{model.description}</p>
                                  
                                  <div className="flex items-center gap-2 mt-1 text-[8px] font-mono text-zinc-400">
                                    <span>{model.latency}</span>
                                    <span>•</span>
                                    <span className="text-zinc-300">⚡ {mStrength}%</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 mt-1">
                                  <Sliders size={12} className={isModelActiveInSlider ? "text-white" : "text-zinc-500"} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* COLUMN 3: Model Strength Slider */}
                    <div className="p-3.5 bg-black/30 flex flex-col justify-between overflow-y-auto">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <div className="flex items-center gap-1.5">
                            <Gauge size={12} className="text-zinc-300" />
                            <span>Força do Modelo</span>
                          </div>
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${strengthMeta.badgeColor}`}>
                            {strengthVal}%
                          </span>
                        </div>

                        {/* Model header card */}
                        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                          <div className="text-xs font-bold text-white truncate">{activeModel?.name}</div>
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5">{activeModel?.company || activeModel?.provider}</div>
                        </div>

                        {/* Interactive Slider */}
                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                            <span>10% (Rápido)</span>
                            <span className="text-white font-bold text-xs">{strengthVal}%</span>
                            <span>100% (Máx)</span>
                          </div>

                          <input 
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={strengthVal}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (activeModel) {
                                setModelStrengths(prev => ({ ...prev, [activeModel.id]: val }));
                              }
                            }}
                            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-zinc-200 transition-all"
                          />

                          {/* Visual Progress Bar under slider */}
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-full bg-gradient-to-r ${strengthMeta.barColor} transition-all duration-150`} 
                              style={{ width: `${strengthVal}%` }}
                            />
                          </div>
                        </div>

                        {/* Dynamic Strength Description */}
                        <div className={`p-2.5 rounded-xl border text-[10px] ${strengthMeta.badgeColor} space-y-1`}>
                          <div className="font-bold">{strengthMeta.label}</div>
                          <div className="text-[9px] text-zinc-300 leading-snug">{strengthMeta.desc}</div>
                        </div>

                        {/* Strength Presets */}
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-zinc-500">Predefinições:</span>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { val: 30, text: "Eco" },
                              { val: 60, text: "Méd" },
                              { val: 85, text: "Alto" },
                              { val: 100, text: "Máx" }
                            ].map(preset => (
                              <button
                                key={preset.val}
                                type="button"
                                onClick={() => {
                                  if (activeModel) {
                                    setModelStrengths(prev => ({ ...prev, [activeModel.id]: preset.val }));
                                  }
                                }}
                                className={`py-1 rounded text-[9px] font-mono transition-all border ${
                                  strengthVal === preset.val
                                    ? "bg-white/20 border-white text-white font-bold"
                                    : "bg-black/20 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                {preset.text}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action button to confirm & apply model */}
                      <div className="pt-3 mt-2 border-t border-white/5 space-y-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeModel) {
                              setSelectedModelId(activeModel.id);
                            }
                            setStrengthToast(true);
                            setTimeout(() => {
                              setStrengthToast(false);
                              setShowConfigMenu(false);
                            }, 500);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                          {strengthToast ? (
                            <>
                              <Check size={13} className="text-emerald-400" />
                              <span>Modelo Ativado!</span>
                            </>
                          ) : (
                            <>
                              <Check size={13} />
                              <span>Definir {activeModel?.name}</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* File Attachment toggle */}
          <div ref={attachMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={`rounded-xl p-2.5 border transition-colors ${
                showAttachMenu || attachedFiles.length > 0
                  ? "bg-[#2f3138] border-white/20 text-white" 
                  : "bg-[#282a32] border-white/10 text-zinc-400 hover:text-white hover:bg-[#32343e]"
              }`}
              title="Anexar arquivo de código"
            >
              <Paperclip size={14} />
            </button>
            {showAttachMenu && (
              <div className="absolute left-0 bottom-full mb-2 w-52 rounded-xl border border-zinc-700/80 bg-[#282a32] p-1.5 shadow-2xl z-50 space-y-0.5 select-none backdrop-blur-md">
                <div className="px-2 py-1 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Anexar código</div>
                {[
                  { name: "App.tsx", type: "React component" },
                  { name: "index.html", type: "Web entry" },
                  { name: "server.ts", type: "Express server" },
                  { name: "styles.css", type: "Tailwind global stylesheet" },
                  { name: "package.json", type: "Project description" }
                ].map((file) => (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => {
                      if (!attachedFiles.includes(file.name)) {
                        setAttachedFiles(prev => [...prev, file.name]);
                      }
                      setShowAttachMenu(false);
                    }}
                    className="flex w-full flex-col text-left rounded-md px-2.5 py-1.5 hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">{file.name}</span>
                    <span className="text-[9px] text-zinc-400">{file.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Conversar com o Agente (${activeModel.name})...`}
              disabled={isSending}
              className="w-full rounded-xl border border-white/10 bg-[#282a32] py-2.5 pl-3.5 pr-11 text-xs text-white outline-none placeholder-zinc-500 focus:border-white/20 focus:bg-[#2d2f38] transition-all"
            />
            
            {/* Dynamic Action Button: Sound Waves (Voice Mode) when empty <-> Send when text is typed */}
            {inputText.trim().length > 0 || attachedFiles.length > 0 ? (
              <button
                type="submit"
                disabled={isSending}
                className="absolute right-1.5 top-1.5 rounded-lg p-2 bg-zinc-200 text-zinc-900 hover:bg-white transition-all shadow-sm flex items-center justify-center cursor-pointer"
                title="Enviar mensagem"
              >
                <Send size={13} />
              </button>
            ) : isRecording ? (
              <button
                type="submit"
                className="absolute right-1.5 top-1.5 rounded-lg p-2 bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse hover:bg-red-500/30 transition-all flex items-center justify-center cursor-pointer"
                title="Finalizar gravação e enviar áudio"
              >
                <AudioLines size={14} className="animate-pulse" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsRecording(true)}
                className="absolute right-1.5 top-1.5 rounded-lg p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                title="Conversar por áudio com o Agente (Ondas Sonoras)"
              >
                <AudioLines size={14} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
