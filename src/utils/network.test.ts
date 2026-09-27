import { describe, expect, it } from "vitest";
import { formatPairCode, meshLayout, normalizePairCode, parseRemoteModel, parseRemoteTarget, remoteModelId, type NetDevice } from "./network";

const dev = (id: string, extra: Partial<NetDevice> = {}): NetDevice => ({ id, name: id, kind: "desktop", os: "Windows 11", models: [], online: true, paired: true, self: false, link: "local", ...extra });

describe("pair code", () => {
  it("formats and normalizes 6 digits", () => {
    expect(formatPairCode("482913")).toBe("482 913");
    expect(normalizePairCode(" 482-913 ")).toBe("482913");
    expect(normalizePairCode("48291")).toBeNull();
    expect(normalizePairCode("48a913")).toBeNull();
  });
});

describe("remote model ids", () => {
  it("round-trips device and model (model names keep their colons)", () => {
    const id = remoteModelId("abc123", "qwen3.5:9b");
    expect(id).toBe("remote:abc123:qwen3.5:9b");
    expect(parseRemoteModel(id)).toEqual({ deviceId: "abc123", model: "qwen3.5:9b" });
    expect(parseRemoteModel("ollama:qwen3.5:9b")).toBeNull();
  });
});

describe("meshLayout", () => {
  it("puts self in the center and links every online paired pair", () => {
    const layout = meshLayout([dev("eu", { self: true }), dev("pc"), dev("note", { kind: "laptop" }), dev("off", { online: false })], 600, 400);
    const self = layout.nodes.find((node) => node.id === "eu")!;
    expect(self).toEqual({ id: "eu", x: 300, y: 200 });
    expect(layout.nodes).toHaveLength(4);
    const pairs = layout.edges.map((edge) => [edge.from, edge.to].sort().join("-")).sort();
    expect(pairs).toEqual(["eu-note", "eu-pc", "note-pc"]);
  });

  it("does not link unpaired devices (they are only discovered)", () => {
    const layout = meshLayout([dev("eu", { self: true }), dev("vizinho", { paired: false })], 600, 400);
    expect(layout.edges).toEqual([]);
  });
});

describe("parseRemoteTarget", () => {
  const list = [dev("eu", { self: true, name: "NOTEBOOK" }), dev("sala", { name: "PC-Sala" }), dev("quarto", { name: "Desktop Quarto", paired: false })];
  it("finds 'no <computador>, <tarefa>' for paired computers", () => {
    expect(parseRemoteTarget("no PC-Sala, abra a calculadora", list)).toEqual({ deviceId: "sala", deviceName: "PC-Sala", task: "abra a calculadora" });
    expect(parseRemoteTarget("No pc sala abra o chrome", list)).toEqual({ deviceId: "sala", deviceName: "PC-Sala", task: "abra o chrome" });
    expect(parseRemoteTarget("pelo computador PC-Sala: mostre a área de trabalho", list)?.task).toBe("mostre a área de trabalho");
  });
  it("ignores unpaired computers, this computer and ordinary messages", () => {
    expect(parseRemoteTarget("no Desktop Quarto, abra o chrome", list)).toBeNull();
    expect(parseRemoteTarget("no NOTEBOOK, abra o chrome", list)).toBeNull();
    expect(parseRemoteTarget("no Brasil, qual a capital?", list)).toBeNull();
    expect(parseRemoteTarget("no PC-Sala", list)).toBeNull();
  });
});
