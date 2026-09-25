import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, Circle, Play, Plus, RotateCcw, TerminalSquare, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";

interface OutputEvent { sessionId: string; data: string; stream: string }

/** Terminal integrado (PowerShell/CMD reais via comandos spawn/write/terminate do Rust). */
export function TerminalView() {
  const { state } = useStore();
  const currentAgent = state.agents.find((agent) => agent.id === state.currentAgentId);
  const sessionId = useRef(crypto.randomUUID());
  const [shell, setShell] = useState<"powershell" | "cmd">("powershell");
  const [output, setOutput] = useState("Open Assistant Terminal · Windows\r\n");
  const [input, setInput] = useState("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    Promise.all([
      listen<OutputEvent>("terminal-output", ({ payload }) => { if (payload.sessionId === sessionId.current) setOutput((value) => value + payload.data); }),
      listen<{ sessionId: string }>("terminal-exit", ({ payload }) => { if (payload.sessionId === sessionId.current) setActive(false); }),
    ]).then(([offOutput, offExit]) => {
      unlistenOutput = offOutput; unlistenExit = offExit;
      if (!cancelled) start();
    }).catch((reason) => setError(String(reason)));
    return () => { cancelled = true; unlistenOutput?.(); unlistenExit?.(); invoke("terminate_terminal_session", { sessionId: sessionId.current }).catch(() => undefined); };
  }, []);

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);

  async function start(nextShell = shell) {
    setError("");
    try { await invoke("spawn_terminal_session", { sessionId: sessionId.current, shell: nextShell }); setActive(true); }
    catch (reason) { setError(String(reason)); setOutput((value) => value + `\r\n[erro] ${reason}\r\n`); }
  }

  async function restart(nextShell = shell) {
    await invoke("terminate_terminal_session", { sessionId: sessionId.current }).catch(() => undefined);
    sessionId.current = crypto.randomUUID(); setOutput(`Open Assistant Terminal · ${nextShell === "cmd" ? "Command Prompt" : "PowerShell"}\r\n`); await start(nextShell);
  }

  async function runCommand(command: string) {
    if (!command.trim() || !active) return;
    const prefix = shell === "cmd" ? "C:\\›" : "PS›";
    setOutput((value) => value + `${prefix} ${command}\r\n`);
    await invoke("write_terminal_session", { sessionId: sessionId.current, input: `${command}\r\n` }).catch((reason) => setError(String(reason)));
  }

  async function submit() {
    if (!input.trim()) return;
    await runCommand(input);
    setInput("");
  }

  return <section className="view terminal-view">
    <header className="view-header compact"><div><span className="eyebrow">Terminal integrado · {currentAgent?.name ?? "Sessão local"}</span><h2><TerminalSquare size={17} /> {shell === "powershell" ? "PowerShell" : "Command Prompt"}</h2></div><div className="view-header-actions"><span className={`terminal-state ${active ? "active" : ""}`}><Circle size={8} fill="currentColor" />{active ? "Ativo" : "Encerrado"}</span><label className="shell-select"><select value={shell} onChange={(event) => { const value = event.target.value as "powershell" | "cmd"; setShell(value); restart(value); }}><option value="powershell">PowerShell</option><option value="cmd">Command Prompt</option></select><ChevronDown size={13} /></label><button className="flat-button" onClick={() => runCommand(shell === "cmd" ? "cd" : "Get-Location")} disabled={!active} title="Executa um comando real para verificar a sessão"><Play size={13} />Testar</button><button className="icon-button" onClick={() => restart()} title="Reiniciar"><RotateCcw size={15} /></button><button className="icon-button" onClick={() => setOutput("")} title="Limpar"><Trash2 size={15} /></button><button className="icon-button" onClick={() => restart()} title="Nova sessão"><Plus size={15} /></button></div></header>
    <div className="terminal-output" ref={outputRef}><pre>{output}</pre>{error && <div className="terminal-error">{error}</div>}</div>
    <div className="terminal-input"><span>{shell === "cmd" ? "C:\\›" : "PS›"}</span><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder={active ? "Digite um comando…" : "Terminal não está ativo"} disabled={!active} autoComplete="off" /></div>
  </section>;
}
