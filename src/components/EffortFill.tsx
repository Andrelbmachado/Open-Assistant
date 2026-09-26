import { useEffect, useRef } from "react";
import { leftwardPhase, pullEnvelope, type EffortSkin } from "../utils/effortSkin";

type RGB = [number, number, number];

const hash = (x: number, y: number) => {
  let h = Math.imul(Math.floor(x) | 0, 374761393) + Math.imul(Math.floor(y) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const noise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number) => (noise(x, y) * .5 + noise(x * 2.03 + 11, y * 2.03 + 7) * .25 + noise(x * 4.1 + 3, y * 4.1 + 19) * .125) / .875;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Cada visual devolve a cor (0–1) de um pixel: `u` 0 = esquerda, 1 = botão; `v` 0–1 na altura. */
type Shader = (u: number, v: number, t: number, h: number) => RGB;

const plasma: Shader = (u, v, t) => {
  const value = Math.sin(u * 10 + t * 2.1) + Math.sin(v * 3 + u * 4 + t * 1.3) + Math.sin(Math.hypot(u * 8 - 4 + Math.sin(t * .7) * 2, v * 3 - 1.5) * 3 - t * 2.6) + Math.sin(u * 22 - t * 3.4) * .5;
  const n = (value + 3.5) / 7, filament = Math.exp(-Math.abs(value) * 3.2), violet = Math.max(0, Math.sin(u * 6 - t * 1.7)) * .35, edge = .55 + .45 * u;
  return [(.05 + .13 * n + .75 * filament + .5 * violet) * edge, (.12 + .33 * n + .95 * filament + .25 * violet) * edge, (.55 + .45 * n + filament + .9 * violet) * edge];
};

const fogo: Shader = (u, v, t) => {
  const env = pullEnvelope(u);
  const x = leftwardPhase(u * 4, t, 2.8);
  const warp = fbm(x * 1.3, v * 2 + t * .7);
  const n = fbm(x + warp * 1.4, v * 3 - t * 1.6 + warp);
  // Línguas de fogo: um segundo ruído mais fino recorta a chama em labaredas que tremulam.
  const tongues = fbm(x * 2.6 + warp, v * 5 - t * 3.2);
  const middle = 1 - Math.abs(v - .5) * 1.6;
  const heat = env * Math.pow(n, 1.4) * 2 * (.25 + tongues * 1.1) * (.3 + middle) + Math.exp(-(1 - u) * 14) * .45;
  return [.06 + Math.min(1, heat * 2.2), .015 + Math.min(1, Math.max(0, heat * 2 - .55)), .02 + Math.max(0, heat * 2.4 - 1.7)];
};

const choque: Shader = (u, v, t, h) => {
  const env = pullEnvelope(u);
  const glowBase = fbm(leftwardPhase(u * 3, t, 1), v * 2) * .16 * env;
  let core = 0, glow = 0;
  for (let k = 0; k < 3; k++) {
    // Raios novos ~14 vezes por segundo, sempre saindo do botão e escorrendo para a esquerda.
    const seed = Math.floor(t * 14) + k * 31;
    if (hash(seed, k) < .28) continue;
    const length = .3 + hash(seed, 7) * .7;
    if (u < 1 - length) continue;
    const x = leftwardPhase(u, t, 1.4);
    const y = .5 + (noise(x * 8 + seed * 1.7, k * 3.1) - .5) * 1.05 + (noise(x * 25 + seed * 3, k + 5) - .5) * .35;
    const distance = Math.abs(v - y) * h;
    const fade = smooth(1 - length, 1 - length + .18, u) * (.55 + .45 * u);
    core += Math.exp(-distance * distance * 1.4) * fade;
    glow += Math.exp(-distance * .55) * fade * .4;
  }
  return [.03 + glowBase * .5 + glow * .45 + core * .9, .05 + glowBase * .7 + glow * .7 + core * .95, .16 + glowBase * 1.4 + glow + core];
};

const agua: Shader = (u, v, t) => {
  const env = pullEnvelope(u);
  const x = leftwardPhase(u * 5, t, 1.7);
  const wave = Math.sin(x * 6 + Math.sin(v * 5 + t * 2) * 1.3) * .5 + .5;
  const caustic = Math.pow(1 - Math.abs(Math.sin(x * 3.1 + fbm(x, v * 2 + t * .5) * 4)), 6);
  const foam = smooth(.6, .88, fbm(x * 3, v * 4 - t)) * env;
  const bubble = hash(Math.floor(x * 6), Math.floor(v * 4)) > .9 ? smooth(.35, .1, Math.hypot((x * 6) % 1 - .5, (v * 4) % 1 - .5)) * env : 0;
  const mix = env * (.4 + .6 * wave);
  return [.02 + .06 * mix + caustic * .2 * env + foam * .8 + bubble * .7, .08 + .3 * mix + caustic * .55 * env + foam * .9 + bubble * .8, .28 + .55 * mix + caustic * .7 * env + foam + bubble];
};

const fumaca: Shader = (u, v, t) => {
  const env = pullEnvelope(u);
  const x = leftwardPhase(u * 3, t, .9);
  const w = fbm(x * 1.4, v * 2 + t * .4);
  const n = fbm(x + w * 1.6, v * 2.5 - t * .35 + w);
  const density = smooth(.32, .85, n) * (.2 + env * .95) * (1 - Math.abs(v - .5) * .7);
  const core = Math.exp(-(1 - u) * 12) * .35;
  return [.07 + density * .62 + core * .8, .07 + density * .62 + core * .8, .09 + density * .7 + core * .9];
};

const SHADERS: Record<Exclude<EffortSkin, "quadrados">, Shader> = { plasma, fogo, choque, agua, fumaca };
const FIELD_W = 140, FIELD_H = 16;
const CELL = 4, GRID_W = 240, GRID_H = 24;

/** Quadrados (estilo Claude Code): grade de pixels que surge no botão e escorre para a esquerda. */
function drawSquares(context: CanvasRenderingContext2D, t: number) {
  const gradient = context.createLinearGradient(0, 0, GRID_W, 0);
  gradient.addColorStop(0, "#15131f");
  gradient.addColorStop(1, "#2a2350");
  context.fillStyle = gradient;
  context.fillRect(0, 0, GRID_W, GRID_H);
  const cols = GRID_W / CELL, rows = GRID_H / CELL;
  const travel = t * 9;
  const scroll = Math.floor(travel), offset = (travel - scroll) * CELL;
  // A grade anda para a esquerda: a coluna `c` mostra agora o que a coluna `c + 1` mostrava um passo antes.
  for (let c = 0; c <= cols + 1; c++) {
    const x = c * CELL - offset;
    const u = (x + CELL / 2) / GRID_W;
    const env = pullEnvelope(u);
    for (let r = 0; r < rows; r++) {
      const key = c + scroll;
      const h1 = hash(key, r), h2 = hash(key * 3 + 1, r + 7);
      if (h1 > env * 1.05) continue;
      const twinkle = .65 + .35 * Math.sin(t * 5 + h1 * 40);
      const light = (.35 + .65 * h2) * twinkle * (.4 + .6 * env);
      const size = Math.max(1, Math.round(1 + 2 * env * h2 + (u > .9 ? 1 : 0)));
      const red = Math.round(255 * Math.min(1, (.5 + .5 * env) * light + .15)), green = Math.round(255 * Math.min(1, (.45 + .45 * env) * light + .1)), blue = Math.round(255 * Math.min(1, light + .25));
      context.fillStyle = `rgb(${red},${green},${blue})`;
      context.fillRect(Math.round(x + (CELL - size) / 2), r * CELL + Math.round((CELL - size) / 2), size, size);
    }
  }
}

/** Preenchimento animado do slider no Ultra, no visual escolhido. */
export function EffortFill({ skin, reducedMotion }: { skin: EffortSkin; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const squares = skin === "quadrados";
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = squares ? null : context.createImageData(FIELD_W, FIELD_H);
    const shader = squares ? null : SHADERS[skin];
    let frame = 0;
    const start = performance.now();
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const t = (now - start) / 1000 * (reducedMotion ? .25 : 1);
      if (squares) { drawSquares(context, t); return; }
      const data = image!.data;
      for (let y = 0; y < FIELD_H; y++) {
        const v = y / (FIELD_H - 1);
        for (let x = 0; x < FIELD_W; x++) {
          const [r, g, b] = shader!(x / (FIELD_W - 1), v, t, FIELD_H);
          const index = (y * FIELD_W + x) * 4;
          data[index] = Math.min(255, r * 255);
          data[index + 1] = Math.min(255, g * 255);
          data[index + 2] = Math.min(255, b * 255);
          data[index + 3] = 255;
        }
      }
      context.putImageData(image!, 0, 0);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [skin, squares, reducedMotion]);
  return <canvas ref={canvasRef} key={skin} className={`effort-plasma effort-skin-${skin}`} width={squares ? GRID_W : FIELD_W} height={squares ? GRID_H : FIELD_H} aria-hidden="true" />;
}
