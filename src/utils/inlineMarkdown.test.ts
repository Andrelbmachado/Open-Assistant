import { describe, expect, it } from "vitest";
import { headingText, tokenizeInline } from "./inlineMarkdown";

describe("tokenizeInline", () => {
  it("separa negrito e código inline do texto", () => {
    expect(tokenizeInline("O trem chega às **17h** usando `v = d / t`.")).toEqual([
      { type: "text", value: "O trem chega às " },
      { type: "bold", value: "17h" },
      { type: "text", value: " usando " },
      { type: "code", value: "v = d / t" },
      { type: "text", value: "." },
    ]);
  });

  it("mantém asteriscos soltos como texto", () => {
    expect(tokenizeInline("2 * 3 = 6 e **incompleto")).toEqual([{ type: "text", value: "2 * 3 = 6 e **incompleto" }]);
  });
});

describe("headingText", () => {
  it("reconhece títulos Markdown", () => {
    expect(headingText("### Cálculo")).toBe("Cálculo");
    expect(headingText("#hashtag")).toBeUndefined();
  });
});
