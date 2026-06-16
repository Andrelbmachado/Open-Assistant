import type { AgentContext, AgentDefinition, AgentResult } from "@open-assistant/shared";

/** Base class every agent extends. Model-agnostic by design. */
export abstract class BaseAgent {
  constructor(public readonly def: AgentDefinition) {}

  /** Implement the agent's behaviour. */
  abstract run(ctx: AgentContext): Promise<AgentResult>;

  protected ok(ctx: AgentContext, output: string, artifactIds?: string[]): AgentResult {
    return { agentId: this.def.id, status: "done", output, artifactIds };
  }
  protected fail(error: string): AgentResult {
    return { agentId: this.def.id, status: "error", output: "", error };
  }
}

/** Example: a research agent skeleton. */
export class ResearchAgent extends BaseAgent {
  async run(ctx: AgentContext): Promise<AgentResult> {
    // TODO: use ctx.tools (web search / browser) + ctx.model to research ctx.goal
    return this.ok(ctx, "");
  }
}
