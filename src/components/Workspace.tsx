import { Activity, Bot, Boxes, Check, Copy, Cpu, FileCode, FileText, FolderOpen, MessageSquare, MoreHorizontal, Plus, ShoppingBag, TerminalSquare, Workflow } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useStore, type ViewKind, type WorkspaceArea, type WorkspaceLayoutNode, type WorkspaceSplit } from "../store/store";
import { calculateSplitIntent, type Corner } from "../utils/workspaceLayout";
import { ChatView } from "./ChatView";
import { TerminalView } from "./TerminalView";
import { WorkflowCanvas } from "./WorkflowCanvas";

const labels: Record<ViewKind, string> = { chat: "Chat", workflow: "Nodes", terminal: "Terminal", agents: "Agentes", marketplace: "Marketplace", files: "Arquivos", browser: "Browser", dashboard: "Dashboard" };
const areaViews: ViewKind[] = ["chat", "workflow", "agents", "terminal", "files", "dashboard", "marketplace"];

function AgentsView() {
  const { state, dispatch } = useStore();
  const [newAgentType, setNewAgentType] = useState<"workflow" | "terminal">("workflow");
  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); dispatch({ type: "openAgent", id }); } };
  return <section className="view collection-view"><header className="view-header"><div><span className="eyebrow">Equipe</span><h2>Agentes</h2></div><div className="agent-create"><select value={newAgentType} onChange={(event) => setNewAgentType(event.target.value as "workflow" | "terminal")}><option value="workflow">Canvas de nodes</option><option value="terminal">Terminal</option></select><button className="primary-button" onClick={() => dispatch({ type: "addAgent", workspace: newAgentType })}><Plus size={14} />Novo agente</button></div></header><div className="card-grid">{state.agents.map((agent) => <article className="agent-card" key={agent.id} role="button" tabIndex={0} onClick={() => dispatch({ type: "openAgent", id: agent.id })} onKeyDown={(event) => openWithKeyboard(event, agent.id)}><span className="agent-icon">{agent.workspace === "workflow" ? <Workflow size={20} /> : <TerminalSquare size={20} />}</span><button aria-label={`Mais opções para ${agent.name}`} onClick={(event) => event.stopPropagation()}><MoreHorizontal size={16} /></button><h3>{agent.name}</h3><p>{agent.role}</p><footer><span className="status-dot" />{agent.status}<small>{agent.workspace === "workflow" ? "Canvas" : "Terminal"}</small></footer></article>)}</div></section>;
}

function MarketplaceView() { return <section className="view collection-view marketplace-view"><header className="view-header"><div><span className="eyebrow">Extensões</span><h2>Marketplace</h2></div><button className="flat-button"><ShoppingBag size={14} />Explorar</button></header><div className="marketplace-grid">{["Pesquisa na Web", "Editor de Código", "Automação Local"].map((name) => <article key={name}><span><Boxes size={19} /></span><h3>{name}</h3><p>Integração disponível para o seu workspace.</p><button className="flat-button">Adicionar</button></article>)}</div></section>; }

const sampleFiles = [
  { name: "package.json", path: "package.json", lang: "json", content: `{\n  "name": "open-assistant-windows",\n  "version": "0.1.0",\n  "private": true,\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build",\n    "tauri": "tauri"\n  }\n}` },
  { name: "Cargo.toml", path: "src-tauri/Cargo.toml", lang: "toml", content: `[package]\nname = "open-assistant"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntauri = { version = "2" }\nserde = { version = "1", features = ["derive"] }` },
  { name: "automate-agents.ps1", path: "scripts/automate-agents.ps1", lang: "powershell", content: `# Script de automação local no Windows\nWrite-Host "Iniciando orquestração de agentes..." -ForegroundColor Cyan\nGet-Process -Name "*open-assistant*" | Format-Table Id, ProcessName` },
  { name: "README.md", path: "README.md", lang: "markdown", content: `# Open Assistant para Windows\nAplicativo desktop nativo com Tauri 2, Rust e React.\nInterface Liquidglass Flat com design Fluent Windows 11.` }
];

function FilesView() {
  const [selectedFile, setSelectedFile] = useState(sampleFiles[0]);
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="view" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header className="view-header compact">
        <div>
          <span className="eyebrow">Workspace · Arquivos do Projeto</span>
          <h2><FolderOpen size={17} /> Arquivos & Código</h2>
        </div>
        <button className="flat-button" onClick={copyCode}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado!" : "Copiar Código"}
        </button>
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{ width: "240px", borderRight: "1px solid var(--border, rgba(255,255,255,0.08))", padding: "12px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "11px", opacity: 0.6, fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Arquivos</span>
          {sampleFiles.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file)}
              className={`flat-button ${selectedFile.path === file.path ? "active" : ""}`}
              style={{ justifyContent: "flex-start", width: "100%", textAlign: "left", gap: "8px", padding: "8px 10px" }}
            >
              <FileCode size={15} />
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
            </button>
          ))}
        </aside>
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "rgba(0,0,0,0.2)" }}>
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", opacity: 0.8 }}>
            <FileText size={13} />
            <code>{selectedFile.path}</code>
          </div>
          <pre style={{ flex: 1, margin: 0, padding: "16px", fontFamily: "Consolas, monospace", fontSize: "13px", lineHeight: "1.5", overflow: "auto" }}>
            <code>{selectedFile.content}</code>
          </pre>
        </main>
      </div>
    </section>
  );
}

function DashboardView() {
  const { state } = useStore();
  return (
    <section className="view collection-view" style={{ padding: "20px", overflowY: "auto" }}>
      <header className="view-header">
        <div>
          <span className="eyebrow">Status do Workspace</span>
          <h2><Activity size={18} /> Painel de Controle Windows</h2>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "16px" }}>
        <article className="agent-card">
          <span className="agent-icon"><Cpu size={20} /></span>
          <h3>Plataforma Nativa</h3>
          <p>Windows 11 x64 · Tauri v2 Rust Core</p>
          <footer><span className="status-dot" />Ativo<small>WebView2</small></footer>
        </article>
        <article className="agent-card">
          <span className="agent-icon"><Bot size={20} /></span>
          <h3>Agentes Registrados</h3>
          <p>{state.agents.length} agentes configurados no workspace</p>
          <footer><span className="status-dot" />Pronto<small>Workflows</small></footer>
        </article>
        <article className="agent-card">
          <span className="agent-icon"><Workflow size={20} /></span>
          <h3>Nós de Execução</h3>
          <p>{state.nodes.length} nós e {state.connections.length} conexões ativas</p>
          <footer><span className="status-dot" />Canvas<small>Interativo</small></footer>
        </article>
        <article className="agent-card">
          <span className="agent-icon"><TerminalSquare size={20} /></span>
          <h3>Terminal Local</h3>
          <p>PowerShell & Command Prompt integrados</p>
          <footer><span className="status-dot" />UTF-8<small>Console</small></footer>
        </article>
      </div>
    </section>
  );
}

function ViewRenderer({ kind }: { kind: ViewKind }) {
  if (kind === "chat") return <ChatView />;
  if (kind === "workflow") return <WorkflowCanvas />;
  if (kind === "terminal") return <TerminalView />;
  if (kind === "agents") return <AgentsView />;
  if (kind === "files") return <FilesView />;
  if (kind === "dashboard") return <DashboardView />;
  if (kind === "marketplace") return <MarketplaceView />;
  return <section className="view placeholder-view"><span><FolderOpen size={28} /></span><h2>{labels[kind]}</h2><p>Esta área está pronta para receber conteúdo.</p></section>;
}

interface SplitDrag { corner: Corner; pointerId: number; startX: number; startY: number; deltaX: number; deltaY: number; }

function AreaShell({ area }: { area: WorkspaceArea }) {
  const { state, dispatch } = useStore();
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<SplitDrag | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const dragRef = useRef<SplitDrag | null>(null);
  const intent = drag && root.current ? calculateSplitIntent(drag.corner, drag.deltaX, drag.deltaY, root.current.clientWidth, root.current.clientHeight) : null;
  const corners: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const clearDrag = () => { dragRef.current = null; setDrag(null); };
  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { ...current, deltaX: event.clientX - current.startX, deltaY: event.clientY - current.startY };
    dragRef.current = next;
    setDrag(next);
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = root.current?.getBoundingClientRect();
    const finalIntent = rect ? calculateSplitIntent(current.corner, event.clientX - current.startX, event.clientY - current.startY, rect.width, rect.height) : null;
    if (finalIntent) dispatch({ type: "splitArea", id: area.id, ...finalIntent });
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    clearDrag();
  };

  const CurrentViewIcon = area.view === "chat" ? MessageSquare : area.view === "workflow" ? Workflow : area.view === "terminal" ? TerminalSquare : area.view === "files" ? FolderOpen : area.view === "agents" ? Bot : area.view === "marketplace" ? ShoppingBag : Activity;
  return <div className={`area-shell ${state.activeAreaId === area.id ? "active" : ""}`} ref={root} onPointerDown={() => dispatch({ type: "activateArea", id: area.id })} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}>
    <ViewRenderer kind={area.view} />
    <div className={`area-controls ${viewMenuOpen ? "open" : ""}`} onMouseEnter={() => setViewMenuOpen(true)} onMouseLeave={() => setViewMenuOpen(false)}>
      <button className="area-view-trigger" aria-label={`Trocar tipo de área: ${labels[area.view]}`} aria-expanded={viewMenuOpen} onPointerDown={(event) => event.stopPropagation()} onClick={() => setViewMenuOpen((open) => !open)}><CurrentViewIcon size={14} /></button>
      <div className="area-view-menu" role="menu">{areaViews.map((view) => { const Icon = view === "chat" ? MessageSquare : view === "workflow" ? Workflow : view === "terminal" ? TerminalSquare : view === "files" ? FolderOpen : view === "agents" ? Bot : view === "marketplace" ? ShoppingBag : Activity; return <button key={view} role="menuitem" aria-label={labels[view]} className={area.view === view ? "active" : ""} onPointerDown={(event) => event.stopPropagation()} onClick={() => { dispatch({ type: "activateArea", id: area.id }); dispatch({ type: "view", view }); setViewMenuOpen(false); }}><Icon size={14} /><span className="sr-only">{labels[view]}</span></button>; })}</div>
    </div>
    {intent && <div className={`area-split-preview ${intent.axis} ${intent.newAreaFirst ? "first" : "second"}`} style={intent.axis === "horizontal" ? { width: `${(intent.newAreaFirst ? intent.fraction : 1 - intent.fraction) * 100}%` } : { height: `${(intent.newAreaFirst ? intent.fraction : 1 - intent.fraction) * 100}%` }} />}
    {corners.map((corner) => <button key={corner} className={`area-corner ${corner}`} aria-label="Arraste para criar uma nova área" onPointerDown={(event) => { event.stopPropagation(); const next = { corner, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, deltaX: 0, deltaY: 0 }; root.current?.setPointerCapture(event.pointerId); dragRef.current = next; setDrag(next); dispatch({ type: "activateArea", id: area.id }); }} />)}
  </div>;
}

function SplitNode({ split }: { split: WorkspaceSplit }) {
  const { dispatch } = useStore();
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const collapseSideRef = useRef<"first" | "second" | null>(null);
  const [collapseSide, setCollapseSide] = useState<"first" | "second" | null>(null);
  const selectCollapseSide = (side: "first" | "second" | null) => { collapseSideRef.current = side; setCollapseSide(side); };
  const update = (event: PointerEvent<HTMLDivElement>) => { if (!dragging.current || !container.current) return; const rect = container.current.getBoundingClientRect(); const total = split.axis === "horizontal" ? rect.width : rect.height; const value = split.axis === "horizontal" ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height; const firstSize = value * total; const secondSize = (1 - value) * total; selectCollapseSide(firstSize < 50 ? "first" : secondSize < 50 ? "second" : null); dispatch({ type: "updateWorkspaceSplit", id: split.id, fraction: value }); };
  const endDrag = () => { if (!dragging.current) return; dragging.current = false; if (collapseSideRef.current === "first") dispatch({ type: "collapseWorkspaceSplit", id: split.id, keep: "second" }); else if (collapseSideRef.current === "second") dispatch({ type: "collapseWorkspaceSplit", id: split.id, keep: "first" }); selectCollapseSide(null); };
  const cancelDrag = () => { dragging.current = false; selectCollapseSide(null); };
  return <div ref={container} className={`workspace-split-node ${split.axis}`} onPointerMove={update} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onPointerLeave={() => { if (!dragging.current) setCollapseSide(null); }}>
    <div className={`split-child ${collapseSide === "first" ? "collapse-target" : ""}`} style={{ flexBasis: `max(0px, calc(${split.fraction * 100}% - 5px))` }}><WorkspaceNode node={split.first} /></div>
    <div className="blender-divider" title="Reduza uma área abaixo de 50 px para fechá-la" onPointerDown={(event) => { dragging.current = true; collapseSideRef.current = null; event.currentTarget.setPointerCapture(event.pointerId); }}><i /></div>
    <div className={`split-child ${collapseSide === "second" ? "collapse-target" : ""}`} style={{ flexBasis: `max(0px, calc(${(1 - split.fraction) * 100}% - 5px))` }}><WorkspaceNode node={split.second} /></div>
  </div>;
}

function WorkspaceNode({ node }: { node: WorkspaceLayoutNode }) { return "view" in node ? <AreaShell area={node} /> : <SplitNode split={node} />; }

/** Área principal com painéis divisíveis estilo Blender (cada área mostra uma vista). */
export function Workspace() {
  const { state } = useStore();
  return <main className="workspace blender-workspace">
    <div className="workspace-layout"><WorkspaceNode node={state.workspaceLayout} /></div>
  </main>;
}
