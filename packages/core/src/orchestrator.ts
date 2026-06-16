import type { AgentResult, Artifact } from "@open-assistant/shared";
import { EventBus } from "./event-bus.js";

export interface Plan {
  steps: { role: string; goal: string }[];
}

/**
 * The brain. Turns a user goal into a plan, runs the agents that fulfil it,
 * streams progress over the EventBus, and returns the resulting artifacts.
 *
 * This is a skeleton: wire in the model, agent registry, and memory.
 */
export class Orchestrator {
  constructor(public readonly bus = new EventBus()) {}

  /** Ask the active model to decompose a goal into a plan. */
  async plan(_goal: string): Promise<Plan> {
    // TODO: call ModelProvider.chat with a planning prompt + tool schemas.
    return { steps: [] };
  }

  /** Execute a plan: spawn agents, collect results, merge artifacts. */
  async run(_goal: string): Promise<{ results: AgentResult[]; artifacts: Artifact[] }> {
    // TODO:
    // 1. const plan = await this.plan(goal)
    // 2. for each step -> registry.create(role) -> agent.run(ctx)
    // 3. merge sub-agent outputs into Artifact(s)
    // 4. persist conversation + distilled memory
    return { results: [], artifacts: [] };
  }
}
