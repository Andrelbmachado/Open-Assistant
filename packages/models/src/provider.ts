import type { ModelProvider, ProviderId } from "@open-assistant/shared";

/** Holds the available providers and the active one. Switching is instant. */
export class ProviderRegistry {
  private providers = new Map<ProviderId, ModelProvider>();

  register(p: ModelProvider): void {
    this.providers.set(p.id, p);
  }
  get(id: ProviderId): ModelProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Provider "${id}" not registered`);
    return p;
  }
  list(): ModelProvider[] {
    return [...this.providers.values()];
  }
}
