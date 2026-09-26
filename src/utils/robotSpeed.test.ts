import { describe, expect, it } from "vitest";
import { crossingSeconds, DEFAULT_ROBOT_SPEED, restoreRobotSpeed, ROBOT_SPEEDS, robotSpeedIndex } from "./robotSpeed";

describe("robot speed", () => {
  it("starts slow enough to watch the robot carry things", () => {
    expect(DEFAULT_ROBOT_SPEED).toBeLessThanOrEqual(240);
    expect(crossingSeconds(DEFAULT_ROBOT_SPEED)).toBeGreaterThanOrEqual(6);
  });

  it("snaps a saved speed to the nearest slider step and restores safely", () => {
    expect(robotSpeedIndex(150)).toBe(1);
    expect(robotSpeedIndex(260)).toBe(2);
    expect(robotSpeedIndex(5000)).toBe(ROBOT_SPEEDS.length - 1);
    expect(restoreRobotSpeed(undefined)).toBe(DEFAULT_ROBOT_SPEED);
    expect(restoreRobotSpeed(10)).toBe(60);
    expect(restoreRobotSpeed(333.3)).toBe(333);
  });
});
