import { useRef } from "react";
import { ShaderCanvas, type UniformSetter } from "./ShaderCanvas";
import { simulatedAudioLevel, type OrbitalState } from "../utils/orbitalState";

interface SuperOrbitalProps {
  state: OrbitalState;
  audioLevel?: number;
  reducedMotion?: boolean;
  className?: string;
}

const RIBBONS = 3;
const RIBBON_POINTS = 41;

// Anel luminoso com raios de espectro, anel dourado, névoa azul, fitas de plasma e bokeh.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time, u_level, u_energy, u_error;
uniform vec2 u_pts[${RIBBONS * RIBBON_POINTS}];
out vec4 outColor;

const vec3 BLUE = vec3(.16, .34, 1.);
const vec3 CYAN = vec3(.45, .85, 1.);
const vec3 GOLD = vec3(1., .6, .18);

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= .5; } return v; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 tone(vec3 c) { vec3 e = max(c - .8, 0.); return min(c, .8) + .2 * (1. - exp(-e * 4.)); }

vec3 ribbons(vec2 p) {
  vec3 acc = vec3(0.);
  for (int k = 0; k < ${RIBBONS}; k++) {
    float dmin = 1e9;
    for (int i = 0; i < ${RIBBON_POINTS - 1}; i++) dmin = min(dmin, sdSeg(p, u_pts[k * ${RIBBON_POINTS} + i], u_pts[k * ${RIBBON_POINTS} + i + 1]));
    vec3 c = k == 0 ? vec3(.62, .9, 1.) : k == 1 ? vec3(.32, .52, 1.) : vec3(.74, .48, 1.);
    acc += c * (exp(-dmin / .0045) * .75 + exp(-dmin / .018) * .3 + exp(-dmin / .06) * .12);
  }
  return acc * (.7 + .55 * u_energy);
}

vec3 bokeh(vec2 uv) {
  vec3 acc = vec3(0.);
  float r = length(uv);
  float m = smoothstep(.24, .4, r) * (1. - smoothstep(.72, .88, r));
  if (m < .001) return acc;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 p = rot(u_time * (.06 + fi * .04) * (i == 0 ? 1. : -1.)) * uv;
    vec2 g = p * (11. + fi * 10.) + fi * 5.7;
    vec2 id = floor(g), f = fract(g) - .5;
    vec3 h = hash32(id);
    if (h.x > .5) continue;
    float d = length(f - (h.yz - .5) * .5);
    float tw = .5 + .5 * sin(u_time * (1.5 + h.z * 3.) + h.x * 30.);
    float disk = i == 0
      ? smoothstep(.12 + .18 * h.y, (.12 + .18 * h.y) * .6, d) * .5 + smoothstep(.1, 0., d) * .3
      : smoothstep(.06 + .08 * h.y, 0., d);
    vec3 c = i == 0 ? mix(GOLD, vec3(1., .78, .42), h.z) : (h.z > .55 ? GOLD : vec3(.45, .68, 1.));
    acc += c * disk * tw;
  }
  return acc * m * (.6 + .6 * u_energy);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * u_res) / (.5 * min(u_res.x, u_res.y));
  float r = length(uv), a = atan(uv.y, uv.x);
  float lv = u_level;
  float ring = .46 * (1. + .03 * lv + .02 * lv * sin(u_time * 6.));

  vec3 col = BLUE * fbm(uv * 2.2 + vec2(u_time * .04, -u_time * .03)) * exp(-pow((r - ring * 1.12) / .34, 2.)) * (.62 + .35 * u_energy);
  col += vec3(.1, .18, .7) * exp(-pow(r / .62, 2.)) * .22;
  col += BLUE * .3 * fbm(uv * 3.1 - u_time * .05) * exp(-pow(uv.x / .38, 2.)) * exp(-pow((abs(uv.y) - .55) / .2, 2.));

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 q = rot(.35 + fi * .06 + u_time * .05 * (1. + fi * .1)) * (uv - vec2(-.02 * fi, .01 * fi));
    vec2 ab = vec2(.6 + fi * .018, .52 + fi * .012) * (1. + .02 * lv);
    float e = abs(length(q / ab) - 1.) * min(ab.x, ab.y);
    col += mix(BLUE, CYAN, .3) * exp(-e / .0022) * (.5 + .5 * cos(atan(q.y, q.x) - 2.6 - fi * .1)) * .35;
  }

  float spec = noise(vec2(a * 3. + u_time * .8, u_time * .6)) * .6 + noise(vec2(a * 9. - u_time * 1.4, u_time)) * .4;
  float outerR = ring + .035 + (.05 + .12 * lv) * spec;
  float band = smoothstep(ring + .005, ring + .02, r) * (1. - smoothstep(outerR - .02, outerR, r));
  col += mix(CYAN, BLUE, smoothstep(ring, outerR, r)) * pow(.5 + .5 * cos(a * 144.), 5.) * band * (.55 + .5 * u_energy);
  float bandIn = smoothstep(ring - .05, ring - .02, r) * (1. - smoothstep(ring - .01, ring, r));
  col += CYAN * pow(.5 + .5 * cos(a * 96. + u_time), 3.) * bandIn * .3;

  float dr = abs(r - ring);
  col += vec3(.8, .92, 1.) * exp(-dr / .0045) * (.9 + .4 * lv);
  col += BLUE * exp(-dr / .035) * (.55 + .35 * lv);
  col += vec3(1., .95, .85) * exp(-dr / .01) * pow(max(0., sin(a)), 8.) * .6;
  float dg = abs(r - ring - .03);
  float seg = smoothstep(.2, .9, .5 + .5 * sin(a * 14. + u_time * 1.5));
  col += GOLD * (exp(-dg / .008) * (.55 + .75 * seg) + exp(-dg / .04) * .3);
  float dgi = abs(r - ring + .035);
  col += GOLD * exp(-dgi / .014) * (.35 + .5 * noise(vec2(a * 5. - u_time, u_time * .3))) * (.7 + .6 * u_energy);

  if (r < .44) col += ribbons(uv) * smoothstep(.44, .36, r);
  col += bokeh(uv);

  vec3 red = vec3(dot(col, vec3(.5, .35, .25))) * vec3(1.4, .35, .3);
  col = tone(mix(col, red, u_error));
  outColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

interface Animator { time: number; level: number; energy: number; error: number; pts: Float32Array }

const STATE_SPEED: Record<OrbitalState, number> = { idle: .5, listening: .85, processing: 1.7, speaking: 1.15, error: .7 };
const STATE_ENERGY: Record<OrbitalState, number> = { idle: .3, listening: .6, processing: .75, speaking: .7, error: .5 };

/** Curvas de Lissajous 3D girando e projetadas: as fitas de plasma dentro do anel. */
function updateRibbons(pts: Float32Array, time: number, level: number) {
  const amp = .3 + .05 * level;
  for (let k = 0; k < RIBBONS; k++) {
    const spin = time * .35 + k * 2.1;
    const cy = Math.cos(spin), sy = Math.sin(spin);
    for (let i = 0; i < RIBBON_POINTS; i++) {
      const s = i / (RIBBON_POINTS - 1) * Math.PI * 2;
      // Laços suaves em "8" como pintura de luz: frequências baixas e fase lenta por fita.
      const x = Math.sin(s + time * (.5 + .15 * k) + k * 2.1);
      const y = Math.sin(s * 2 + time * (.62 + .1 * k) + k * 1.7) * (.85 + .15 * Math.sin(time * .7 + k));
      const z = Math.cos(s + time * .4 - k * 1.3);
      const rx = x * cy - z * sy;
      const rz = x * sy + z * cy;
      const scale = amp * (.85 + .15 * rz);
      pts[(k * RIBBON_POINTS + i) * 2] = rx * scale;
      pts[(k * RIBBON_POINTS + i) * 2 + 1] = y * scale;
    }
  }
}

function step(anim: Animator, set: UniformSetter, t: number, dt: number, props: SuperOrbitalProps) {
  const rate = (target: number, value: number, speed: number) => value + (target - value) * (1 - Math.exp(-dt * speed));
  const level = props.audioLevel ?? simulatedAudioLevel(props.state, t * 1000);
  anim.level = rate(level, anim.level, 14);
  anim.energy = rate(STATE_ENERGY[props.state] + (props.state === "speaking" || props.state === "listening" ? anim.level * .5 : 0), anim.energy, 4);
  anim.error = rate(props.state === "error" ? 1 : 0, anim.error, 5);
  anim.time += dt * STATE_SPEED[props.state] * (props.reducedMotion ? .3 : 1);
  updateRibbons(anim.pts, anim.time, anim.level);
  set("u_time", anim.time);
  set("u_level", anim.level);
  set("u_energy", anim.energy);
  set("u_error", anim.error);
  set("u_pts", ...anim.pts);
}

export function SuperOrbital(props: SuperOrbitalProps) {
  const latest = useRef(props);
  const anim = useRef<Animator | null>(null);
  latest.current = props;
  anim.current ??= { time: 0, level: 0, energy: .3, error: 0, pts: new Float32Array(RIBBONS * RIBBON_POINTS * 2) };
  return <ShaderCanvas
    fragment={FRAGMENT}
    className={props.className ?? "orbital-canvas"}
    label={`Super orbital: ${props.state}`}
    onFrame={(set, time, dt) => step(anim.current!, set, time, dt, latest.current)}
    fallback={<div className={`orbital-fallback orbital-${props.state}`} role="img" aria-label="Super orbital" />}
  />;
}
