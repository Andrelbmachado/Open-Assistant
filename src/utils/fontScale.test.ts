import { describe, expect, it } from "vitest";
import { clampFontScale, fontScaleVariables, restoreFontScale } from "./fontScale";

describe("fontScale", () => {
  it("limita e arredonda ao passo do controle", () => {
    expect(clampFontScale(3)).toBe(1.4);
    expect(clampFontScale(0.1)).toBe(0.8);
    expect(clampFontScale(1.12)).toBe(1.1);
    expect(clampFontScale("grande")).toBe(1);
  });

  it("restaura valores salvos e ignora lixo", () => {
    expect(restoreFontScale(undefined)).toEqual({ title: 1, subtitle: 1, body: 1 });
    expect(restoreFontScale({ title: 1.2, body: Number.NaN })).toEqual({ title: 1.2, subtitle: 1, body: 1 });
  });

  it("gera as variáveis CSS usadas pelos font-size", () => {
    expect(fontScaleVariables({ title: 1.2, subtitle: 0.9, body: 1 })).toEqual({ "--fs-title": "1.2", "--fs-subtitle": "0.9", "--fs-body": "1" });
  });
});
