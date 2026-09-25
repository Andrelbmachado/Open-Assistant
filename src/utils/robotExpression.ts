import type { OrbitalState } from "./orbitalState";

/** Variações visuais do rosto do assistente enquanto conversa. */
export const ROBOT_EXPRESSIONS = ["idle", "talking", "stopping", "whisper", "shouting", "calm", "fast", "angry"] as const;
export type RobotExpression = (typeof ROBOT_EXPRESSIONS)[number];

export const ROBOT_EXPRESSION_LABELS: Record<RobotExpression, string> = {
  idle: "Parado",
  talking: "Conversando",
  stopping: "Parando de falar",
  whisper: "Falando baixinho",
  shouting: "Gritando",
  calm: "Calmo",
  fast: "Acelerado",
  angry: "Bravo",
};

const ANGRY_WORDS = /\b(raiva|irritad\w*|furios\w*|absurd\w*|inaceit[aá]vel|odeio|droga|bravo|brava|chega)\b/i;
const WHISPER_WORDS = /\b(baixinho|sussurr\w*|segredo|shh+|psiu|em sil[eê]ncio)\b/i;
const CALM_WORDS = /\b(calma|calmamente|tranquil\w*|respire|relax\w*|sem pressa|devagar|serenidade)\b/i;
const FAST_WORDS = /\b(r[aá]pido|urgente|depressa|corre|correndo|agora mesmo|imediatamente|acelerad\w*)\b/i;

/** Escolhe a variação do rosto a partir do texto que será falado. */
export function detectSpeechExpression(text: string): RobotExpression {
  const trimmed = text.trim();
  if (!trimmed) return "talking";
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  const exclamations = (trimmed.match(/!/g) ?? []).length;
  const shouting = (letters.length >= 8 && upper / letters.length > .6) || exclamations >= 3;
  if (ANGRY_WORDS.test(trimmed)) return "angry";
  if (shouting) return "shouting";
  if (WHISPER_WORDS.test(trimmed) || /^\(.*\)$/s.test(trimmed)) return "whisper";
  if (FAST_WORDS.test(trimmed) || trimmed.length > 700) return "fast";
  if (CALM_WORDS.test(trimmed) || /\.\.\.|…/.test(trimmed)) return "calm";
  return "talking";
}

/** Parâmetros contínuos do shader do robô; o componente interpola entre eles. */
export interface RobotPose {
  /** Cor do lado esquerdo e direito do visor (RGB 0–1). */
  colorA: [number, number, number];
  colorB: [number, number, number];
  rim: [number, number, number];
  brightness: number;
  eyeHeight: number;
  eyeWidth: number;
  /** 0 = barras, 1 = arcos "^ ^" (sorriso nos olhos). */
  eyeHappy: number;
  /** 0 = barras, 1 = chevrons "> <". */
  eyeSquint: number;
  /** Inclinação das barras: positivo = sobrancelha brava. */
  eyeTilt: number;
  /** Abertura máxima da boca e frequência das sílabas (Hz). */
  mouthAmp: number;
  mouthWidth: number;
  syllableHz: number;
  shake: number;
  particles: number;
  scan: number;
  glow: number;
}

const TEAL: [number, number, number] = [.2, .92, .86];
const VIOLET: [number, number, number] = [.62, .42, 1];
const RIM_BLUE: [number, number, number] = [.34, .36, .95];

const BASE_POSE: RobotPose = {
  colorA: TEAL, colorB: VIOLET, rim: RIM_BLUE, brightness: .85,
  eyeHeight: 1, eyeWidth: 1, eyeHappy: 0, eyeSquint: 0, eyeTilt: 0,
  mouthAmp: 0, mouthWidth: 1, syllableHz: 8, shake: 0, particles: .08, scan: 0, glow: .55,
};

const EXPRESSION_POSES: Record<RobotExpression, Partial<RobotPose>> = {
  idle: {},
  talking: { mouthAmp: .62, particles: .35, brightness: .95, glow: .7 },
  stopping: { mouthAmp: 0, particles: .12, brightness: .88 },
  whisper: { mouthAmp: .24, mouthWidth: .62, syllableHz: 6.5, brightness: .5, eyeHeight: .5, particles: .04, glow: .3, colorA: [.18, .62, .8], colorB: [.42, .34, .82] },
  shouting: { mouthAmp: 1, mouthWidth: 1.5, syllableHz: 7, brightness: 1.25, eyeSquint: 1, shake: .5, particles: 1, glow: 1.2, colorA: [.35, .95, 1], colorB: [.95, .45, 1] },
  calm: { mouthAmp: .42, mouthWidth: .9, syllableHz: 4.4, eyeHappy: 1, brightness: .82, particles: .18, glow: .55, colorA: [.2, .86, .78], colorB: [.36, .6, 1] },
  fast: { mouthAmp: .58, syllableHz: 13, brightness: 1.05, particles: .7, glow: .85, eyeHeight: 1.08 },
  angry: { mouthAmp: .82, mouthWidth: 1.25, syllableHz: 9, eyeTilt: 1, eyeHeight: .74, shake: .35, brightness: 1.15, particles: .5, glow: 1, colorA: [1, .22, .16], colorB: [1, .5, .2], rim: [1, .2, .2] },
};

/** Pose final para um estado da conversa combinado com a expressão falada. */
export function robotPose(state: OrbitalState, expression: RobotExpression): RobotPose {
  if (state === "error") return { ...BASE_POSE, ...EXPRESSION_POSES.angry, mouthAmp: 0, shake: .25, particles: .15 };
  if (state === "listening") return { ...BASE_POSE, eyeHeight: 1.14, eyeWidth: 1.08, brightness: 1, glow: .75, particles: .15 };
  if (state === "processing") return { ...BASE_POSE, eyeHeight: .9, scan: 1, brightness: .95, glow: .7, particles: .25 };
  if (state === "speaking") return { ...BASE_POSE, ...EXPRESSION_POSES[expression === "idle" || expression === "stopping" ? "talking" : expression] };
  return { ...BASE_POSE, ...EXPRESSION_POSES[expression === "stopping" ? "stopping" : "idle"] };
}
