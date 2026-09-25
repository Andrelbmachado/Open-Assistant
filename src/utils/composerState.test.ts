import { describe, expect, it } from "vitest";
import { getVisibleTokensPerSecond, nextComposerPopover, type GenerationMetric } from "./composerState";

describe("composer state", () => {
  it("keeps at most one primary composer popover open", () => {
    expect(nextComposerPopover("quick", "project")).toBe("project");
    expect(nextComposerPopover("project", "project")).toBeNull();
  });

  it("only shows a generation rate for the active chat and selected model", () => {
    const metric: GenerationMetric = { chatId: "chat-a", model: "Ollama: qwen3.5:9b", tokensPerSecond: 34 };
    expect(getVisibleTokensPerSecond(metric, "chat-a", metric.model)).toBe(34);
    expect(getVisibleTokensPerSecond(metric, "chat-b", metric.model)).toBeUndefined();
    expect(getVisibleTokensPerSecond(metric, "chat-a", "GPT-5")).toBeUndefined();
  });
});
