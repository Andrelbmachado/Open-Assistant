export type ViewKind = "chat" | "workflow" | "terminal" | "agents" | "marketplace" | "files" | "browser" | "dashboard" | "network";

export interface WorkspaceArea {
  id: string;
  view: ViewKind;
  /** Conversa mostrada por esta área de chat; cada área de chat tem a sua. */
  chatId?: string;
  /** Workflow mostrado por esta área do editor de nodes; cada área tem o seu (trocar numa não muda a outra). */
  workflowId?: string;
}

export interface WorkspaceSplit {
  id: string;
  axis: "horizontal" | "vertical";
  fraction: number;
  first: WorkspaceLayoutNode;
  second: WorkspaceLayoutNode;
}

export type WorkspaceLayoutNode = WorkspaceArea | WorkspaceSplit;
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SplitIntent {
  axis: WorkspaceSplit["axis"];
  fraction: number;
  newAreaFirst: boolean;
}

const VIEW_KINDS = new Set<ViewKind>(["chat", "workflow", "terminal", "agents", "marketplace", "files", "browser", "dashboard", "network"]);

/** Converte o arrasto a partir de um canto em intenção de dividir a área (eixo e fração). */
export function calculateSplitIntent(corner: Corner, deltaX: number, deltaY: number, width: number, height: number): SplitIntent | null {
  const leading = corner.endsWith("left");
  const top = corner.startsWith("top");
  const horizontal = leading ? Math.max(deltaX, 0) : Math.max(-deltaX, 0);
  const vertical = top ? Math.max(deltaY, 0) : Math.max(-deltaY, 0);

  if (Math.max(horizontal, vertical) < 24) return null;

  if (horizontal >= vertical) {
    if (width < 120) return null;
    const minimum = Math.min(.45, 50 / Math.max(width, 1));
    const share = Math.min(1 - minimum, Math.max(minimum, horizontal / Math.max(width, 1)));
    return { axis: "horizontal", fraction: leading ? share : 1 - share, newAreaFirst: leading };
  }

  if (height < 120) return null;
  const minimum = Math.min(.45, 50 / Math.max(height, 1));
  const share = Math.min(1 - minimum, Math.max(minimum, vertical / Math.max(height, 1)));
  return { axis: "vertical", fraction: top ? share : 1 - share, newAreaFirst: top };
}

/** Valida um layout restaurado do localStorage. */
export function isValidWorkspaceLayout(node: unknown): node is WorkspaceLayoutNode {
  return validateWorkspaceLayout(node, new Set<string>());
}

/** O layout contém a área `id`? */
export function hasWorkspaceArea(node: WorkspaceLayoutNode, id: string): boolean {
  if ("view" in node) return node.id === id;
  return hasWorkspaceArea(node.first, id) || hasWorkspaceArea(node.second, id);
}

function validateWorkspaceLayout(node: unknown, ids: Set<string>): node is WorkspaceLayoutNode {
  if (!node || typeof node !== "object") return false;
  const value = node as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (ids.has(value.id)) return false;
  ids.add(value.id);

  if ("view" in value) return typeof value.view === "string" && VIEW_KINDS.has(value.view as ViewKind) && (value.chatId === undefined || typeof value.chatId === "string") && (value.workflowId === undefined || typeof value.workflowId === "string");

  return (value.axis === "horizontal" || value.axis === "vertical")
    && typeof value.fraction === "number"
    && Number.isFinite(value.fraction)
    && value.fraction > 0
    && value.fraction < 1
    && validateWorkspaceLayout(value.first, ids)
    && validateWorkspaceLayout(value.second, ids);
}

/** Áreas na ordem da árvore (esquerda/cima primeiro). */
export function listAreas(node: WorkspaceLayoutNode): WorkspaceArea[] {
  return "view" in node ? [node] : [...listAreas(node.first), ...listAreas(node.second)];
}

/** Troca a conversa de uma área. */
export function setAreaChat(node: WorkspaceLayoutNode, id: string, chatId: string | undefined): WorkspaceLayoutNode {
  if ("view" in node) return node.id === id ? { ...node, chatId } : node;
  return { ...node, first: setAreaChat(node.first, id, chatId), second: setAreaChat(node.second, id, chatId) };
}

/**
 * Garante que cada área de chat mostre uma conversa própria (sem janelas duplicadas):
 * a área ativa mostra `activeChatId`; as outras mantêm a sua ou ganham uma conversa nova (`createChat`).
 */
export function assignChatAreas(layout: WorkspaceLayoutNode, activeAreaId: string, activeChatId: string, chatIds: ReadonlySet<string>, createChat: () => string): WorkspaceLayoutNode {
  const areas = listAreas(layout).filter((area) => area.view === "chat");
  const ordered = [...areas.filter((area) => area.id === activeAreaId), ...areas.filter((area) => area.id !== activeAreaId)];
  const used = new Set<string>();
  let next = layout;
  for (const area of ordered) {
    const wanted = area.id === activeAreaId && chatIds.has(activeChatId) ? activeChatId : area.chatId;
    const chatId = wanted && chatIds.has(wanted) && !used.has(wanted) ? wanted : createChat();
    used.add(chatId);
    if (area.chatId !== chatId) next = setAreaChat(next, area.id, chatId);
  }
  return next;
}

/** Troca o workflow de uma área do editor de nodes. */
export function setAreaWorkflow(node: WorkspaceLayoutNode, id: string, workflowId: string | undefined): WorkspaceLayoutNode {
  if ("view" in node) return node.id === id ? { ...node, workflowId } : node;
  return { ...node, first: setAreaWorkflow(node.first, id, workflowId), second: setAreaWorkflow(node.second, id, workflowId) };
}

/**
 * Ao abrir o app: áreas de nodes sem workflow (ou com um que não existe mais) adotam os workflows salvos
 * que nenhuma área mostra — é assim que o canvas antigo migrado aparece na área que já existia.
 */
export function adoptWorkflows(layout: WorkspaceLayoutNode, workflowIds: string[], keep: string[] = []): WorkspaceLayoutNode {
  const shown = new Set(listAreas(layout).map((area) => area.workflowId).filter((id): id is string => Boolean(id && workflowIds.includes(id))));
  const orphans = workflowIds.filter((id) => !shown.has(id));
  let next = layout;
  for (const area of listAreas(layout).filter((item) => item.view === "workflow")) {
    if (area.workflowId && (workflowIds.includes(area.workflowId) || keep.includes(area.workflowId))) continue;
    const adopted = orphans.shift();
    if (!adopted) break;
    next = setAreaWorkflow(next, area.id, adopted);
  }
  return next;
}

/**
 * Cada área do editor de nodes mostra um workflow próprio: mantém o que já tinha (se ainda existe e não
 * está em outra área) ou ganha um novo (`createWorkflow`). Dividir uma área de nodes = workflow novo.
 */
export function assignWorkflowAreas(layout: WorkspaceLayoutNode, workflowIds: ReadonlySet<string>, createWorkflow: () => string): WorkspaceLayoutNode {
  const used = new Set<string>();
  let next = layout;
  for (const area of listAreas(layout).filter((item) => item.view === "workflow")) {
    const keep = area.workflowId && workflowIds.has(area.workflowId) && !used.has(area.workflowId) ? area.workflowId : undefined;
    const workflowId = keep ?? createWorkflow();
    used.add(workflowId);
    if (area.workflowId !== workflowId) next = setAreaWorkflow(next, area.id, workflowId);
  }
  return next;
}

/** Mostra o workflow numa área nova à direita de `besideAreaId` (ex.: o fluxo da memória ao lado do chat). Se alguma área já mostra, usa ela. */
export function openWorkflowBeside(layout: WorkspaceLayoutNode, besideAreaId: string, workflowId: string, ids: { area: string; split: string }): { layout: WorkspaceLayoutNode; areaId: string } {
  const holder = listAreas(layout).find((area) => area.view === "workflow" && area.workflowId === workflowId);
  if (holder) return { layout, areaId: holder.id };
  const visit = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if ("view" in node) return node.id === besideAreaId ? { id: ids.split, axis: "horizontal", fraction: .55, first: node, second: { id: ids.area, view: "workflow", workflowId } } : node;
    return { ...node, first: visit(node.first), second: visit(node.second) };
  };
  return { layout: visit(layout), areaId: ids.area };
}
