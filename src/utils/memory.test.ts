import { describe, expect, it } from "vitest";
import { applyDetected, detectMemory, EMPTY_MEMORY, memoryPrompt, parseMemoryFile, restoreMemory, serializeMemoryFile } from "./memory";

describe("detectMemory", () => {
  it("learns explicit preferences", () => {
    expect(detectMemory("não use emojis nas conversas").facts).toEqual(["Não usar emojis nas respostas."]);
    expect(detectMemory("Pare de usar emoji, por favor").facts).toEqual(["Não usar emojis nas respostas."]);
    expect(detectMemory("sempre responda em inglês").facts).toEqual(["Sempre responda em inglês"]);
    expect(detectMemory("lembre que eu uso Windows 11 e uma RTX 5070").facts).toEqual(["Eu uso Windows 11 e uma RTX 5070"]);
    expect(detectMemory("a partir de agora, responda em tópicos").facts).toEqual(["Responda em tópicos"]);
    expect(detectMemory("prefiro respostas curtas").facts).toEqual(["Prefere respostas curtas"]);
  });

  it("learns how to call the user", () => {
    expect(detectMemory("me chame de Dé").callMe).toBe("Dé");
    expect(detectMemory("pode me chamar de André, por favor").callMe).toBe("André");
    expect(detectMemory("meu nome é André Machado").name).toBe("André Machado");
  });

  it("ignores ordinary questions and statements", () => {
    for (const text of ["como funciona a fotossíntese?", "o chrome sempre fecha sozinho", "abre o powershell", "você sempre usa muita memória?", "me chame de novo amanhã"]) {
      const detected = detectMemory(text);
      expect(detected.facts, text).toEqual([]);
      expect(detected.callMe, text).toBeUndefined();
    }
  });
});

describe("applyDetected + memoryPrompt", () => {
  it("adds only new facts and reports the changes", () => {
    const first = applyDetected(EMPTY_MEMORY, detectMemory("não use emojis"), 1);
    expect(first.changes).toEqual(["Não usar emojis nas respostas."]);
    const again = applyDetected(first.memory, detectMemory("NÃO USE EMOJIS!"), 2);
    expect(again.changes).toEqual([]);
    expect(again.memory.facts).toHaveLength(1);
  });

  it("renders a system prompt block with name, style and facts", () => {
    const memory = { ...EMPTY_MEMORY, name: "André", callMe: "Dé", styles: ["no-emoji", "direct"], facts: [{ id: "1", text: "Usa Windows 11", source: "manual" as const, createdAt: 0 }] };
    const prompt = memoryPrompt(memory);
    expect(prompt).toContain('chame-o de "Dé"');
    expect(prompt).toContain("Nunca use emojis.");
    expect(prompt).toContain("Seja direto");
    expect(prompt).toContain("Usa Windows 11");
    expect(memoryPrompt(EMPTY_MEMORY)).toBe("");
  });

  it("restores broken saved data safely", () => {
    expect(restoreMemory(null)).toEqual(EMPTY_MEMORY);
    expect(restoreMemory({ name: 3, facts: [{ id: "a", text: "ok" }, null], learn: false })).toMatchObject({ name: "", facts: [{ id: "a", text: "ok" }], learn: false });
  });
});

describe("memoria-da-ia.md", () => {
  it("round-trips name, nickname, styles, extra instructions and facts", () => {
    const memory = { ...EMPTY_MEMORY, name: "André", callMe: "André", styles: ["direct", "no-emoji"], about: "Fale em português do Brasil.", facts: [{ id: "1", text: "Usa Windows 11", source: "auto" as const, createdAt: 0 }, { id: "2", text: "Trabalha com design", source: "manual" as const, createdAt: 0 }] };
    const text = serializeMemoryFile(memory);
    expect(text).toContain("- Apelido: André");
    expect(text).toContain("- [x] Sem emojis");
    const parsed = parseMemoryFile(text);
    expect(parsed).toMatchObject({ name: "André", callMe: "André", styles: ["direct", "no-emoji"], about: "Fale em português do Brasil.", learn: true });
    expect(parsed.facts.map((fact) => [fact.text, fact.source])).toEqual([["Usa Windows 11", "auto"], ["Trabalha com design", "manual"]]);
  });

  it("reads a hand-edited file", () => {
    const parsed = parseMemoryFile("## Como me chamar\r\n- Apelido: André\r\n\r\n## Aprendido nas conversas\r\n* Não usar emojis\r\n");
    expect(parsed.callMe).toBe("André");
    expect(parsed.facts.map((fact) => fact.text)).toEqual(["Não usar emojis"]);
    expect(serializeMemoryFile(EMPTY_MEMORY)).toContain("- (nada ainda)");
    expect(parseMemoryFile(serializeMemoryFile(EMPTY_MEMORY)).facts).toEqual([]);
  });
});
