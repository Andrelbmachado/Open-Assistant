/** Rostos disponíveis para o modo voz. */
export const ORBITAL_SKINS = ["robot", "super", "tentacles", "sphere", "atom"] as const;
export type OrbitalSkin = (typeof ORBITAL_SKINS)[number];
/** Skins desenhadas pelo canvas de partículas original. */
export type ParticleSkin = Extract<OrbitalSkin, "tentacles" | "sphere" | "atom">;

export const ORBITAL_SKIN_LABELS: Record<OrbitalSkin, string> = {
  robot: "Robô",
  super: "Super orbital",
  tentacles: "Tentáculos",
  sphere: "Esfera",
  atom: "Átomo",
};

/** Estados do rosto (ouvindo, pensando, falando…). */
export const ORBITAL_STATES = ["idle", "listening", "processing", "speaking", "error"] as const;
export type OrbitalState = (typeof ORBITAL_STATES)[number];

export type OrbitalEvent = "voice-start" | "voice-end" | "request-start" | "speech-start" | "speech-end" | "error" | "reset";

/** Rosto padrão. */
export const DEFAULT_ORBITAL_SKIN: OrbitalSkin = "robot";

export interface OrbitalMotion {
  geometry: "wave" | "orbit" | "tentacle";
  intensity: number;
  speed: number;
  color: string;
}

/** Valida uma skin restaurada do localStorage. */
export function isOrbitalSkin(value: unknown): value is OrbitalSkin {
  return typeof value === "string" && (ORBITAL_SKINS as readonly string[]).includes(value);
}

/** Estado do rosto depois de um evento de voz/geração. */
export function nextOrbitalState(event: OrbitalEvent): OrbitalState {
  const states: Record<OrbitalEvent, OrbitalState> = {
    "voice-start": "listening",
    "voice-end": "processing",
    "request-start": "processing",
    "speech-start": "speaking",
    "speech-end": "idle",
    error: "error",
    reset: "idle",
  };
  return states[event];
}

/** Legenda exibida sob o rosto. */
export function activityLabel(state: OrbitalState) {
  const labels: Record<OrbitalState, string> = {
    idle: "Pode falar",
    listening: "Ouvindo…",
    processing: "Pensando…",
    speaking: "Falando…",
    error: "Algo deu errado",
  };
  return labels[state];
}

/** Só envia a transcrição se não houve erro e há texto. */
export function shouldProcessVoiceTranscript(hadRecognitionError: boolean, transcript: string) {
  return !hadRecognitionError && Boolean(transcript.trim());
}

/** Volume simulado para animar o rosto quando não há áudio real. */
export function simulatedAudioLevel(state: OrbitalState, timeMs: number) {
  const phase = timeMs / 260;
  const wave = (Math.sin(phase) + Math.sin(phase * 1.71 + .4) + 2) / 4;
  if (state === "idle") return .035 + wave * .035;
  if (state === "listening") return .12 + wave * .36;
  if (state === "processing") return .22 + wave * .2;
  if (state === "speaking") return .18 + wave * .68;
  return .1 + wave * .18;
}

/** Parâmetros de movimento das partículas para skin + estado + volume. */
export function getOrbitalMotion(skin: ParticleSkin, state: OrbitalState, audioLevel = 0): OrbitalMotion {
  const level = Math.max(0, Math.min(1, audioLevel));
  const activity = state === "idle" ? .16 : state === "processing" ? .58 : state === "error" ? .7 : .42 + level * .58;
  const stateBoost = state === "speaking" ? .25 : state === "listening" ? .12 : 0;
  const base = skin === "tentacles" ? 1.1 : skin === "atom" ? .94 : .76;
  return {
    geometry: skin === "sphere" ? "wave" : skin === "atom" ? "orbit" : "tentacle",
    intensity: Math.min(1, activity * base + stateBoost),
    speed: (.25 + activity * 1.65) * base,
    color: state === "error" ? "#ff5c57" : skin === "atom" ? "#94b7ff" : skin === "sphere" ? "#5ca7ff" : "#29b6ff",
  };
}
