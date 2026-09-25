export type ComposerPopover = "quick" | "project" | "meter";

export interface GenerationMetric {
  chatId: string;
  model: string;
  tokensPerSecond: number;
}

export function nextComposerPopover(current: ComposerPopover | null, requested: ComposerPopover): ComposerPopover | null {
  return current === requested ? null : requested;
}

export function getVisibleTokensPerSecond(metric: GenerationMetric | undefined, chatId: string, model: string): number | undefined {
  return metric?.chatId === chatId && metric.model === model ? metric.tokensPerSecond : undefined;
}
