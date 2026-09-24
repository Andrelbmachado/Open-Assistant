import { describe, expect, it } from "vitest";
import { recommendLocalModel, type HardwareProfile } from "./localModels";

const rtx5070: HardwareProfile = {
  gpus: [{ name: "NVIDIA GeForce RTX 5070", vramMb: 12288, driverVersion: "576.02", vendor: "nvidia" }],
  cpuName: "AMD Ryzen 7",
  ramMb: 32768,
  availableDiskMb: 102400,
  warnings: [],
};

describe("recommendLocalModel", () => {
  it("recomenda Qwen3.5 9B para 12 GB de VRAM com RAM e disco suficientes", () => {
    expect(recommendLocalModel(rtx5070)).toMatchObject({
      eligible: true,
      modelId: "qwen3.5:9b",
      downloadSizeMb: 6600,
    });
  });

  it("bloqueia o download quando a GPU NVIDIA não tem VRAM para um perfil equilibrado", () => {
    const recommendation = recommendLocalModel({
      ...rtx5070,
      gpus: [{ ...rtx5070.gpus[0], vramMb: 2048 }],
    });

    expect(recommendation.eligible).toBe(false);
    expect(recommendation.reason).toContain("VRAM");
  });

  it("bloqueia o download quando não há GPU NVIDIA detectada", () => {
    const recommendation = recommendLocalModel({
      ...rtx5070,
      gpus: [{ name: "Adaptador básico", vramMb: 4096, vendor: "other" }],
    });

    expect(recommendation.eligible).toBe(false);
    expect(recommendation.reason).toContain("NVIDIA");
  });
});
