import { useEffect, useRef, useState, type ReactNode } from "react";

export type UniformSetter = (name: string, ...values: number[]) => void;

interface ShaderCanvasProps {
  fragment: string;
  label: string;
  className?: string;
  /** Chamado a cada quadro antes do desenho; `u_res` e `u_time` já vêm preenchidos. */
  onFrame: (set: UniformSetter, timeSec: number, dtSec: number) => void;
  maxPixelRatio?: number;
  fallback: ReactNode;
}

// Triângulo que cobre a tela inteira, sem buffers de vértice.
const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("Shader não compilou:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGL2RenderingContext, fragment: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  console.warn("Programa WebGL não ligou:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

/** Canvas WebGL2 com um shader de tela cheia, pausado automaticamente fora da tela. */
export function ShaderCanvas({ fragment, label, className, onFrame, maxPixelRatio = 2, fallback }: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(onFrame);
  const [failed, setFailed] = useState(false);
  frameRef.current = onFrame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    const program = gl ? link(gl, fragment) : null;
    if (!gl || !program) { setFailed(true); return; }
    setFailed(false);
    const locations = new Map<string, WebGLUniformLocation | null>();
    const set: UniformSetter = (name, ...values) => {
      let location = locations.get(name);
      if (location === undefined) { location = gl.getUniformLocation(program, name); locations.set(name, location); }
      if (!location) return;
      if (values.length === 1) gl.uniform1f(location, values[0]);
      else if (values.length === 2) gl.uniform2f(location, values[0], values[1]);
      else if (values.length === 3) gl.uniform3f(location, values[0], values[1], values[2]);
      else if (values.length === 4) gl.uniform4f(location, values[0], values[1], values[2], values[3]);
      // Mais de 4 valores: array de vec2 (ex.: pontos de uma curva).
      else gl.uniform2fv(location, values);
    };
    let frame = 0;
    let visible = true;
    let last = performance.now();
    const start = last;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    const onLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setFailed(true); };
    canvas.addEventListener("webglcontextlost", onLost);

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const dt = Math.min(.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      set("u_res", width, height);
      const time = (now - start) / 1000;
      set("u_time", time);
      frameRef.current(set, time, dt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
    };
  }, [fragment, maxPixelRatio]);

  if (failed) return <>{fallback}</>;
  return <canvas ref={canvasRef} className={className} role="img" aria-label={label} />;
}
