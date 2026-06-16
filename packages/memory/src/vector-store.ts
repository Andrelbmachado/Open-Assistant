import type { Embedding, VectorMemory } from "@open-assistant/shared";

/**
 * Layer 2a — semantic recall (pgvector in production).
 * This in-memory cosine version is a stand-in for development.
 */
export class InMemoryVectorStore implements VectorMemory {
  private records: Embedding[] = [];
  async upsert(records: Embedding[]): Promise<void> {
    this.records.push(...records);
  }
  async query(_text: string, _k: number): Promise<Embedding[]> {
    // TODO: embed _text, cosine-rank this.records, return top _k
    return [];
  }
}
