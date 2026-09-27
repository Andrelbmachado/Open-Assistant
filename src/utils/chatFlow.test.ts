import { describe, expect, it } from "vitest";
import type { SystemTrace } from "../store/systemTrace";
import { startChatFlow } from "./chatFlow";

function recorder() {
  const calls: string[] = [];
  const trace: SystemTrace = {
    step: (id, sample) => calls.push(`step ${id}${sample ? `: ${sample}` : ""}`),
    wait: (id) => calls.push(`wait ${id}`),
    skip: (id) => calls.push(`skip ${id}`),
    fail: (id, message) => calls.push(`fail ${id}: ${message}`),
    end: (summary) => calls.push(`end ${summary}`),
  };
  return { calls, open: () => trace };
}

describe("startChatFlow", () => {
  it("lights the chosen branch and skips the others", () => {
    const rec = recorder();
    const flow = startChatFlow(rec.open, "2+2");
    flow.route("calculadora", "2+2 = 4");
    flow.done("2+2 = 4");
    expect(rec.calls).toEqual([
      "step mensagem: 2+2", "step rotear: Calculadora do app", "step calculadora: 2+2 = 4",
      "skip imagem", "skip rede", "skip acao", "skip agente", "skip modelo",
      "step resposta: 2+2 = 4", "end Calculadora do app",
    ]);
  });

  it("keeps both branches when the model hands over to the agent", () => {
    const rec = recorder();
    const flow = startChatFlow(rec.open, "abre o chrome");
    flow.route("modelo", "Qwen3.5 9B");
    flow.route("agente");
    flow.detail("3 passos");
    flow.done("Pronto.");
    expect(rec.calls.filter((call) => call.startsWith("skip"))).toEqual(["skip imagem", "skip calculadora", "skip rede", "skip acao"]);
    expect(rec.calls).toContain("step agente: 3 passos");
    expect(rec.calls[rec.calls.length - 1]).toBe("end Agente do PC");
  });

  it("fails on the current branch only once", () => {
    const rec = recorder();
    const flow = startChatFlow(rec.open, "oi");
    flow.route("modelo");
    flow.fail("Ollama parado");
    flow.done("não conta");
    expect(rec.calls[rec.calls.length - 1]).toBe("fail modelo: Ollama parado");
  });
});
