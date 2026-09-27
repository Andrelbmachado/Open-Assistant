import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorkflowRun } from "./workflowRuns";
import { holdTrace, releaseTrace, traceHistory, traceSystem } from "./systemTrace";
import { SYS_MEMORY_SAVE } from "../utils/systemWorkflows";

function clock(start = 1000) { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; }

describe("traceSystem", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("lights nodes in order and finishes the run", () => {
    const c = clock();
    const trace = traceSystem(SYS_MEMORY_SAVE, { chatId: "chat-1" }, c.now);
    let run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.running).toBe(true);
    expect(run.trigger).toBe("sistema");
    expect(run.chatId).toBe("chat-1");
    expect(run.nodes.gravar.state).toBe("waiting");
    c.tick(5); trace.step("mensagem", "lembre que eu gosto de café");
    trace.wait("gravar");
    run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.nodes.mensagem).toMatchObject({ state: "ok", sample: "lembre que eu gosto de café", ms: 5 });
    expect(run.nodes.gravar.state).toBe("running");
    c.tick(20); trace.end("Memória salva");
    run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.running).toBe(false);
    expect(run.result).toMatchObject({ ok: true, ms: 25 });
    expect(traceHistory()[0]).toMatchObject({ workflowId: SYS_MEMORY_SAVE, chatId: "chat-1", ok: true, summary: "Memória salva" });
  });

  it("fail marks the node and ends the run once", () => {
    const trace = traceSystem(SYS_MEMORY_SAVE);
    trace.fail("gravar", "disco cheio");
    trace.end("não deve contar");
    const run = getWorkflowRun(SYS_MEMORY_SAVE)!;
    expect(run.nodes.gravar).toMatchObject({ state: "error", message: "disco cheio" });
    expect(run.result).toMatchObject({ ok: false, error: "disco cheio" });
    expect(traceHistory()[0].summary).toBe("disco cheio");
  });

  it("a held trace fails by itself when nobody releases it", () => {
    vi.useFakeTimers();
    const trace = traceSystem(SYS_MEMORY_SAVE);
    holdTrace("k", trace, "gravar", 5000);
    vi.advanceTimersByTime(5001);
    expect(getWorkflowRun(SYS_MEMORY_SAVE)!.nodes.gravar.state).toBe("error");
    expect(releaseTrace("k")).toBeUndefined();
  });

  it("releaseTrace hands the trace back and cancels the timeout", () => {
    vi.useFakeTimers();
    const trace = traceSystem(SYS_MEMORY_SAVE);
    holdTrace("k2", trace, "gravar", 5000);
    expect(releaseTrace("k2")).toBe(trace);
    vi.advanceTimersByTime(6000);
    expect(getWorkflowRun(SYS_MEMORY_SAVE)!.running).toBe(true);
  });
});
