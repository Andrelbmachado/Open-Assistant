import type { ChatTurn, ShortTermMemory } from "@open-assistant/shared";

/** Layer 1 — verbatim conversation (the only layer the user sees). */
export class InMemoryShortTerm implements ShortTermMemory {
  private turns: ChatTurn[] = [];
  async append(turn: ChatTurn): Promise<void> {
    this.turns.push(turn);
  }
  async recent(limit: number): Promise<ChatTurn[]> {
    return this.turns.slice(-limit);
  }
  async all(): Promise<ChatTurn[]> {
    return [...this.turns];
  }
}
