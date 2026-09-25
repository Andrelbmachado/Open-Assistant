import { Info } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { EFFORT_INFO, EFFORT_LEVELS, effortAt, effortIndex, type EffortLevel } from "../utils/effort";

const PLASMA_WIDTH = 120;
const PLASMA_HEIGHT = 14;

/** Plasma azul de baixa resolução, ampliado pelo CSS: filamentos brilhantes nos cruzamentos de zero. */
function PlasmaFill({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = context.createImageData(PLASMA_WIDTH, PLASMA_HEIGHT);
    const data = image.data;
    let frame = 0;
    const start = performance.now();
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const t = (now - start) / 1000 * (reducedMotion ? .25 : 1);
      for (let y = 0; y < PLASMA_HEIGHT; y++) {
        const v = y / (PLASMA_HEIGHT - 1);
        for (let x = 0; x < PLASMA_WIDTH; x++) {
          const u = x / (PLASMA_WIDTH - 1);
          const value = Math.sin(u * 10 + t * 2.1)
            + Math.sin(v * 3 + u * 4 + t * 1.3)
            + Math.sin(Math.hypot(u * 8 - 4 + Math.sin(t * .7) * 2, v * 3 - 1.5) * 3 - t * 2.6)
            + Math.sin(u * 22 - t * 3.4) * .5;
          const n = (value + 3.5) / 7;
          const filament = Math.exp(-Math.abs(value) * 3.2);
          const violet = Math.max(0, Math.sin(u * 6 - t * 1.7)) * .35;
          const edge = .55 + .45 * u;
          const r = (.05 + .13 * n + .75 * filament + .5 * violet) * edge;
          const g = (.12 + .33 * n + .95 * filament + .25 * violet) * edge;
          const b = (.55 + .45 * n + filament + .9 * violet) * edge;
          const index = (y * PLASMA_WIDTH + x) * 4;
          data[index] = Math.min(255, r * 255);
          data[index + 1] = Math.min(255, g * 255);
          data[index + 2] = Math.min(255, b * 255);
          data[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);
  return <canvas ref={canvasRef} className="effort-plasma" width={PLASMA_WIDTH} height={PLASMA_HEIGHT} aria-hidden="true" />;
}

interface EffortControlProps {
  value: EffortLevel;
  onChange: (value: EffortLevel) => void;
  reducedMotion?: boolean;
}

/** Slider de esforço no estilo do Claude Code: do mais rápido ao mais inteligente. */
export function EffortControl({ value, onChange, reducedMotion = false }: EffortControlProps) {
  const index = effortIndex(value);
  const info = EFFORT_INFO[value];
  const last = EFFORT_LEVELS.length - 1;
  return <div className={`effort-control level-${value}`}>
    <div className="effort-head">
      <span>Esforço</span>
      <b className="effort-name">{info.label}</b>
      <span className="effort-info" title="Mais esforço ativa o raciocínio do modelo (quando disponível) e pede mais verificação. As respostas ficam melhores, porém mais lentas."><Info size={13} /></span>
    </div>
    <div className="effort-slider" style={{ "--effort": index / last } as CSSProperties}>
      <div className="effort-track">
        <div className="effort-fill">{value === "ultra" && <PlasmaFill reducedMotion={reducedMotion} />}</div>
        {EFFORT_LEVELS.map((level, stop) => <i key={level} className={`effort-stop ${stop <= index ? "on" : ""}`} style={{ "--stop": stop / last } as CSSProperties} />)}
        <span className="effort-knob" />
      </div>
      <input type="range" min={0} max={last} step={1} value={index} aria-label="Esforço do modelo" aria-valuetext={`${info.label}: ${info.description}`} onChange={(event) => onChange(effortAt(Number(event.target.value)))} />
    </div>
    <div className="effort-scale"><span>Mais rápido</span><span>Mais inteligente</span></div>
    <small className="effort-description">{info.description}</small>
  </div>;
}
