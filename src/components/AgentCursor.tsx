import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { RobotCharacter } from "./RobotCharacter";
import { carrySideShift, choosePose, cursorLook, gazeFor, hotspotOffset, stepBob, WALKING_ACTIONS, type CursorAction, type Pose, type RobotView } from "../utils/robotCursor";
import { leanFor, motionProfile, ROBOT_SIZE } from "../utils/robotMotion";

/** Evento `agent-cursor` emitido por `computer.rs`/`desktop.rs` (pixels físicos relativos a esta janela). */
interface CursorEvent {
  x: number;
  y: number;
  action: CursorAction;
  label: string;
  visible: boolean;
  /** Tempo da viagem até o ponto (ms); o Rust só age depois disso. */
  duration: number;
  sign?: string;
  carry?: { width: number; height: number };
  /** Braço invisível (coreografia de carregar): rosto `reach` × tamanho acima das mãos. */
  reach?: number;
  /** -1 virado para a esquerda, 1 para a direita. */
  facing?: number;
  /** De frente para o usuário, de lado (andando) ou de costas (subindo a tela). */
  view?: RobotView;
}

/** Imagem do ícone que o robô carrega (evento `agent-cursor-carry` de `desktop.rs`; px físicos). */
interface CarryGhost { image: string; label: string; width: number; height: number; icon: number; grip: number }

interface Point { x: number; y: number }
interface Flight { from: Point; to: Point; handsFrom: Point; handsTo: Point; fromReach: number; toReach: number; start: number; duration: number; linear: boolean }

/** Braço sem coreografia: mãos logo abaixo do rosto. */
const ARM_REST = .37;
/** Comprimento de um passo (px): o corpo sobe e desce uma vez a cada passo andado. */
const STRIDE = 46;

/**
 * O mouse do agente é o próprio robô — o mesmo do modo voz, do mesmo tamanho. O ponteiro do usuário
 * não é usado: o Rust mexe no alvo pelas APIs do Windows e o robô encena por cima. A ponta do dedo
 * indicador (de qualquer uma das mãos, conforme o lugar na tela) é a ponta do mouse; ele aponta,
 * pergunta "É este?", aperta com o dedo (clique) ou segura com as duas mãos e carrega (ícone, janela).
 * Viaja com aceleração, freia antes de chegar e recua um pouco. Janela transparente, fora dos prints.
 */
export function AgentCursor() {
  const [cursor, setCursor] = useState<CursorEvent>();
  const [settled, setSettled] = useState(true);
  const [pressKey, setPressKey] = useState(0);
  const [pose, setPose] = useState<Pose>({ mirrorX: false, flipY: false });
  const body = useRef<HTMLDivElement>(null);
  const flight = useRef<Flight | undefined>(undefined);
  const position = useRef<{ x: number; y: number } | undefined>(undefined);
  const reachNow = useRef(ARM_REST);
  const lastGesture = useRef("idle");
  const walking = useRef(false);
  /** Onde estão as mãos agora (px lógicos): a imagem do ícone carregado fica presa nelas. */
  const hands = useRef<Point | undefined>(undefined);
  const [ghost, setGhost] = useState<CarryGhost>();
  const ghostEl = useRef<HTMLDivElement>(null);
  const poseRef = useRef(pose);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let stop: () => void = () => undefined;
    listen<CursorEvent>("agent-cursor", (event) => {
      const payload = event.payload;
      if (!payload.visible) { setCursor(undefined); setGhost(undefined); position.current = undefined; hands.current = undefined; flight.current = undefined; return; }
      // O Rust manda pixels físicos; o CSS usa pixels lógicos.
      const scale = window.devicePixelRatio || 1;
      const point = { x: payload.x / scale, y: payload.y / scale };
      const look = cursorLook(payload.action, true);
      const nextPose = look.gesture === "point" || look.gesture === "press" ? choosePose(point, { width: innerWidth, height: innerHeight }, ROBOT_SIZE, poseRef.current) : poseRef.current;
      poseRef.current = nextPose;
      setPose(nextPose);
      const offset = hotspotOffset(look.gesture, nextPose, ROBOT_SIZE, payload.reach);
      // Andando de lado, o corpo fica atrás do que carrega (o objeto vai na frente).
      const shift = carrySideShift(payload.action, payload.facing ?? 0, payload.view) * ROBOT_SIZE;
      const face = { x: point.x - offset.x + shift, y: point.y - offset.y };
      // Perto do topo da tela o rosto não cabe acima das mãos: o robô segura de lado (rosto ao lado do que
      // carrega, virado para o meio da tela), sem sair da tela e sem tampar o objeto.
      let reachTarget = payload.reach ?? ARM_REST;
      const top = ROBOT_SIZE * .5 + 4;
      if (payload.reach !== undefined && face.y < top) {
        const side = point.x > innerWidth / 2 ? 1 : -1;
        face.x = point.x - side * ROBOT_SIZE * .62;
        face.y = Math.max(top, point.y + ROBOT_SIZE * .12);
        reachTarget = (point.y - face.y) / ROBOT_SIZE;
      }
      walking.current = WALKING_ACTIONS.includes(payload.action);
      const now = performance.now();
      const current = position.current ?? (payload.action === "appear" ? face : { x: face.x + 160, y: face.y + 120 });
      // Trocar de gesto no mesmo lugar (apontar → segurar) também desliza, nunca pula. Na coreografia os
      // tempos já vêm do Rust (choreo.rs) e os quadros seguidos (≤ 60 ms) andam em linha reta.
      const gestureChanged = lastGesture.current !== look.gesture;
      lastGesture.current = look.gesture;
      const duration = payload.action === "appear" ? 0 : Math.max(payload.duration, gestureChanged && payload.reach === undefined ? 240 : 0);
      const toReach = reachTarget;
      flight.current = { from: current, to: face, handsFrom: hands.current ?? point, handsTo: point, fromReach: reachNow.current, toReach, start: now, duration, linear: payload.duration <= 60 || payload.action === "carry" || payload.action === "drag" };
      position.current = current;
      setCursor(payload);
      setSettled(duration <= 60);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        setSettled(true);
        if (["click", "double-click", "right-click"].includes(payload.action)) {
          setPressKey((value) => value + 1);
          if (payload.action === "double-click") setTimeout(() => setPressKey((value) => value + 1), 220);
        }
      }, Math.max(0, duration - 30));
    }).then((unlisten) => { stop = unlisten; void invoke("robot_cursor_ready").catch(() => undefined); }).catch(() => undefined);
    // Ícone da área de trabalho: a imagem dele passa para as mãos ao pegar e some ao soltar.
    let stopGhost: () => void = () => undefined;
    listen<CarryGhost | null>("agent-cursor-carry", (event) => setGhost(event.payload ?? undefined)).then((unlisten) => { stopGhost = unlisten; }).catch(() => undefined);
    return () => { stop(); stopGhost(); if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, []);

  // Voo com a curva do robô; a inclinação acompanha a aceleração (para frente ao sair, para trás ao frear).
  // Andando, o corpo sobe e desce a cada passo (a distância andada marca o ritmo) e as mãos ficam no objeto.
  useEffect(() => {
    let frame = 0;
    let previous = { x: 0, y: 0, vx: 0, time: performance.now() };
    let lean = 0;
    let stride = 0;
    let bob = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const current = flight.current;
      if (!current || !body.current) return;
      const t = current.duration <= 0 ? 1 : Math.min(1, (now - current.start) / current.duration);
      const k = current.linear ? t : motionProfile(t);
      const x = current.from.x + (current.to.x - current.from.x) * k;
      const y = current.from.y + (current.to.y - current.from.y) * k;
      position.current = { x, y };
      hands.current = { x: current.handsFrom.x + (current.handsTo.x - current.handsFrom.x) * k, y: current.handsFrom.y + (current.handsTo.y - current.handsFrom.y) * k };
      if (ghostEl.current) ghostEl.current.style.transform = `translate(${hands.current.x.toFixed(1)}px, ${hands.current.y.toFixed(1)}px)`;
      reachNow.current = current.fromReach + (current.toReach - current.fromReach) * (current.linear ? t : Math.min(1, Math.max(0, motionProfile(t))));
      const dt = Math.max(1, now - previous.time) / 1000;
      const vx = (x - previous.x) / dt;
      const ax = (vx - previous.vx) / dt;
      const moved = Math.hypot(x - previous.x, y - previous.y);
      previous = { x, y, vx, time: now };
      lean += (leanFor(ax / 12) - lean) * .18;
      stride += walking.current && moved < 80 ? moved / STRIDE : 0;
      bob += ((walking.current ? stepBob(stride) : 0) - bob) * .35;
      body.current.style.setProperty("--reach", (reachNow.current + bob / ROBOT_SIZE).toFixed(3));
      // As mãos ficam no objeto mesmo quando o corpo vai para o lado (andando de lado, perto do topo).
      body.current.style.setProperty("--hands-x", `${(hands.current.x - x).toFixed(1)}px`);
      body.current.style.transform = `translate(${x.toFixed(1)}px, ${(y - bob).toFixed(1)}px) rotate(${lean.toFixed(2)}deg)`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!cursor?.visible) return null;
  const look = cursorLook(cursor.action, settled);
  const label = !look.showLabel ? undefined : cursor.action === "point" ? `É este? ${cursor.label}` : cursor.label || undefined;
  const at = position.current;
  const gaze = gazeFor(cursor.action, cursor.facing ?? 0, cursor.view);
  const scale = window.devicePixelRatio || 1;
  const held = hands.current;
  return <>
    {/* O ícone carregado: mesmo tamanho e desenho do Explorer, com a borda de cima presa nas mãos. */}
    {ghost && <div ref={ghostEl} className="robot-carry-ghost" style={held ? { transform: `translate(${held.x}px, ${held.y}px)` } : undefined}>
      <div className="robot-carry-tile" style={{ width: ghost.width / scale, height: ghost.height / scale, left: -ghost.width / scale / 2, top: -ghost.grip / scale }}>
        <img src={ghost.image} alt="" style={{ width: ghost.icon / scale, height: ghost.icon / scale }} />
        <span>{ghost.label}</span>
      </div>
    </div>}
    <div ref={body} className={`agent-cursor robot-cursor action-${cursor.action}`} style={at ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined}>
      <RobotCharacter state={look.state} expression={look.expression} gesture={look.gesture} pose={pose} pressKey={pressKey} label={label} gaze={gaze} view={cursor.view} />
    </div>
  </>;
}
