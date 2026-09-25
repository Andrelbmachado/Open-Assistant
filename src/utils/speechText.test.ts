import { describe, expect, it } from "vitest";
import { speechChunks, textForSpeech } from "./speechText";

describe("textForSpeech", () => {
  it("drops code blocks, markdown and links", () => {
    const text = "## Resultado\n**Pronto!** Veja `npm test`:\n```ts\nconst a = 1;\n```\nMais em https://exemplo.com e [docs](https://x.y).";
    expect(textForSpeech(text)).toBe("Resultado Pronto! Veja npm test: (trecho de código na tela) Mais em o link na tela e docs.");
  });
});

describe("speechChunks", () => {
  it("keeps the first sentence alone so audio starts quickly", () => {
    expect(speechChunks("Olá! Tudo bem? Hoje vamos testar a voz.")).toEqual(["Olá!", "Tudo bem? Hoje vamos testar a voz."]);
  });

  it("splits very long sentences by words", () => {
    const long = Array.from({ length: 60 }, (_, index) => `palavra${index}`).join(" ");
    const chunks = speechChunks(long, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
  });
});
