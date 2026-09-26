import type { MutableRefObject } from "react";
import { RobotFace, type SpeechPulse } from "./RobotFace";
import { RobotHands, type HandPose } from "./RobotHands";
import type { OrbitalState } from "../utils/orbitalState";
import type { RobotExpression } from "../utils/robotExpression";

interface RobotAvatarProps {
  state: OrbitalState;
  expression: RobotExpression;
  hands: HandPose;
  /** Texto do cartaz segurado pelas mãos (sem texto, não há cartaz). */
  sign?: string;
  /** Diâmetro do rosto em px; mãos e cartaz acompanham. */
  size?: number;
  handSide?: "both" | "left" | "right";
  audioLevel?: number;
  reducedMotion?: boolean;
  speechPulse?: MutableRefObject<SpeechPulse>;
  className?: string;
}

/**
 * Robô completo: rosto de LED, mãos de LED e, opcionalmente, um cartaz branco seguro pelas mãos.
 * As mãos ficam na base do rosto; o ponto entre elas é a "ponta" quando o robô é o mouse do agente.
 */
export function RobotAvatar({ state, expression, hands, sign, size = 96, handSide, audioLevel, reducedMotion, speechPulse, className = "" }: RobotAvatarProps) {
  const cell = Math.max(1.6, size / 36);
  return <div className={`robot-avatar ${sign ? "with-sign" : ""} ${className}`} style={{ width: size, "--robot-size": `${size}px` } as React.CSSProperties}>
    <RobotFace state={state} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} className="robot-avatar-face" />
    {sign && <div className="robot-sign" role="note"><span>{sign}</span></div>}
    <RobotHands pose={sign ? "grip" : hands} side={handSide} cell={cell} className="robot-avatar-hands" />
  </div>;
}
