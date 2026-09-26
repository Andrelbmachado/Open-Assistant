import { describe, expect, it } from "vitest";
import { speechChunks, textForSpeech } from "./speechText";

describe("textForSpeech", () => {
  it("drops code blocks, markdown and links", () => {
    const text = "## Resultado\n**Pronto!** Veja `npm test`:\n```ts\nconst a = 1;\n```\nMais em https://exemplo.com e [docs](https://x.y).";
    expect(textForSpeech(text)).toBe("Resultado Pronto! Veja npm test: (trecho de código na tela) Mais em o link na tela e docs.");
  });

  it("never reads emojis or stage directions aloud", () => {
    expect(textForSpeech("Claro! 😊 Vamos lá 👍🏽")).toBe("Claro! Vamos lá");
    expect(textForSpeech("*sorrindo* Oi, André! (risos) Tudo bem? [pausa] Me conta.")).toBe("Oi, André! Tudo bem? Me conta.");
    expect(textForSpeech("Use o comando (dir) no terminal.")).toBe("Use o comando (dir) no terminal.");
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
