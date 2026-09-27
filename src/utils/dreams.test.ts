import { describe, expect, it } from "vitest";
import { buildDreamPrompt, isDreamTime, parseDreamProposals, slugify } from "./dreams";

describe("dreams", () => {
  it("builds a prompt with today's requests and memory", () => {
    const prompt = buildDreamPrompt(["resuma a reunião de hoje", "abra o Excel"], ["Gosto de respostas curtas"]);
    expect(prompt).toContain("- resuma a reunião de hoje");
    expect(prompt).toContain("- Gosto de respostas curtas");
    expect(prompt).toContain('"skills"');
  });

  it("parses proposals even with text and code fences around the JSON", () => {
    const reply = 'Claro!\n```json\n{"skills":[{"name":"Resumo de Reuniões","description":"Quando pedir resumo","instructions":"1. Leia a ata"}],"connectors":[{"name":"Google Agenda","reason":"Ver reuniões do dia"}]}\n```';
    const proposals = parseDreamProposals(reply, 7);
    expect(proposals).toEqual([
      { id: "sonho-7-s0", kind: "skill", name: "resumo-de-reunioes", description: "Quando pedir resumo", content: "1. Leia a ata", status: "pendente", createdAt: 7 },
      { id: "sonho-7-c0", kind: "conector", name: "Google Agenda", description: "Ver reuniões do dia", content: "Ver reuniões do dia", status: "pendente", createdAt: 7 },
    ]);
  });

  it("ignores broken replies and incomplete items", () => {
    expect(parseDreamProposals("não sei")).toEqual([]);
    expect(parseDreamProposals('{"skills":[{"name":"x"}],"connectors":[{}]}')).toEqual([]);
  });

  it("slugifies names safely", () => {
    expect(slugify("Ação: Relatório/Semanal!")).toBe("acao-relatorio-semanal");
    expect(slugify("???")).toBe("skill");
  });

  it("dreams once per night between 2h and 6h", () => {
    expect(isDreamTime(new Date(2026, 8, 27, 3, 0), "2026-09-26")).toBe(true);
    expect(isDreamTime(new Date(2026, 8, 27, 3, 0), "2026-09-27")).toBe(false);
    expect(isDreamTime(new Date(2026, 8, 27, 14, 0), "2026-09-26")).toBe(false);
  });
});
