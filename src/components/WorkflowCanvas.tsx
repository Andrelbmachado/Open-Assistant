import { invoke } from "@tauri-apps/api/core";
import { Bell, Bot, Check, ChevronDown, CirclePlay, Clock, Eye, Cloud, CloudDownload, CloudUpload, Copy, FileInput, FileOutput, Filter, FolderOpen, Frame, Globe, ImageIcon, LayoutTemplate, Link2, ListChecks, LoaderCircle, Maximize2, Merge, MessageSquare, Minus, Octagon, Pencil, Play, Plus, Search, Sparkles, Square, TerminalSquare, Trash2, Wand2, Workflow, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useStore, type FlowFrame, type FlowNode, type WorkflowDoc } from "../store/store";
import { useLocalModels } from "../store/localModelsStore";
import { installTool, useTools } from "../store/toolsStore";
import { cancelRun, useWorkflowRuns } from "../store/workflowRuns";
import { IMAGE_MODELS } from "../utils/imageCatalog";
import { OLLAMA_MODEL_PREFIX } from "../utils/localCatalog";
import { CATEGORY_LABEL, KIND_BY_ID, NODE_KINDS, NODE_WIDTH, nodeTitle, scheduleMinutes, validateWorkflow, WORKFLOW_TEMPLATES, withDefaults, type NodeCategory, type ParamSpec, type ParamValue } from "../utils/workflow";
import { runWorkflowById } from "../utils/workflowService";
import { allowedWhenReadOnly, isSystemWorkflow, SYSTEM_WORKFLOWS, systemWorkflow } from "../utils/systemWorkflows";
import { isQAOffline } from "../utils/qaMode";
import { useDismiss } from "../utils/useDismiss";
import { Dropdown } from "./Dropdown";

/** Centro vertical das portas: borda (1) + cabeçalho (38) + resumo (40) + metade da linha "Entrada/Saída" (32/2). */
const PORT_TOP = 95;

const KIND_ICON: Record<string, LucideIcon> = {
  "trigger.manual": CirclePlay, "trigger.schedule": Clock, "web.open": Globe, "web.read": FileInput, "web.search": Search, "http.request": Link2,
  "file.list": FolderOpen, "file.read": FileInput, "file.write": FileOutput, "file.copy": Copy, "cloud.list": Cloud, "cloud.download": CloudDownload,
  "cloud.upload": CloudUpload, "ai.prompt": Sparkles, "ai.summarize": ListChecks, "image.generate": ImageIcon, "image.edit": Wand2, "flow.merge": Merge,
  "flow.filter": Filter, "flow.stopIfEmpty": Octagon, "output.chat": MessageSquare, "output.notify": Bell, "system.powershell": TerminalSquare, "agent.task": Bot,
};

const CATEGORY_ORDER: NodeCategory[] = ["gatilho", "web", "arquivos", "nuvem", "ia", "fluxo", "saida", "sistema"];

type Interaction =
  | { mode: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { mode: "node"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "frame"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "resize-frame"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "marquee"; startX: number; startY: number; initialNodeIds: string[] };

interface Marquee { x: number; y: number; width: number; height: number }

function connectionPath(x1: number, y1: number, x2: number, y2: number) {
  const curve = Math.max(72, Math.min(220, Math.abs(x2 - x1) * .48));
  return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
}

/** Contas de nuvem conectadas (rclone). Uma leitura por abertura do app. */
interface CloudStatus { installed: boolean; remotes: { name: string; kind: string }[] }
let cloudCache: Promise<CloudStatus> | undefined;
function loadCloud(force = false): Promise<CloudStatus> {
  if (isQAOffline()) return Promise.resolve({ installed: false, remotes: [] });
  if (force || !cloudCache) cloudCache = invoke<CloudStatus>("cloud_status").catch(() => ({ installed: false, remotes: [] }));
  return cloudCache;
}

/** Escolha da conta de nuvem com os botões de baixar o conector e de conectar (login no navegador). */
function RemoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tools = useTools();
  const [status, setStatus] = useState<CloudStatus>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const installing = tools.progress.rclone?.state === "running";
  useEffect(() => { void loadCloud(tools.installed.has("rclone")).then(setStatus); }, [tools.installed]);
  const connect = async (provider: string, name: string) => {
    setBusy(`Entre na sua conta no navegador que abriu… (${provider === "drive" ? "Google Drive" : provider})`);
    setError("");
    try {
      await invoke("cloud_connect", { provider, name });
      setStatus(await loadCloud(true));
      onChange(name);
    } catch (reason) { setError(String(reason)); }
    setBusy("");
  };
  if (!status?.installed) {
    return <div className="node-cloud-setup">
      <button className="node-mini-button" disabled={installing} onPointerDown={(event) => event.stopPropagation()} onClick={() => void installTool("rclone")}>{installing ? <LoaderCircle size={11} className="spin" /> : <CloudDownload size={11} />}{installing ? "Baixando conector…" : "Baixar conector de nuvens (30 MB)"}</button>
    </div>;
  }
  const known = status.remotes.some((remote) => remote.name === value);
  return <div className="node-cloud-setup">
    <Dropdown size="sm" ariaLabel="Conta de nuvem" value={known ? value : ""} placeholder={value ? `${value} (não conectada)` : "Escolha a conta"} onChange={onChange}
      options={status.remotes.map((remote) => ({ value: remote.name, label: remote.name, description: remote.kind === "drive" ? "Google Drive" : remote.kind, icon: <Cloud size={13} /> }))} />
    {!known && <button className="node-mini-button" disabled={Boolean(busy)} onPointerDown={(event) => event.stopPropagation()} onClick={() => void connect("drive", value || "gdrive")}><Cloud size={11} />Conectar Google Drive</button>}
    {busy && <small className="node-hint">{busy}</small>}
    {error && <small className="node-hint error">{error}</small>}
  </div>;
}

/** Controle de um parâmetro do node. */
function ParamField({ spec, value, onChange }: { spec: ParamSpec; value: ParamValue | undefined; onChange: (value: ParamValue) => void }) {
  const local = useLocalModels();
  const tools = useTools();
  const stop = { onPointerDown: (event: PointerEvent) => event.stopPropagation(), onWheel: (event: WheelEvent) => event.stopPropagation() };
  const text = value === undefined ? "" : String(value);
  switch (spec.type) {
    case "boolean": {
      const on = value === true || value === "true";
      return <button type="button" role="switch" aria-checked={on} className={`wf-switch ${on ? "on" : ""}`} {...stop} onClick={() => onChange(!on)}><i /><span>{on ? "Sim" : "Não"}</span></button>;
    }
    case "select": return <Dropdown size="sm" ariaLabel={spec.label} value={text} onChange={onChange} options={spec.options?.map((option) => ({ value: option.value, label: option.label })) ?? []} />;
    case "number": return <input type="number" value={text} step={spec.key === "strength" ? .05 : 1} {...stop} onChange={(event) => onChange(Number(event.target.value))} />;
    case "longtext": return <textarea value={text} rows={3} placeholder={spec.placeholder} spellCheck={false} {...stop} onChange={(event) => onChange(event.target.value)} />;
    case "model": return <Dropdown size="sm" ariaLabel={spec.label} value={text} onChange={onChange} options={[
      { value: "", label: "Modelo do chat", description: "o mesmo da conversa aberta" },
      ...local.installed.map((model) => ({ value: `${OLLAMA_MODEL_PREFIX}${model.name}`, label: model.name, description: model.parameterSize, group: "Instalados" })),
      ...(text && !local.installed.some((model) => `${OLLAMA_MODEL_PREFIX}${model.name}` === text) ? [{ value: text, label: text, description: "não instalado" }] : []),
    ]} />;
    case "imageModel": return <Dropdown size="sm" ariaLabel={spec.label} value={text} onChange={onChange} options={[
      { value: "", label: "Melhor instalado", description: "escolhe sozinho" },
      ...IMAGE_MODELS.filter((model) => tools.installed.has(model.id)).map((model) => ({ value: model.id, label: model.name, group: "Instalados" })),
    ]} />;
    case "remote": return <RemoteField value={text} onChange={onChange} />;
    default: return <input type="text" value={text} placeholder={spec.placeholder} spellCheck={false} {...stop} onChange={(event) => onChange(event.target.value)} />;
  }
}

/**
 * Editor de nodes de uma área. Cada área mostra **o seu** workflow (`workflowId` da área): trocar de
 * projeto aqui não mexe nas outras áreas. Os nodes são de verdade — Executar roda o fluxo, e os com
 * "A cada X minutos" rodam sozinhos. Documentação: docs/NODE_EDITOR.md.
 */
export function WorkflowCanvas({ areaId, workflowId }: { areaId: string; workflowId?: string }) {
  const { state, dispatch: storeDispatch } = useStore();
  const runs = useWorkflowRuns();
  const readOnly = isSystemWorkflow(workflowId);
  const doc: WorkflowDoc | undefined = state.workflows.find((item) => item.id === workflowId) ?? systemWorkflow(workflowId);
  // Fluxo do sistema: pode navegar (zoom, arrastar a vista, trocar de workflow), mas nada é editado.
  const dispatch = useCallback((action: Parameters<typeof storeDispatch>[0]) => { if (!readOnly || allowedWhenReadOnly(action.type)) storeDispatch(action); }, [readOnly, storeDispatch]);
  const [scale, setScale] = useState(.82);
  const [pan, setPan] = useState({ x: 20, y: 36 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const interaction = useRef<Interaction | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const projectArea = useRef<HTMLDivElement>(null);
  const paletteArea = useRef<HTMLDivElement>(null);
  useDismiss(projectMenu, [projectArea], () => setProjectMenu(false));
  useDismiss(paletteOpen, [paletteArea], () => setPaletteOpen(false));
  const run = doc ? runs[doc.id] : undefined;
  const id = doc?.id ?? "";
  const nodes = useMemo(() => doc?.nodes ?? [], [doc?.nodes]);
  const connections = doc?.connections ?? [];
  const frames = doc?.frames ?? [];

  // Abrir outro workflow nesta área: enquadra os nodes dele e limpa a seleção.
  useEffect(() => {
    setSelectedNodeIds([]); setSelectedFrame(null); setSelectedConnection(null); setConnecting(null);
    const box = shell.current?.getBoundingClientRect();
    if (!doc || !box || !doc.nodes.length) { setScale(.82); setPan({ x: 20, y: 36 }); return; }
    const right = Math.max(...doc.nodes.map((node) => node.x + NODE_WIDTH));
    const bottom = Math.max(...doc.nodes.map((node) => node.y + 260));
    const left = Math.min(...doc.nodes.map((node) => node.x));
    const top = Math.min(...doc.nodes.map((node) => node.y));
    // Cabe tudo quando dá; workflows compridos ficam legíveis (mínimo 60 %) a partir do começo, à esquerda.
    const fit = Math.min(1, Math.max(readOnly ? .35 : .6, Math.min((box.width - 60) / (right - left + 40), (box.height - 120) / (bottom - top + 40))));
    setScale(fit);
    setPan({ x: 30 - left * fit, y: 70 - top * fit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  function toCanvasPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left - pan.x) / scale, y: (event.clientY - rect.top - pan.y) / scale };
  }

  function selectNode(nodeId: string, additive = false) {
    setSelectedNodeIds((selected) => {
      if (!additive) return [nodeId];
      return selected.includes(nodeId) ? selected.filter((item) => item !== nodeId) : [...selected, nodeId];
    });
  }

  function updateMarquee(event: PointerEvent<HTMLDivElement>, current: Extract<Interaction, { mode: "marquee" }>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = { x: Math.min(current.startX, event.clientX) - rect.left, y: Math.min(current.startY, event.clientY) - rect.top, width: Math.abs(event.clientX - current.startX), height: Math.abs(event.clientY - current.startY) };
    setMarquee(next);
    const selected = nodes.filter((node) => {
      const nodeLeft = pan.x + node.x * scale;
      const nodeTop = pan.y + node.y * scale;
      return nodeLeft < next.x + next.width && nodeLeft + NODE_WIDTH * scale > next.x && nodeTop < next.y + next.height && nodeTop + 190 * scale > next.y;
    }).map((node) => node.id);
    setSelectedNodeIds([...new Set([...current.initialNodeIds, ...selected])]);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (connecting) setCursor(toCanvasPoint(event));
    const current = interaction.current;
    if (!current || !doc) return;
    if (current.mode === "marquee") { updateMarquee(event, current); return; }
    const dx = (event.clientX - current.startX) / (current.mode === "pan" ? 1 : scale);
    const dy = (event.clientY - current.startY) / (current.mode === "pan" ? 1 : scale);
    if (current.mode === "pan") setPan({ x: current.originX + dx, y: current.originY + dy });
    if (current.mode === "node") dispatch({ type: "wfMoveNode", workflowId: id, id: current.id, x: Math.round(current.originX + dx), y: Math.round(current.originY + dy) });
    if (current.mode === "frame") dispatch({ type: "wfMoveFrame", workflowId: id, id: current.id, x: current.originX + dx, y: current.originY + dy });
    if (current.mode === "resize-frame") dispatch({ type: "wfResizeFrame", workflowId: id, id: current.id, width: current.originX + dx, height: current.originY + dy });
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setScale((value) => Math.min(1.6, Math.max(.3, value - event.deltaY * .0008)));
  }

  // Delete apaga a seleção — só nesta área (com duas áreas de nodes, cada uma cuida da sua).
  useEffect(() => {
    const remove = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (state.activeAreaId !== areaId) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (selectedConnection) { dispatch({ type: "wfRemoveConnection", workflowId: id, id: selectedConnection }); setSelectedConnection(null); }
      else if (selectedNodeIds.length) { dispatch({ type: "wfRemoveNodes", workflowId: id, ids: selectedNodeIds }); setSelectedNodeIds([]); }
      else if (selectedFrame) { dispatch({ type: "wfRemoveFrame", workflowId: id, id: selectedFrame }); setSelectedFrame(null); }
    };
    window.addEventListener("keydown", remove);
    return () => window.removeEventListener("keydown", remove);
  }, [dispatch, id, selectedConnection, selectedFrame, selectedNodeIds, state.activeAreaId, areaId]);

  const drawn = connections.flatMap((connection) => {
    const from = nodes.find((node) => node.id === connection.from);
    const to = nodes.find((node) => node.id === connection.to);
    return from && to ? [{ ...connection, from, to }] : [];
  });
  const pendingFrom = connecting ? nodes.find((node) => node.id === connecting) : null;
  const stage = { width: Math.max(1800, ...nodes.map((node) => node.x + NODE_WIDTH + 400)), height: Math.max(1000, ...nodes.map((node) => node.y + 600)) };
  const issues = doc ? validateWorkflow(doc) : [];
  const minutes = doc ? scheduleMinutes(doc) : undefined;

  function startFrameInteraction(event: PointerEvent, frame: FlowFrame, mode: "frame" | "resize-frame") {
    event.stopPropagation();
    setSelectedFrame(frame.id); setSelectedNodeIds([]); setSelectedConnection(null);
    interaction.current = { mode, id: frame.id, startX: event.clientX, startY: event.clientY, originX: mode === "frame" ? frame.x : frame.width, originY: mode === "frame" ? frame.y : frame.height };
  }

  function addNode(kind: string) {
    const box = shell.current?.getBoundingClientRect();
    // Nasce no meio do que está visível.
    const x = box ? Math.round((box.width / 2 - pan.x) / scale - NODE_WIDTH / 2) : undefined;
    const y = box ? Math.round((box.height / 2 - pan.y) / scale - 90) : undefined;
    dispatch({ type: "wfAddNode", workflowId: id, kind, x, y });
    setPaletteOpen(false);
  }

  function runNow() {
    if (!doc) return;
    if (run?.running) { cancelRun(doc.id); return; }
    setPanelOpen(true);
    void runWorkflowById(doc.id, "manual").catch(() => undefined);
  }

  if (!doc) return <section className="view workflow-view n8n-canvas-view"><div className="canvas-empty"><LoaderCircle size={18} className="spin" />Preparando o workflow…</div></section>;

  return <section className="view workflow-view n8n-canvas-view" onPointerDown={() => { if (state.activeAreaId !== areaId) dispatch({ type: "activateArea", id: areaId }); }}>
    <header className="view-header compact workflow-header">
      <div className="workflow-title">
        <span className="eyebrow">Editor de nodes</span>
        <div className="workflow-project" ref={projectArea}>
          {renaming
            ? <input autoFocus defaultValue={doc.name} aria-label="Nome do workflow" onBlur={(event) => { dispatch({ type: "wfRename", workflowId: id, name: event.target.value }); setRenaming(false); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setRenaming(false); }} />
            : <button className={`workflow-project-button ${projectMenu ? "open" : ""}`} onClick={() => { setProjectMenu((open) => !open); setProjectQuery(""); }} title="Trocar o workflow desta área (as outras áreas não mudam)"><h2>{doc.name}</h2><ChevronDown size={14} /></button>}
          {!renaming && !readOnly && <button className="icon-button wf-rename" onClick={() => setRenaming(true)} title="Renomear" aria-label="Renomear workflow"><Pencil size={13} /></button>}
          {projectMenu && <div className="workflow-project-menu oa-menu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
            <label className="oa-menu-search"><Search size={13} /><input autoFocus value={projectQuery} placeholder="Buscar workflows e modelos…" onChange={(event) => setProjectQuery(event.target.value)} /></label>
            <div className="oa-menu-scroll">
              <span className="oa-menu-label">Seus workflows</span>
              {state.workflows.filter((item) => item.name.toLowerCase().includes(projectQuery.toLowerCase())).map((item) => <button key={item.id} role="menuitem" className={`oa-menu-item ${item.id === doc.id ? "active" : ""}`} onClick={() => { dispatch({ type: "wfOpen", workflowId: item.id, areaId }); setProjectMenu(false); }}>
                <span className="oa-menu-icon"><Workflow size={14} /></span>
                <span className="oa-menu-text"><b>{item.name}</b><small>{item.nodes.length} {item.nodes.length === 1 ? "node" : "nodes"}{scheduleMinutes(item) ? ` · a cada ${scheduleMinutes(item)} min` : ""}</small></span>
                {item.id === doc.id && <Check size={14} className="oa-menu-check" />}
              </button>)}
              <span className="oa-menu-label">Fluxos do sistema</span>
              {SYSTEM_WORKFLOWS.filter((item) => item.name.toLowerCase().includes(projectQuery.toLowerCase())).map((item) => <button key={item.id} role="menuitem" className={`oa-menu-item ${item.id === doc.id ? "active" : ""}`} onClick={() => { dispatch({ type: "wfOpen", workflowId: item.id, areaId }); setProjectMenu(false); }}>
                <span className="oa-menu-icon"><Eye size={14} /></span>
                <span className="oa-menu-text"><b>{item.name}</b><small>só visualização</small></span>
                {item.id === doc.id && <Check size={14} className="oa-menu-check" />}
              </button>)}
              <button role="menuitem" className="oa-menu-item" onClick={() => { dispatch({ type: "wfCreate", areaId }); setProjectMenu(false); }}><span className="oa-menu-icon accent"><Plus size={14} /></span><span className="oa-menu-text"><b>Novo workflow em branco</b></span></button>
              <span className="oa-menu-label">Modelos prontos</span>
              {WORKFLOW_TEMPLATES.filter((template) => `${template.name} ${template.description}`.toLowerCase().includes(projectQuery.toLowerCase())).map((template) => <button key={template.id} role="menuitem" className="oa-menu-item" onClick={() => { dispatch({ type: "wfCreate", doc: template.build(), areaId }); setProjectMenu(false); }}>
                <span className="oa-menu-icon"><LayoutTemplate size={14} /></span><span className="oa-menu-text"><b>{template.name}</b><small>{template.description}</small></span>
              </button>)}
            </div>
            {state.workflows.length > 1 && !readOnly && <div className="oa-menu-footer"><button role="menuitem" className="oa-menu-item danger" onClick={() => { if (confirm(`Apagar o workflow "${doc.name}"?`)) dispatch({ type: "wfDelete", workflowId: id }); setProjectMenu(false); }}><span className="oa-menu-icon"><Trash2 size={14} /></span><span className="oa-menu-text"><b>Apagar "{doc.name}"</b></span></button></div>}
          </div>}
        </div>
      </div>
      <div className="view-header-actions">
        {readOnly && <span className="workflow-readonly-note" title={`Fluxo do sistema: acende quando o app usa. ${doc.description ?? ""}`}><Eye size={13} />Só visualização</span>}
        {!readOnly && <span className={`connect-hint ${connecting ? "active" : ""}`}><Link2 size={13} />{connecting ? "Solte na entrada de outro node" : "Arraste da saída para a entrada"}</span>}
        {minutes && <button className={`workflow-schedule ${doc.scheduleEnabled === false ? "off" : "on"}`} onClick={() => dispatch({ type: "wfSetSchedule", workflowId: id, enabled: doc.scheduleEnabled === false })} title="Liga/desliga a execução automática (só com o app aberto)">
          <Clock size={13} /><span className="schedule-text">A cada {minutes} min · </span>{doc.scheduleEnabled === false ? "pausado" : "ligado"}
        </button>}
        {!readOnly && <button className={`primary-button workflow-run ${run?.running ? "running" : ""}`} onClick={runNow} disabled={!run?.running && issues.length > 0} title={issues.length ? issues.map((issue) => issue.message).join("\n") : "Executar agora"}>
          {run?.running ? <><Square size={12} />Parar</> : <><Play size={13} />Executar</>}
        </button>}
      </div>
    </header>
    <div ref={shell} className={`canvas-shell n8n-canvas ${connecting ? "connecting" : ""}`} onPointerMove={onPointerMove}
      onPointerUp={(event) => { interaction.current = null; setMarquee(null); if (connecting && !(event.target as HTMLElement).classList.contains("node-input")) setConnecting(null); }}
      onPointerLeave={() => { if (interaction.current?.mode !== "marquee") interaction.current = null; }} onWheel={onWheel}
      onPointerDown={(event) => {
        setProjectMenu(false);
        if (!(event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-grid"))) return;
        if (event.button === 1) { event.preventDefault(); interaction.current = { mode: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }; return; }
        if (event.button !== 0) return;
        setSelectedConnection(null); setSelectedFrame(null); setPaletteOpen(false);
        if (connecting) { setConnecting(null); return; }
        const initialNodeIds = event.ctrlKey || event.metaKey ? selectedNodeIds : [];
        if (!(event.ctrlKey || event.metaKey)) setSelectedNodeIds([]);
        interaction.current = { mode: "marquee", startX: event.clientX, startY: event.clientY, initialNodeIds };
        setMarquee({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY, width: 0, height: 0 });
      }}>
      <div className="canvas-grid" />
      {marquee && <div className="marquee-selection" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      {!readOnly && <div className="node-library wf-toolbar" ref={paletteArea} onPointerDown={(event) => event.stopPropagation()}>
        <button className={paletteOpen ? "active" : ""} onClick={() => { setPaletteOpen((open) => !open); setPaletteQuery(""); }}><Plus size={14} />Adicionar node</button>
        <button onClick={() => dispatch({ type: "wfAddFrame", workflowId: id })}><Frame size={13} />Frame</button>
        {paletteOpen && <div className="node-palette oa-menu" role="menu">
          <label className="oa-menu-search"><Search size={13} /><input autoFocus value={paletteQuery} placeholder="Buscar node (ex.: pasta, IA, nuvem)…" onChange={(event) => setPaletteQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { const first = NODE_KINDS.find((spec) => !spec.traceOnly && `${spec.label} ${spec.description} ${CATEGORY_LABEL[spec.category]}`.toLowerCase().includes(paletteQuery.toLowerCase())); if (first) addNode(first.kind); } }} /></label>
          <div className="oa-menu-scroll">
            {CATEGORY_ORDER.map((category) => {
              const items = NODE_KINDS.filter((spec) => !spec.traceOnly && spec.category === category && `${spec.label} ${spec.description} ${CATEGORY_LABEL[category]}`.toLowerCase().includes(paletteQuery.toLowerCase()));
              if (!items.length) return null;
              return <div key={category} className="node-palette-group">
                <span className="oa-menu-label">{CATEGORY_LABEL[category]}</span>
                {items.map((spec) => { const Icon = KIND_ICON[spec.kind] ?? Sparkles; return <button key={spec.kind} role="menuitem" className={`oa-menu-item cat-${spec.category}`} onClick={() => addNode(spec.kind)} title={spec.description}>
                  <span className="oa-menu-icon cat"><Icon size={14} /></span><span className="oa-menu-text"><b>{spec.label}</b><small>{spec.description}</small></span>
                </button>; })}
              </div>;
            })}
          </div>
        </div>}
      </div>}
      <div className="canvas-stage blender-stage" style={{ width: stage.width, height: stage.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
        {frames.map((frame) => <section key={frame.id} className={`workflow-frame ${selectedFrame === frame.id ? "selected" : ""}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} onPointerDown={(event) => { event.stopPropagation(); setSelectedFrame(frame.id); setSelectedNodeIds([]); setSelectedConnection(null); }}>
          <header onPointerDown={(event) => startFrameInteraction(event, frame, "frame")}><Frame size={13} /><strong>{frame.title}</strong><span>{nodes.filter((node) => node.x >= frame.x && node.y >= frame.y && node.x <= frame.x + frame.width && node.y <= frame.y + frame.height).length} nodes</span><button aria-label={`Excluir ${frame.title}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => dispatch({ type: "wfRemoveFrame", workflowId: id, id: frame.id })}><X size={12} /></button></header>
          <button className="frame-resize" aria-label={`Redimensionar ${frame.title}`} onPointerDown={(event) => startFrameInteraction(event, frame, "resize-frame")} />
        </section>)}
        <svg className="connections" width={stage.width} height={stage.height}>
          {drawn.map(({ id: connectionId, from, to }) => { const state = run?.nodes[from.id]?.state; return <path key={connectionId} className={`${selectedConnection === connectionId ? "selected" : ""} ${state === "ok" && (run?.nodes[to.id]?.state === "running" || run?.nodes[to.id]?.state === "ok") ? "flowing" : ""}`} d={connectionPath(from.x + NODE_WIDTH, from.y + PORT_TOP, to.x, to.y + PORT_TOP)} onPointerDown={(event) => { event.stopPropagation(); setSelectedConnection(connectionId); setSelectedNodeIds([]); setSelectedFrame(null); }} />; })}
          {pendingFrom && <path className="pending-connection" d={connectionPath(pendingFrom.x + NODE_WIDTH, pendingFrom.y + PORT_TOP, cursor.x, cursor.y)} />}
        </svg>
        {nodes.map((node) => <NodeCard key={node.id} node={node} workflowId={id} selected={selectedNodeIds.includes(node.id)} connecting={connecting}
          info={run?.nodes[node.id]} issue={issues.find((issue) => issue.nodeId === node.id)?.message}
          onSelect={(additive) => { selectNode(node.id, additive); setSelectedFrame(null); setSelectedConnection(null); }}
          onDragStart={(event) => { interaction.current = { mode: "node", id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y }; }}
          onStartConnect={() => { selectNode(node.id); setConnecting(node.id); }}
          onFinishConnect={() => { if (connecting && connecting !== node.id) { dispatch({ type: "wfConnect", workflowId: id, from: connecting, to: node.id }); setConnecting(null); } }} />)}
      </div>
      {!nodes.length && <div className="canvas-empty-hint"><Plus size={16} />Clique em "Adicionar node" e comece por um gatilho.</div>}
      <div className="canvas-tools wf-zoom"><button onClick={() => setScale((value) => Math.max(.3, value - .1))} title="Afastar" aria-label="Afastar"><Minus size={14} /></button><span>{Math.round(scale * 100)}%</span><button onClick={() => setScale((value) => Math.min(1.6, value + .1))} title="Aproximar" aria-label="Aproximar"><Plus size={14} /></button><i /><button onClick={() => { setScale(.82); setPan({ x: 20, y: 36 }); }} title="Voltar ao início" aria-label="Voltar ao início"><Maximize2 size={13} /></button></div>
      {run && <RunPanel doc={doc} open={panelOpen} onToggle={() => setPanelOpen((open) => !open)} />}
    </div>
  </section>;
}

interface NodeCardProps {
  node: FlowNode;
  workflowId: string;
  selected: boolean;
  connecting: string | null;
  info?: { state: string; count?: number; message?: string; sample?: string; ms?: number };
  issue?: string;
  onSelect: (additive: boolean) => void;
  onDragStart: (event: PointerEvent) => void;
  onStartConnect: () => void;
  onFinishConnect: () => void;
}

/** Um node: cabeçalho colorido pela categoria, porta de entrada/saída e os parâmetros editáveis. */
function NodeCard({ node, workflowId, selected, connecting, info, issue, onSelect, onDragStart, onStartConnect, onFinishConnect }: NodeCardProps) {
  const { dispatch } = useStore();
  const spec = KIND_BY_ID.get(node.kind);
  const Icon = KIND_ICON[node.kind] ?? Sparkles;
  const params = withDefaults(node.kind, node.params);
  const status = info?.state;
  return <article className={`workflow-node blender-node flow-node cat-${spec?.category ?? "sistema"} ${selected ? "selected" : ""} ${status ? `run-${status}` : ""}`} style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
    onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); onSelect(event.ctrlKey || event.metaKey); }}>
    <div className="node-header" onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); onSelect(event.ctrlKey || event.metaKey); onDragStart(event); }}>
      <span><i className="wf-node-icon"><Icon size={13} /></i><b>{nodeTitle(node)}</b></span>
      {status === "running" ? <LoaderCircle size={12} className="spin node-status" /> : status ? <i className={`node-status-dot ${status}`} title={status} /> : null}
      <button aria-label={`Excluir ${nodeTitle(node)}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => dispatch({ type: "wfRemoveNodes", workflowId, ids: [node.id] })}><Trash2 size={11} /></button>
    </div>
    <div className="node-summary"><strong>{spec ? CATEGORY_LABEL[spec.category] : "Desconhecido"}</strong><small title={spec?.description}>{spec?.description ?? node.kind}</small></div>
    <div className="blender-node-rows">
      <div className="blender-node-row node-io-row">
        {spec?.input && <button className={`node-port node-input ${connecting && connecting !== node.id ? "available" : ""}`} aria-label={`Entrada de ${nodeTitle(node)}`} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => { event.stopPropagation(); onFinishConnect(); }} />}
        <label>{spec?.input ? "Entrada" : "Início"}</label>
        <span className="node-value">{info?.count !== undefined ? `${info.count} ${info.count === 1 ? "item" : "itens"}${info.ms !== undefined ? ` · ${(info.ms / 1000).toFixed(1)} s` : ""}` : spec?.output ? "Saída →" : "Fim"}</span>
        {spec?.output && <button className={`node-port node-output ${connecting === node.id ? "active" : ""}`} aria-label={`Saída de ${nodeTitle(node)}`} onPointerDown={(event) => { event.stopPropagation(); onStartConnect(); }} />}
      </div>
      {spec?.params.map((param) => <div key={param.key} className={`blender-node-row param-${param.type}`} title={param.help}>
        <label>{param.label}</label>
        <ParamField spec={param} value={params[param.key]} onChange={(value) => dispatch({ type: "wfSetParam", workflowId, id: node.id, key: param.key, value })} />
      </div>)}
    </div>
    {(info?.message || issue) && <p className={`node-note ${status === "error" ? "error" : issue && !info ? "warn" : ""}`}>{info?.message ?? issue}</p>}
  </article>;
}

/** Painel da última execução: cada node com estado, itens e amostra do que saiu. */
function RunPanel({ doc, open, onToggle }: { doc: WorkflowDoc; open: boolean; onToggle: () => void }) {
  const runs = useWorkflowRuns();
  const run = runs[doc.id];
  if (!run) return null;
  const result = run.result;
  return <div className={`workflow-run-panel ${open ? "open" : ""}`} onPointerDown={(event) => event.stopPropagation()}>
    <button className="workflow-run-head" onClick={onToggle}>
      {run.running ? <LoaderCircle size={13} className="spin" /> : result?.ok ? <i className="node-status-dot ok" /> : <i className="node-status-dot error" />}
      <strong>{run.running ? "Executando…" : result?.ok ? result.stopped ? "Nada novo — parou" : "Concluído" : "Falhou"}</strong>
      <small>{run.trigger === "agenda" ? "agendado" : run.trigger === "ia" ? "pela IA" : run.trigger === "sistema" ? "pelo sistema" : "manual"}{result ? ` · ${(result.ms / 1000).toFixed(1)} s` : ""}</small>
      <ChevronDown size={13} className="chevron" />
    </button>
    {open && <div className="workflow-run-body">
      {result?.error && <p className="node-note error">{result.error}</p>}
      {doc.nodes.map((node) => { const info = run.nodes[node.id]; if (!info) return null; return <div key={node.id} className={`workflow-run-row ${info.state}`}>
        <i className={`node-status-dot ${info.state}`} /><b>{nodeTitle(node)}</b><small>{info.count !== undefined ? `${info.count} itens` : info.state === "running" ? "rodando" : info.state === "skipped" ? "pulado" : ""}</small>
        {(info.sample || info.message) && <p>{info.message ?? info.sample}</p>}
      </div>; })}
    </div>}
  </div>;
}
