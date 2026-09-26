import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const GRID = 18;
const TICK_MS = 120;

type Point = { x: number; y: number };
const DIRECTIONS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
};

/** Avança um passo: devolve a cobra nova, se comeu e se bateu (em si mesma; as bordas dão a volta). */
export function stepSnake(snake: Point[], direction: Point, apple: Point, grid = GRID): { snake: Point[]; ate: boolean; dead: boolean } {
  const head = { x: (snake[0].x + direction.x + grid) % grid, y: (snake[0].y + direction.y + grid) % grid };
  const ate = head.x === apple.x && head.y === apple.y;
  const body = ate ? snake : snake.slice(0, -1);
  const dead = body.some((part) => part.x === head.x && part.y === head.y);
  return { snake: [head, ...body], ate, dead };
}

function randomApple(snake: Point[]): Point {
  for (;;) {
    const apple = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!snake.some((part) => part.x === apple.x && part.y === apple.y)) return apple;
  }
}

/** Posição desenhada de cada gomo entre dois passos (0 → 1). Atravessar a borda não desliza: pula. */
export function lerpSegment(from: Point | undefined, to: Point, t: number): Point {
  if (!from || Math.abs(from.x - to.x) > 1 || Math.abs(from.y - to.y) > 1) return to;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

const START = () => ({ snake: [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }], previous: [{ x: 7, y: 9 }, { x: 6, y: 9 }, { x: 5, y: 9 }], direction: { x: 1, y: 0 }, queued: [] as Point[], apple: { x: 13, y: 9 }, over: false, stepAt: 0 });

/**
 * Jogo da cobrinha dentro da prévia enquanto a imagem é gerada (setas ou WASD). Minimalista: fundo
 * preto, mini círculos marcando as casas, cobrinha de pontos azuis (a cabeça maior, clara e com olhos),
 * maçã vermelha simples. A lógica anda em passos; o desenho desliza entre um passo e outro (60 fps).
 * Quando a imagem fica pronta, o componente pai troca o jogo pela imagem: ele para na hora.
 */
export function SnakeGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem("open-assistant-snake-best") ?? 0); } catch { return 0; } });
  const [over, setOver] = useState(false);
  const game = useRef(START());

  const restart = () => {
    game.current = { ...START(), stepAt: performance.now() };
    setScore(0);
    setOver(false);
  };

  useEffect(() => {
    const element = canvas.current;
    element?.focus();
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const css = element.clientWidth || 360;
    element.width = Math.round(css * ratio);
    element.height = Math.round(css * ratio);
    context.scale(ratio, ratio);
    const cell = css / GRID;
    game.current.stepAt = performance.now();

    const draw = (now: number) => {
      const state = game.current;
      const t = state.over ? 1 : Math.min(1, (now - state.stepAt) / TICK_MS);
      context.fillStyle = "#000";
      context.fillRect(0, 0, css, css);
      // Casas por onde a cobrinha anda: mini círculos.
      context.strokeStyle = "rgba(255, 255, 255, .09)";
      context.lineWidth = 1;
      for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
        context.beginPath();
        context.arc(x * cell + cell / 2, y * cell + cell / 2, cell * .1, 0, Math.PI * 2);
        context.stroke();
      }
      // Maçã: círculo vermelho, cabinho e folha.
      const ax = state.apple.x * cell + cell / 2;
      const ay = state.apple.y * cell + cell / 2 + cell * .04;
      context.fillStyle = "#ff3b3b";
      context.beginPath();
      context.arc(ax, ay, cell * .3, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#7a4a2a";
      context.lineWidth = Math.max(1, cell * .06);
      context.beginPath();
      context.moveTo(ax, ay - cell * .26);
      context.lineTo(ax + cell * .04, ay - cell * .4);
      context.stroke();
      context.fillStyle = "#3fbf5f";
      context.beginPath();
      context.ellipse(ax + cell * .13, ay - cell * .36, cell * .1, cell * .05, -0.5, 0, Math.PI * 2);
      context.fill();
      // Cobrinha: do rabo para a cabeça, pontos azuis que afinam no fim.
      const length = state.snake.length;
      for (let index = length - 1; index >= 0; index--) {
        const point = lerpSegment(state.previous[index] ?? state.previous[state.previous.length - 1], state.snake[index], t);
        const cx = point.x * cell + cell / 2;
        const cy = point.y * cell + cell / 2;
        if (index === 0) continue;
        const fade = 1 - index / (length + 4);
        context.fillStyle = `rgba(47, 123, 255, ${.45 + .55 * fade})`;
        context.beginPath();
        context.arc(cx, cy, cell * (.2 + .12 * fade), 0, Math.PI * 2);
        context.fill();
      }
      const head = lerpSegment(state.previous[0], state.snake[0], t);
      const hx = head.x * cell + cell / 2;
      const hy = head.y * cell + cell / 2;
      context.fillStyle = "#9cc8ff";
      context.shadowColor = "rgba(90, 160, 255, .8)";
      context.shadowBlur = cell * .6;
      context.beginPath();
      context.arc(hx, hy, cell * .4, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      // Olhos olhando para onde ela vai.
      const { x: dx, y: dy } = state.direction;
      context.fillStyle = "#06101f";
      for (const side of [-1, 1]) {
        context.beginPath();
        context.arc(hx + dx * cell * .14 - dy * side * cell * .15, hy + dy * cell * .14 + dx * side * cell * .15, cell * .065, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    let frame = requestAnimationFrame(draw);

    const timer = setInterval(() => {
      const state = game.current;
      if (state.over) return;
      const next = state.queued.shift();
      if (next && !(next.x === -state.direction.x && next.y === -state.direction.y)) state.direction = next;
      const result = stepSnake(state.snake, state.direction, state.apple);
      if (result.dead) {
        state.over = true;
        setOver(true);
        return;
      }
      state.previous = state.snake;
      state.snake = result.snake;
      state.stepAt = performance.now();
      if (result.ate) {
        state.apple = randomApple(result.snake);
        setScore((value) => {
          const score = value + 1;
          setBest((current) => {
            const best = Math.max(current, score);
            try { localStorage.setItem("open-assistant-snake-best", String(best)); } catch { /* sem armazenamento */ }
            return best;
          });
          return score;
        });
      }
    }, TICK_MS);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, []);

  const onKey = (event: KeyboardEvent) => {
    const direction = DIRECTIONS[event.code];
    if (!direction) {
      if (over && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); restart(); }
      return;
    }
    event.preventDefault();
    if (over) { restart(); return; }
    if (game.current.queued.length < 2) game.current.queued.push(direction);
  };

  return <div className="snake-game">
    <canvas ref={canvas} tabIndex={0} onKeyDown={onKey} aria-label="Jogo da cobrinha: use as setas ou WASD" onClick={() => { canvas.current?.focus(); if (over) restart(); }} />
    <div className="snake-hud"><span>{score}</span><span>recorde {best}</span></div>
    {over && <div className="snake-over">Fim de jogo · clique ou aperte uma seta</div>}
  </div>;
}
