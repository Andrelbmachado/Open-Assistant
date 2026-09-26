import { describe, expect, it } from "vitest";
import { lerpSegment, stepSnake } from "./SnakeGame";

describe("stepSnake", () => {
  it("anda, cresce ao comer e dá a volta nas bordas", () => {
    const start = [{ x: 1, y: 1 }, { x: 0, y: 1 }];
    const moved = stepSnake(start, { x: 1, y: 0 }, { x: 5, y: 5 }, 10);
    expect(moved.snake).toEqual([{ x: 2, y: 1 }, { x: 1, y: 1 }]);
    const ate = stepSnake(start, { x: 1, y: 0 }, { x: 2, y: 1 }, 10);
    expect(ate.ate).toBe(true);
    expect(ate.snake).toHaveLength(3);
    expect(stepSnake([{ x: 9, y: 0 }], { x: 1, y: 0 }, { x: 5, y: 5 }, 10).snake[0]).toEqual({ x: 0, y: 0 });
  });

  it("morre ao bater no próprio corpo", () => {
    const snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }];
    expect(stepSnake(snake, { x: -1, y: 0 }, { x: 8, y: 8 }, 10).dead).toBe(true);
  });

  it("desliza entre os passos, mas pula quando atravessa a borda", () => {
    expect(lerpSegment({ x: 1, y: 1 }, { x: 2, y: 1 }, 0.5)).toEqual({ x: 1.5, y: 1 });
    expect(lerpSegment({ x: 17, y: 1 }, { x: 0, y: 1 }, 0.5)).toEqual({ x: 0, y: 1 });
    expect(lerpSegment(undefined, { x: 3, y: 3 }, 0.2)).toEqual({ x: 3, y: 3 });
  });
});
