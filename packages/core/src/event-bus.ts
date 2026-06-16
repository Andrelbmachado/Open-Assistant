import type { AgentEvent } from "@open-assistant/shared";

export type CoreEvent =
  | { type: "agent"; payload: AgentEvent }
  | { type: "token"; payload: { agentId: string; delta: string } }
  | { type: "artifact"; payload: { artifactId: string } };

type Listener = (e: CoreEvent) => void;

/** Minimal pub/sub so the UI can render live progress without blocking. */
export class EventBus {
  private listeners = new Set<Listener>();
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: CoreEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
