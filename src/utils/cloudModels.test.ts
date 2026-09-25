import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS, cloudDisplayName, cloudModelValue, parseCloudModel, providerModels } from "./cloudModels";

describe("cloud models", () => {
  it("round-trips provider and model, even with slashes in the model id", () => {
    const value = cloudModelValue("together-ai", "meta-llama/Llama-3.3-70B-Instruct-Turbo");
    expect(parseCloudModel(value)).toEqual({ providerId: "together-ai", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" });
    expect(parseCloudModel("Ollama: qwen3.5:9b")).toBeUndefined();
    expect(parseCloudModel("Nuvem: openai/")).toBeUndefined();
  });

  it("shows product names users recognize", () => {
    expect(cloudDisplayName("Nuvem: openai/gpt-5")).toBe("ChatGPT · gpt-5");
    expect(cloudDisplayName("Nuvem: anthropic/claude-sonnet-5")).toBe("Claude · claude-sonnet-5");
  });

  it("keeps ids compatible with the Rust endpoint table", () => {
    expect(BUILTIN_PROVIDERS.map((provider) => provider.id)).toEqual(["openai", "anthropic", "google", "deepseek", "perplexity", "together-ai", "fireworks"]);
  });

  it("offers Gemini with the default model first", () => {
    const google = BUILTIN_PROVIDERS.find((provider) => provider.id === "google")!;
    expect(providerModels(google)).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
    expect(cloudDisplayName("Nuvem: google/gemini-2.5-pro")).toBe("Gemini · gemini-2.5-pro");
    expect(providerModels({ id: "x", name: "X", kind: "custom", defaultModel: "m" })).toEqual(["m"]);
  });
});
