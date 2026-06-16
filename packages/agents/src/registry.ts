import type { AgentDefinition } from "@open-assistant/shared";
import { BaseAgent } from "./agent.js";

type Factory = (def: AgentDefinition) => BaseAgent;

/** Maps roles to agent constructors so the orchestrator can spawn by role. */
export class AgentRegistry {
  private factories = new Map<string, Factory>();

  register(role: string, factory: Factory): void {
    this.factories.set(role, factory);
  }

  create(def: AgentDefinition): BaseAgent {
    const factory = this.factories.get(def.role);
    if (!factory) throw new Error(`No agent registered for role "${def.role}"`);
    return factory(def);
  }
}
