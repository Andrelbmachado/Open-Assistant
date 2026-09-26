import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AssistantFace } from "./AssistantFace";
import { RobotCharacter } from "./RobotCharacter";
import type { SpeechPulse } from "./RobotFace";
import type { OrbitalSkin, OrbitalState } from "../utils/orbitalState";
import type { RobotExpression } from "../utils/robotExpression";
import { clampToZone, contentColumn, fallbackZone, freeZones, nearestZone, wanderTarget, type Box, type Zone } from "../utils/freeZones";
import { leanFor, REST_WOBBLE, ROBOT_SIZE, stepBody, stepWobble, type Body, type Wobble } from "../utils/robotMotion";
import { isQAOffline } from "../utils/qaMode";

/** Caixa do robô flutuante: rosto + mãos + pílula de estado. */
const WIDTH = ROBOT_SIZE + 24;
const HEIGHT = Math.round(ROBOT_SIZE * 1.02) + 34;
/** Centro do rosto dentro da caixa. */
const FACE_CENTER = { x: WIDTH / 2, y: ROBOT_SIZE / 2 + 4 };
const STORAGE_KEY = "open-assistant-face-position";

interface Point { x: number; y: number }

/** Retângulos da área de chat que tem o robô (ver `freeZones`). */
export interface ChatBounds { messages: Box; paddingX: number; composerTop: number }

interface FloatingFaceProps {
  skin: OrbitalSkin;
  state: OrbitalState;
  expression: RobotExpression;
  audioLevel?: number;
  reducedMotion: boolean;
  speechPulse: MutableRefObject<SpeechPulse>;
  status: string;
  leaving: boolean;
  /** Onde fica o texto do chat: o robô só passeia nas laterais livres. */
  getBounds?: () => ChatBounds | undefined;
  /** Desliga o modo voz (botão ao lado do estado). */
  onClose?: () => void;
}

/** Mantém o robô inteiro dentro da janela. */
export function clampFacePosition(point: Point, width: number, height: number): Point {
  return { x: Math.min(Math.max(8, point.x), Math.max(8, width - WIDTH - 8)), y: Math.min(Math.max(40, point.y), Math.max(40, height - HEIGHT - 12)) };
}

function initialPosition(): Point {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Point | null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clampFacePosition(saved, innerWidth, innerHeight);
  } catch { /* posição padrão */ }
  return clampFacePosition({ x: innerWidth - WIDTH - 40, y: innerHeight / 2 - HEIGHT / 2 }, innerWidth, innerHeight);
}

/**
 * Robô do modo voz solto na janela, sem fundo. Flutua **só nas zonas livres** (laterais da coluna de
 * mensagens), com física: acelera aos poucos, freia antes de chegar e o rosto recua quando freia rápido.
 * Pode ser arrastado (a posição fica salva). Quando o agente age no PC, este mesmo robô "sai" do app:
 * some daqui e aparece no mesmo lugar da tela como robô-mouse (`AgentCursor`); no fim, volta para cá.
 */
export function FloatingFace({ skin, state, expression, audioLevel, reducedMotion, speechPulse, status, leaving, getBounds, onClose }: FloatingFaceProps) {
  const [dragging, setDragging] = useState(false);
  const [away, setAway] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<Body>({ ...initialPosition(), vx: 0, vy: 0 });
  const target = useRef<Point>({ x: bodyRef.current.x, y: bodyRef.current.y });
  const drag = useRef<{ pointerId: number; dx: number; dy: number; last: Point; time: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const boundsRef = useRef(getBounds);
  boundsRef.current = getBounds;

  // O robô-mouse avisa quando sai do app e quando volta.
  useEffect(() => {
    if (isQAOffline()) return;
    let stop: () => void = () => undefined;
    listen<boolean>("robot-away", (event) => setAway(event.payload)).then((unlisten) => { stop = unlisten; }).catch(() => undefined);
    return () => { stop(); void invoke("robot_set_home", { x: null, y: null }).catch(() => undefined); };
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let nextWander = 0;
    let zones: Zone[] = [];
    let nextZones = 0;
    let wobble: Wobble = REST_WOBBLE;
    let lean = 0;
    let nextHome = 0;
    let lastHome = { x: NaN, y: NaN };
    let windowOrigin: Point | undefined;
    const readOrigin = () => { if (!isQAOffline()) getCurrentWindow().innerPosition().then((point) => { windowOrigin = { x: point.x, y: point.y }; }).catch(() => undefined); };
    readOrigin();
    const stopMoved = getCurrentWindow().onMoved(readOrigin).catch(() => () => undefined);
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      if (now > nextZones) {
        nextZones = now + 400;
        const bounds = boundsRef.current?.();
        zones = bounds ? freeZones(bounds.messages, contentColumn(bounds.messages, bounds.paddingX), bounds.composerTop, { width: WIDTH, height: HEIGHT }) : [];
        const fallback = bounds && !zones.length ? fallbackZone(bounds.messages, bounds.composerTop, { width: WIDTH, height: HEIGHT }) : undefined;
        if (fallback) zones = [fallback];
      }
      let body = bodyRef.current;
      let accel = { x: 0, y: 0 };
      if (!drag.current) {
        const zone = nearestZone(zones, body);
        if (zone) {
          const inside = clampToZone(body, zone);
          // Fora da zona (a janela mudou ou foi solto em cima do texto): volta flutuando para a lateral.
          if (Math.hypot(inside.x - body.x, inside.y - body.y) > 2) target.current = inside;
          else if (!reducedMotion && t > nextWander) {
            target.current = wanderTarget(zone, body);
            nextWander = t + 3.5 + Math.random() * 5;
          }
          target.current = clampToZone(target.current, zone);
        } else {
          target.current = clampFacePosition(target.current, innerWidth, innerHeight);
        }
        if (reducedMotion) body = { ...target.current, vx: 0, vy: 0 };
        else ({ body, accel } = stepBody(body, target.current, dt));
        bodyRef.current = body;
      }
      if (!reducedMotion) wobble = stepWobble(wobble, accel, dt);
      lean += (leanFor(accel.x) - lean) * .12;
      const speaking = stateRef.current === "speaking";
      const bob = reducedMotion ? 0 : Math.sin(t * (speaking ? 3.1 : 1.6)) * (speaking ? 5 : 4);
      const sway = reducedMotion ? 0 : Math.sin(t * (speaking ? 1.9 : .8)) * (speaking ? 3 : 1.2);
      const x = body.x + wobble.x;
      const y = body.y + wobble.y + bob;
      if (root.current) root.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(lean + sway).toFixed(2)}deg)`;
      // Conta ao Rust onde o robô está (pixels da tela), para o robô-mouse sair e voltar daqui.
      if (windowOrigin && now > nextHome) {
        nextHome = now + 250;
        const scale = devicePixelRatio || 1;
        const home = { x: Math.round(windowOrigin.x + (body.x + FACE_CENTER.x) * scale), y: Math.round(windowOrigin.y + (body.y + FACE_CENTER.y) * scale) };
        // Primeiro envio: `lastHome` ainda é NaN (e NaN > 3 é sempre falso).
        if (!Number.isFinite(lastHome.x) || Math.abs(home.x - lastHome.x) + Math.abs(home.y - lastHome.y) > 3) {
          lastHome = home;
          void invoke("robot_set_home", home).catch(() => undefined);
        }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); void stopMoved.then((stop) => stop()); };
  }, [reducedMotion]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const body = bodyRef.current;
    drag.current = { pointerId: event.pointerId, dx: event.clientX - body.x, dy: event.clientY - body.y, last: { x: body.x, y: body.y }, time: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = clampFacePosition({ x: event.clientX - current.dx, y: event.clientY - current.dy }, innerWidth, innerHeight);
    const now = performance.now();
    const dt = Math.max(.008, (now - current.time) / 1000);
    // Solto com velocidade: continua um pouco no embalo e freia sozinho.
    bodyRef.current = { x: next.x, y: next.y, vx: (next.x - current.last.x) / dt * .5, vy: (next.y - current.last.y) / dt * .5 };
    target.current = next;
    current.last = next;
    current.time = now;
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: bodyRef.current.x, y: bodyRef.current.y })); } catch { /* sem armazenamento */ }
  };

  return createPortal(<div ref={root} className={`floating-face ${leaving ? "leaving" : ""} ${dragging ? "dragging" : ""} ${away ? "away" : ""}`} style={{ width: WIDTH, transform: `translate(${bodyRef.current.x}px, ${bodyRef.current.y}px)` }} aria-label="Conversa por voz (arraste para mover)" role="region">
    <div className="floating-face-body" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} title="Arraste para mover">
      {skin === "robot"
        ? <div className="floating-robot" style={{ width: WIDTH, height: HEIGHT - 30 }}>
          <div className="floating-robot-anchor" style={{ left: FACE_CENTER.x, top: FACE_CENTER.y }}>
            <RobotCharacter state={state} expression={expression} gesture="idle" idleHands={state === "speaking" ? "rest" : "grip"} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} />
          </div>
        </div>
        : <AssistantFace skin={skin} state={state} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} className="orbital-canvas voice-face" />}
      <div className="floating-face-bar">
        <p className="floating-face-status" aria-live="polite">{status}</p>
        {onClose && <button className="floating-face-close" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} title="Desligar modo voz" aria-label="Desligar modo voz"><X size={12} /></button>}
      </div>
    </div>
  </div>, document.body);
}
