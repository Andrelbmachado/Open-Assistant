import React, { useState, useRef, useEffect } from "react";
import { 
  Terminal, Trash2, ShieldAlert, Sparkles, Send, Copy, Check, 
  Download, Search, Plus, X, ArrowDownCircle, RefreshCw, Play, Filter,
  CheckCircle2, AlertTriangle, Info, TerminalSquare
} from "lucide-react";
import { AgentTerminal, TerminalLog } from "../types";

interface TerminalPanelProps {
  terminals: AgentTerminal[];
  onClearTerminal: (terminalId: string) => void;
  onSendCommand: (terminalId: string, cmd: string) => void;
  accentColor: string;
  onActiveTerminalNameChange?: (name: string) => void;
}

export default function TerminalPanel({
  terminals: propTerminals,
  onClearTerminal,
  onSendCommand,
  accentColor,
  onActiveTerminalNameChange
}: TerminalPanelProps) {
  // Local terminals state to allow adding custom user sessions seamlessly
  const [localTerminals, setLocalTerminals] = useState<AgentTerminal[]>(propTerminals);
  const [activeTerminalId, setActiveTerminalId] = useState(propTerminals[0]?.id || "term-1");
  const [inputCmd, setInputCmd] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "info" | "success" | "warning" | "error" | "input">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedToast, setCopiedToast] = useState(false);
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const terminalScrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync when propTerminals update
  useEffect(() => {
    setLocalTerminals((prev) => {
      // Merge logs from propTerminals into localTerminals
      const map = new Map(prev.map(t => [t.id, t]));
      propTerminals.forEach(t => {
        map.set(t.id, t);
      });
      return Array.from(map.values());
    });
  }, [propTerminals]);

  const activeTerminal = localTerminals.find((t) => t.id === activeTerminalId) || localTerminals[0] || propTerminals[0];

  useEffect(() => {
    if (activeTerminal?.agentName && onActiveTerminalNameChange) {
      onActiveTerminalNameChange(activeTerminal.agentName);
    }
  }, [activeTerminal?.agentName, onActiveTerminalNameChange]);

  useEffect(() => {
    if (autoScroll) {
      terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTerminal?.logs, autoScroll]);

  // Set default active tab when terminal list loads
  useEffect(() => {
    if (localTerminals.length > 0 && !activeTerminalId) {
      setActiveTerminalId(localTerminals[0].id);
    }
  }, [localTerminals, activeTerminalId]);

  // Create a new terminal tab
  const handleAddNewTerminal = () => {
    const newId = `term-${Date.now()}`;
    const newTerm: AgentTerminal = {
      id: newId,
      agentId: "custom-agent",
      agentName: `Terminal Shell ${localTerminals.length + 1}`,
      status: "running",
      lastUpdated: "Ativo agora",
      logs: [
        {
          id: `log-${Date.now()}-1`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          type: "info",
          text: `Sessão de terminal interativo iniciada. Digite 'help' para listar comandos disponíveis.`
        }
      ]
    };
    setLocalTerminals((prev) => [...prev, newTerm]);
    setActiveTerminalId(newId);
  };

  // Close terminal tab
  const handleCloseTerminal = (e: React.MouseEvent, termId: string) => {
    e.stopPropagation();
    if (localTerminals.length <= 1) return;
    const nextList = localTerminals.filter((t) => t.id !== termId);
    setLocalTerminals(nextList);
    if (activeTerminalId === termId) {
      setActiveTerminalId(nextList[0]?.id || "");
    }
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim() || !activeTerminal) return;
    
    const cmd = inputCmd.trim();
    setInputCmd("");

    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Interactive built-in command interpreter
    const inputLog: TerminalLog = {
      id: `log-in-${Date.now()}`,
      timestamp,
      type: "input",
      text: cmd
    };

    let replyLogs: TerminalLog[] = [];

    const lower = cmd.toLowerCase();
    if (lower === "help") {
      replyLogs = [
        {
          id: `log-h-${Date.now()}`,
          timestamp,
          type: "info",
          text: "COMANDOS DISPONÍVEIS NO SANDBOX:\n  • npm run start     - Inicia o servidor local de desenvolvimento (porta 3000)\n  • git status        - Verifica o status do repositório Git e branch ativa\n  • ls -la / ls       - Lista os arquivos do diretório atual de workspace\n  • cat <arquivo>     - Exibe o conteúdo de um arquivo (ex: cat styles.css)\n  • node -v           - Versão do runtime Node.js\n  • date              - Exibe data e hora do sistema\n  • clear             - Limpa o histórico de logs deste terminal\n  • whoami            - Informações do usuário autenticado"
        }
      ];
    } else if (lower === "clear") {
      onClearTerminal(activeTerminal.id);
      setLocalTerminals((prev) =>
        prev.map((t) => (t.id === activeTerminal.id ? { ...t, logs: [] } : t))
      );
      return;
    } else if (lower === "git status") {
      replyLogs = [
        {
          id: `log-git-${Date.now()}`,
          timestamp,
          type: "success",
          text: "On branch main\nYour branch is up to date with 'origin/main'.\n\nChanges not staged for commit:\n  (use \"git add <file>...\" to update what will be committed)\n\tmodified:   src/components/ChatPanel.tsx\n\tmodified:   src/components/TerminalPanel.tsx\n\nno changes added to commit (use \"git add\")"
        }
      ];
    } else if (lower === "npm run start" || lower === "npm run dev") {
      replyLogs = [
        {
          id: `log-npm-${Date.now()}`,
          timestamp,
          type: "success",
          text: "> open-assistant@0.1.0 dev\n> tsx server.ts\n\n✓ Vite v5.4.21 ready in 218 ms\n➜  Local:   http://localhost:3000/\n➜  Network: use --host to expose\n➜  Sandbox Container: connected (0.0.0.0:3000)"
        }
      ];
    } else if (lower === "ls" || lower === "ls -la" || lower === "dir") {
      replyLogs = [
        {
          id: `log-ls-${Date.now()}`,
          timestamp,
          type: "info",
          text: "drwxr-xr-x  14 andrem  staff   448B Aug 22 19:00 src/\ndrwxr-xr-x   6 andrem  staff   192B Aug 22 18:45 workspace/\n-rw-r--r--   1 andrem  staff   1.2K Aug 22 19:00 package.json\n-rw-r--r--   1 andrem  staff   640B Aug 22 19:00 styles.css\n-rw-r--r--   1 andrem  staff   420B Aug 22 19:00 index.html\n-rw-r--r--   1 andrem  staff   1.8K Aug 22 19:00 tsconfig.json"
        }
      ];
    } else if (lower.startsWith("cat ")) {
      const target = lower.replace("cat ", "").trim();
      replyLogs = [
        {
          id: `log-cat-${Date.now()}`,
          timestamp,
          type: "info",
          text: `[CONTEÚDO DE ${target}]:\n/* Sandbox preview file content */\n:root {\n  --accent: #55FCFF;\n  --background: #17181c;\n}`
        }
      ];
    } else if (lower === "node -v") {
      replyLogs = [
        { id: `log-node-${Date.now()}`, timestamp, type: "info", text: "v20.18.0 (LTS Iron)" }
      ];
    } else if (lower === "date") {
      replyLogs = [
        { id: `log-date-${Date.now()}`, timestamp, type: "info", text: new Date().toString() }
      ];
    } else if (lower === "whoami") {
      replyLogs = [
        { id: `log-who-${Date.now()}`, timestamp, type: "info", text: "user: André Machado (uid=1000, gid=1000) [Admin Sandbox]" }
      ];
    } else {
      replyLogs = [
        {
          id: `log-out-${Date.now()}`,
          timestamp,
          type: "info",
          text: `Executado no sandbox com sucesso: ${cmd} (exit code 0)`
        }
      ];
    }

    // Update local state
    setLocalTerminals((prev) =>
      prev.map((t) =>
        t.id === activeTerminal.id
          ? { ...t, logs: [...t.logs, inputLog, ...replyLogs] }
          : t
      )
    );

    // Call parent handler
    onSendCommand(activeTerminal.id, cmd);
  };

  const handleClearCurrentTerminal = () => {
    if (!activeTerminal) return;
    onClearTerminal(activeTerminal.id);
    setLocalTerminals((prev) =>
      prev.map((t) => (t.id === activeTerminal.id ? { ...t, logs: [] } : t))
    );
  };

  const handleCopyLogs = () => {
    if (!activeTerminal) return;
    const text = activeTerminal.logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  const handleExportLogs = () => {
    if (!activeTerminal) return;
    const text = activeTerminal.logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `terminal-${activeTerminal.agentName.toLowerCase().replace(/\s+/g, "-")}-logs.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter logs by type and search query
  const filteredLogs = (activeTerminal?.logs || []).filter((log) => {
    const matchesFilter = logFilter === "all" ? true : log.type === logFilter;
    const matchesSearch = searchQuery === "" || 
      log.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.timestamp.includes(searchQuery);
    return matchesFilter && matchesSearch;
  });

  const getLogColor = (type: string) => {
    switch (type) {
      case "error": return "text-red-400 bg-red-950/20 border-l-2 border-red-500 pl-2 rounded-r";
      case "warning": return "text-amber-300 bg-amber-950/20 border-l-2 border-amber-500 pl-2 rounded-r";
      case "success": return "text-emerald-400 bg-emerald-950/15 border-l-2 border-emerald-500 pl-2 rounded-r";
      case "input": return "text-cyan-300 font-bold bg-cyan-950/20 border-l-2 border-cyan-400 pl-2 rounded-r";
      default: return "text-zinc-200";
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#1c1d22] text-zinc-100 font-mono select-none">
      {/* Floating Toolbar & Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-white/[0.08] bg-[#18191d] px-4 py-2 gap-2 shrink-0 z-10">
        
        {/* Terminals Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
          {localTerminals.map((term) => {
            const isActive = term.id === activeTerminalId;
            return (
              <div
                key={term.id}
                onClick={() => setActiveTerminalId(term.id)}
                className={`group flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition-all cursor-pointer whitespace-nowrap border ${
                  isActive 
                    ? "bg-white/15 border-white/20 text-white font-bold shadow-sm ring-1 ring-white/10" 
                    : "bg-black/20 border-white/5 text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Terminal size={12} className={isActive ? "text-cyan-300" : "text-zinc-500"} />
                <span className="truncate max-w-[140px]">{term.agentName}</span>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  term.status === "running" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                }`} />

                {localTerminals.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTerminal(e, term.id)}
                    className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded p-0.5 text-zinc-400 hover:text-white transition-opacity ml-1"
                    title="Fechar aba de terminal"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Terminal Tab Button */}
          <button
            type="button"
            onClick={handleAddNewTerminal}
            className="flex items-center justify-center h-7 w-7 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer shrink-0"
            title="Nova Aba de Terminal"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Right Action Menus: Search, Log Filter, AutoScroll, Copy, Clear */}
        <div className="flex items-center gap-2 overflow-x-auto shrink-0">
          {/* Quick Search */}
          <div className="relative flex items-center">
            <Search size={11} className="absolute left-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-28 sm:w-36 rounded-lg bg-black/40 border border-white/10 py-1 pl-7 pr-2 text-[10px] text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 text-zinc-500 hover:text-white"
              >
                <X size={10} />
              </button>
            )}
          </div>

          {/* Level Filter Selector */}
          <div className="flex items-center bg-black/30 p-0.5 rounded-lg border border-white/10 text-[10px]">
            {(["all", "success", "error", "input"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLogFilter(lvl)}
                className={`px-2 py-0.5 rounded-md font-semibold transition-colors uppercase text-[9px] ${
                  logFilter === lvl
                    ? "bg-white/20 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {lvl === "all" ? "Todos" : lvl === "success" ? "Sucesso" : lvl === "error" ? "Erros" : "Cmds"}
              </button>
            ))}
          </div>

          {/* Auto-Scroll Toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              autoScroll
                ? "bg-white/15 border-white/20 text-white"
                : "bg-black/20 border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
            title={autoScroll ? "Auto-scroll ativo (clique para pausar)" : "Auto-scroll pausado (clique para ativar)"}
          >
            <ArrowDownCircle size={13} className={autoScroll ? "text-cyan-300" : ""} />
          </button>

          {/* Copy Logs Button */}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Copiar todos os logs"
          >
            {copiedToast ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {/* Export Logs Button */}
          <button
            type="button"
            onClick={handleExportLogs}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Exportar logs (.log)"
          >
            <Download size={13} />
          </button>

          {/* Clear Logs Button */}
          <button
            type="button"
            onClick={handleClearCurrentTerminal}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
            title="Limpar logs deste terminal"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Quick Command Suggestions Bar */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-black/40 border-b border-white/[0.04] overflow-x-auto text-[10px] select-none scrollbar-none">
        <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] shrink-0 mr-1 flex items-center gap-1">
          <Sparkles size={10} className="text-zinc-400" />
          Comandos:
        </span>
        {[
          "npm run start",
          "git status",
          "ls -la",
          "node -v",
          "help",
          "clear"
        ].map((quickCmd) => (
          <button
            key={quickCmd}
            type="button"
            onClick={() => {
              setInputCmd(quickCmd);
            }}
            className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white transition-all font-mono text-[10px] shrink-0 cursor-pointer active:scale-95"
          >
            ${quickCmd}
          </button>
        ))}
      </div>

      {/* Log Terminal Screen */}
      <div 
        ref={terminalScrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1.5 text-xs select-text bg-[#131417] leading-relaxed"
      >
        <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-2.5 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-zinc-400">SANDBOX macOS KERNEL v2.4 • SESSÃO ISOLADA</span>
          </div>
          <span className="font-mono text-[9px] text-zinc-500">
            {filteredLogs.length} linhas {searchQuery ? `(filtrado: "${searchQuery}")` : ""}
          </span>
        </div>

        {filteredLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 text-[11px] font-mono group py-0.5">
            <span className="text-zinc-600 select-none text-[10px] pt-0.5 shrink-0 group-hover:text-zinc-400 transition-colors">
              {log.timestamp}
            </span>
            <div className={`flex-1 break-words ${getLogColor(log.type)}`}>
              {log.type === "input" && <span className="text-zinc-400 mr-2 select-none">$</span>}
              <span className="whitespace-pre-wrap">{log.text}</span>
            </div>
          </div>
        ))}

        {filteredLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 italic select-none space-y-1">
            <TerminalSquare size={28} className="text-zinc-700 mb-1" />
            <p className="text-xs">Nenhum log encontrado para o filtro atual.</p>
            <p className="text-[10px] text-zinc-600">Digite um comando abaixo para começar.</p>
          </div>
        )}
        <div ref={terminalBottomRef} />
      </div>

      {/* Interactive Command Input Prompt */}
      {activeTerminal && (
        <div className="border-t border-white/[0.08] bg-[#18191d] p-3">
          <form onSubmit={handleCommandSubmit} className="flex items-center gap-2.5 bg-black/50 border border-white/10 rounded-xl px-3 py-2 shadow-inner">
            <span className="text-cyan-400 font-bold select-none text-sm font-mono">$</span>
            <input
              type="text"
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              placeholder="Digite um comando para o sandbox (ex: npm run start, git status, help)..."
              className="flex-1 bg-transparent text-xs text-white outline-none placeholder-zinc-500 font-mono"
            />
            <button
              type="submit"
              disabled={!inputCmd.trim()}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                inputCmd.trim() 
                  ? "bg-white/15 text-white hover:bg-white/25 border border-white/20 shadow-sm" 
                  : "text-zinc-600 cursor-not-allowed"
              }`}
            >
              <Send size={11} />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
