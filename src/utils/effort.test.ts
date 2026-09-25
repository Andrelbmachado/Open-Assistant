import { describe, expect, it } from "vitest";
import { DEFAULT_EFFORT, EFFORT_INFO, EFFORT_LEVELS, effortAt, effortIndex, isEffortLevel } from "./effort";

describe("effort slider", () => {
  it("vai do mais rápido (sem raciocínio) ao Ultra", () => {
    expect(EFFORT_LEVELS[0]).toBe("fast");
    expect(EFFORT_LEVELS[EFFORT_LEVELS.length - 1]).toBe("ultra");
    expect(EFFORT_INFO.fast.think).toBe(false);
    expect(EFFORT_LEVELS.slice(1).every((level) => EFFORT_INFO[level].think)).toBe(true);
  });

  it("mantém o padrão rápido anterior e rejeita valores restaurados inválidos", () => {
    expect(DEFAULT_EFFORT).toBe("fast");
    expect(isEffortLevel("ultra")).toBe(true);
    expect(isEffortLevel("Alto")).toBe(false);
  });

  it("converte a posição do slider em nível, limitando os extremos", () => {
    expect(effortAt(effortIndex("high"))).toBe("high");
    expect(effortAt(-3)).toBe("fast");
    expect(effortAt(99)).toBe("ultra");
    expect(effortAt(2.4)).toBe("high");
  });
});
