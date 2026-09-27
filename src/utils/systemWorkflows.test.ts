import { describe, expect, it } from "vitest";
import { KIND_BY_ID, validateWorkflow } from "./workflow";
import { runWorkflow, type WorkflowHost } from "./workflowEngine";
import { allowedWhenReadOnly, isSystemWorkflow, SYS_MEMORY_SAVE, SYSTEM_AGENTS, SYSTEM_WORKFLOWS, systemWorkflow } from "./systemWorkflows";

describe("system workflows", () => {
  it("are valid, use only trace kinds and have sys- ids", () => {
    for (const doc of SYSTEM_WORKFLOWS) {
      expect(doc.id.startsWith("sys-"), doc.id).toBe(true);
      expect(validateWorkflow(doc), doc.id).toEqual([]);
      for (const node of doc.nodes) expect(KIND_BY_ID.get(node.kind)?.traceOnly, node.id).toBe(true);
    }
    expect(new Set(SYSTEM_WORKFLOWS.map((doc) => doc.id)).size).toBe(SYSTEM_WORKFLOWS.length);
  });

  it("memory flow has the four steps in order", () => {
    const doc = systemWorkflow(SYS_MEMORY_SAVE)!;
    expect(doc.nodes.map((node) => node.id)).toEqual(["mensagem", "detectar", "juntar", "gravar"]);
    expect(doc.connections.map((c) => `${c.from}>${c.to}`)).toEqual(["mensagem>detectar", "detectar>juntar", "juntar>gravar"]);
  });

  it("every system agent points to a system workflow", () => {
    for (const agent of SYSTEM_AGENTS) expect(isSystemWorkflow(agent.workflowId), agent.id).toBe(true);
    expect(isSystemWorkflow("qualquer")).toBe(false);
    expect(isSystemWorkflow(undefined)).toBe(false);
  });

  it("the engine refuses to run trace nodes", async () => {
    const result = await runWorkflow(systemWorkflow(SYS_MEMORY_SAVE)!, {} as WorkflowHost);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("só mostra");
  });

  it("read-only canvas only lets navigation actions through", () => {
    expect(allowedWhenReadOnly("wfOpen")).toBe(true);
    expect(allowedWhenReadOnly("wfCreate")).toBe(true);
    expect(allowedWhenReadOnly("activateArea")).toBe(true);
    for (const type of ["wfAddNode", "wfMoveNode", "wfSetParam", "wfRemoveNodes", "wfConnect", "wfRename", "wfDelete", "wfReplace", "wfSetSchedule"]) expect(allowedWhenReadOnly(type), type).toBe(false);
  });
});
