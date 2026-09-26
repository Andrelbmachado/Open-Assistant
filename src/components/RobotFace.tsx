import { useRef, type MutableRefObject } from "react";
import { ShaderCanvas, type UniformSetter } from "./ShaderCanvas";
import { robotPose, type RobotExpression, type RobotPose } from "../utils/robotExpression";
import { simulatedAudioLevel, type OrbitalState } from "../utils/orbitalState";
import type { Gaze } from "../utils/robotCursor";

/** Último limite de palavra da síntese de voz, usado para sincronizar a boca. */
export interface SpeechPulse { at: number; supported: boolean }

interface RobotFaceProps {
  state: OrbitalState;
  expression: RobotExpression;
  audioLevel?: number;
  reducedMotion?: boolean;
  speechPulse?: MutableRefObject<SpeechPulse>;
  className?: string;
  /** Olhar fixo (robô-mouse carregando algo): vira e olha para lá em vez de olhar em volta. */
  gaze?: Gaze;
}

// Esfera de vidro escura com visor de LED em matriz de pontos, olhos e boca desenhados por SDF.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_colorA, u_colorB, u_rim;
uniform float u_brightness, u_glow, u_scan, u_particles, u_pspeed;
uniform float u_eyeH, u_eyeW, u_eyeHappy, u_eyeSquint, u_eyeAngry, u_blink;
uniform float u_mouthOpen, u_mouthW, u_mouthVis, u_mouthRest, u_mouthRound, u_smile, u_eyeSus;
uniform vec2 u_look, u_shake;
uniform float u_turn, u_tilt, u_back, u_side;
uniform vec3 u_pcolor;
uniform float u_ptint, u_pchaos;
out vec4 outColor;

const float R = 0.8;
const vec2 C = vec2(0.0, -0.13);
const vec2 HS = vec2(0.6, 0.29);

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
vec3 tone(vec3 c) { vec3 e = max(c - .8, 0.); return min(c, .8) + .2 * (1. - exp(-e * 5.)); }

// Virar a cabeça: visor e rosto deslizam para o lado e o visor encolhe na horizontal (perspectiva).
// De costas (u_back → 1) o visor continua girando até sumir atrás da esfera.
float turnSide() { return u_turn >= 0. ? 1. : -1.; }
// De perfil (u_side → 1, andando de lado) o visor vai bem para a borda e fica estreito.
vec2 screenCenter() { return vec2(u_turn * .17 + turnSide() * (u_back * .55 + u_side * .14), .02) + u_look * vec2(.05, .035); }
vec2 screenHalf() { return HS * vec2((1. - .2 * abs(u_turn)) * (1. - .75 * u_back) * (1. - .3 * u_side), 1.); }

vec3 screenField(vec2 q) {
  vec2 sc = screenCenter();
  vec2 hs = screenHalf();
  float d = sdRoundBox(q - sc, hs, hs.y);
  float mask = smoothstep(.13, -.09, d);
  float gx = clamp((q.x - sc.x) / hs.x * .5 + .5, 0., 1.);
  float w = clamp(gx + sin(u_time * .33) * .28 + .1 * sin(q.y * 7. + u_time * 1.2), 0., 1.);
  vec3 mid = mix(u_colorA, u_colorB, .5) * .75 + vec3(.19, .2, .25);
  vec3 col = w < .5 ? mix(u_colorA, mid, w * 2.) : mix(mid, u_colorB, (w - .5) * 2.);
  float n = noise(q * 6. + vec2(u_time * .5, -u_time * .35));
  float b = mask * (.62 + .38 * n) * u_brightness;
  float sweep = (fract(u_time * .55) * 2. - 1.) * hs.x * 1.25;
  b += u_scan * mask * .65 * exp(-pow((q.x - sc.x - sweep) / .07, 2.));
  return col * b;
}

float eyeDist(vec2 p, float side) {
  float near = u_turn * side;
  vec2 c = vec2(side * .25 * (1. - .18 * abs(u_turn)) * (1. - .75 * u_back) * (1. - .35 * u_side) + u_turn * .15 + turnSide() * (u_back * .6 + u_side * .13), -.05 + u_mouthVis * .05 + u_mouthOpen * .02) + u_look * vec2(.075, .05);
  vec2 lp = p - c;
  // O olho do lado para onde ele vira fica maior; a boca bem aberta aperta um pouco os olhos.
  float h = max(.13 * u_eyeH * (1. + .14 * near) * (1. - .16 * u_mouthOpen) * mix(1., .72, u_mouthVis) * mix(1., .08, u_blink), .012);
  float w = .03 * u_eyeW * (1. + .3 * near);
  float bar = sdRoundBox(lp, vec2(w, h), w);
  float happy = min(sdSeg(lp, vec2(-.075, -.03), vec2(0., .045)), sdSeg(lp, vec2(0., .045), vec2(.075, -.03))) - .022;
  vec2 sp = lp * vec2(-side, 1.);
  float squint = min(sdSeg(sp, vec2(-.05, .075), vec2(.05, 0.)), sdSeg(sp, vec2(.05, 0.), vec2(-.05, -.075))) - .022;
  float angry = max(bar, dot(lp - vec2(0., h * .2), normalize(vec2(-side * .95, 1.))));
  // Desconfiado: traço em cima e uma haste descendo (o olho direito um pouco inclinado).
  vec2 sl = side > 0. ? mat2(.985, -.17, .17, .985) * lp : lp;
  float lid = sdRoundBox(sl - vec2(0., h * .45), vec2(.078, .018), .014);
  float stem = sdRoundBox(sl - vec2(.05, h * .45 - .055), vec2(.018, .055), .014);
  float suspicious = min(lid, stem);
  float d = mix(bar, happy, u_eyeHappy);
  d = mix(d, suspicious, u_eyeSus);
  d = mix(d, squint, u_eyeSquint);
  return mix(d, angry, u_eyeAngry);
}

float mouthDist(vec2 p) {
  float open = max(u_mouthOpen, u_mouthRest);
  vec2 c = vec2(u_turn * .14 + turnSide() * (u_back * .6 + u_side * .13), -.17 - .03 * open) + u_look * vec2(.06, .04);
  float h = mix(.009, .112, open);
  float w = mix(.045 * u_mouthW + .045 * open, max(h, .03), u_mouthRound) * (1. - .15 * abs(u_turn));
  float box = sdRoundBox(p - c, vec2(w, h), min(w, h));
  // Sorriso: arco de círculo, só a metade de baixo.
  vec2 q = p - c - vec2(0., .07);
  float arc = max(abs(length(q) - .105) - .017, q.y + .04);
  return mix(box, arc, u_smile);
}

vec3 particles(vec2 uv) {
  vec3 acc = vec3(0.);
  if (u_particles < .01) return acc;
  vec2 rel = uv - C;
  // Caos (bravo): partículas mais espalhadas e rápidas, cada coluna na sua velocidade.
  float spread = 1. + u_pchaos * .22;
  // Somem antes da borda do quadro: sem fundo atrás do robô, um corte reto apareceria.
  float ymask = smoothstep(R * .1, R * .75, rel.y) * (1. - smoothstep(R * .95, R * 1.38, rel.y));
  float xmask = 1. - smoothstep(R * .35 * spread, R * .8 * spread, abs(rel.x) - max(rel.y - R, 0.) * .45);
  float m = ymask * xmask;
  if (m < .001) return acc;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (i == 3 && u_pchaos < .1) break;
    float scale = 16. + fi * 8.;
    float col = floor(rel.x * scale + fi * 17.3);
    float colSpeed = 1. + u_pchaos * (hash12(vec2(col, fi * 7.1)) * 1.8 - .4);
    vec2 g = vec2(rel.x * scale + fi * 17.3, (rel.y - u_time * (.1 + fi * .05) * u_pspeed * colSpeed) * scale + fi * 17.3);
    vec2 id = floor(g), f = fract(g) - .5;
    vec3 h = hash32(id);
    if (h.x > u_particles * (.45 + .35 * u_pchaos)) continue;
    f.x += sin(g.y * (.6 + u_pchaos * .9) + h.y * 30. + u_time * (1. + u_pchaos * 4.)) * (.08 + u_pchaos * .16);
    float size = .1 + .16 * h.y + u_pchaos * .05;
    float tw = .55 + .45 * sin(u_time * (2. + h.z * 5. + u_pchaos * 6.) + h.x * 50.);
    float dotm = smoothstep(size, size * .2, length(f - (h.yz - .5) * .45)) * tw;
    vec3 pc = mix(mix(vec3(.18, .85, .85), vec3(.3, .45, 1.), h.z), u_colorA, .35);
    pc = mix(pc, u_pcolor * (.75 + .6 * h.y), u_ptint);
    acc += pc * dotm * (.7 + .3 * fi);
  }
  return acc * m * clamp(u_particles * 1.4, 0., 1.);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * u_res) / (.5 * min(u_res.x, u_res.y));
  float px = 2. / min(u_res.x, u_res.y);
  vec2 s = (uv - C - u_shake) / R;
  float ct = cos(u_tilt), st = sin(u_tilt);
  s = mat2(ct, st, -st, ct) * s;
  float spx = px / R;
  float ds = length(s);
  float inside = 1. - smoothstep(1. - spx * 1.5, 1., ds);

  float z = sqrt(max(0., 1. - ds * ds));
  float fres = pow(1. - z, 2.4);
  vec3 rimCol = mix(u_rim, vec3(.58, .36, .92), .5 + .5 * sin(atan(s.y, s.x) - .9));
  vec3 sphere = mix(vec3(.01, .012, .03), vec3(.03, .035, .08), clamp(.5 + s.y * .5, 0., 1.) * (1. - ds * .6));
  sphere += rimCol * fres * .62;
  sphere += rimCol * smoothstep(.955, .995, ds) * .18;
  sphere += vec3(.55, .65, 1.) * .07 * smoothstep(.42, 0., length(s - vec2(-.36 + u_turn * .12, .5)));

  float cell = max(.028, 3.4 * spx);
  vec2 sc = screenCenter();
  vec2 g = (s - sc) / cell;
  vec2 id = floor(g), f = fract(g) - .5;
  vec3 led = screenField((id + .5) * cell + sc);
  float I = max(led.r, max(led.g, led.b));
  float rad = .5 * clamp(sqrt(I) * (.85 + .3 * hash12(id)), 0., 1.);
  float dotMask = smoothstep(rad, rad - 1.2 * spx / cell, length(f));
  vec3 bloom = screenField(s);
  vec3 screen = led * dotMask * 1.35 + bloom * .22 * u_glow;
  sphere += bloom * .1;

  float dE = min(eyeDist(s, -1.), eyeDist(s, 1.));
  float dM = mouthDist(s);
  float eyeMask = 1. - smoothstep(-spx, spx, dE);
  float mouthMask = (1. - smoothstep(-spx, spx, dM)) * u_mouthVis;
  float feature = max(eyeMask, mouthMask);
  vec3 tint = mix(u_colorA, u_colorB, .5);
  vec3 features = mix(vec3(1.), tint, .12) * feature * 1.05;
  vec3 featGlow = tint * (exp(-max(dE, 0.) / .03) + exp(-max(dM, 0.) / .03) * u_mouthVis) * .35 * u_glow;

  // De costas: visor, olhos e boca somem; ficam três respiros discretos no meio da esfera.
  float front = 1. - u_back;
  vec2 bp = s - vec2(0., -.04);
  float row = clamp(floor(bp.y / .085 + .5), -1., 1.);
  float slot = sdRoundBox(bp - vec2(0., row * .085), vec2(.19 - abs(row) * .04, .011), .011);
  float vent = (1. - smoothstep(-spx, spx, slot)) * u_back * u_back;
  vec3 col = (sphere + (screen * (1. - feature) + features + featGlow) * front + rimCol * vent * .5) * inside;
  float outer = max(ds - 1., 0.);
  // Tudo que fica fora da esfera some antes da borda do canvas: sem isso o brilho fraco
  // deixava um quadrado visível atrás do robô.
  float edgeFade = smoothstep(0., .3, 1. - max(abs(uv.x), abs(uv.y)));
  col += (rimCol * exp(-outer * 14.) * .28 + tint * exp(-outer * 6.) * .06) * u_glow * (1. - inside) * edgeFade;
  col += particles(uv) * edgeFade;
  col = tone(col);
  outColor = vec4(col, max(inside, max(col.r, max(col.g, col.b))));
}`;

type Vec3 = [number, number, number];
const wobble = (x: number) => (Math.sin(x) + Math.sin(x * 1.7 + 1.3) + Math.sin(x * 2.9 + .7)) / 6 + .5;
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-dt * rate));
const approach3 = (from: Vec3, to: Vec3, rate: number, dt: number) => { for (let i = 0; i < 3; i++) from[i] = approach(from[i], to[i], rate, dt); };

interface Animator {
  pose: RobotPose;
  mouth: number;
  mouthVis: number;
  phase: number;
  blinkAt: number;
  blinkStart: number;
  look: [number, number];
  lookTarget: [number, number];
  lookAt: number;
  level: number;
  turn: number;
  turnTarget: number;
  tilt: number;
  tiltTarget: number;
  turnAt: number;
  back: number;
  side: number;
}

function createAnimator(): Animator {
  const pose = robotPose("idle", "idle");
  return { pose: { ...pose, colorA: [...pose.colorA], colorB: [...pose.colorB], rim: [...pose.rim], particleColor: [...pose.particleColor] }, turn: 0, turnTarget: 0, tilt: 0, tiltTarget: 0, turnAt: 1, back: 0, side: 0, mouth: 0, mouthVis: 0, phase: 0, blinkAt: 1.5, blinkStart: -1, look: [0, 0], lookTarget: [0, 0], lookAt: 0, level: 0 };
}

function lookTargetFor(state: OrbitalState, time: number): [number, number] {
  if (state === "processing") return [.55 * Math.sin(time * 1.1), .5];
  if (state === "listening") return [0, .18];
  if (state === "error") return [0, -.45];
  const range = state === "speaking" ? .28 : .6;
  return [(Math.random() * 2 - 1) * range, (Math.random() * 2 - 1) * range * .6];
}

function step(anim: Animator, set: UniformSetter, t: number, dt: number, props: RobotFaceProps) {
  const target = robotPose(props.state, props.expression);
  const p = anim.pose;
  approach3(p.colorA, target.colorA, 4, dt);
  approach3(p.colorB, target.colorB, 4, dt);
  approach3(p.rim, target.rim, 4, dt);
  approach3(p.particleColor, target.particleColor, 4, dt);
  for (const key of ["brightness", "eyeHeight", "eyeWidth", "eyeHappy", "eyeSquint", "eyeTilt", "eyeSuspicious", "mouthShow", "mouthRest", "mouthRound", "smile", "mouthAmp", "mouthWidth", "syllableHz", "shake", "particles", "particleTint", "particleChaos", "particleSpeed", "scan", "glow"] as const) {
    p[key] = approach(p[key], target[key], 6, dt);
  }
  const time = props.reducedMotion ? t * .35 : t;
  const speaking = props.state === "speaking";

  let mouthTarget = 0;
  if (speaking && p.mouthAmp > .01) {
    anim.phase += dt * p.syllableHz * (.8 + .4 * wobble(time * 1.3));
    const syllable = Math.pow(Math.abs(Math.sin(anim.phase * Math.PI)), .7);
    const word = .55 + .45 * wobble(time * 2.1 + 3);
    const pulse = props.speechPulse?.current;
    let gate: number;
    if (pulse?.supported) {
      const since = performance.now() - pulse.at;
      gate = since < 380 ? 1 : Math.max(0, 1 - (since - 380) / 260);
    } else {
      gate = Math.min(1, Math.max(0, (wobble(time * .45 + 7) - .2) / .15));
    }
    mouthTarget = p.mouthAmp * syllable * word * gate;
  }
  anim.mouth = approach(anim.mouth, mouthTarget, 22, dt);
  anim.mouthVis = approach(anim.mouthVis, Math.max(speaking ? 1 : 0, p.mouthShow), speaking || p.mouthShow > .5 ? 10 : 3.2, dt);

  if (t > anim.blinkAt) { anim.blinkStart = t; anim.blinkAt = t + 2.4 + Math.random() * 3.6; }
  const blinkPhase = (t - anim.blinkStart) / .16;
  const blink = blinkPhase >= 0 && blinkPhase <= 1 && props.state !== "error" ? Math.sin(blinkPhase * Math.PI) : 0;

  if (props.state === "processing" || props.state === "listening" || props.state === "error" || t > anim.lookAt) {
    anim.lookTarget = lookTargetFor(props.state, time);
    if (t > anim.lookAt) anim.lookAt = t + (speaking ? 1.1 : 2) + Math.random() * 2.2;
  }
  // Vira a cabeça e inclina: bastante enquanto fala, pouco ouvindo, de vez em quando parado.
  if (t > anim.turnAt) {
    const range = speaking ? .85 : props.state === "listening" ? .22 : props.state === "processing" ? .35 : .5;
    anim.turnTarget = (Math.random() * 2 - 1) * range;
    anim.tiltTarget = (Math.random() * 2 - 1) * (speaking ? .14 : .06);
    anim.turnAt = t + (speaking ? .7 + Math.random() * 1.2 : 1.8 + Math.random() * 2.6);
  }
  if (props.gaze) {
    anim.turnTarget = props.gaze.turn;
    anim.lookTarget = props.gaze.look;
    anim.tiltTarget = 0;
  }
  const still = props.reducedMotion ? .3 : 1;
  // Girar de lado/de frente/de costas: um pouco mais rápido quando é a coreografia mandando (gaze).
  anim.turn = approach(anim.turn, anim.turnTarget * still, speaking ? 4.5 : props.gaze ? 5.2 : 2.6, dt);
  anim.back = approach(anim.back, props.gaze?.back ?? 0, 5.2, dt);
  anim.side = approach(anim.side, props.gaze?.side ?? 0, 5.2, dt);
  anim.tilt = approach(anim.tilt, anim.tiltTarget * still, speaking ? 4 : 2.2, dt);
  anim.look[0] = approach(anim.look[0], anim.lookTarget[0], 9, dt);
  anim.look[1] = approach(anim.look[1], anim.lookTarget[1], 9, dt);

  const level = props.audioLevel ?? (props.state === "listening" ? simulatedAudioLevel("listening", t * 1000) : 0);
  anim.level = approach(anim.level, props.state === "listening" ? level : 0, 12, dt);
  const shake = props.reducedMotion ? 0 : p.shake * (.35 + anim.mouth);

  set("u_colorA", ...p.colorA);
  set("u_colorB", ...p.colorB);
  set("u_rim", ...p.rim);
  set("u_brightness", p.brightness + anim.level * .5);
  set("u_glow", p.glow + anim.level * .4);
  set("u_scan", p.scan);
  set("u_particles", p.particles);
  set("u_pspeed", (.7 + p.particles * .9) * p.particleSpeed);
  set("u_pcolor", ...p.particleColor);
  set("u_ptint", p.particleTint);
  set("u_pchaos", p.particleChaos);
  set("u_turn", anim.turn);
  set("u_back", anim.back);
  set("u_side", anim.side);
  set("u_tilt", anim.tilt);
  set("u_eyeH", p.eyeHeight * (1 + anim.level * .12));
  set("u_eyeW", p.eyeWidth);
  set("u_eyeHappy", p.eyeHappy);
  set("u_eyeSquint", p.eyeSquint);
  set("u_eyeAngry", p.eyeTilt);
  set("u_blink", blink);
  set("u_mouthOpen", anim.mouth);
  set("u_mouthW", p.mouthWidth);
  set("u_mouthVis", anim.mouthVis);
  set("u_mouthRest", p.mouthRest);
  set("u_mouthRound", p.mouthRound);
  set("u_smile", p.smile);
  set("u_eyeSus", p.eyeSuspicious);
  set("u_look", anim.look[0], anim.look[1]);
  set("u_shake", Math.sin(t * 53) * .011 * shake, Math.cos(t * 47) * .009 * shake);
  if (props.reducedMotion) set("u_time", time);
}

/** Rosto de robô do modo voz: olhos e boca animados pela expressão e pelo áudio. */
export function RobotFace(props: RobotFaceProps) {
  const latest = useRef(props);
  const anim = useRef<Animator | null>(null);
  latest.current = props;
  anim.current ??= createAnimator();
  return <ShaderCanvas
    fragment={FRAGMENT}
    className={props.className ?? "orbital-canvas"}
    label={`Rosto do assistente: ${props.state}`}
    onFrame={(set, time, dt) => step(anim.current!, set, time, dt, latest.current)}
    fallback={<div className={`orbital-fallback orbital-${props.state}`} role="img" aria-label="Rosto do assistente" />}
  />;
}
