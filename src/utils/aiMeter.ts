export type AIMeterKind = "local" | "qa" | "cloud" | "none";

export interface AIMeterSummary {
  kind: AIMeterKind;
  label: string;
  detail: string;
  throughput: string;
}

function isLocalModel(model: string) {
  return /ollama|bitnet|local|qwen|llama/i.test(model);
}

function speedDescription(tokensPerSecond: number) {
  if (tokensPerSecond >= 24) return "rápido";
  if (tokensPerSecond >= 8) return "normal";
  return "econômico";
}

/** Resumo do medidor de uso (local = ilimitado; nuvem = saldo) e velocidade da última resposta. */
export function getAIMeterSummary(model: string, tokensPerSecond: number | undefined, qaOffline: boolean): AIMeterSummary {
  const throughput = tokensPerSecond ? `${Math.round(tokensPerSecond)} tok/s · ${speedDescription(tokensPerSecond)}` : "Aguardando resposta";

  if (isLocalModel(model)) {
    const modelId = model.startsWith("Ollama: ") ? model.slice("Ollama: ".length) : model.startsWith("BitNet: ") ? "BitNet (1 bit, CPU)" : "";
    return { kind: "local", label: "Ilimitado", detail: qaOffline ? "Inferência local simulada" : modelId ? `Inferência local · ${modelId}` : "Inferência local", throughput };
  }

  if (qaOffline) {
    return { kind: "qa", label: "QA offline", detail: "Sem consumo de créditos", throughput };
  }

  if (!model.trim()) {
    return { kind: "none", label: "Sem modelo local", detail: "Baixe um modelo em Configurações › Modelos locais", throughput };
  }

  return { kind: "cloud", label: "Saldo indisponível", detail: "Conecte um provedor para consultar créditos", throughput };
}
