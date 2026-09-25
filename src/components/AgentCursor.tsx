import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/** Evento `agent-cursor` emitido por `computer.rs` (coordenadas físicas relativas à janela do cursor). */
interface CursorEvent { x: number; y: number; action: "click" | "scroll" | "type" | string; label: string; visible: boolean }

/**
 * Cursor próprio do agente: vive numa janela transparente, sempre no topo, que ignora o mouse
 * e fica fora dos prints (`WDA_EXCLUDEFROMCAPTURE`). Ele desliza até o alvo (~350 ms) e o Rust
 * só clica depois que ele chega, então o usuário vê onde a IA vai clicar.
 */
export function AgentCursor() {
  const [cursor, setCursor] = useState<CursorEvent>();
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    let stop: () => void = () => undefined;
    listen<CursorEvent>("agent-cursor", (event) => {
      setCursor(event.payload);
      if (event.payload.action === "click") setTimeout(() => setPulse((value) => value + 1), 360);
    }).then((unlisten) => { stop = unlisten; }).catch(() => undefined);
    return () => stop();
  }, []);

  if (!cursor?.visible) return null;
  // O Rust manda pixels físicos; o CSS usa pixels lógicos.
  const scale = window.devicePixelRatio || 1;
  return <div className="agent-cursor" style={{ transform: `translate(${cursor.x / scale}px, ${cursor.y / scale}px)` }}>
    <span key={pulse} className="agent-cursor-ripple" />
    <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true">
      <path d="M3 2 L3 24 L9 18.5 L13.5 28 L17.5 26.2 L13 16.8 L21 16.8 Z" fill="#7c5cff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
    <span className="agent-cursor-label">{cursor.action === "type" ? "digitando…" : cursor.label || "Open Assistant"}</span>
  </div>;
}
