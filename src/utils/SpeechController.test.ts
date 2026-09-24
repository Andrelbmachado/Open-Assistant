import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechController } from "./SpeechController";

class FakeUtterance {
  lang = "";
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: (() => void) | null = null;
  constructor(public text: string) {}
}

afterEach(() => vi.unstubAllGlobals());

describe("SpeechController", () => {
  it("reports lifecycle events while speaking", () => {
    let utterance: FakeUtterance | undefined;
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: (value: FakeUtterance) => { utterance = value; },
    });
    const events: string[] = [];

    new SpeechController().speak("Olá", {
      onStart: () => events.push("start"),
      onBoundary: () => events.push("boundary"),
      onEnd: () => events.push("end"),
    });
    utterance?.onstart?.();
    utterance?.onboundary?.();
    utterance?.onend?.();

    expect(events).toEqual(["start", "boundary", "end"]);
  });

  it("returns a cancellation function for active speech", () => {
    const cancel = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", { cancel, getVoices: () => [], speak: vi.fn() });

    const stop = new SpeechController().speak("Olá");
    stop();

    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
