/**
 * Modelos em nuvem no seletor do chat. O valor salvo no chat é `Nuvem: <provedor>/<modelo>`;
 * a chave de API fica no Gerenciador de Credenciais e só o Rust a lê (`cloud_chat`).
 */
import { createProviderId, type ProviderConfig } from "./providers";

export const CLOUD_MODEL_PREFIX = "Nuvem: ";

/** Provedores internos, o modelo padrão e os outros modelos oferecidos no seletor. */
export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  { name: "OpenAI", models: ["gpt-5", "gpt-5-mini"] },
  { name: "Anthropic", models: ["claude-sonnet-5", "claude-opus-5-5", "claude-haiku-4-5"] },
  { name: "Google", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { name: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { name: "Perplexity", models: ["sonar", "sonar-pro"] },
  { name: "Together AI", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"] },
  { name: "Fireworks", models: ["accounts/fireworks/models/llama-v3p3-70b-instruct"] },
].map(({ name, models }) => ({ id: createProviderId(name), name, kind: "builtin", defaultModel: models[0], models }));

/** Nome amigável no seletor: "ChatGPT · gpt-5", "Gemini · gemini-2.5-flash". */
export const CLOUD_PRODUCT_NAMES: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", google: "Gemini", deepseek: "DeepSeek", perplexity: "Perplexity", "together-ai": "Together AI", fireworks: "Fireworks" };

/** Formato da chave, para o placeholder do campo em Provedores. */
export const KEY_PLACEHOLDERS: Record<string, string> = { openai: "sk-proj-••••••••••••", anthropic: "sk-ant-••••••••••••", google: "AIza••••••••••••••••", deepseek: "sk-••••••••••••••••", perplexity: "pplx-••••••••••••" };

/** Página onde o usuário cria a chave de cada provedor. */
export const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google: "https://aistudio.google.com/apikey",
  deepseek: "https://platform.deepseek.com/api_keys",
  perplexity: "https://www.perplexity.ai/settings/api",
  "together-ai": "https://api.together.ai/settings/api-keys",
  fireworks: "https://fireworks.ai/account/api-keys",
};

/** Modelos de um provedor, sem repetição, com o padrão primeiro. */
export function providerModels(provider: ProviderConfig): string[] {
  return [...new Set([provider.defaultModel, ...(provider.models ?? [])].filter(Boolean))];
}

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
