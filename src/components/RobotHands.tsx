import { useId, type CSSProperties } from "react";

/** Pose das mãos: paradas, segurando (arrastar/cartaz), apertando (clique) ou digitando. */
export type HandPose = "rest" | "grip" | "press" | "type" | "point";

// Mão direita em matriz de LEDs (o polegar fica do lado de dentro, à esquerda); a esquerda é espelhada.
const SHAPES: Record<"rest" | "grip" | "point", string[]> = {
  rest: [
    "..#.#.#.#.",
    "..#.#.#.#.",
    "..#######.",
    "#.########",
    "##########",
    ".#########",
    "..#######.",
    "...#####..",
  ],
  // Dedos dobrados por cima de uma borda (cartaz, ícone agarrado).
  grip: [
    "..##.##.#.",
    ".#########",
    "##########",
    "##########",
    ".#########",
    "..#######.",
    "...#####..",
  ],
  // Indicador esticado (clique com o botão direito, apontar).
  point: [
    "...#......",
    "...#......",
    "...#......",
    "..#######.",
    "#.########",
    "##########",
    ".########.",
    "..######..",
  ],
};

const COLUMNS = 10;

interface RobotHandsProps {
  pose: HandPose;
  /** Tamanho de cada LED em px. */
  cell?: number;
  /** Qual mão aperta no clique com o botão direito. */
  side?: "both" | "left" | "right";
  className?: string;
}

function Hand({ rows, cell, mirror, gradient, className }: { rows: string[]; cell: number; mirror: boolean; gradient: string; className: string }) {
  const width = COLUMNS * cell;
  const height = rows.length * cell;
  return <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={mirror ? { transform: "scaleX(-1)" } : undefined}>
    {rows.flatMap((row, y) => [...row].map((char, x) => char === "#"
      ? <rect key={`${x}-${y}`} x={x * cell + cell * .1} y={y * cell + cell * .1} width={cell * .8} height={cell * .8} rx={cell * .22} fill={`url(#${gradient})`} />
      : null))}
  </svg>;
}

/** Duas mãos de LED do robô; mesma linguagem visual do visor (pontos azul-esverdeados com brilho). */
export function RobotHands({ pose, cell = 3.4, side = "both", className = "" }: RobotHandsProps) {
  const id = useId().replace(/:/g, "");
  const gradient = `robot-hand-${id}`;
  const shapeFor = (hand: "left" | "right") => {
    if (pose === "point" && (side === "both" || side === hand)) return SHAPES.point;
    if (pose === "rest" || pose === "point") return SHAPES.rest;
    return SHAPES.grip;
  };
  const pressing = (hand: "left" | "right") => pose === "press" && (side === "both" || side === hand);
  return <div className={`robot-hands pose-${pose} ${className}`}>
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ff0dc" />
          <stop offset=".55" stopColor="#2cc4b8" />
          <stop offset="1" stopColor="#1a8a96" />
        </linearGradient>
      </defs>
    </svg>
    <Hand rows={shapeFor("left")} cell={cell} mirror gradient={gradient} className={`robot-hand left ${pressing("left") ? "pressing" : ""}`} />
    <Hand rows={shapeFor("right")} cell={cell} mirror={false} gradient={gradient} className={`robot-hand right ${pressing("right") ? "pressing" : ""}`} />
  </div>;
}

/** Largura em px de uma mão com LEDs de `cell` px. */
export const handWidth = (cell: number) => COLUMNS * cell;
/** Altura em px de uma mão na pose. */
export const handHeight = (cell: number, shape: "rest" | "grip" | "point" = "rest") => SHAPES[shape].length * cell;
/** Ponta do indicador na mão "point" (antes de girar): coluna 3, topo; espelhada, do outro lado. */
export const fingerTip = (cell: number, mirror = false) => ({ x: mirror ? (COLUMNS - 3.5) * cell : 3.5 * cell, y: .15 * cell });

/** Uma mão de LED solta (o robô-mouse posiciona cada mão sozinho). `mirror` = mão esquerda. */
export function LedHand({ shape, cell, mirror = false, className = "", style }: { shape: "rest" | "grip" | "point"; cell: number; mirror?: boolean; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const gradient = `robot-led-${id}`;
  return <div className={`robot-led-hand ${className}`} style={style}>
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ff0dc" />
          <stop offset=".55" stopColor="#2cc4b8" />
          <stop offset="1" stopColor="#1a8a96" />
        </linearGradient>
      </defs>
    </svg>
    <Hand rows={SHAPES[shape]} cell={cell} mirror={mirror} gradient={gradient} className="robot-hand" />
  </div>;
}

/** Uma só mão apontando com o indicador: a ponta do dedo é a ponta do mouse do agente. */
export function PointerHand({ cell = 3.4, pressing = false, className = "", style }: { cell?: number; pressing?: boolean; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const gradient = `robot-pointer-${id}`;
  return <div className={`robot-pointer-hand ${pressing ? "pressing" : ""} ${className}`} style={style}>
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ff0dc" />
          <stop offset=".55" stopColor="#2cc4b8" />
          <stop offset="1" stopColor="#1a8a96" />
        </linearGradient>
      </defs>
    </svg>
    <Hand rows={SHAPES.point} cell={cell} mirror={false} gradient={gradient} className="robot-hand pointer" />
  </div>;
}
