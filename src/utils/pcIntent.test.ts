import { describe, expect, it } from "vitest";
import { looksLikePcAction } from "./pcIntent";

describe("looksLikePcAction", () => {
  it("detects requests to act on the computer", () => {
    for (const text of ["abre o powershell", "Pode abrir o Chrome e entrar no g1?", "por favor, fecha o spotify", "tira um print da tela", "instala o 7zip", "entra no youtube"]) {
      expect(looksLikePcAction(text), text).toBe(true);
    }
  });

  it("leaves questions and chat to the model", () => {
    for (const text of ["como abro o powershell?", "o que é o PowerShell?", "me explica o que é MCP", "escreva um poema", "qual o melhor navegador", ""]) {
      expect(looksLikePcAction(text), text).toBe(false);
    }
  });
});
