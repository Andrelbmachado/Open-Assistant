import { describe, expect, it } from "vitest";
import { connectionStatus } from "./connectionStatus";

const base = { ollama: "online" as const, installed: ["qwen3.5:9b"], bitnetInstalled: false };

describe("connectionStatus", () => {
  it("is green when Ollama is online and the chosen model is installed", () => {
    expect(connectionStatus({ ...base, model: "Ollama: qwen3.5:9b" }).level).toBe("ok");
    expect(connectionStatus({ ...base, model: undefined }).level).toBe("ok");
  });

  it("explains what is missing", () => {
    expect(connectionStatus({ ...base, ollama: "offline", model: "Ollama: qwen3.5:9b" })).toMatchObject({ level: "error", label: "Ollama parado" });
    expect(connectionStatus({ ...base, model: "Ollama: llama3.2" })).toMatchObject({ level: "error", label: "Modelo ausente" });
    expect(connectionStatus({ ...base, ollama: "checking" }).level).toBe("checking");
  });

  it("uses the API key for cloud models and the install state for BitNet", () => {
    expect(connectionStatus({ ...base, model: "Nuvem: google/gemini-2.5-flash", cloudKey: true }).level).toBe("ok");
    expect(connectionStatus({ ...base, model: "Nuvem: google/gemini-2.5-flash", cloudKey: false }).level).toBe("error");
    expect(connectionStatus({ ...base, model: "BitNet: b1.58-2B-4T" }).level).toBe("error");
  });
});
