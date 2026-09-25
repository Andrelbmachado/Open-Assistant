import { Bot, MessageSquare, Search, Settings, TerminalSquare, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore, type ViewKind } from "../store/store";

/** Paleta de comandos (Ctrl+P): atalhos para vistas e Configurações. */
export function CommandPalette() {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const commands = useMemo(() => [
    { title: "Abrir Chat", icon: MessageSquare, view: "chat" as ViewKind },
    { title: "Abrir Agentes", icon: Bot, view: "agents" as ViewKind },
    { title: "Abrir Workflow", icon: Workflow, view: "workflow" as ViewKind },
    { title: "Abrir Terminal", icon: TerminalSquare, view: "terminal" as ViewKind },
    { title: "Abrir Configurações", icon: Settings, settings: true },
  ], []);
  useEffect(() => { if (!state.paletteOpen) setQuery(""); }, [state.paletteOpen]);
  if (!state.paletteOpen) return null;
  const filtered = commands.filter((command) => command.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="palette-backdrop" onMouseDown={() => dispatch({ type: "palette", open: false })}><div className="command-palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite um comando…" onKeyDown={(event) => { if (event.key === "Escape") dispatch({ type: "palette", open: false }); }} /><button onClick={() => dispatch({ type: "palette", open: false })}><X size={15} /></button></div><div className="command-list"><span>Ações</span>{filtered.map(({ title, icon: Icon, view, settings }) => <button key={title} onClick={() => { if (settings) dispatch({ type: "settings", open: true }); else if (view) dispatch({ type: "view", view }); dispatch({ type: "palette", open: false }); }}><Icon size={16} /><strong>{title}</strong><kbd>Enter</kbd></button>)}</div></div></div>;
}
