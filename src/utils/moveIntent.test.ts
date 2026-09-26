import { describe, expect, it } from "vitest";
import { normalizePlace, parseMoveIntent } from "./moveIntent";

describe("parseMoveIntent", () => {
  it("moves desktop items to a place", () => {
    expect(parseMoveIntent("mova a pasta teste mover para o outro lado da tela")).toEqual({ kind: "file", target: "teste mover", place: "outro lado" });
    expect(parseMoveIntent("Leve o arquivo lateral.png pra direita")).toEqual({ kind: "file", target: "lateral.png", place: "direita" });
    expect(parseMoveIntent("arraste Relatório Final para o canto superior direito")).toEqual({ kind: "file", target: "Relatório Final", place: "cima direita" });
  });

  it("keeps combined zones, relative moves, percentages and 'next to'", () => {
    expect(parseMoveIntent("mova a pasta Nova pasta para cima na direita")?.place).toBe("cima direita");
    expect(parseMoveIntent("leva a Nova pasta pro canto de baixo à esquerda")?.place).toBe("baixo esquerda");
    expect(parseMoveIntent("mova a pasta fotos para o meio da parte de cima")?.place).toBe("cima centro");
    expect(parseMoveIntent("mova a pasta fotos para 70% 30%")?.place).toBe("70% 30%");
    expect(parseMoveIntent("mova a pasta fotos para a zona 3")?.place).toBe("zona 3");
    expect(parseMoveIntent("leve a pasta fotos um pouco para a direita")).toMatchObject({ target: "fotos", place: "um pouco para a direita" });
    expect(parseMoveIntent("leve a pasta fotos para um pouco mais para a direita")?.place).toBe("um pouco mais para a direita");
    expect(parseMoveIntent("coloque a pasta fotos ao lado da Lixeira")).toMatchObject({ target: "fotos", place: "ao lado da lixeira" });
    expect(normalizePlace("perto da Lixeira")).toBe("perto da lixeira");
  });

  it("reads speed and path from the sentence", () => {
    expect(parseMoveIntent("mova a pasta teste bem devagar para a direita")).toMatchObject({ target: "teste", place: "direita", speed: "bem devagar" });
    expect(parseMoveIntent("mova a pasta teste para a direita devagar em linha reta")).toMatchObject({ target: "teste", place: "direita", speed: "devagar", path: "reto" });
    expect(parseMoveIntent("mova a pasta teste para a esquerda")).toEqual({ kind: "file", target: "teste", place: "esquerda" });
  });

  it("moves windows and snaps them", () => {
    expect(parseMoveIntent("coloque a janela do chrome na metade esquerda")).toEqual({ kind: "window", target: "chrome", place: "esquerda" });
    expect(parseMoveIntent("maximize a janela do bloco de notas")).toEqual({ kind: "window", target: "bloco de notas", place: "maximizar" });
    expect(parseMoveIntent("joga o spotify pro outro monitor")).toEqual({ kind: "window", target: "spotify", place: "outro monitor" });
  });

  it("ignores sentences that are not moves", () => {
    expect(parseMoveIntent("mova-se")).toBeUndefined();
    expect(parseMoveIntent("leve em conta o prazo de amanhã para o projeto")).toBeUndefined();
    expect(parseMoveIntent("o que é uma pasta?")).toBeUndefined();
  });

  it("normalizes spoken places", () => {
    expect(normalizePlace("o lado direito da tela")).toBe("direita");
    expect(normalizePlace("tela cheia")).toBe("maximizar");
    expect(normalizePlace("lá em cima")).toBe("cima");
    expect(normalizePlace("a lua")).toBeUndefined();
  });
});
