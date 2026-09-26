/**
 * Detecta quando a pessoa começa a falar por cima do robô (para cortar a fala e ouvir).
 * Compara o volume do microfone com o da própria fala do robô: o eco que sobra depois do
 * cancelamento de eco não pode disparar sozinho.
 */
export interface BargeInOptions {
  /** Volume mínimo do microfone (0–1, mesma escala do `onLevel` da captura). */
  minLevel: number;
  /** Fração do volume da fala do robô que o microfone precisa passar. */
  echoRatio: number;
  /** Teto da exigência de volume (a pessoa sempre consegue interromper). */
  maxRequired: number;
  /** Fala contínua necessária para interromper. */
  holdMs: number;
  /** Ignora o começo da fala do robô (o eco inicial ainda não foi cancelado). */
  graceMs: number;
}

export const DEFAULT_BARGE_IN: BargeInOptions = { minLevel: .2, echoRatio: .7, maxRequired: .8, holdMs: 280, graceMs: 450 };

export class BargeInDetector {
  private elapsed = 0;
  private voiced = 0;

  constructor(private readonly options: BargeInOptions = DEFAULT_BARGE_IN) {}

  /** Um bloco de áudio: `mic` e `speech` em 0–1. Devolve true quando a pessoa interrompeu. */
  push(mic: number, speech: number, durationMs: number): boolean {
    this.elapsed += durationMs;
    if (this.elapsed < this.options.graceMs) return false;
    // O volume do robô é o da saída digital, não o eco que chega ao microfone (o cancelamento de eco
    // tira quase tudo): a exigência tem teto, senão ninguém conseguiria interromper uma fala alta.
    const required = Math.min(this.options.maxRequired, Math.max(this.options.minLevel, speech * this.options.echoRatio + .1));
    const loudEnough = mic >= required;
    // Pequenas quedas no meio de uma palavra não zeram a contagem.
    this.voiced = loudEnough ? this.voiced + durationMs : Math.max(0, this.voiced - durationMs * 2);
    return this.voiced >= this.options.holdMs;
  }
}
