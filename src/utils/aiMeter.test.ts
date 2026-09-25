import { describe, expect, it } from "vitest";
import { getAIMeterSummary } from "./aiMeter";

describe("AI meter summary", () => {
  it("shows unlimited local inference with a useful throughput estimate", () => {
    expect(getAIMeterSummary("Ollama: qwen3.5:9b", 34, false)).toMatchObject({
      kind: "local",
      label: "Ilimitado",
      detail: "Inferência local · qwen3.5:9b",
      throughput: "34 tok/s · rápido",
    });
  });

  it("asks for a local model instead of implying cloud credits when none is selected", () => {
    expect(getAIMeterSummary("", undefined, false)).toMatchObject({ kind: "none", label: "Sem modelo local" });
  });

  it("identifies QA mode without inventing cloud-credit data", () => {
    expect(getAIMeterSummary("GPT-5", undefined, true)).toMatchObject({
      kind: "qa",
      label: "QA offline",
      detail: "Sem consumo de créditos",
    });
  });

  it("keeps local inference unlimited even inside the offline QA shell", () => {
    expect(getAIMeterSummary("Llama 3.2 (Local)", 28, true)).toMatchObject({
      kind: "local",
      label: "Ilimitado",
      detail: "Inferência local simulada",
    });
  });

  it("does not claim a cloud credit balance when the provider does not expose one", () => {
    expect(getAIMeterSummary("Claude", 8, false)).toMatchObject({
      kind: "cloud",
      label: "Saldo indisponível",
      throughput: "8 tok/s · normal",
    });
  });
});
