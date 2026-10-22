/**
 * Custo estimado por mensagem dos modelos em nuvem, para o usuário comparar antes de escolher.
 * Os preços são públicos (US$ por 1 milhão de tokens, entrada/saída) e mudam com o tempo — por isso
 * o rótulo diz "estimativa". O cálculo é propositalmente simples: assume uma troca típica
 * (`TYPICAL_INPUT_TOKENS` de entrada + `TYPICAL_OUTPUT_TOKENS` de saída) só para dar ordem de grandeza.
 *
 * A chave é `"<providerId>/<model>"`; modelos sem preço conhecido não mostram estimativa.
 */

/** Preço público em US$ por 1 milhão de tokens. */
export interface TokenPrice {
  input: number;
  output: number;
}

/** Troca de exemplo usada só para a estimativa (uma pergunta curta e uma resposta média). */
export const TYPICAL_INPUT_TOKENS = 1000;
export const TYPICAL_OUTPUT_TOKENS = 1000;

/**
 * Tabela de preços por `"<providerId>/<model>"` (US$ / 1M tokens). Valores de referência de out/2026;
 * servem para comparar modelos, não para cobrança. Atualize quando os provedores mudarem os preços.
 */
export const CLOUD_PRICES: Record<string, TokenPrice> = {
  // OpenAI
  "openai/gpt-5": { input: 1.25, output: 10 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  // Anthropic
  "anthropic/claude-sonnet-5": { input: 3, output: 15 },
  "anthropic/claude-opus-5-5": { input: 15, output: 75 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5 },
  // Google
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  // DeepSeek
  "deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek/deepseek-reasoner": { input: 0.55, output: 2.19 },
  // Perplexity
  "perplexity/sonar": { input: 1, output: 1 },
  "perplexity/sonar-pro": { input: 3, output: 15 },
  // Together AI
  "together-ai/meta-llama/Llama-3.3-70B-Instruct-Turbo": { input: 0.88, output: 0.88 },
  // Fireworks
  "fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct": { input: 0.9, output: 0.9 },
  // OpenRouter (mesmos modelos dos provedores diretos; preço com a margem do roteador)
  "openrouter/openai/gpt-5-mini": { input: 0.25, output: 2 },
  "openrouter/anthropic/claude-sonnet-5": { input: 3, output: 15 },
  "openrouter/google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "openrouter/deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
};

/** Preço de um modelo pela dupla provedor/modelo, ou undefined se não houver na tabela. */
export function priceFor(providerId: string, model: string): TokenPrice | undefined {
  return CLOUD_PRICES[`${providerId}/${model}`];
}

/**
 * Custo estimado em US$ de uma mensagem típica neste modelo (entrada + saída de exemplo).
 * Retorna undefined quando o preço é desconhecido.
 */
export function estimateMessageCostUsd(providerId: string, model: string): number | undefined {
  const price = priceFor(providerId, model);
  if (!price) return undefined;
  return (price.input * TYPICAL_INPUT_TOKENS + price.output * TYPICAL_OUTPUT_TOKENS) / 1_000_000;
}

/**
 * Rótulo curto do custo por mensagem para o seletor de modelos (ex.: "~US$ 0,01/msg",
 * "menos de US$ 0,01/msg"). Vazio quando o preço é desconhecido.
 */
export function formatMessageCost(providerId: string, model: string): string {
  const usd = estimateMessageCostUsd(providerId, model);
  if (usd === undefined) return "";
  if (usd < 0.01) return "menos de US$ 0,01/msg";
  return `~US$ ${usd.toFixed(2).replace(".", ",")}/msg`;
}
