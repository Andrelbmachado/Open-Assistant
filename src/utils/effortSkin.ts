/** Visuais do slider de esforço no nível Ultra (Configurações › Aparência). */
export const EFFORT_SKINS = ["plasma", "choque", "fogo", "agua", "fumaca", "quadrados"] as const;
export type EffortSkin = (typeof EFFORT_SKINS)[number];

export const DEFAULT_EFFORT_SKIN: EffortSkin = "plasma";

export const EFFORT_SKIN_LABELS: Record<EffortSkin, string> = {
  plasma: "Plasma",
  choque: "Choque",
  fogo: "Fogo",
  agua: "Água",
  fumaca: "Fumaça",
  quadrados: "Quadrados",
};

export function isEffortSkin(value: unknown): value is EffortSkin {
  return typeof value === "string" && (EFFORT_SKINS as readonly string[]).includes(value);
}

/**
 * Efeito comum a todos os visuais: a fonte fica presa à direita (no botão do slider) e o
 * conteúdo é puxado para a esquerda, perdendo força. `u` vai de 0 (esquerda) a 1 (botão).
 */
export function pullEnvelope(u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  return Math.min(1, Math.pow(clamped, 1.6) * .85 + Math.exp(-(1 - clamped) * 9) * .6);
}

/** Posição de um padrão que escorre para a esquerda: cresce com o tempo, então o desenho anda para trás. */
export function leftwardPhase(u: number, time: number, speed: number): number {
  return u + time * speed;
}
