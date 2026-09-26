import type { OrbitalState } from "./orbitalState";
import type { RobotExpression } from "./robotExpression";
import { ROBOT_SIZE } from "./robotMotion";

/**
 * O que o robô-mouse está fazendo (vem de `computer.rs`/`desktop.rs`/`choreo.rs`). Ao carregar algo a
 * ordem é sempre: approach → face → crouch → reach → grab → lift → turn → carry → arrive → lower → extend →
 * release → rise (tabela em `skills/mover-arquivos-e-janelas/movimento_robo.md`).
 */
export type CursorAction = "appear" | "home" | "move" | "point" | "click" | "double-click" | "right-click" | "grab" | "carry" | "drag" | "drop" | "scroll" | "type" | "look" | "wait"
  | "approach" | "face" | "crouch" | "reach" | "lift" | "turn" | "arrive" | "lower" | "extend" | "release" | "rise";

/** Vista do robô: de frente para o usuário, de lado (andando) ou de costas (subindo a tela, "para dentro"). */
export type RobotView = "front" | "side" | "back";

/** Ações em que o robô está andando (o corpo balança a cada passo). */
export const WALKING_ACTIONS: readonly CursorAction[] = ["approach", "carry"];

/**
 * Gesto do corpo. `idle` = como no modo voz (mãos abertas embaixo do rosto); `point` = indicador
 * esticado com a ponta do dedo na ponta do mouse; `press` = o mesmo dedo apertando (clique);
 * `grip`/`carry` = as duas mãos segurando (ícone, janela pela barra de título); `reach` = mãos abertas
 * viradas para baixo (esticando para pegar ou acabando de soltar); `type` = digitando.
 */
export type RobotGesture = "idle" | "point" | "press" | "grip" | "carry" | "reach" | "type";

export interface CursorLook {
  state: OrbitalState;
  expression: RobotExpression;
  gesture: RobotGesture;
  /** Mostra o rótulo ("É este? …") ao lado do rosto. */
  showLabel: boolean;
}

/** Rosto e gesto para cada ação; `settled` = já chegou ao alvo (antes disso só viaja). */
export function cursorLook(action: CursorAction, settled: boolean): CursorLook {
  const look = (gesture: RobotGesture, expression: RobotExpression, showLabel = false, state: OrbitalState = "idle"): CursorLook => ({ gesture, expression, showLabel, state });
  switch (action) {
    case "appear":
    case "home":
    case "move":
    case "approach":
    case "crouch": return look("idle", "neutral");
    case "face": return look("idle", "smiling");
    case "reach": return look("reach", "suspicious");
    case "lift":
    case "extend": return look("grip", "smiling", true);
    case "turn":
    case "arrive":
    case "lower": return look("carry", "smiling", true);
    case "release": return look("reach", "smiling");
    case "rise": return look("idle", "smiling");
    case "point": return settled ? look("point", "suspicious", true) : look("point", "neutral");
    case "click":
    case "double-click": return settled ? look("press", "smiling") : look("point", "neutral");
    case "right-click": return settled ? look("press", "suspicious") : look("point", "neutral");
    case "grab": return look("grip", "surprised", true);
    case "carry":
    case "drag": return look("carry", "smiling", true);
    case "drop": return look("idle", "smiling");
    case "scroll": return look("point", "neutral");
    case "type": return look("type", "talking", false, "speaking");
    case "look": return look("idle", "neutral", false, "processing");
    case "wait": return look("idle", "suspicious");
    default: return look("idle", "neutral");
  }
}

export interface Pose { mirrorX: boolean; flipY: boolean }

/** Onde fica a ponta do dedo (apontando) em relação ao centro do rosto, em frações do tamanho. */
export const POINT_REACH = { x: .62, y: .6 };
/** Onde as duas mãos seguram, abaixo do rosto (fração do tamanho). */
export const GRIP_DROP = .37;

/**
 * Vetor do centro do rosto até a "ponta do mouse" do gesto. Apontando, o corpo fica embaixo e à direita
 * do dedo (como a seta do Windows); espelhado, embaixo e à esquerda; virado, em cima.
 */
export function hotspotOffset(gesture: RobotGesture, pose: Pose, size = ROBOT_SIZE, reach?: number): { x: number; y: number } {
  if (gesture === "point" || gesture === "press") {
    return { x: POINT_REACH.x * size * (pose.mirrorX ? 1 : -1), y: POINT_REACH.y * size * (pose.flipY ? 1 : -1) };
  }
  // Na coreografia o Rust diz o comprimento do braço invisível: o rosto fica `reach` × tamanho acima das mãos.
  if (reach !== undefined) return { x: 0, y: reach * size };
  if (gesture === "grip" || gesture === "carry" || gesture === "reach" || gesture === "type") return { x: 0, y: GRIP_DROP * size };
  return { x: 0, y: 0 };
}

/**
 * Para onde o rosto vira e olha: `turn` -1…1 (lado), `look` x/y (-1…1, y negativo = para baixo) e `back`
 * 0…1 (de costas: o visor some atrás da esfera) e `side` 0…1 (de perfil: visor na borda, estreito).
 */
export interface Gaze { turn: number; look: [number, number]; back?: number; side?: number }

/**
 * Olhar de cada estado da coreografia. A vista vem do Rust (`view`): de lado, vira o rosto para onde anda;
 * de costas, o visor some; de frente, olha para o usuário — e para baixo, para o objeto, ao pegar e soltar.
 * `undefined` = o rosto olha em volta sozinho (como no modo voz).
 */
export function gazeFor(action: CursorAction, facing = 0, view?: RobotView): Gaze | undefined {
  const walking = action === "approach" || action === "turn" || action === "carry";
  if (walking && view === "back") return { turn: facing * .35, look: [0, .2], back: 1 };
  if (walking && view === "front") return { turn: 0, look: [facing * .15, -.2] };
  switch (action) {
    case "approach":
    case "turn":
    case "carry": return { turn: facing * .9, look: [facing * .7, -.1], side: 1 };
    // Virou de frente para o usuário: olha para ele antes de pegar e depois de chegar.
    case "face":
    case "arrive": return { turn: 0, look: [0, .05] };
    case "crouch":
    case "reach":
    case "grab":
    case "lift":
    case "lower":
    case "extend":
    case "release": return { turn: 0, look: [0, -.75] };
    case "rise": return { turn: 0, look: [0, .1] };
    default: return undefined;
  }
}

/**
 * Onde o corpo fica em relação às mãos quando anda de lado: atrás do objeto (quem carrega uma caixa leva a
 * caixa na frente). Fração do tamanho, no eixo x; 0 de frente/de costas.
 */
export function carrySideShift(action: CursorAction, facing = 0, view?: RobotView): number {
  if (view !== "side") return 0;
  return action === "turn" || action === "carry" || action === "approach" ? -facing * .14 : 0;
}

/** Balanço de um passo (px para cima) para a fase `phase` (1 = um passo inteiro): sobe e desce duas vezes por ciclo. */
export function stepBob(phase: number, amplitude = 3.2): number {
  return amplitude * Math.abs(Math.sin(phase * Math.PI));
}

/**
 * Qual mão aponta, conforme o lugar na tela: o corpo precisa caber inteiro. Perto da borda direita o
 * robô passa para o outro lado e aponta com a outra mão; perto do rodapé, fica em cima do alvo.
 */
export function choosePose(point: { x: number; y: number }, viewport: { width: number; height: number }, size = ROBOT_SIZE, current?: Pose): Pose {
  const bodyRight = point.x + (POINT_REACH.x + .5) * size + 150; // + rótulo
  const bodyLeft = point.x - (POINT_REACH.x + .5) * size;
  const bodyBottom = point.y + (POINT_REACH.y + .5) * size + 36;
  let mirrorX = current?.mirrorX ?? false;
  if (!mirrorX && bodyRight > viewport.width) mirrorX = true;
  else if (mirrorX && bodyLeft < 0) mirrorX = false;
  const flipY = bodyBottom > viewport.height;
  return { mirrorX, flipY };
}
