import { describe, expect, it } from "vitest";
import { buildLocalModelOptions, formatBytes, resolveChatModel } from "./localCatalog";
import type { HardwareProfile } from "./localModels";

const rtx5070: HardwareProfile = {
  gpus: [{ name: "NVIDIA GeForce RTX 5070", vramMb: 12227, driverVersion: "610.88", vendor: "nvidia" }],
  cpuName: "AMD Ryzen 7",
  ramMb: 15462,
  availableDiskMb: 76_800,
  warnings: [],
};

const byId = (options: ReturnType<typeof buildLocalModelOptions>, id: string) => options.find((item) => item.id === id);

describe("buildLocalModelOptions", () => {
  it("marca um modelo presente no Ollama como instalado", () => {
    const options = buildLocalModelOptions(rtx5070, [{ name: "qwen3.5:9b", sizeBytes: 6_594_474_711 }]);
    expect(byId(options, "qwen3.5:9b")?.status).toBe("installed");
  });

  it("recomenda o maior Qwen3.5 que cabe na GPU de 12 GB mesmo com 15 GB de RAM", () => {
    const options = buildLocalModelOptions(rtx5070, []);
    expect(byId(options, "qwen3.5:9b")).toMatchObject({ status: "available", recommended: true, runsOn: "gpu" });
    expect(options.filter((item) => item.recommended)).toHaveLength(1);
  });

  it("mantém a recomendação no modelo já instalado em vez de sugerir um menor", () => {
    const options = buildLocalModelOptions(rtx5070, [{ name: "qwen3.5:9b", sizeBytes: 6_594_474_711 }]);
    expect(byId(options, "qwen3.5:9b")).toMatchObject({ status: "installed", recommended: true });
    expect(options.filter((item) => item.recommended)).toHaveLength(1);
  });

  it("mantém visíveis, porém incompatíveis, os modelos que não cabem na VRAM", () => {
    const gptOss = byId(buildLocalModelOptions(rtx5070, []), "gpt-oss:20b");
    expect(gptOss?.status).toBe("incompatible");
    expect(gptOss?.reason).toContain("VRAM");
  });

  it("permite modelos pequenos na CPU quando não há GPU NVIDIA", () => {
    const options = buildLocalModelOptions({ ...rtx5070, gpus: [], ramMb: 16_384 }, []);
    expect(byId(options, "qwen3.5:2b")).toMatchObject({ status: "available", runsOn: "cpu" });
    expect(byId(options, "qwen3.5:9b")?.status).toBe("incompatible");
  });

  it("bloqueia o download quando falta espaço em disco", () => {
    const qwen = byId(buildLocalModelOptions({ ...rtx5070, availableDiskMb: 2_048 }, []), "qwen3.5:9b");
    expect(qwen?.status).toBe("incompatible");
    expect(qwen?.reason).toContain("disco");
  });

  it("lista modelos instalados fora do catálogo com o nome exato do Ollama", () => {
    const options = buildLocalModelOptions(rtx5070, [{ name: "mistral:7b", sizeBytes: 4_100_000_000 }]);
    expect(options[0]).toMatchObject({ id: "mistral:7b", label: "mistral:7b", status: "installed", sizeBytes: 4_100_000_000 });
  });

  it("não bloqueia modelos enquanto o hardware ainda não foi verificado", () => {
    expect(byId(buildLocalModelOptions(undefined, []), "qwen3.5:9b")?.status).toBe("available");
  });
});

describe("resolveChatModel", () => {
  it("respeita o modelo Ollama escolhido explicitamente", () => {
    expect(resolveChatModel("Ollama: gemma3:4b", ["qwen3.5:9b"], undefined)).toBe("Ollama: gemma3:4b");
  });

  it("troca um modelo antigo de nuvem pelo modelo local preferido", () => {
    expect(resolveChatModel("GPT-5", ["gemma3:4b", "qwen3.5:9b"], "Ollama: qwen3.5:9b")).toBe("Ollama: qwen3.5:9b");
  });

  it("mantém o modelo preferido quando o Ollama desligado não lista nada, para o erro real aparecer", () => {
    expect(resolveChatModel("", [], "Ollama: qwen3.5:9b")).toBe("Ollama: qwen3.5:9b");
  });

  it("ignora a preferência por um modelo que foi removido do Ollama", () => {
    expect(resolveChatModel("", ["gemma3:4b"], "Ollama: qwen3.5:9b")).toBe("Ollama: gemma3:4b");
  });

  it("usa o primeiro modelo instalado quando não há preferência", () => {
    expect(resolveChatModel("", ["gemma3:4b"], undefined)).toBe("Ollama: gemma3:4b");
  });

  it("mantém o BitNet escolhido, que não aparece na lista do Ollama", () => {
    expect(resolveChatModel("BitNet: bitnet-b1.58-2b-4t", ["qwen3.5:9b"], undefined)).toBe("BitNet: bitnet-b1.58-2b-4t");
    expect(resolveChatModel("", ["qwen3.5:9b"], "BitNet: bitnet-b1.58-2b-4t")).toBe("BitNet: bitnet-b1.58-2b-4t");
  });

  it("não inventa modelo quando nada está instalado", () => {
    expect(resolveChatModel("GPT-5", [], undefined)).toBeUndefined();
  });
});

describe("formatBytes", () => {
  it("formata tamanhos em GB e MB no padrão brasileiro", () => {
    expect(formatBytes(6_594_474_711)).toBe("6,1 GB");
    expect(formatBytes(524_288_000)).toBe("500 MB");
  });
});
