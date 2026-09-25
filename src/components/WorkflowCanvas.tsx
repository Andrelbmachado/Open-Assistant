import { Bot, Box, CirclePlay, Frame, Link2, Maximize2, Minus, MousePointer2, Plus, Save, Trash2, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useStore, type WorkflowFrame, type WorkflowNode } from "../store/store";

const NODE_WIDTH = 240;
const PORT_TOP = 79;
const PORT_GAP = 25;
const nodeIcon = { input: CirclePlay, agent: Bot, tool: Wrench, output: Box };

const paletteNodes: { label: string; type: WorkflowNode["type"]; title?: string; description?: string }[] = [
  { label: "Entrada", type: "input" },
  { label: "Agente", type: "agent" },
  { label: "PowerShell", type: "tool", title: "PowerShell", description: "Executa comandos no terminal integrado" },
  { label: "Ollama", type: "tool", title: "Ollama", description: "Executa um modelo local instalado pelo usuário" },
  { label: "OpenClaw", type: "tool", title: "OpenClaw", description: "Aciona uma automação local do OpenClaw" },
  { label: "Voz", type: "tool", title: "Voz", description: "Ditado e leitura usando recursos do Windows" },
  { label: "Credencial", type: "tool", title: "Credencial segura", description: "Usa um segredo do Gerenciador de Credenciais" },
  { label: "Saída", type: "output" },
];

type PortDrag = { nodeId: string; port: number };
type Interaction =
  | { mode: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { mode: "node"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "frame"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "resize-frame"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "marquee"; startX: number; startY: number; initialNodeIds: string[] };

interface Marquee { x: number; y: number; width: number; height: number }

type NodeRow = { label: string; value: string; control?: "select" | "slider" | "toggle" };

function rowsFor(node: WorkflowNode): NodeRow[] {
  if (node.type === "input") return [
    { label: "Evento", value: "Nova mensagem", control: "select" },
    { label: "Formato", value: "Texto", control: "select" },
    { label: "Payload", value: "Automático" },
    { label: "Disparar", value: "Ativo", control: "toggle" },
  ];
  if (node.type === "agent") return [
    { label: "Modelo", value: "GPT-5", control: "select" },
    { label: "Temperatura", value: "0.4", control: "slider" },
    { label: "Contexto", value: "Workspace" },
    { label: "Executar", value: "Automático", control: "toggle" },
  ];
  if (node.type === "tool") return [
    { label: "Ferramenta", value: node.title, control: "select" },
    { label: "Ação", value: "Executar" },
    { label: "Confirmação", value: "Quando necessário", control: "toggle" },
    { label: "Resultado", value: "stdout" },
  ];
  return [
    { label: "Destino", value: "Chat", control: "select" },
    { label: "Formato", value: "Markdown", control: "select" },
    { label: "Resposta", value: "Resultado" },
    { label: "Concluir", value: "Ativo", control: "toggle" },
  ];
}

function connectionPath(x1: number, y1: number, x2: number, y2: number) {
  const curve = Math.max(72, Math.min(220, Math.abs(x2 - x1) * .48));
  return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
}

function portY(node: WorkflowNode, port = 0) { return node.y + PORT_TOP + port * PORT_GAP; }

/** Canvas de nodes de agentes (arrastar, conectar portas, frames, zoom). */
export function WorkflowCanvas() {
  const { state, dispatch } = useStore();
  const [scale, setScale] = useState(.82);
  const [pan, setPan] = useState({ x: 20, y: 36 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["agent"]);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<PortDrag | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const currentAgent = state.agents.find((agent) => agent.id === state.currentAgentId);

  function toCanvasPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left - pan.x) / scale, y: (event.clientY - rect.top - pan.y) / scale };
  }

  function selectNode(id: string, additive = false) {
    setSelectedNodeIds((selected) => {
      if (!additive) return [id];
      return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    });
  }

  function updateMarquee(event: PointerEvent<HTMLDivElement>, current: Extract<Interaction, { mode: "marquee" }>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      x: Math.min(current.startX, event.clientX) - rect.left,
      y: Math.min(current.startY, event.clientY) - rect.top,
      width: Math.abs(event.clientX - current.startX),
      height: Math.abs(event.clientY - current.startY),
    };
    setMarquee(next);
    const selected = state.nodes.filter((node) => {
      const nodeLeft = pan.x + node.x * scale;
      const nodeTop = pan.y + node.y * scale;
      const nodeRight = nodeLeft + NODE_WIDTH * scale;
      const nodeBottom = nodeTop + 174 * scale;
      return nodeLeft < next.x + next.width && nodeRight > next.x && nodeTop < next.y + next.height && nodeBottom > next.y;
    }).map((node) => node.id);
    setSelectedNodeIds([...new Set([...current.initialNodeIds, ...selected])]);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (connecting) setCursor(toCanvasPoint(event));
    const current = interaction.current;
    if (!current) return;
    if (current.mode === "marquee") { updateMarquee(event, current); return; }
    const dx = (event.clientX - current.startX) / (current.mode === "pan" ? 1 : scale);
    const dy = (event.clientY - current.startY) / (current.mode === "pan" ? 1 : scale);
    if (current.mode === "pan") setPan({ x: current.originX + dx, y: current.originY + dy });
    if (current.mode === "node") dispatch({ type: "moveNode", id: current.id, x: current.originX + dx, y: current.originY + dy });
    if (current.mode === "frame") dispatch({ type: "moveFrame", id: current.id, x: current.originX + dx, y: current.originY + dy });
    if (current.mode === "resize-frame") dispatch({ type: "resizeFrame", id: current.id, width: current.originX + dx, height: current.originY + dy });
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setScale((value) => Math.min(1.6, Math.max(.35, value - event.deltaY * .0008)));
  }

  useEffect(() => {
    const remove = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (selectedConnection) { dispatch({ type: "removeConnection", id: selectedConnection }); setSelectedConnection(null); }
      else if (selectedNodeIds.length) { selectedNodeIds.forEach((id) => dispatch({ type: "removeNode", id })); setSelectedNodeIds([]); }
      else if (selectedFrame) { dispatch({ type: "removeFrame", id: selectedFrame }); setSelectedFrame(null); }
    };
    window.addEventListener("keydown", remove);
    return () => window.removeEventListener("keydown", remove);
  }, [dispatch, selectedConnection, selectedFrame, selectedNodeIds]);

  const connections = state.connections.flatMap((connection) => {
    const from = state.nodes.find((node) => node.id === connection.from);
    const to = state.nodes.find((node) => node.id === connection.to);
    return from && to ? [{ ...connection, from, to }] : [];
  });
  const pendingFrom = connecting ? state.nodes.find((node) => node.id === connecting.nodeId) : null;

  function startFrameInteraction(event: PointerEvent, frame: WorkflowFrame, mode: "frame" | "resize-frame") {
    event.stopPropagation();
    setSelectedFrame(frame.id); setSelectedNodeIds([]); setSelectedConnection(null);
    interaction.current = { mode, id: frame.id, startX: event.clientX, startY: event.clientY, originX: mode === "frame" ? frame.x : frame.width, originY: mode === "frame" ? frame.y : frame.height };
  }

  return <section className="view workflow-view n8n-canvas-view">
    <header className="view-header compact"><div><span className="eyebrow">Node editor</span><h2>{currentAgent?.name ?? "Agente de desenvolvimento"}</h2></div><div className="view-header-actions"><span className={`connect-hint ${connecting ? "active" : ""}`}><Link2 size={13} />{connecting ? "Solte em uma porta de entrada" : "Conecte portas como no Blender"}</span><button className="flat-button" title="O workflow é salvo automaticamente no dispositivo"><Save size={14} />Salvo localmente</button><button className="icon-button"><Maximize2 size={15} /></button></div></header>
    <div className={`canvas-shell n8n-canvas ${connecting ? "connecting" : ""} ${interaction.current?.mode === "pan" ? "canvas-panning" : ""}`} onPointerMove={onPointerMove} onPointerUp={(event) => { interaction.current = null; setMarquee(null); if (connecting && !(event.target as HTMLElement).classList.contains("node-input")) setConnecting(null); }} onPointerLeave={() => { if (interaction.current?.mode !== "marquee") interaction.current = null; }} onWheel={onWheel} onPointerDown={(event) => { if (!(event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-grid"))) return; if (event.button === 1) { event.preventDefault(); interaction.current = { mode: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }; return; } if (event.button !== 0) return; setSelectedConnection(null); setSelectedFrame(null); if (connecting) { setConnecting(null); return; } const initialNodeIds = event.ctrlKey || event.metaKey ? selectedNodeIds : []; if (!(event.ctrlKey || event.metaKey)) setSelectedNodeIds([]); interaction.current = { mode: "marquee", startX: event.clientX, startY: event.clientY, initialNodeIds }; setMarquee({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY, width: 0, height: 0 }); }}>
      <div className="canvas-grid" />
      {marquee && <div className="marquee-selection" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      <div className="node-library"><span>Adicionar</span><button onClick={() => dispatch({ type: "addFrame" })}><Frame size={12} />Frame</button>{paletteNodes.map((item) => <button key={item.label} title={item.description} onClick={() => dispatch({ type: "addNode", nodeType: item.type, title: item.title, description: item.description })}>{item.label}</button>)}</div>
      <div className="canvas-stage blender-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
        {state.frames.map((frame) => <section key={frame.id} className={`workflow-frame ${selectedFrame === frame.id ? "selected" : ""}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} onPointerDown={(event) => { event.stopPropagation(); setSelectedFrame(frame.id); setSelectedNodeIds([]); setSelectedConnection(null); }}>
          <header onPointerDown={(event) => startFrameInteraction(event, frame, "frame")}><Frame size={13} /><strong>{frame.title}</strong><span>{state.nodes.filter((node) => node.x >= frame.x && node.y >= frame.y && node.x <= frame.x + frame.width && node.y <= frame.y + frame.height).length} nodes</span><button aria-label={`Excluir ${frame.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => dispatch({ type: "removeFrame", id: frame.id })}><X size={12} /></button></header>
          <p>Arraste nodes para organizar esta etapa do workflow.</p>
          <button className="frame-resize" aria-label={`Redimensionar ${frame.title}`} onPointerDown={(event) => startFrameInteraction(event, frame, "resize-frame")} />
        </section>)}
        <svg className="connections" width="1800" height="1000">{connections.map(({ id, from, to, fromPort, toPort }) => <path key={id} className={selectedConnection === id ? "selected" : ""} d={connectionPath(from.x + NODE_WIDTH, portY(from, fromPort), to.x, portY(to, toPort))} onPointerDown={(event) => { event.stopPropagation(); setSelectedConnection(id); setSelectedNodeIds([]); setSelectedFrame(null); }} />)}{pendingFrom && connecting && <path className="pending-connection" d={connectionPath(pendingFrom.x + NODE_WIDTH, portY(pendingFrom, connecting.port), cursor.x, cursor.y)} />}</svg>
        {state.nodes.map((node) => {
          const Icon = nodeIcon[node.type];
          const rows = rowsFor(node);
          return <article key={node.id} className={`workflow-node blender-node ${node.type} ${selectedNodeIds.includes(node.id) ? "selected" : ""}`} style={{ left: node.x, top: node.y }} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); selectNode(node.id, event.ctrlKey || event.metaKey); setSelectedFrame(null); setSelectedConnection(null); }}>
            <div className="node-header" onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); selectNode(node.id, event.ctrlKey || event.metaKey); setSelectedFrame(null); setSelectedConnection(null); interaction.current = { mode: "node", id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y }; }}><span><Icon size={13} />{node.title}</span><button aria-label={`Excluir ${node.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => dispatch({ type: "removeNode", id: node.id })}><Trash2 size={11} /></button></div>
            <div className="node-summary"><strong>{node.type === "agent" ? "AI Agent" : node.type === "tool" ? "Action" : node.type === "input" ? "Trigger" : "Output"}</strong><small>{node.description}</small></div>
            <div className="blender-node-rows">{rows.map((row, port) => <div className="blender-node-row" key={`${node.id}-${row.label}`}>
              <button className="node-port node-input" aria-label={`Entrada ${row.label} de ${node.title}`} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => { event.stopPropagation(); if (connecting && connecting.nodeId !== node.id) { dispatch({ type: "connectNodes", from: connecting.nodeId, to: node.id, fromPort: connecting.port, toPort: port }); setConnecting(null); } }} />
              <label>{row.label}</label>
              {row.control === "select" ? <select defaultValue={row.value} onPointerDown={(event) => event.stopPropagation()}><option>{row.value}</option></select> : row.control === "slider" ? <span className="node-slider"><i style={{ width: "40%" }} />{row.value}</span> : row.control === "toggle" ? <span className="node-toggle"><i />{row.value}</span> : <span className="node-value">{row.value}</span>}
              <button className={`node-port node-output ${connecting?.nodeId === node.id && connecting.port === port ? "active" : ""}`} aria-label={`Saída ${row.label} de ${node.title}`} onPointerDown={(event) => { event.stopPropagation(); selectNode(node.id); setConnecting({ nodeId: node.id, port }); }} />
            </div>)}</div>
          </article>;
        })}
      </div>
      <div className="canvas-tools"><button onClick={() => setScale((value) => Math.min(1.6, value + .1))}><Plus size={15} /></button><span>{Math.round(scale * 100)}%</span><button onClick={() => setScale((value) => Math.max(.35, value - .1))}><Minus size={15} /></button><i /><button onClick={() => { setScale(.82); setPan({ x: 20, y: 36 }); }}><MousePointer2 size={15} /></button></div>
      <div className="minimap"><div className="minimap-viewport" />{state.frames.map((frame) => <b key={frame.id} style={{ left: frame.x / 10, top: frame.y / 10, width: frame.width / 10, height: frame.height / 10 }} />)}{state.nodes.map((node) => <i key={node.id} style={{ left: node.x / 10, top: node.y / 10 }} />)}</div>
    </div>
  </section>;
}
