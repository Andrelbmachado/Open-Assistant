import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import { RobotFace, type SpeechPulse } from "./RobotFace";
import { fingerTip, handWidth, LedHand, RobotHands, type HandPose } from "./RobotHands";
import { hotspotOffset, type Gaze, type Pose, type RobotGesture, type RobotView } from "../utils/robotCursor";
import { ROBOT_SIZE } from "../utils/robotMotion";
import type { OrbitalState } from "../utils/orbitalState";
import type { RobotExpression } from "../utils/robotExpression";

interface RobotCharacterProps {
  state: OrbitalState;
  expression: RobotExpression;
  gesture: RobotGesture;
  pose?: Pose;
  /** Mãos no gesto `idle`: abertas (falando) ou fechadas por cima de uma borda. */
  idleHands?: HandPose;
  /** Muda a cada clique para repetir a animação do dedo apertando. */
  pressKey?: number;
  label?: string;
  audioLevel?: number;
  reducedMotion?: boolean;
  speechPulse?: MutableRefObject<SpeechPulse>;
  size?: number;
  /** Para onde o rosto olha (coreografia de carregar); sem isso ele olha em volta sozinho. */
  gaze?: Gaze;
  /** De frente, de lado ou de costas (robô-mouse carregando algo). */
  view?: RobotView;
}

/**
 * O robô inteiro, desenhado a partir do **centro do rosto** (0, 0): o mesmo personagem e o mesmo tamanho
 * no modo voz e no robô-mouse. Mãos de LED com tamanho de LED = tamanho/36 em todos os gestos.
 */
export function RobotCharacter({ state, expression, gesture, pose = { mirrorX: false, flipY: false }, idleHands = "rest", pressKey = 0, label, audioLevel, reducedMotion, speechPulse, size = ROBOT_SIZE, gaze, view = "front" }: RobotCharacterProps) {
  const cell = size / 36;
  const face = <RobotFace state={state} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} gaze={gaze} className="robot-character-face" />;
  const hot = hotspotOffset(gesture, pose, size);
  let hands: ReactNode;
  if (gesture === "point" || gesture === "press") {
    // Mão que aponta: a ponta do indicador fica exatamente no ponto do mouse e a mão aponta para lá a partir do rosto.
    const mirror = pose.mirrorX;
    const tip = fingerTip(cell, mirror);
    const angle = Math.atan2(hot.y, hot.x) * 180 / Math.PI + 90;
    const length = Math.hypot(hot.x, hot.y);
    const poke = { "--poke-x": `${(hot.x / length) * size * .06}px`, "--poke-y": `${(hot.y / length) * size * .06}px` } as CSSProperties;
    const other = mirror ? -1 : 1;
    hands = <>
      <LedHand key={`point-${pressKey}`} shape="point" cell={cell} mirror={mirror} className={`robot-pointing-hand ${gesture === "press" ? "pressing" : ""}`}
        style={{ ...poke, left: hot.x - tip.x, top: hot.y - tip.y, transformOrigin: `${tip.x}px ${tip.y}px`, transform: `rotate(${angle.toFixed(1)}deg)` }} />
      <LedHand shape="rest" cell={cell} mirror={!mirror} className="robot-resting-hand" style={{ left: other * size * .2 - handWidth(cell) / 2, top: size * .27 }} />
      {gesture === "press" && <span key={`ripple-${pressKey}`} className="robot-press-ripple" style={{ left: hot.x - 14, top: hot.y - 14 }} />}
    </>;
  } else {
    const handsPose: HandPose = gesture === "idle" ? idleHands : gesture === "type" ? "type" : gesture === "reach" ? "rest" : "grip";
    // Altura das mãos = braço invisível (`--reach`, animado pelo robô-mouse); sem ele, logo abaixo do rosto.
    hands = <div className={`robot-character-hands gesture-${gesture}`} style={{ top: `calc(${size}px * (var(--reach, .37) - .11))`, left: "var(--hands-x, 0px)" }}>
      <RobotHands pose={handsPose} cell={cell} />
    </div>;
  }
  const labelLeft = hot.x <= 0;
  return <div className={`robot-character gesture-${gesture} view-${view}`} style={{ "--robot-size": `${size}px` } as CSSProperties}>
    <div className="robot-character-face-wrap" style={{ left: -size / 2, top: -size / 2, width: size, height: size }}>{face}</div>
    {hands}
    {label && <span className={`robot-character-label ${labelLeft ? "right" : "left"}`} style={labelLeft ? { left: size / 2 + 6, top: -size * .2 } : { left: -size / 2 - 6, top: -size * .2 }}>{label}</span>}
  </div>;
}
