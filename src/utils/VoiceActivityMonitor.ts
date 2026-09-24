export class VoiceActivityMonitor {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private frame = 0;

  async start(onLevel: (level: number) => void) {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.context = new AudioContext();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      const source = this.context.createMediaStreamSource(this.stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        const sum = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0);
        onLevel(Math.min(1, sum / samples.length / 32));
        this.frame = requestAnimationFrame(measure);
      };
      measure();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
