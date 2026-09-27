import { Activity, Bot, FolderOpen, Globe, MessageSquare, Network, ShoppingBag, TerminalSquare, Workflow } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { useStore, type ViewKind, type WorkspaceArea, type WorkspaceLayoutNode, type WorkspaceSplit } from "../store/store";
import { calculateSplitIntent, type Corner } from "../utils/workspaceLayout";
import { ChatView } from "./ChatView";
import { TerminalView } from "./TerminalView";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { AgentsView } from "./AgentsView";
import { DashboardView } from "./DashboardView";
import { FilesView } from "./FilesView";
import { MarketplaceView } from "./MarketplaceView";
import { NetworkView } from "./NetworkView";
import { BrowserView } from "./BrowserView";
import { useDismiss } from "../utils/useDismiss";

const labels: Record<ViewKind, string> = { chat: "Chat", workflow: "Nodes", terminal: "Terminal", agents: "Agentes", marketplace: "Marketplace", files: "Arquivos", browser: "Browser", dashboard: "Dashboard", network: "Rede" };
const areaViews: ViewKind[] = ["chat", "workflow", "agents", "terminal", "files", "browser", "dashboard", "marketplace", "network"];

function ViewRenderer({ kind, chatId, areaId, workflowId }: { kind: ViewKind; chatId?: string; areaId: string; workflowId?: string }) {
  if (kind === "chat") return <ChatView chatId={chatId} />;
  if (kind === "workflow") return <WorkflowCanvas areaId={areaId} workflowId={workflowId} />;
  if (kind === "terminal") return <TerminalView />;
  if (kind === "agents") return <AgentsView />;
  if (kind === "files") return <FilesView />;
  if (kind === "dashboard") return <DashboardView />;
  if (kind === "marketplace") return <MarketplaceView />;
  if (kind === "network") return <NetworkView />;
  if (kind === "browser") return <BrowserView />;
  return <section className="view placeholder-view"><span><FolderOpen size={28} /></span><h2>{labels[kind]}</h2><p>Esta área está pronta para receber conteúdo.</p></section>;
}

interface SplitDrag { corner: Corner; pointerId: number; startX: number; startY: number; deltaX: number; deltaY: number; }

function AreaShell({ area }: { area: WorkspaceArea }) {
  const { state, dispatch } = useStore();
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<SplitDrag | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  useDismiss(viewMenuOpen, [controls], () => setViewMenuOpen(false));
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

  const CurrentViewIcon = area.view === "chat" ? MessageSquare : area.view === "workflow" ? Workflow : area.view === "terminal" ? TerminalSquare : area.view === "files" ? FolderOpen : area.view === "agents" ? Bot : area.view === "marketplace" ? ShoppingBag : area.view === "network" ? Network : area.view === "browser" ? Globe : Activity;
  return <div className={`area-shell ${state.activeAreaId === area.id ? "active" : ""}`} ref={root} onPointerDown={() => dispatch({ type: "activateArea", id: area.id })} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}>
    <ViewRenderer kind={area.view} chatId={area.chatId} areaId={area.id} workflowId={area.workflowId} />
    <div ref={controls} className={`area-controls ${viewMenuOpen ? "open" : ""}`} onMouseEnter={() => setViewMenuOpen(true)} onMouseLeave={() => setViewMenuOpen(false)}>
      <button className="area-view-trigger" aria-label={`Trocar tipo de área: ${labels[area.view]}`} aria-expanded={viewMenuOpen} onPointerDown={(event) => event.stopPropagation()} onClick={() => setViewMenuOpen(true)}><CurrentViewIcon size={14} /></button>
      <div className="area-view-menu" role="menu">{areaViews.map((view) => { const Icon = view === "chat" ? MessageSquare : view === "workflow" ? Workflow : view === "terminal" ? TerminalSquare : view === "files" ? FolderOpen : view === "agents" ? Bot : view === "marketplace" ? ShoppingBag : view === "network" ? Network : view === "browser" ? Globe : Activity; return <button key={view} role="menuitem" aria-label={labels[view]} title={labels[view]} className={area.view === view ? "active" : ""} onPointerDown={(event) => event.stopPropagation()} onClick={() => { dispatch({ type: "activateArea", id: area.id }); dispatch({ type: "view", view }); setViewMenuOpen(false); }}><Icon size={14} /><span className="sr-only">{labels[view]}</span></button>; })}</div>
    </div>
    {intent && <div className={`area-split-preview ${intent.axis} ${intent.newAreaFirst ? "first" : "second"}`} style={intent.axis === "horizontal" ? { width: `calc(${(intent.newAreaFirst ? intent.fraction : 1 - intent.fraction) * 100}% - 5px)` } : { height: `calc(${(intent.newAreaFirst ? intent.fraction : 1 - intent.fraction) * 100}% - 5px)` }} />}
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
    <div className={`split-child ${collapseSide === "first" ? "collapse-target" : ""}`} style={{ flexBasis: `max(0px, calc(${split.fraction * 100}% - 3px))` }}><WorkspaceNode node={split.first} /></div>
    <div className="blender-divider" title="Reduza uma área abaixo de 50 px para fechá-la" onPointerDown={(event) => { dragging.current = true; collapseSideRef.current = null; event.currentTarget.setPointerCapture(event.pointerId); }}><i /></div>
    <div className={`split-child ${collapseSide === "second" ? "collapse-target" : ""}`} style={{ flexBasis: `max(0px, calc(${(1 - split.fraction) * 100}% - 3px))` }}><WorkspaceNode node={split.second} /></div>
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
