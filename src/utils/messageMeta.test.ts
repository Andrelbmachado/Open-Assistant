import { describe, expect, it } from "vitest";
import { estimateTokens, formatElapsed, formatTokenCount, modelDisplayName, thinkingVerb } from "./messageMeta";

describe("message meta", () => {
  it("usa o nome do modelo escolhido como título, sem tokens por segundo", () => {
    expect(modelDisplayName("Ollama: qwen3.5:9b")).toBe("Qwen3.5 9B");
    expect(modelDisplayName("Ollama: meu-modelo:latest")).toBe("meu-modelo:latest");
    expect(modelDisplayName(undefined, "Ollama (gemma3:4b)")).toBe("Gemma 3 4B");
    expect(modelDisplayName(undefined)).toBe("Open Assistant");
  });

  it("formata o cronômetro e os tokens de raciocínio", () => {
    expect(formatElapsed(8400)).toBe("8s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatTokenCount(345)).toBe("345");
    expect(formatTokenCount(1250)).toBe("1,3k");
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("mantém o mesmo verbo durante toda a mensagem", () => {
    expect(thinkingVerb("abc")).toBe(thinkingVerb("abc"));
  });
});
