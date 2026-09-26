/** Escala das fontes do app (Configurações › Aparência). 1 = tamanho do design. */
export interface FontScale {
  title: number;
  subtitle: number;
  body: number;
}

export type FontScaleKey = keyof FontScale;

export const DEFAULT_FONT_SCALE: FontScale = { title: 1, subtitle: 1, body: 1 };
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.4;
export const FONT_SCALE_STEP = 0.05;

/** Limita a escala à faixa aceita e arredonda ao passo do controle. */
export function clampFontScale(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 1;
  const stepped = Math.round(number / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(stepped.toFixed(2))));
}

/** Restaura a escala salva no localStorage, descartando valores inválidos. */
export function restoreFontScale(value: unknown): FontScale {
  const stored = value && typeof value === "object" ? value as Partial<Record<FontScaleKey, unknown>> : {};
  return { title: clampFontScale(stored.title ?? 1), subtitle: clampFontScale(stored.subtitle ?? 1), body: clampFontScale(stored.body ?? 1) };
}

/** Variáveis CSS usadas por todo `font-size` do app: `calc(Npx * var(--fs-body))`. */
export function fontScaleVariables(scale: FontScale): Record<`--fs-${FontScaleKey}`, string> {
  return { "--fs-title": String(scale.title), "--fs-subtitle": String(scale.subtitle), "--fs-body": String(scale.body) };
}
