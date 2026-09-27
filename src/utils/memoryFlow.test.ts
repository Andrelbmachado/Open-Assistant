import { describe, expect, it } from "vitest";
import { learnWithTrace } from "./memoryFlow";
import { releaseTrace, type SystemTrace } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "./systemWorkflows";
import { EMPTY_MEMORY } from "./memory";

function recorder() {
  const calls: string[] = [];
  const trace: SystemTrace = {
    step: (id, sample) => calls.push(`step ${id}${sample ? `: ${sample}` : ""}`),
    wait: (id) => calls.push(`wait ${id}`),
    skip: (id) => calls.push(`skip ${id}`),
    fail: (id, message) => calls.push(`fail ${id}: ${message}`),
    end: (summary) => calls.push(`end ${summary}`),
  };
  let opened = 0;
  return { calls, open: () => { opened += 1; return trace; }, opened: () => opened };
}

const empty = () => ({ ...EMPTY_MEMORY, learn: true });

describe("learnWithTrace", () => {
  it("does not open a trace for ordinary messages", () => {
    const rec = recorder();
    const result = learnWithTrace(empty(), "qual a capital da França?", rec.open);
    expect(result.changes).toEqual([]);
    expect(rec.opened()).toBe(0);
  });

  it("reports every step and holds the trace until the file is written", () => {
    const rec = recorder();
    const result = learnWithTrace(empty(), "lembre que eu gosto de café", rec.open);
    expect(result.changes.length).toBe(1);
    expect(rec.calls).toEqual([
      "step mensagem: lembre que eu gosto de café",
      `step detectar: ${result.changes[0]}`,
      `step juntar: ${result.changes[0]}`,
      "wait gravar",
    ]);
    expect(releaseTrace(SYS_MEMORY_SAVE)).toBeDefined();
  });

  it("ends early when the fact was already saved", () => {
    const rec = recorder();
    const first = learnWithTrace(empty(), "lembre que eu gosto de café", recorder().open);
    releaseTrace(SYS_MEMORY_SAVE);
    const again = learnWithTrace(first.memory, "lembre que eu gosto de café", rec.open);
    expect(again.changes).toEqual([]);
    expect(rec.calls.slice(-3)).toEqual(["step juntar: Já estava salvo.", "skip gravar", "end Nada novo: já estava na memória."]);
  });
});
