export type ViewKind = "chat" | "workflow" | "terminal" | "agents" | "marketplace" | "files" | "browser" | "dashboard";

export interface WorkspaceArea {
  id: string;
  view: ViewKind;
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

const VIEW_KINDS = new Set<ViewKind>(["chat", "workflow", "terminal", "agents", "marketplace", "files", "browser", "dashboard"]);

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

  if ("view" in value) return typeof value.view === "string" && VIEW_KINDS.has(value.view as ViewKind);

  return (value.axis === "horizontal" || value.axis === "vertical")
    && typeof value.fraction === "number"
    && Number.isFinite(value.fraction)
    && value.fraction > 0
    && value.fraction < 1
    && validateWorkspaceLayout(value.first, ids)
    && validateWorkspaceLayout(value.second, ids);
}
