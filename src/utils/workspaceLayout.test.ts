import { describe, expect, it } from "vitest";
import {
  calculateSplitIntent,
  hasWorkspaceArea,
  isValidWorkspaceLayout,
  type WorkspaceLayoutNode,
} from "./workspaceLayout";

describe("calculateSplitIntent", () => {
  it("creates a left horizontal area from a single continuous drag", () => {
    expect(calculateSplitIntent("top-left", 180, 12, 900, 620)).toEqual({
      axis: "horizontal",
      fraction: 0.2,
      newAreaFirst: true,
    });
  });

  it("creates a bottom vertical area when vertical travel dominates", () => {
    expect(calculateSplitIntent("bottom-right", -20, -155, 900, 620)).toEqual({
      axis: "vertical",
      fraction: 0.75,
      newAreaFirst: false,
    });
  });

  it("does not create an area from a click-sized gesture", () => {
    expect(calculateSplitIntent("top-right", -23, 0, 900, 620)).toBeNull();
  });
});

describe("isValidWorkspaceLayout", () => {
  it("rejects a restored split with an invalid fraction", () => {
    const invalid: WorkspaceLayoutNode = {
      id: "root",
      axis: "horizontal",
      fraction: Number.NaN,
      first: { id: "left", view: "chat" },
      second: { id: "right", view: "workflow" },
    };

    expect(isValidWorkspaceLayout(invalid)).toBe(false);
  });

  it("rejects a restored tree with duplicate area identifiers", () => {
    const invalid: WorkspaceLayoutNode = {
      id: "root",
      axis: "horizontal",
      fraction: .5,
      first: { id: "duplicate", view: "chat" },
      second: { id: "duplicate", view: "workflow" },
    };

    expect(isValidWorkspaceLayout(invalid)).toBe(false);
  });

  it("detects when a restored active area no longer exists", () => {
    const layout: WorkspaceLayoutNode = { id: "chat-area", view: "chat" };

    expect(hasWorkspaceArea(layout, "missing-area")).toBe(false);
  });
});
