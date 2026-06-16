/** Three-layer memory model. Implemented in @open-assistant/memory. */

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
}

/** Layer 1 — verbatim conversation (the only layer the user sees). */
export interface ShortTermMemory {
  append(turn: ChatTurn): Promise<void>;
  recent(limit: number): Promise<ChatTurn[]>;
  all(): Promise<ChatTurn[]>;
}

/** Distilled knowledge extracted from each turn (Layer 2, hidden). */
export interface Fact {
  id: string;
  statement: string;
  source: string; // turn id
  at: number;
}

export interface Embedding {
  vector: number[];
  text: string;
  metadata?: Record<string, unknown>;
}

/** Layer 2a — semantic recall. */
export interface VectorMemory {
  upsert(records: Embedding[]): Promise<void>;
  query(text: string, k: number): Promise<Embedding[]>;
}

/** Layer 2b — relationships. */
export interface GraphNode {
  id: string;
  kind: "person" | "place" | "project" | "task" | "entity" | string;
  label: string;
  props?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string; // e.g. "depends_on", "member_of"
}

export interface KnowledgeGraph {
  addNode(node: GraphNode): Promise<void>;
  addEdge(edge: GraphEdge): Promise<void>;
  neighbors(nodeId: string, relation?: string): Promise<GraphNode[]>;
}

/** Distillation step turns a turn into structured memory. */
export interface MemoryDistiller {
  distill(turn: ChatTurn): Promise<{
    facts: Fact[];
    embeddings: Embedding[];
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>;
}
