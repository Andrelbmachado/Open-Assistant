import { describe, expect, it } from "vitest";
import { describeLocalOperation, describePull, type LocalModelOperation, type PullProgress } from "./localOperation";

describe("describeLocalOperation", () => {
  it("shows known progress, speed and estimated remaining time", () => {
    const operation: LocalModelOperation = { id: "op", kind: "download_model", state: "running", message: "Baixando", progressPercent: 40, bytesPerSecond: 2 * 1024 * 1024, etaSeconds: 90 };
    expect(describeLocalOperation(operation)).toMatchObject({ progress: 40, phase: "Baixando", speed: "2,0 MB/s", eta: "cerca de 1 min 30 s" });
  });

  it("does not invent telemetry when the runtime did not provide it", () => {
    const operation: LocalModelOperation = { id: "op", kind: "download_model", state: "running", message: "Verificando", progressPercent: undefined };
    expect(describeLocalOperation(operation)).toMatchObject({ progress: undefined, speed: undefined, eta: undefined });
  });

  it("labels a safely stopped download as paused and resumable", () => {
    const operation: LocalModelOperation = { id: "op", kind: "download_model", state: "paused", message: "Pausado pelo usuário" };
    expect(describeLocalOperation(operation).phase).toBe("Pausado — pronto para retomar");
  });
});

const base: PullProgress = { operationId: "op", modelId: "qwen3.5:9b", state: "running", status: "pulling 1a2b3c" };

describe("describePull", () => {
  it("mostra bytes baixados, total, velocidade e tempo restante reais", () => {
    const description = describePull({ ...base, totalBytes: 6 * 1024 ** 3, completedBytes: 1.5 * 1024 ** 3, bytesPerSecond: 45.3 * 1024 ** 2, etaSeconds: 130 });
    expect(description).toEqual({ phase: "Baixando", percent: 25, transferred: "1,5 GB de 6,0 GB", speed: "45,3 MB/s", eta: "cerca de 2 min 10 s" });
  });

  it("não mostra velocidade residual depois que os bytes terminaram de chegar", () => {
    const description = describePull({ ...base, status: "verifying sha256 digest", totalBytes: 6 * 1024 ** 3, completedBytes: 6 * 1024 ** 3, bytesPerSecond: 700_000, etaSeconds: 1 });
    expect(description).toMatchObject({ phase: "Verificando integridade", percent: 100, transferred: "6,0 GB de 6,0 GB", speed: undefined, eta: undefined });
  });

  it("traduz as etapas finais do Ollama", () => {
    expect(describePull({ ...base, status: "verifying sha256 digest" }).phase).toBe("Verificando integridade");
    expect(describePull({ ...base, status: "pulling manifest" }).phase).toBe("Lendo manifesto");
  });

  it("não inventa percentual antes de o Ollama informar o tamanho", () => {
    expect(describePull({ ...base, status: "pulling manifest" })).toMatchObject({ percent: undefined, transferred: undefined, speed: undefined, eta: undefined });
  });

  it("marca o download concluído como pronto para usar", () => {
    expect(describePull({ ...base, state: "completed", status: "success", totalBytes: 10, completedBytes: 10 })).toMatchObject({ phase: "Pronto para usar", percent: 100 });
  });

  it("exibe o erro informado pelo Ollama", () => {
    expect(describePull({ ...base, state: "failed", error: "pull model manifest: file does not exist" }).phase).toBe("pull model manifest: file does not exist");
  });
});
