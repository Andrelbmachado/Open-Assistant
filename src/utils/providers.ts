export interface ProviderConfig {
  id: string;
  name: string;
  kind: "builtin" | "custom";
  baseUrl?: string;
  defaultModel: string;
  /** Outros modelos oferecidos no seletor (o padrão vem primeiro). */
  models?: string[];
  enabled?: boolean;
}

/** Id estável de um provedor a partir do nome (minúsculas, hífens). */
export function createProviderId(name: string): string {
  return name.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Erro de validação de um provedor customizado, ou undefined se ok. */
export function validateProviderConfig(config: ProviderConfig): string | undefined {
  if (!config.name.trim()) return "Informe o nome do provedor.";
  if (!config.defaultModel.trim()) return "Informe o modelo padrão.";
  if (config.kind === "custom") {
    try { const url = new URL(config.baseUrl ?? ""); if (!/^https?:$/.test(url.protocol)) throw new Error(); }
    catch { return "Informe uma URL HTTP(S) compatível com OpenAI."; }
  }
}
