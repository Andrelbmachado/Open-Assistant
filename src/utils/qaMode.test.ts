import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineQAReply, shouldSubscribeToLocalModelEvents } from "./qaMode";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createOfflineQAReply", () => {
  it("does not subscribe to Tauri runtime events in QA mode", () => {
    expect(shouldSubscribeToLocalModelEvents(true)).toBe(false);
    expect(shouldSubscribeToLocalModelEvents(false)).toBe(true);
  });

  it("returns a code fixture for a code scenario without external services", () => {
    const reply = createOfflineQAReply("mostre um exemplo de código", "GPT-5");

    expect(reply.source).toBe("QA Offline Simulator");
    expect(reply.text).toContain("```ts");
  });

  it("marks an error scenario as controlled", () => {
    expect(() => createOfflineQAReply("simular erro qa", "GPT-5")).toThrow(
      "Falha simulada do modo QA offline",
    );
  });

  it("intercepts chat requests before any network call in QA mode", async () => {
    vi.stubEnv("VITE_QA_OFFLINE", "true");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { askAI } = await import("./aiService");

    const reply = await askAI("GPT-5", [{ role: "user", content: "olá" }]);

    expect(reply.source).toBe("QA Offline Simulator");
    expect(fetch).not.toHaveBeenCalled();
  });
});
