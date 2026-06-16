import type { GraphEdge, GraphNode, KnowledgeGraph } from "@open-assistant/shared";

/** Layer 2b — relationships (people, projects, dependencies). */
export class InMemoryGraph implements KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  async addNode(node: GraphNode): Promise<void> {
    this.nodes.set(node.id, node);
  }
  async addEdge(edge: GraphEdge): Promise<void> {
    this.edges.push(edge);
  }
  async neighbors(nodeId: string, relation?: string): Promise<GraphNode[]> {
    return this.edges
      .filter((e) => e.from === nodeId && (!relation || e.relation === relation))
      .map((e) => this.nodes.get(e.to))
      .filter((n): n is GraphNode => Boolean(n));
  }
}
