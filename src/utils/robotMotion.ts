/**
 * Física do robô: o mesmo "corpo" no modo voz (passeando dentro do app) e no robô-mouse (fora do app).
 *
 * - `motionProfile`: viagem com duração fixa (robô-mouse). Sai do repouso acelerando, freia antes de
 *   chegar, passa um pouco do ponto e recua. Igual a `desktop.rs::motion_profile` (o Rust move a janela
 *   ou o ícone com a mesma curva, então o objeto anda junto com as mãos).
 * - `stepBody`: passeio livre (modo voz). Direção com aceleração limitada e chegada suave
 *   ("arrive"): começa a frear a `slowRadius` px do alvo.
 * - `stepWobble`: o rosto é preso ao corpo por uma mola; quando o corpo freia rápido, o rosto segue
 *   por inércia, passa do ponto e volta (o recuo).
 */

/** Tamanho único do robô (diâmetro do rosto, px lógicos) em todas as animações: modo voz, apontar, segurar. */
export const ROBOT_SIZE = 128;

export function motionProfile(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const zeta = .62;
  const omega = 7.4;
  const s = t * t * (3 - 2 * t) * .35 + t * .65;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  const value = 1 - Math.exp(-zeta * omega * s) * (Math.cos(damped * s) + (zeta * omega / damped) * Math.sin(damped * s));
  const settle = Math.min(1, Math.max(0, (t - .88) / .12));
  return value + (1 - value) * settle * settle;
}

/** Mesma conta de `desktop.rs::travel_ms`: duração da viagem por distância (px). */
export function travelMs(distance: number): number {
  return Math.round(Math.min(1150, Math.max(320, 260 + Math.sqrt(Math.max(0, distance)) * 22)));
}

export interface Vec { x: number; y: number }
export interface Body { x: number; y: number; vx: number; vy: number }
export interface BodyOptions { maxSpeed: number; maxAccel: number; slowRadius: number; response: number }

export const FLOAT_BODY: BodyOptions = { maxSpeed: 150, maxAccel: 260, slowRadius: 150, response: .35 };

/**
 * Um passo do corpo rumo ao alvo. Velocidade desejada cai linearmente dentro de `slowRadius`
 * (freia antes de chegar); a aceleração nunca passa de `maxAccel` (nada de arrancos).
 * Devolve o corpo novo e a aceleração usada (para a mola do rosto e a inclinação).
 */
export function stepBody(body: Body, target: Vec, dt: number, options: BodyOptions = FLOAT_BODY): { body: Body; accel: Vec } {
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  const distance = Math.hypot(dx, dy);
  const speed = distance < .5 ? 0 : Math.min(options.maxSpeed, options.maxSpeed * distance / options.slowRadius);
  const desired = distance < .5 ? { x: 0, y: 0 } : { x: dx / distance * speed, y: dy / distance * speed };
  let ax = (desired.x - body.vx) / options.response;
  let ay = (desired.y - body.vy) / options.response;
  const accel = Math.hypot(ax, ay);
  if (accel > options.maxAccel) { ax *= options.maxAccel / accel; ay *= options.maxAccel / accel; }
  const vx = body.vx + ax * dt;
  const vy = body.vy + ay * dt;
  return { body: { x: body.x + vx * dt, y: body.y + vy * dt, vx, vy }, accel: { x: ax, y: ay } };
}

export interface Wobble { x: number; y: number; vx: number; vy: number }
export const REST_WOBBLE: Wobble = { x: 0, y: 0, vx: 0, vy: 0 };

/**
 * Mola do rosto: reage à aceleração do corpo ao contrário (inércia). Frear forte empurra o rosto para
 * frente; a mola o traz de volta passando um pouco do ponto — o recuo de quem freou rápido.
 */
export function stepWobble(wobble: Wobble, accel: Vec, dt: number, stiffness = 70, damping = 8, gain = .045): Wobble {
  const ax = -stiffness * wobble.x - damping * wobble.vx - accel.x * gain;
  const ay = -stiffness * wobble.y - damping * wobble.vy - accel.y * gain;
  const vx = wobble.vx + ax * dt;
  const vy = wobble.vy + ay * dt;
  return { x: wobble.x + vx * dt, y: wobble.y + vy * dt, vx, vy };
}

/** Inclinação do corpo (graus): para frente ao acelerar, para trás ao frear. */
export function leanFor(accelX: number, max = 9): number {
  return Math.max(-max, Math.min(max, accelX * .03));
}
