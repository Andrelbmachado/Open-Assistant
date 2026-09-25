import { describe, expect, it } from "vitest";
import { Endpointer, rms } from "./endpointer";

const options = { silenceMs: 300, noSpeechMs: 1000, maxMs: 3000, minSpeechMs: 100 };

function feed(endpointer: Endpointer, level: number, ms: number) {
  const events: string[] = [];
  for (let t = 0; t < ms; t += 50) {
    const event = endpointer.push(level, 50);
    if (event !== "none") events.push(event);
  }
  return events;
}

describe("Endpointer", () => {
  it("detects the start and the end of a phrase", () => {
    const endpointer = new Endpointer(options);
    expect(feed(endpointer, 0.002, 400)).toEqual([]);
    expect(feed(endpointer, 0.2, 500)).toEqual(["speech-start"]);
    expect(endpointer.speaking).toBe(true);
    expect(feed(endpointer, 0.002, 400)).toEqual(["speech-end"]);
    expect(endpointer.speaking).toBe(false);
  });

  it("ignores short clicks before speech", () => {
    const endpointer = new Endpointer(options);
    feed(endpointer, 0.002, 200);
    expect(feed(endpointer, 0.3, 50)).toEqual([]);
    expect(feed(endpointer, 0.002, 200)).toEqual([]);
  });

  it("gives up when nobody speaks", () => {
    const endpointer = new Endpointer(options);
    expect(feed(endpointer, 0.001, 1200)).toEqual(["no-speech"]);
  });

  it("adapts to a noisy room instead of treating noise as speech forever", () => {
    const endpointer = new Endpointer(options);
    feed(endpointer, 0.01, 600);
    expect(endpointer.threshold()).toBeGreaterThan(0.012);
    expect(feed(endpointer, 0.2, 300)).toEqual(["speech-start"]);
    expect(feed(endpointer, 0.01, 400)).toEqual(["speech-end"]);
  });

  it("stops at the maximum phrase length", () => {
    const endpointer = new Endpointer(options);
    expect(feed(endpointer, 0.2, 3200)).toEqual(["speech-start", "max-length"]);
  });

  it("computes RMS", () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});
