/**
 * Detecta início e fim de fala a partir da energia (RMS) de cada bloco de áudio.
 * O limiar acompanha o ruído de fundo, então funciona com microfones mais "quentes" ou mais baixos.
 */
export interface EndpointerOptions {
  /** Silêncio depois da fala que encerra a frase. */
  silenceMs: number;
  /** Tempo máximo esperando o usuário começar a falar. */
  noSpeechMs: number;
  /** Limite de uma frase. */
  maxMs: number;
  /** Fala contínua mínima para contar como início (ignora cliques e estalos). */
  minSpeechMs: number;
}

export type EndpointEvent = "none" | "speech-start" | "speech-end" | "no-speech" | "max-length";

/** Tempos padrão do modo voz. */
export const DEFAULT_ENDPOINTER: EndpointerOptions = { silenceMs: 900, noSpeechMs: 8000, maxMs: 30000, minSpeechMs: 150 };

const MIN_THRESHOLD = 0.012;

/** Máquina de estados de início/fim de fala; alimente com `push(rms, ms)` a cada bloco. */
export class Endpointer {
  private elapsed = 0;
  private noiseFloor = 0.01;
  private voicedRun = 0;
  private silenceRun = 0;
  private started = false;
  private finished = false;

  constructor(private readonly options: EndpointerOptions = DEFAULT_ENDPOINTER) {}

  get speaking(): boolean { return this.started && !this.finished; }

  threshold(): number {
    return Math.max(MIN_THRESHOLD, this.noiseFloor * 3);
  }

  /** Processa um bloco de `durationMs` com energia `rms` (0–1). */
  push(rms: number, durationMs: number): EndpointEvent {
    if (this.finished) return "none";
    this.elapsed += durationMs;
    const voiced = rms > this.threshold();
    if (!voiced) {
      // Ruído de fundo: sobe devagar e desce rápido, para não "aprender" a própria voz.
      this.noiseFloor = rms < this.noiseFloor ? this.noiseFloor * 0.7 + rms * 0.3 : this.noiseFloor * 0.98 + rms * 0.02;
    }
    if (!this.started) {
      this.voicedRun = voiced ? this.voicedRun + durationMs : 0;
      if (this.voicedRun >= this.options.minSpeechMs) {
        this.started = true;
        return "speech-start";
      }
      if (this.elapsed >= this.options.noSpeechMs) { this.finished = true; return "no-speech"; }
      return "none";
    }
    this.silenceRun = voiced ? 0 : this.silenceRun + durationMs;
    if (this.silenceRun >= this.options.silenceMs) { this.finished = true; return "speech-end"; }
    if (this.elapsed >= this.options.maxMs) { this.finished = true; return "max-length"; }
    return "none";
  }
}

/** Energia (raiz da média dos quadrados) de um bloco de áudio. */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index++) sum += samples[index] * samples[index];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
