import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { describeToolCall, keepLatestImage, parseArguments, runAgent, type AgentRunOptions, type AgentStep } from "./agentRunner";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

function options(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
  return {
    model: "Ollama: qwen3.5:9b",
    history: [],
    userText: "entra no g1",
    access: "Automático",
    requestId: "r1",
    onStep: () => undefined,
    confirm: async () => "allow",
    isCancelled: () => false,
    ...overrides,
  };
}

beforeEach(() => invokeMock.mockReset());

describe("agent helpers", () => {
  it("labels tool calls in Portuguese", () => {
    expect(describeToolCall("click", { element: 3 })).toBe("Clicando no elemento [3]");
    expect(describeToolCall("type_text", { text: "g1.globo.com", enter: true })).toBe('Digitando "g1.globo.com" + Enter');
    expect(describeToolCall("run_intent", { id: "open_url", slots: { url: "https://g1.globo.com" } })).toBe("Ação open_url · https://g1.globo.com");
    expect(describeToolCall("mcp__playwright__browser_click", {})).toBe("Conector playwright · browser_click");
  });

  it("parses arguments given as object or JSON string", () => {
    expect(parseArguments({ a: 1 })).toEqual({ a: 1 });
    expect(parseArguments('{"keys":"ctrl+l"}')).toEqual({ keys: "ctrl+l" });
    expect(parseArguments("não é json")).toEqual({});
  });

  it("keeps only the most recent screenshot", () => {
    const kept = keepLatestImage([
      { role: "user", content: "a", images: ["old"] },
      { role: "tool", content: "t" },
      { role: "user", content: "b", images: ["new"] },
    ]);
    expect(kept[0].images).toBeUndefined();
    expect(kept[2].images).toEqual(["new"]);
  });
});

describe("runAgent", () => {
  it("runs a catalog intent without calling the model", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "agent_route") return { id: "open_browser", risk: "safe", slots: { browser: "default" }, alias: "abre o chrome" };
      if (command === "agent_tool") return { status: "ok", text: "OK: Google Chrome aberto" };
      return undefined;
    });
    const result = await runAgent(options({ userText: "abre o chrome" }));
    expect(result.text).toBe("OK: Google Chrome aberto");
    expect(invokeMock.mock.calls.map(([command]) => command)).not.toContain("ollama_chat");
  });

  it("loops through tool calls, asks for confirmation and returns the final answer", async () => {
    let chatTurn = 0;
    const confirmed: boolean[] = [];
    invokeMock.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "agent_route") return null;
      if (command === "agent_prepare") return { systemPrompt: "skill", tools: [], skillDir: "x" };
      if (command === "ollama_chat") {
        chatTurn += 1;
        if (chatTurn === 1) return { model: "qwen3.5:9b", content: "", thinking: "", cancelled: false, toolCalls: [{ function: { name: "run_command", arguments: { command: "Get-Date" } } }] };
        return { model: "qwen3.5:9b", content: "Hoje é sexta.", thinking: "", cancelled: false, evalCount: 12, toolCalls: [] };
      }
      if (command === "agent_tool") {
        const { confirmed: ok } = args as { confirmed: boolean };
        confirmed.push(ok);
        return ok ? { status: "ok", text: "sexta-feira" } : { status: "needs_confirm", text: "", reason: "Executar este comando?" };
      }
      return undefined;
    });
    const steps: AgentStep[] = [];
    const result = await runAgent(options({ access: "Perguntar", onStep: (step) => steps.push(step) }));
    expect(result.text).toBe("Hoje é sexta.");
    expect(confirmed).toEqual([false, true]);
    expect(steps.some((step) => step.status === "waiting")).toBe(true);
    expect(steps[steps.length - 1].status).toBe("ok");
  });

  it("returns the model question when it calls ask_user", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "agent_route") return null;
      if (command === "agent_prepare") return { systemPrompt: "skill", tools: [], skillDir: "x" };
      if (command === "ollama_chat") return { model: "m", content: "", thinking: "", cancelled: false, toolCalls: [{ function: { name: "ask_user", arguments: { question: "Qual pasta?" } } }] };
      return undefined;
    });
    expect((await runAgent(options())).text).toBe("Qual pasta?");
  });

  it("refuses BitNet, which has no tool support", async () => {
    invokeMock.mockImplementation(async (command: string) => (command === "agent_route" ? null : undefined));
    await expect(runAgent(options({ model: "BitNet: bitnet-b1.58-2b-4t" }))).rejects.toThrow("ferramentas");
  });
});
