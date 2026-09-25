/** Níveis do slider de esforço do menu +, do mais rápido ao mais inteligente. */
export const EFFORT_LEVELS = ["fast", "medium", "high", "max", "ultra"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const DEFAULT_EFFORT: EffortLevel = "fast";

export interface EffortInfo {
  label: string;
  description: string;
  /** Liga o raciocínio (`think`) em modelos que o suportam. */
  think: boolean;
  /** Nível aceito por modelos com raciocínio graduado (gpt-oss). */
  thinkLevel?: "low" | "medium" | "high";
  /** Instrução extra no prompt de sistema para aprofundar o raciocínio. */
  instruction?: string;
}

export const EFFORT_INFO: Record<EffortLevel, EffortInfo> = {
  fast: { label: "Rápido", description: "Responde direto, sem raciocínio.", think: false },
  medium: { label: "Médio", description: "Raciocínio breve antes de responder.", think: true, thinkLevel: "low" },
  high: { label: "Alto", description: "Pensa com cuidado nos detalhes.", think: true, thinkLevel: "medium", instruction: "Pense com cuidado antes de responder." },
  max: { label: "Máximo", description: "Raciocina passo a passo e revisa.", think: true, thinkLevel: "high", instruction: "Raciocine passo a passo e revise a resposta antes de entregá-la." },
  ultra: { label: "Ultra", description: "Explora alternativas e verifica cada etapa.", think: true, thinkLevel: "high", instruction: "Use o máximo de raciocínio: explore abordagens alternativas, verifique cada etapa, procure erros no próprio raciocínio e só então entregue a melhor resposta." },
};

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function effortIndex(level: EffortLevel): number {
  return EFFORT_LEVELS.indexOf(level);
}

export function effortAt(index: number): EffortLevel {
  const clamped = Math.min(EFFORT_LEVELS.length - 1, Math.max(0, Math.round(index)));
  return EFFORT_LEVELS[clamped];
}
