import { useEffect, useState } from "react";
import { AssistantFace } from "./AssistantFace";
import { ORBITAL_STATES, type OrbitalSkin, type OrbitalState } from "../utils/orbitalState";
import { ROBOT_EXPRESSION_LABELS, type RobotExpression } from "../utils/robotExpression";

interface PreviewMode { id: string; label: string; state: OrbitalState; expression: RobotExpression }

const ROBOT_MODES: PreviewMode[] = [
  { id: "idle", label: ROBOT_EXPRESSION_LABELS.idle, state: "idle", expression: "idle" },
  { id: "listening", label: "Ouvindo", state: "listening", expression: "idle" },
  { id: "processing", label: "Pensando", state: "processing", expression: "idle" },
  ...(["talking", "stopping", "whisper", "shouting", "calm", "fast", "angry"] as const).map((expression) => ({ id: expression, label: ROBOT_EXPRESSION_LABELS[expression], state: "speaking" as const, expression })),
];

const ORBITAL_LABELS: Record<OrbitalState, string> = { idle: "Ocioso", listening: "Ouvindo", processing: "Pensando", speaking: "Falando", error: "Erro" };
const ORBITAL_MODES: PreviewMode[] = ORBITAL_STATES.map((state) => ({ id: state === "speaking" ? "talking" : state, label: ORBITAL_LABELS[state], state, expression: "idle" }));

/** Prévia ao vivo do rosto escolhido, com todas as variações de expressão. */
export function FacePreview({ skin, reducedMotion }: { skin: OrbitalSkin; reducedMotion?: boolean }) {
  const modes = skin === "robot" ? ROBOT_MODES : ORBITAL_MODES;
  const [modeId, setModeId] = useState("talking");
  const [talkingPhase, setTalkingPhase] = useState(true);
  const mode = modes.find((item) => item.id === modeId) ?? modes.find((item) => item.state === "speaking") ?? modes[0];

  // "Parando de falar" alterna fala e silêncio para mostrar a transição.
  useEffect(() => {
    if (mode.id !== "stopping") return;
    setTalkingPhase(true);
    const timer = setInterval(() => setTalkingPhase((value) => !value), 1800);
    return () => clearInterval(timer);
  }, [mode.id]);

  const stopping = mode.id === "stopping";
  const state: OrbitalState = stopping ? (talkingPhase ? "speaking" : "idle") : mode.state;
  const expression: RobotExpression = stopping ? (talkingPhase ? "talking" : "stopping") : mode.expression;

  return <div className="face-preview">
    <div className={`face-preview-stage skin-${skin}`}>
      <AssistantFace skin={skin} state={state} expression={expression} reducedMotion={reducedMotion} className="orbital-canvas" />
    </div>
    <div className="face-preview-modes" role="group" aria-label="Variações do rosto">
      {modes.map((item) => <button key={item.id} className={item.id === mode.id ? "active" : ""} onClick={() => setModeId(item.id)}>{item.label}</button>)}
    </div>
  </div>;
}
