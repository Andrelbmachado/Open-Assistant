import { describe, expect, it } from "vitest";
import { BargeInDetector } from "./bargeIn";

const feed = (detector: BargeInDetector, blocks: number, mic: number, speech: number) => {
  let fired = false;
  for (let index = 0; index < blocks; index++) fired = detector.push(mic, speech, 64) || fired;
  return fired;
};

describe("BargeInDetector", () => {
  it("interrompe quando a pessoa fala alto o bastante por um tempo", () => {
    const detector = new BargeInDetector();
    expect(feed(detector, 8, 0, .3)).toBe(false);
    expect(feed(detector, 6, .6, .3)).toBe(true);
  });

  it("ignora o eco da própria fala do robô e ruídos curtos", () => {
    const echo = new BargeInDetector();
    expect(feed(echo, 40, .35, .4)).toBe(false);
    const click = new BargeInDetector();
    feed(click, 8, 0, 0);
    expect(feed(click, 2, .9, 0)).toBe(false);
  });

  it("consegue interromper mesmo quando o robô fala alto", () => {
    const detector = new BargeInDetector();
    feed(detector, 8, 0, 1);
    expect(feed(detector, 6, 1, 1)).toBe(true);
  });

  it("não dispara no começo da fala do robô", () => {
    expect(feed(new BargeInDetector(), 6, .9, 0)).toBe(false);
  });
});
