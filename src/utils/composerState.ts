export type ComposerPopover = "quick" | "project" | "meter";

export interface GenerationMetric {
  chatId: string;
  model: string;
  tokensPerSecond: number;
}

/** Alterna o popover do compositor (clicar no mesmo fecha). */
export function nextComposerPopover(current: ComposerPopover | null, requested: ComposerPopover): ComposerPopover | null {
  return current === requested ? null : requested;
}

/** tok/s da última resposta, só se for do mesmo chat e modelo. */
export function getVisibleTokensPerSecond(metric: GenerationMetric | undefined, chatId: string, model: string): number | undefined {
  return metric?.chatId === chatId && metric.model === model ? metric.tokensPerSecond : undefined;
}
