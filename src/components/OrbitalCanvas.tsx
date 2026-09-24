import { useEffect, useRef, useState } from "react";
import { getOrbitalMotion, simulatedAudioLevel, type OrbitalSkin, type OrbitalState } from "../utils/orbitalState";

export interface OrbitalCanvasProps {
  skin: OrbitalSkin;
  state: OrbitalState;
  audioLevel?: number;
  reducedMotion?: boolean;
}

interface Particle { x: number; y: number; size: number; alpha: number; }

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in float a_size;
in float a_alpha;
uniform vec3 u_color;
out float v_alpha;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = a_size;
  v_alpha = a_alpha;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec3 u_color;
in float v_alpha;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - vec2(.5));
  float glow = smoothstep(.52, .0, d);
  outColor = vec4(u_color, v_alpha * glow);
}`;

function hexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

function particlesFor(skin: OrbitalSkin, state: OrbitalState, audioLevel: number, time: number, reducedMotion: boolean): Particle[] {
  const motion = getOrbitalMotion(skin, state, audioLevel);
  const t = reducedMotion ? 0 : time * motion.speed;
  const points: Particle[] = [];
  const intensity = motion.intensity;

  if (skin === "sphere") {
    for (let index = 0; index < 132; index++) {
      const band = index % 22;
      const ring = Math.floor(index / 22);
      const angle = band / 22 * Math.PI * 2 + t * (.5 + ring * .08);
      const radius = .16 + ring * .105 + Math.sin(angle * 3 + t * 1.4) * (.015 + audioLevel * .07);
      points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .82, size: 2.2 + intensity * 3.2, alpha: .15 + intensity * .72 });
    }
    points.push({ x: 0, y: 0, size: 32 + intensity * 32, alpha: .76 });
  } else if (skin === "atom") {
    for (let orbit = 0; orbit < 3; orbit++) {
      const tilt = orbit * Math.PI / 3 + .2;
      for (let step = 0; step < 48; step++) {
        const angle = step / 48 * Math.PI * 2 + t * (orbit % 2 ? -.9 : .9);
        const radius = .58 + audioLevel * .11;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * .29;
        points.push({ x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt), size: 1.8 + intensity * 2.2, alpha: .18 + intensity * .52 });
      }
      const electron = t * (orbit % 2 ? -.9 : .9) + orbit * 2.1;
      points.push({ x: Math.cos(electron) * .58, y: Math.sin(electron) * .2, size: 8 + intensity * 8, alpha: 1 });
    }
    for (let core = 0; core < 17; core++) {
      const angle = core * 2.4 + t;
      const radius = .035 + (core % 4) * .025;
      points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: 6 + intensity * 8, alpha: .72 });
    }
  } else {
    for (let arm = 0; arm < 12; arm++) {
      const base = arm / 12 * Math.PI * 2;
      for (let step = 0; step < 18; step++) {
        const ratio = step / 17;
        const curl = Math.sin(t * 1.9 + arm * .7 + ratio * 6) * (.16 + intensity * .25) * ratio;
        const angle = base + curl + t * .12;
        const radius = .08 + ratio * (.43 + intensity * .15);
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: 1.5 + (1 - ratio) * 5 + intensity * 3, alpha: .16 + (1 - ratio) * .58 });
      }
    }
    points.push({ x: 0, y: 0, size: 18 + intensity * 34, alpha: .85 });
  }
  return points;
}

function drawCanvas(context: CanvasRenderingContext2D, width: number, height: number, particles: Particle[], color: string) {
  context.clearRect(0, 0, width, height);
  const [red, green, blue] = hexColor(color).map((value) => Math.round(value * 255));
  context.globalCompositeOperation = "lighter";
  for (const point of particles) {
    const x = (point.x + 1) * .5 * width;
    const y = (1 - point.y) * .5 * height;
    const radius = point.size * Math.max(1, width / 180);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${point.alpha})`);
    gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
}

export function OrbitalCanvas({ skin, state, audioLevel, reducedMotion = false }: OrbitalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ skin, state, audioLevel, reducedMotion });
  const [unavailable, setUnavailable] = useState(false);
  latest.current = { skin, state, audioLevel, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true });
    const context2d = gl ? null : canvas.getContext("2d");
    const program = gl ? createProgram(gl) : null;
    if (!program && !context2d) { setUnavailable(true); return; }
    setUnavailable(false);
    const positionBuffer = gl?.createBuffer();
    const sizeBuffer = gl?.createBuffer();
    const alphaBuffer = gl?.createBuffer();
    let frame = 0;

    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const current = latest.current;
      const level = current.audioLevel ?? simulatedAudioLevel(current.state, now);
      const motion = getOrbitalMotion(current.skin, current.state, level);
      const particles = particlesFor(current.skin, current.state, level, now / 1000, current.reducedMotion);

      if (gl && program && positionBuffer && sizeBuffer && alphaBuffer) {
        const positions = new Float32Array(particles.flatMap((point) => [point.x, point.y]));
        const sizes = new Float32Array(particles.map((point) => point.size * pixelRatio));
        const alphas = new Float32Array(particles.map((point) => point.alpha));
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        const position = gl.getAttribLocation(program, "a_position");
        const size = gl.getAttribLocation(program, "a_size");
        const alpha = gl.getAttribLocation(program, "a_alpha");
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer); gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(size); gl.vertexAttribPointer(size, 1, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer); gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(alpha); gl.vertexAttribPointer(alpha, 1, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(gl.getUniformLocation(program, "u_color"), hexColor(motion.color));
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, particles.length);
      } else if (context2d) {
        drawCanvas(context2d, width, height, particles, motion.color);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      if (gl) { if (positionBuffer) gl.deleteBuffer(positionBuffer); if (sizeBuffer) gl.deleteBuffer(sizeBuffer); if (alphaBuffer) gl.deleteBuffer(alphaBuffer); if (program) gl.deleteProgram(program); }
    };
  }, []);

  const label = `${skin === "tentacles" ? "Tentáculos" : skin === "atom" ? "Átomo" : "Esfera"}: ${state}`;
  if (unavailable) return <div className={`orbital-fallback orbital-${skin} orbital-${state}`} role="img" aria-label={label} />;
  return <canvas ref={canvasRef} className="orbital-canvas" role="img" aria-label={label} />;
}
