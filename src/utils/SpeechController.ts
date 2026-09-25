import { invoke } from "@tauri-apps/api/core";
import { speechChunks, textForSpeech } from "./speechText";
import { SYSTEM_VOICE_ID } from "./toolCatalog";

export interface SpeechLifecycle {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onBoundary?: () => void;
  /** Volume real da fala (0–1), para animar o rosto em vozes locais. */
  onLevel?: (level: number) => void;
  /** `system` (voz do Windows) ou o id de uma voz Piper instalada. */
  voiceId?: string;
}

export interface Transcription { text: string; elapsedMs: number }

/** Transcreve no backend (sherpa-onnx); o WebView2 não tem reconhecimento de voz offline. */
export function transcribe(samples: Float32Array, sampleRate: number, modelId: string, language = "pt"): Promise<Transcription> {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return invoke<Transcription>("asr_transcribe", bytes, { headers: { "x-model": modelId, "x-sample-rate": String(Math.round(sampleRate)), "x-language": language } });
}

/** Gera WAV com uma voz Piper instalada (`tts_synthesize`). */
export function synthesize(voiceId: string, text: string, speed = 1): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("tts_synthesize", { voiceId, text, speed });
}

/** Fala respostas (voz do Windows ou Piper) com eventos de início/fim/volume para o rosto. */
export class SpeechController {
  private stopLocal: (() => void) | null = null;

  speak(text: string, lifecycle: SpeechLifecycle = {}) {
    this.stopLocal?.();
    if (lifecycle.voiceId && lifecycle.voiceId !== SYSTEM_VOICE_ID) {
      if (typeof globalThis.speechSynthesis !== "undefined") speechSynthesis.cancel();
      return this.speakLocal(text, lifecycle.voiceId, lifecycle);
    }
    if (typeof globalThis.speechSynthesis === "undefined" || typeof globalThis.SpeechSynthesisUtterance === "undefined") {
      lifecycle.onError?.("Síntese de voz não está disponível neste WebView2.");
      return () => undefined;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textForSpeech(text) || text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    const preferred = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("pt-br"));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => lifecycle.onStart?.();
    utterance.onboundary = () => lifecycle.onBoundary?.();
    utterance.onend = () => lifecycle.onEnd?.();
    utterance.onerror = (event) => lifecycle.onError?.(`Falha na síntese de voz: ${event.error}`);
    speechSynthesis.speak(utterance);
    return () => speechSynthesis.cancel();
  }

  /** Voz Piper: sintetiza a próxima frase enquanto a atual toca. */
  private speakLocal(text: string, voiceId: string, lifecycle: SpeechLifecycle) {
    const chunks = speechChunks(textForSpeech(text));
    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    let frame = 0;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(context.destination);
    const levels = new Float32Array(analyser.fftSize);
    const measure = () => {
      analyser.getFloatTimeDomainData(levels);
      let sum = 0;
      for (const value of levels) sum += value * value;
      const level = Math.min(1, Math.sqrt(sum / levels.length) * 6);
      lifecycle.onLevel?.(level);
      if (level > 0.08) lifecycle.onBoundary?.();
      frame = requestAnimationFrame(measure);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      lifecycle.onLevel?.(0);
      void context.close().catch(() => undefined);
    };
    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      try { source?.stop(); } catch { /* já parou */ }
      finish();
      if (this.stopLocal === stop) this.stopLocal = null;
    };
    this.stopLocal = stop;

    const play = (buffer: AudioBuffer) => new Promise<void>((resolve) => {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      source.onended = () => resolve();
      source.start();
    });

    void (async () => {
      if (!chunks.length) { stop(); lifecycle.onEnd?.(); return; }
      try {
        let next = synthesize(voiceId, chunks[0]);
        for (let index = 0; index < chunks.length; index++) {
          const wav = await next;
          if (cancelled) return;
          if (index + 1 < chunks.length) next = synthesize(voiceId, chunks[index + 1]);
          const buffer = await context.decodeAudioData(wav.slice(0));
          if (cancelled) return;
          if (index === 0) { lifecycle.onStart?.(); measure(); }
          await play(buffer);
          if (cancelled) return;
        }
        stop();
        lifecycle.onEnd?.();
      } catch (error) {
        if (cancelled) return;
        stop();
        lifecycle.onError?.(`Falha na voz local: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return stop;
  }

  stopSpeaking() {
    this.stopLocal?.();
    if (typeof globalThis.speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
}
