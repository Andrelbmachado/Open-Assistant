import { describe, expect, it } from "vitest";
import { cleanModelTitle, NEW_CHAT_TITLE, titleFromMessage } from "./chatTitle";

describe("titleFromMessage", () => {
  it("drops greetings and polite openers and keeps the first sentence", () => {
    expect(titleFromMessage("oi, pode me explicar como funciona o MCP? quero usar no app")).toBe("Me explicar como funciona o MCP");
    expect(titleFromMessage("Abre o chrome e entra no g1")).toBe("Abre o chrome e entra no g1");
  });

  it("shortens long first lines on a word boundary", () => {
    const title = titleFromMessage("Crie um aplicativo completo de controle financeiro pessoal com gráficos e metas mensais");
    expect(title.length).toBeLessThanOrEqual(43);
    expect(title.endsWith("…")).toBe(true);
  });

  it("handles attachment-only and empty messages", () => {
    expect(titleFromMessage("[Anexos: print.png]")).toBe("Anexos");
    expect(titleFromMessage("   ")).toBe(NEW_CHAT_TITLE);
  });
});

describe("cleanModelTitle", () => {
  it("strips labels, quotes and final punctuation", () => {
    expect(cleanModelTitle('Título: "configurar conectores MCP".')).toBe("Configurar conectores MCP");
  });

  it("rejects answers that are not a short title", () => {
    expect(cleanModelTitle("ok")).toBeUndefined();
    expect(cleanModelTitle("Este é um título muito longo que claramente não é um título de conversa")).toBeUndefined();
  });
});
