import { describe, expect, it } from "vitest";
import { assignChatAreas, calculateSplitIntent, listAreas, hasWorkspaceArea, isValidWorkspaceLayout, type WorkspaceLayoutNode, adoptWorkflows, assignWorkflowAreas, openWorkflowBeside, setAreaWorkflow } from "./workspaceLayout";

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

describe("assignChatAreas", () => {
  const split = (first: WorkspaceLayoutNode, second: WorkspaceLayoutNode): WorkspaceLayoutNode => ({ id: `s-${Math.random()}`, axis: "horizontal", fraction: .5, first, second });

  it("gives a freshly split chat area its own new conversation", () => {
    let created = 0;
    const layout = split({ id: "a", view: "chat", chatId: "c1" }, { id: "b", view: "chat" });
    const next = assignChatAreas(layout, "a", "c1", new Set(["c1"]), () => `novo-${++created}`);
    expect(listAreas(next).map((area) => area.chatId)).toEqual(["c1", "novo-1"]);
  });

  it("never shows the same conversation in two areas", () => {
    const layout = split({ id: "a", view: "chat", chatId: "c1" }, { id: "b", view: "chat", chatId: "c1" });
    const next = assignChatAreas(layout, "b", "c1", new Set(["c1", "c2"]), () => "novo");
    expect(listAreas(next).map((area) => area.chatId)).toEqual(["novo", "c1"]);
  });

  it("makes the active area follow the selected conversation and ignores other views", () => {
    const layout = split({ id: "a", view: "chat", chatId: "c1" }, { id: "b", view: "workflow" });
    const next = assignChatAreas(layout, "a", "c2", new Set(["c1", "c2"]), () => "novo");
    expect(listAreas(next)).toEqual([{ id: "a", view: "chat", chatId: "c2" }, { id: "b", view: "workflow" }]);
  });
});

describe("workflow areas", () => {
  const layout = { id: "root", axis: "horizontal" as const, fraction: .5, first: { id: "a", view: "workflow" as const }, second: { id: "b", view: "workflow" as const } };
  it("gives each node editor area its own workflow and keeps them apart", () => {
    let created = 0;
    const assigned = assignWorkflowAreas(setAreaWorkflow(layout, "a", "w1"), new Set(["w1"]), () => `novo${++created}`);
    expect(listAreas(assigned).map((area) => area.workflowId)).toEqual(["w1", "novo1"]);
    // Trocar o projeto da área B não muda a área A.
    const switched = setAreaWorkflow(assigned, "b", "w9");
    expect(listAreas(switched).map((area) => area.workflowId)).toEqual(["w1", "w9"]);
    // Duas áreas nunca mostram o mesmo workflow: a segunda ganha outro.
    const duplicated = assignWorkflowAreas(setAreaWorkflow(assigned, "b", "w1"), new Set(["w1"]), () => "outro");
    expect(listAreas(duplicated).map((area) => area.workflowId)).toEqual(["w1", "outro"]);
  });

  it("adopts saved workflows that no area shows (old canvas migrated)", () => {
    const adopted = adoptWorkflows(setAreaWorkflow(layout, "a", "sumiu"), ["migrado", "outro"]);
    expect(listAreas(adopted).map((area) => area.workflowId)).toEqual(["migrado", "outro"]);
  });
  it("keeps areas that show a pinned (system) workflow", () => {
    const adopted = adoptWorkflows(setAreaWorkflow(layout, "a", "sys-memoria-salvar"), ["migrado"], ["sys-memoria-salvar"]);
    expect(listAreas(adopted).map((area) => area.workflowId)).toEqual(["sys-memoria-salvar", "migrado"]);
  });

  it("opens a workflow beside an area, or reuses the area that already shows it", () => {
    const first = openWorkflowBeside(layout, "a", "sys-memoria-salvar", { area: "novo", split: "s1" });
    expect(first.areaId).toBe("novo");
    expect(listAreas(first.layout).find((area) => area.id === "novo")).toMatchObject({ view: "workflow", workflowId: "sys-memoria-salvar" });
    const again = openWorkflowBeside(first.layout, "a", "sys-memoria-salvar", { area: "outro", split: "s2" });
    expect(again.areaId).toBe("novo");
    expect(again.layout).toBe(first.layout);
  });
});
