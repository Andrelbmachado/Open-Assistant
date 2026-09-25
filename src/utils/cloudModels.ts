/**
 * Modelos em nuvem no seletor do chat. O valor salvo no chat é `Nuvem: <provedor>/<modelo>`;
 * a chave de API fica no Gerenciador de Credenciais e só o Rust a lê (`cloud_chat`).
 */
import { createProviderId, type ProviderConfig } from "./providers";

export const CLOUD_MODEL_PREFIX = "Nuvem: ";

/** Provedores internos e o modelo usado por padrão em cada um. */
export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  { name: "OpenAI", defaultModel: "gpt-5" },
  { name: "Anthropic", defaultModel: "claude-sonnet-5" },
  { name: "DeepSeek", defaultModel: "deepseek-chat" },
  { name: "Perplexity", defaultModel: "sonar" },
  { name: "Together AI", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { name: "Fireworks", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
].map(({ name, defaultModel }) => ({ id: createProviderId(name), name, kind: "builtin", defaultModel }));

/** Nome amigável no seletor: "ChatGPT (GPT-5)", "Claude (Sonnet 5)". */
export const CLOUD_PRODUCT_NAMES: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", deepseek: "DeepSeek", perplexity: "Perplexity", "together-ai": "Together AI", fireworks: "Fireworks" };

export function cloudModelValue(providerId: string, model: string): string {
  return `${CLOUD_MODEL_PREFIX}${providerId}/${model}`;
}

/** `Nuvem: openai/gpt-5` → `{ providerId: "openai", model: "gpt-5" }` (o modelo pode conter "/"). */
export function parseCloudModel(value: string | undefined): { providerId: string; model: string } | undefined {
  if (!value?.startsWith(CLOUD_MODEL_PREFIX)) return undefined;
  const rest = value.slice(CLOUD_MODEL_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return undefined;
  return { providerId: rest.slice(0, slash), model: rest.slice(slash + 1) };
}

/** Provedores customizados salvos pela aba Provedores. */
export function loadCustomProviders(): ProviderConfig[] {
  try { return JSON.parse(localStorage.getItem("open-assistant-custom-providers") ?? "[]"); }
  catch { return []; }
}

export function allCloudProviders(): ProviderConfig[] {
  return [...BUILTIN_PROVIDERS, ...loadCustomProviders().filter((provider) => provider.defaultModel)];
}

export function cloudDisplayName(value: string): string | undefined {
  const parsed = parseCloudModel(value);
  if (!parsed) return undefined;
  const product = CLOUD_PRODUCT_NAMES[parsed.providerId] ?? allCloudProviders().find((item) => item.id === parsed.providerId)?.name ?? parsed.providerId;
  return `${product} · ${parsed.model}`;
}
