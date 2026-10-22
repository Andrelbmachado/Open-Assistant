import { describe, expect, it } from "vitest";
import { CLOUD_PRICES, estimateMessageCostUsd, formatMessageCost, priceFor } from "./cloudPricing";

describe("cloud pricing", () => {
  it("reads a known price by provider/model", () => {
    expect(priceFor("openai", "gpt-5-mini")).toEqual({ input: 0.25, output: 2 });
    expect(priceFor("openai", "modelo-inexistente")).toBeUndefined();
  });

  it("estimates a typical message cost from input + output price", () => {
    // gpt-5-mini: (0.25 + 2) US$/1M * 1000 tokens cada = 0.00225 US$
    expect(estimateMessageCostUsd("openai", "gpt-5-mini")).toBeCloseTo(0.00225, 6);
    expect(estimateMessageCostUsd("anthropic", "claude-opus-5-5")).toBeCloseTo(0.09, 6);
    expect(estimateMessageCostUsd("x", "y")).toBeUndefined();
  });

  it("formats a short cost label in pt-BR", () => {
    expect(formatMessageCost("openai", "gpt-5-mini")).toBe("menos de US$ 0,01/msg");
    expect(formatMessageCost("anthropic", "claude-opus-5-5")).toBe("~US$ 0,09/msg");
    expect(formatMessageCost("x", "y")).toBe("");
  });

  it("every price entry has positive input and output rates", () => {
    for (const [key, price] of Object.entries(CLOUD_PRICES)) {
      expect(price.input, key).toBeGreaterThan(0);
      expect(price.output, key).toBeGreaterThan(0);
    }
  });
});
