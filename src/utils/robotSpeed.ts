/**
 * Velocidade com que o robô anda pela tela carregando pastas e janelas (px/s), escolhida pelo usuário no
 * menu "+" do compositor. O Rust (`choreo.rs::robot_set_speed`) usa a mesma escala e os mesmos limites.
 */
export interface RobotSpeedLevel { label: string; speed: number }

export const ROBOT_SPEEDS: readonly RobotSpeedLevel[] = [
  { label: "Bem devagar", speed: 90 },
  { label: "Devagar", speed: 150 },
  { label: "Normal", speed: 240 },
  { label: "Rápido", speed: 420 },
  { label: "Muito rápido", speed: 720 },
];

export const DEFAULT_ROBOT_SPEED = 150;
const MIN = 60;
const MAX = 900;

/** Degrau do slider mais perto da velocidade salva. */
export function robotSpeedIndex(speed: number): number {
  let best = 0;
  ROBOT_SPEEDS.forEach((level, index) => { if (Math.abs(level.speed - speed) < Math.abs(ROBOT_SPEEDS[best].speed - speed)) best = index; });
  return best;
}

export function restoreRobotSpeed(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(MAX, Math.max(MIN, Math.round(value))) : DEFAULT_ROBOT_SPEED;
}

/** Quanto tempo leva para atravessar uma tela Full HD (1.400 px) andando nessa velocidade, em segundos
 * (com o tempo de acelerar e frear, igual a `choreo.rs::Gait::walk_ms`). */
export function crossingSeconds(speed: number): number {
  return Math.round(1400 / speed / .79 + .25);
}
