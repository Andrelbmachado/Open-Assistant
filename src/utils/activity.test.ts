import { describe, expect, it } from "vitest";
import { currentActivity, rotatingVerb, toolActivity } from "./activity";
import type { AgentStep } from "./agentRunner";

const step = (tool: string, status: AgentStep["status"], args: Record<string, unknown> = {}): AgentStep => ({ id: tool, tool, args, label: tool, status });

describe("activity", () => {
  it("says what the running tool is doing", () => {
    expect(currentActivity({ seed: "a", elapsedMs: 0, steps: [step("web_search", "running")] })).toBe("Navegando na internet");
    expect(currentActivity({ seed: "a", elapsedMs: 0, steps: [step("look", "ok"), step("run_intent", "running")] })).toBe("Executando ferramentas");
    expect(toolActivity(step("mcp_call", "running", { server: "supabase", tool: "query" }))).toBe("Acessando a base de dados");
    expect(toolActivity(step("mcp__github__list_issues", "running"))).toBe("Acessando github");
    expect(toolActivity(step("ferramenta_nova", "running"))).toBe("Executando ferramentas");
  });

  it("waits for the user and then analyses the result", () => {
    expect(currentActivity({ seed: "a", elapsedMs: 0, steps: [step("click", "waiting")] })).toBe("Aguardando sua confirmação");
    expect(currentActivity({ seed: "a", elapsedMs: 0, steps: [step("look", "ok")] })).toBe("Analisando o resultado");
  });

  it("rotates the thinking verbs instead of staying on one", () => {
    const seen = new Set(Array.from({ length: 11 }, (_, index) => rotatingVerb("msg", index * 6000)));
    expect(seen.size).toBe(11);
    expect(seen.has("Rachando a cuca")).toBe(true);
    expect(rotatingVerb("msg", 1000)).toBe(rotatingVerb("msg", 5000));
    expect(currentActivity({ seed: "msg", elapsedMs: 0 })).toBe(rotatingVerb("msg", 0));
  });
});
