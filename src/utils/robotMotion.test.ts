import { describe, expect, it } from "vitest";
import { leanFor, motionProfile, REST_WOBBLE, stepBody, stepWobble, travelMs, type Body } from "./robotMotion";
import { clampToZone, contentColumn, fallbackZone, freeZones, nearestZone, wanderTarget } from "./freeZones";

describe("motionProfile", () => {
  it("starts still, brakes, overshoots a little and lands exactly", () => {
    expect(motionProfile(0)).toBe(0);
    expect(motionProfile(1)).toBe(1);
    expect(motionProfile(.05)).toBeLessThan(.08);
    const samples = Array.from({ length: 99 }, (_, index) => motionProfile((index + 1) / 100));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.12);
    expect(Math.abs(motionProfile(.99) - 1)).toBeLessThan(.01);
  });

  it("matches the Rust travel time", () => {
    expect(travelMs(0)).toBe(320);
    expect(travelMs(100_000)).toBe(1150);
    expect(travelMs(400)).toBe(700);
  });
});

describe("stepBody", () => {
  it("accelerates gradually, brakes before arriving and stops on the target", () => {
    let body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
    const speeds: number[] = [];
    for (let frame = 0; frame < 60 * 8; frame++) {
      body = stepBody(body, { x: 400, y: 0 }, 1 / 60).body;
      speeds.push(Math.hypot(body.vx, body.vy));
    }
    expect(speeds[1]).toBeLessThan(10);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(151);
    // Perto do alvo a velocidade já caiu (freou antes de chegar).
    const index = speeds.findIndex((_, frame) => frame > 60 && speeds[frame] < speeds[frame - 1] - .5);
    expect(index).toBeGreaterThan(0);
    expect(Math.abs(body.x - 400)).toBeLessThan(2);
  });
});

describe("stepWobble", () => {
  it("swings forward after a hard stop and settles back", () => {
    let wobble = REST_WOBBLE;
    // Freada forte para a esquerda (aceleração negativa enquanto andava para a direita).
    for (let frame = 0; frame < 12; frame++) wobble = stepWobble(wobble, { x: -260, y: 0 }, 1 / 60);
    expect(wobble.x).toBeGreaterThan(0);
    let crossed = false;
    for (let frame = 0; frame < 120; frame++) { wobble = stepWobble(wobble, { x: 0, y: 0 }, 1 / 60); if (wobble.x < 0) crossed = true; }
    expect(crossed).toBe(true);
    expect(Math.abs(wobble.x)).toBeLessThan(.2);
  });

  it("leans with acceleration within limits", () => {
    expect(leanFor(1000)).toBe(9);
    expect(leanFor(-1000)).toBe(-9);
    expect(leanFor(0)).toBe(0);
  });
});

describe("freeZones", () => {
  const messages = { left: 300, top: 60, right: 1500, bottom: 820 };
  const column = contentColumn(messages, 108);
  it("finds the side gutters of the 780 px column", () => {
    expect(column.right - column.left).toBe(780);
    const zones = freeZones(messages, column, 760, { width: 150, height: 180 });
    expect(zones.map((zone) => zone.side)).toEqual(["left", "right"]);
    expect(zones[0].right + 150).toBeLessThanOrEqual(column.left - 16);
    expect(zones[1].left).toBeGreaterThanOrEqual(column.right + 16);
    expect(zones[0].bottom + 180).toBeLessThanOrEqual(760 - 16);
  });

  it("has no zone when the robot does not fit", () => {
    const narrow = { left: 300, top: 60, right: 1100, bottom: 820 };
    expect(freeZones(narrow, contentColumn(narrow, 40), 760, { width: 150, height: 180 })).toEqual([]);
  });

  it("falls back to the right edge of the chat itself (never another area)", () => {
    const narrow = { left: 300, top: 60, right: 1100, bottom: 820 };
    expect(fallbackZone(narrow, 760, { width: 150, height: 180 })).toEqual({ side: "right", left: 934, right: 934, top: 76, bottom: 564 });
    expect(fallbackZone({ left: 0, top: 0, right: 400, bottom: 150 }, 150, { width: 150, height: 180 })).toBeUndefined();
  });

  it("wanders inside the nearest zone", () => {
    const zones = freeZones(messages, column, 760, { width: 150, height: 180 });
    const zone = nearestZone(zones, { x: 1400, y: 300 })!;
    expect(zone.side).toBe("right");
    const next = wanderTarget(zone, { x: zone.left, y: zone.top }, () => 0);
    expect(next).toEqual(clampToZone(next, zone));
  });
});
