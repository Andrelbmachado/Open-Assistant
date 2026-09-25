import { describe, expect, it } from "vitest";
import { createProviderId, validateProviderConfig } from "./providers";

describe("provider config", () => {
  it("creates a stable normalized identifier", () => expect(createProviderId("Meu Provedor IA")).toBe("meu-provedor-ia"));
  it("rejects a custom provider without a valid OpenAI-compatible URL", () => expect(validateProviderConfig({ id: "x", name: "X", kind: "custom", baseUrl: "notaurl", defaultModel: "x" })).toContain("URL"));
});
