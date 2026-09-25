/**
 * Indicador de conexão sob o ícone de computador/nuvem da barra lateral:
 * verde = IA pronta (Ollama online com o modelo instalado, BitNet instalado ou chave de nuvem salva);
 * amarelo = verificando; vermelho = parado ou faltando algo.
 */
import { BITNET_MODEL_PREFIX, OLLAMA_MODEL_PREFIX } from "./localCatalog";
import { CLOUD_MODEL_PREFIX } from "./cloudModels";

export type ConnectionLevel = "ok" | "checking" | "error";

export interface ConnectionStatus {
  level: ConnectionLevel;
  label: string;
  /** Texto do tooltip explicando o que fazer. */
  detail: string;
}

export interface ConnectionInput {
  model?: string;
  ollama: "unknown" | "checking" | "online" | "offline";
  installed: string[];
  bitnetInstalled: boolean;
  /** Chave do provedor em nuvem: undefined enquanto confere. */
  cloudKey?: boolean;
  qa?: boolean;
}

export function connectionStatus(input: ConnectionInput): ConnectionStatus {
  const { model } = input;
  if (input.qa) return { level: "ok", label: "Modo QA", detail: "Modo QA offline: respostas simuladas." };
  if (model?.startsWith(CLOUD_MODEL_PREFIX)) {
    if (input.cloudKey === undefined) return { level: "checking", label: "Verificando", detail: "Conferindo a chave de API…" };
    return input.cloudKey
      ? { level: "ok", label: "Conectado", detail: "IA na nuvem pronta: chave de API salva." }
      : { level: "error", label: "Sem chave", detail: "Falta a chave de API: adicione em Configurações › Provedores." };
  }
  if (model?.startsWith(BITNET_MODEL_PREFIX)) {
    return input.bitnetInstalled
      ? { level: "ok", label: "Funcionando", detail: "BitNet pronto neste computador (CPU)." }
      : { level: "error", label: "Não instalado", detail: "BitNet não está instalado: baixe em Configurações › Ferramentas de IA." };
  }
  if (input.ollama === "unknown" || input.ollama === "checking") return { level: "checking", label: "Verificando", detail: "Conferindo o Ollama…" };
  if (input.ollama === "offline") return { level: "error", label: "Ollama parado", detail: "O Ollama não está rodando: inicie em Configurações › Runtimes locais." };
  const modelId = model?.startsWith(OLLAMA_MODEL_PREFIX) ? model.slice(OLLAMA_MODEL_PREFIX.length).trim() : undefined;
  if (modelId && !input.installed.includes(modelId)) return { level: "error", label: "Modelo ausente", detail: `O modelo ${modelId} não está instalado: baixe em Configurações › Modelos locais.` };
  if (!modelId && input.installed.length === 0) return { level: "error", label: "Sem modelo", detail: "Nenhum modelo local baixado: escolha um em Configurações › Modelos locais." };
  return { level: "ok", label: "Funcionando", detail: `IA local funcionando${modelId ? ` (${modelId})` : ""}: Ollama conectado.` };
}
