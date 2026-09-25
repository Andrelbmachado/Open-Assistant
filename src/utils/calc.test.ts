import { describe, expect, it } from "vitest";
import { evaluate, formatNumber, parseCalculation } from "./calc";

describe("parseCalculation", () => {
  it("solves basic arithmetic written with symbols or words", () => {
    expect(parseCalculation("quanto é 12 x 8?")).toMatchObject({ expression: "12 × 8", result: "96" });
    expect(parseCalculation("150 dividido por 4")).toMatchObject({ result: "37,5" });
    expect(parseCalculation("2+2")).toMatchObject({ expression: "2 + 2", result: "4" });
    expect(parseCalculation("calcula 10 mais 5 vezes 2")).toMatchObject({ result: "20" });
    expect(parseCalculation("(3 + 4) * 2 =")).toMatchObject({ result: "14" });
    expect(parseCalculation("15% de 200")).toMatchObject({ expression: "15% de 200", result: "30" });
    expect(parseCalculation("2,5 * 4")).toMatchObject({ result: "10" });
    expect(parseCalculation("raiz quadrada de 81")).toMatchObject({ result: "9" });
    expect(parseCalculation("2 elevado a 10")).toMatchObject({ result: "1.024" });
    expect(parseCalculation("1.000 - 1")).toMatchObject({ result: "999" });
  });

  it("ignores text that is not a calculation", () => {
    for (const text of ["2026", "abre o chrome", "quanto é o dólar hoje?", "me conta uma piada", "12 x 8 pessoas", "o que é 2+2 em binário", ""]) {
      expect(parseCalculation(text), text).toBeUndefined();
    }
  });

  it("refuses invalid math instead of guessing", () => {
    expect(parseCalculation("10 / 0")).toBeUndefined();
    expect(() => evaluate("10/0")).toThrow("dividir por zero");
    expect(() => evaluate("2+*3")).toThrow();
  });

  it("formats without floating point noise", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0,3");
    expect(formatNumber(1 / 3)).toBe("0,3333333333");
  });
});
