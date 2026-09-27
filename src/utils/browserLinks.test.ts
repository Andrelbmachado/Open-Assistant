import { describe, expect, it } from "vitest";
import { extractLinks, normalizeAddress } from "./browserLinks";

describe("extractLinks", () => {
  it("resolves relative links, skips images and duplicates", () => {
    const markdown = "[![logo](/logo.png)](/)\n[Learn](/learn) e [**API**](https://react.dev/reference) e [Learn](/learn)\n![foto](/a.png) [mail](mailto:x@y.z) [### Blog novo](/blog)";
    expect(extractLinks(markdown, "https://react.dev/")).toEqual([
      { text: "Learn", url: "https://react.dev/learn" },
      { text: "API", url: "https://react.dev/reference" },
      { text: "Blog novo", url: "https://react.dev/blog" },
    ]);
  });
});

describe("normalizeAddress", () => {
  it("completes domains and turns phrases into a search", () => {
    expect(normalizeAddress("g1.globo.com")).toBe("https://g1.globo.com");
    expect(normalizeAddress("https://react.dev/learn")).toBe("https://react.dev/learn");
    expect(normalizeAddress("previsão do tempo")).toBe("https://duckduckgo.com/html/?q=previs%C3%A3o%20do%20tempo");
    expect(normalizeAddress("   ")).toBeNull();
  });
});
