import { BITNET_MODEL_PREFIX, LOCAL_MODEL_CATALOG, OLLAMA_MODEL_PREFIX } from "./localCatalog";

/** Nome exibido no título das respostas: o rótulo do catálogo ou o id do Ollama. */
export function modelDisplayName(model: string | undefined, source?: string): string {
  if (model?.startsWith(BITNET_MODEL_PREFIX) || source?.startsWith("BitNet")) return "BitNet b1.58 2B4T";
  const id = model?.startsWith(OLLAMA_MODEL_PREFIX) ? model.slice(OLLAMA_MODEL_PREFIX.length).trim() : model?.trim() || source?.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (!id) return "Open Assistant";
  return LOCAL_MODEL_CATALOG.find((item) => item.id.toLowerCase() === id.toLowerCase())?.label ?? id;
}

/** Rodapé da resposta: "Qwen3.5 9B · 312 tokens · 61 tok/s". */
export function replyFooter(model: string | undefined, source: string | undefined, tokens?: number, tokensPerSecond?: number): string {
  const parts = [modelDisplayName(model, source)];
  if (tokens) parts.push(`${formatTokenCount(tokens)} tokens`);
  if (tokensPerSecond) parts.push(`${Math.round(tokensPerSecond)} tok/s`);
  return parts.join(" · ");
}

/** Tempo decorrido no formato do indicador de raciocínio: `8s`, `1m 05s`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
}

/** Contagem de tokens compacta ("950", "1,2k"). */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
}

const THINKING_VERBS = ["Pensando", "Raciocinando", "Refletindo", "Ponderando", "Analisando", "Elaborando", "Conectando ideias", "Destrinchando", "Matutando", "Tecendo a resposta"];

/** Verbo estável por mensagem, como o spinner do Claude Code. */
export function thinkingVerb(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return THINKING_VERBS[hash % THINKING_VERBS.length];
}

/** Estimativa usada quando o backend não informa a contagem real (~4 caracteres por token). */
export function estimateTokens(text: string): number {
  return text ? Math.max(1, Math.round(text.length / 4)) : 0;
}
