import { DEFAULT_ENDPOINTER, Endpointer, rms, type EndpointerOptions } from "./endpointer";

export interface CaptureResult {
  samples: Float32Array;
  sampleRate: number;
  /** Por que a gravação parou. */
  reason: "speech-end" | "max-length" | "no-speech" | "stopped";
}

export interface CaptureCallbacks {
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onFinish: (result: CaptureResult) => void;
}

/** Traduz os erros do getUserMedia para algo que o usuário consiga resolver. */
export function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : (error as { name?: string })?.name;
  switch (name) {
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhum microfone foi encontrado. Conecte um microfone e escolha-o em Configurações › Voz.";
    case "NotAllowedError":
    case "SecurityError":
      return "O acesso ao microfone foi negado. No Windows, abra Configurações › Privacidade › Microfone e permita aplicativos da área de trabalho.";
    case "NotReadableError":
    case "AbortError":
      return "O Windows não liberou o microfone: ele pode estar em uso exclusivo por outro programa. Feche o outro app ou escolha outro microfone em Configurações › Voz.";
    case "OverconstrainedError":
      return "O microfone escolhido não está mais conectado. Escolha outro em Configurações › Voz.";
    default:
      return `Não foi possível abrir o microfone: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const TARGET_RATE = 16000;

/**
 * Captura do microfone em mono 16 kHz (o sherpa-onnx reamostra se o WebView2 recusar
 * a taxa pedida) e para sozinha quando a pessoa termina de falar.
 */
export class VoiceCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private callbacks: CaptureCallbacks | null = null;
  private endpointer = new Endpointer();

  get active(): boolean { return Boolean(this.context); }

  async start(callbacks: CaptureCallbacks, deviceId?: string, options: EndpointerOptions = DEFAULT_ENDPOINTER): Promise<void> {
    this.stop("stopped", false);
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este WebView2 não permite acesso ao microfone.");
    const audio = (exact?: string): MediaTrackConstraints => ({ deviceId: exact ? { exact } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audio(deviceId) });
    } catch (error) {
      // O microfone salvo sumiu (desconectado ou trocado): tenta o padrão do Windows.
      if (!deviceId || (error as { name?: string })?.name !== "OverconstrainedError") throw new Error(describeMicError(error));
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: audio() }); }
      catch (fallback) { throw new Error(describeMicError(fallback)); }
    }
    let context: AudioContext;
    try { context = new AudioContext({ sampleRate: TARGET_RATE }); }
    catch { context = new AudioContext(); }
    this.context = context;
    this.callbacks = callbacks;
    this.chunks = [];
    this.endpointer = new Endpointer(options);
    const source = context.createMediaStreamSource(this.stream);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const blockMs = (1024 / context.sampleRate) * 1000;
    processor.onaudioprocess = (event) => {
      if (!this.context) return;
      const input = new Float32Array(event.inputBuffer.getChannelData(0));
      this.chunks.push(input);
      const energy = rms(input);
      this.callbacks?.onLevel?.(Math.min(1, energy * 8));
      const endpoint = this.endpointer.push(energy, blockMs);
      if (endpoint === "speech-start") this.callbacks?.onSpeechStart?.();
      else if (endpoint !== "none") this.stop(endpoint, true);
    };
    source.connect(processor);
    // O ScriptProcessor só roda conectado ao destino; ele devolve silêncio.
    processor.connect(context.destination);
    this.processor = processor;
    if (context.state === "suspended") await context.resume().catch(() => undefined);
  }

  /** Encerra a captura; com `notify`, entrega o áudio gravado em `onFinish`. */
  stop(reason: CaptureResult["reason"] = "stopped", notify = true) {
    const context = this.context;
    if (!context) return;
    const callbacks = this.callbacks;
    const sampleRate = context.sampleRate;
    this.context = null;
    this.callbacks = null;
    if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); }
    this.processor = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void context.close().catch(() => undefined);
    const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    callbacks?.onLevel?.(0);
    if (notify) callbacks?.onFinish({ samples, sampleRate, reason });
  }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  // "default"/"communications" são apelidos do Windows para um dos dispositivos reais.
  return devices.filter((device) => device.kind === "audioinput" && device.deviceId !== "communications");
}
