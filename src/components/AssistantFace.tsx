import type { MutableRefObject } from "react";
import { OrbitalCanvas } from "./OrbitalCanvas";
import { RobotFace, type SpeechPulse } from "./RobotFace";
import { SuperOrbital } from "./SuperOrbital";
import type { OrbitalSkin, OrbitalState } from "../utils/orbitalState";
import type { RobotExpression } from "../utils/robotExpression";

interface AssistantFaceProps {
  skin: OrbitalSkin;
  state: OrbitalState;
  expression?: RobotExpression;
  audioLevel?: number;
  reducedMotion?: boolean;
  speechPulse?: MutableRefObject<SpeechPulse>;
  className?: string;
}

/** Rosto do assistente no modo fala: robô, super orbital ou as orbitais de partículas. */
export function AssistantFace({ skin, state, expression = "idle", audioLevel, reducedMotion, speechPulse, className }: AssistantFaceProps) {
  if (skin === "robot") return <RobotFace state={state} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} className={className} />;
  if (skin === "super") return <SuperOrbital state={state} audioLevel={audioLevel} reducedMotion={reducedMotion} className={className} />;
  return <OrbitalCanvas skin={skin} state={state} audioLevel={audioLevel} reducedMotion={reducedMotion} />;
}
