type RecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global { interface Window { webkitSpeechRecognition?: RecognitionConstructor; SpeechRecognition?: RecognitionConstructor } }

export interface SpeechLifecycle {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onBoundary?: () => void;
}

export class SpeechController {
  private recognition: InstanceType<RecognitionConstructor> | null = null;

  speak(text: string, lifecycle: SpeechLifecycle = {}) {
    if (typeof globalThis.speechSynthesis === "undefined" || typeof globalThis.SpeechSynthesisUtterance === "undefined") {
      lifecycle.onError?.("Síntese de voz não está disponível neste WebView2.");
      return () => undefined;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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

  listen(onText: (text: string) => void, onEnd: () => void, onError: (message: string) => void) {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { onError("Reconhecimento de voz não está disponível neste WebView2."); return; }
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let value = "";
      for (let index = 0; index < event.results.length; index++) value += event.results[index][0].transcript;
      onText(value);
    };
    recognition.onerror = (event) => onError(`Falha no microfone: ${event.error}`);
    recognition.onend = onEnd;
    this.recognition = recognition;
    recognition.start();
  }

  stopListening() { this.recognition?.stop(); }

  stopSpeaking() {
    if (typeof globalThis.speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
}
