import { describe, expect, it } from "vitest";
import { carrySideShift, choosePose, cursorLook, gazeFor, hotspotOffset, stepBob } from "./robotCursor";
import { ROBOT_SIZE } from "./robotMotion";

describe("robot cursor", () => {
  it("points with the index finger, presses to click and holds with both hands", () => {
    expect(cursorLook("point", true)).toMatchObject({ gesture: "point", showLabel: true });
    expect(cursorLook("click", false).gesture).toBe("point");
    expect(cursorLook("click", true).gesture).toBe("press");
    expect(cursorLook("grab", true).gesture).toBe("grip");
    expect(cursorLook("carry", true).gesture).toBe("carry");
    expect(cursorLook("appear", true).gesture).toBe("idle");
  });

  it("keeps the fingertip up-left of the face, or up-right with the other hand", () => {
    const right = hotspotOffset("point", { mirrorX: false, flipY: false });
    expect(right.x).toBeLessThan(0);
    expect(right.y).toBeLessThan(0);
    const left = hotspotOffset("point", { mirrorX: true, flipY: false });
    expect(left.x).toBeGreaterThan(0);
    expect(hotspotOffset("grip", { mirrorX: false, flipY: false })).toEqual({ x: 0, y: .37 * ROBOT_SIZE });
    expect(hotspotOffset("idle", { mirrorX: false, flipY: false })).toEqual({ x: 0, y: 0 });
  });

  it("switches hands near the right edge and goes above near the bottom", () => {
    const screen = { width: 1920, height: 1080 };
    expect(choosePose({ x: 400, y: 400 }, screen)).toEqual({ mirrorX: false, flipY: false });
    expect(choosePose({ x: 1880, y: 400 }, screen).mirrorX).toBe(true);
    expect(choosePose({ x: 400, y: 1060 }, screen).flipY).toBe(true);
    // Já espelhado, só volta quando o corpo não cabe do lado esquerdo (sem ficar trocando de mão).
    expect(choosePose({ x: 1200, y: 400 }, screen, ROBOT_SIZE, { mirrorX: true, flipY: false }).mirrorX).toBe(true);
    expect(choosePose({ x: 60, y: 400 }, screen, ROBOT_SIZE, { mirrorX: true, flipY: false }).mirrorX).toBe(false);
  });

  it("stretches the invisible arm: the face stays reach × size above the hands", () => {
    expect(hotspotOffset("grip", { mirrorX: false, flipY: false }, 100, .57).y).toBeCloseTo(57);
    expect(hotspotOffset("idle", { mirrorX: false, flipY: false }, 100, .37).y).toBeCloseTo(37);
    // Apontar ignora o braço da coreografia.
    expect(hotspotOffset("point", { mirrorX: false, flipY: false }, 100, .57).y).toBeLessThan(0);
  });

  it("walks the carry choreography with the right hands and gaze", () => {
    const order = ["approach", "face", "crouch", "reach", "grab", "lift", "turn", "carry", "arrive", "lower", "extend", "release", "rise"] as const;
    expect(order.map((action) => cursorLook(action, true).gesture)).toEqual(["idle", "idle", "idle", "reach", "grip", "grip", "carry", "carry", "carry", "carry", "grip", "reach", "idle"]);
    // Andando de lado olha para onde vai; de frente para o usuário ao pegar e soltar, olhando para baixo.
    expect(gazeFor("carry", 1, "side")!.turn).toBeGreaterThan(.5);
    expect(gazeFor("carry", -1, "side")!.look[0]).toBeLessThan(0);
    expect(gazeFor("face", 1, "front")!.turn).toBe(0);
    expect(gazeFor("reach", 1)!.turn).toBe(0);
    expect(gazeFor("reach", 1)!.look[1]).toBeLessThan(-.5);
    expect(gazeFor("click", 1)).toBeUndefined();
  });

  it("turns its back when walking up the screen and faces the user when walking down", () => {
    expect(gazeFor("carry", 1, "back")!.back).toBe(1);
    expect(gazeFor("approach", -1, "front")).toMatchObject({ turn: 0 });
    expect(gazeFor("arrive", 1, "front")!.back).toBeUndefined();
  });

  it("carries the object in front of the body when walking sideways", () => {
    expect(carrySideShift("carry", 1, "side")).toBeLessThan(0);
    expect(carrySideShift("carry", -1, "side")).toBeGreaterThan(0);
    expect(carrySideShift("carry", 1, "front")).toBe(0);
    expect(carrySideShift("lower", 1, "side")).toBe(0);
  });

  it("bobs a little at each step and rests between steps", () => {
    expect(stepBob(0)).toBeCloseTo(0);
    expect(stepBob(.5)).toBeCloseTo(3.2);
    expect(stepBob(1)).toBeCloseTo(0);
  });
});
