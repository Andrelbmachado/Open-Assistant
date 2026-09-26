import type { CSSProperties } from "react";
import { DEFAULT_EFFORT_SKIN, type EffortSkin } from "../utils/effortSkin";
import { EffortFill } from "./EffortFill";
import { EFFORT_INFO, EFFORT_LEVELS, effortAt, effortIndex, type EffortLevel } from "../utils/effort";

interface EffortControlProps {
  value: EffortLevel;
  onChange: (value: EffortLevel) => void;
  reducedMotion?: boolean;
  /** Visual do preenchimento animado no Ultra. */
  skin?: EffortSkin;
}

/** Slider de esforço no estilo do Claude Code: do mais rápido ao mais inteligente. */
export function EffortControl({ value, onChange, reducedMotion = false, skin = DEFAULT_EFFORT_SKIN }: EffortControlProps) {
  const index = effortIndex(value);
  const info = EFFORT_INFO[value];
  const last = EFFORT_LEVELS.length - 1;
  return <div className={`effort-control level-${value} skin-${skin}`}>
    <div className="effort-head">
      <span>Esforço</span>
      <b className="effort-name">{info.label}</b>
    </div>
    <div className="effort-slider" style={{ "--effort": index / last } as CSSProperties}>
      <div className="effort-track">
        <div className="effort-fill">{value === "ultra" && <EffortFill skin={skin} reducedMotion={reducedMotion} />}</div>
        {value !== "ultra" && EFFORT_LEVELS.map((level, stop) => <i key={level} className={`effort-stop ${stop <= index ? "on" : ""}`} style={{ "--stop": stop / last } as CSSProperties} />)}
        <span className="effort-knob" />
      </div>
      <input type="range" min={0} max={last} step={1} value={index} aria-label="Esforço do modelo" aria-valuetext={`${info.label}: ${info.description}`} onChange={(event) => onChange(effortAt(Number(event.target.value)))} />
    </div>
    <div className="effort-scale"><span>Mais rápido</span><span>Mais inteligente</span></div>
  </div>;
}
