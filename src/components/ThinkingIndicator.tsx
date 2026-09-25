import { useEffect, useState } from "react";
import { formatElapsed, formatTokenCount, thinkingVerb } from "../utils/messageMeta";

/**
 * Pac-Man de lado comendo bolinhas: três bolinhas andam até a boca e, a cada uma comida,
 * outra surge no fim da fila. A animação é só CSS (`.pacman-loader` em refresh.css).
 */
export function PacmanLoader() {
  return <span className="pacman-loader" aria-hidden="true"><span className="pacman" /><span className="pac-dots"><i /><i /><i /></span></span>;
}

interface ThinkingIndicatorProps {
  messageId: string;
  startedAt?: number;
  tokens?: number;
  /** Trecho mais recente do raciocínio, exibido esmaecido abaixo da linha. */
  preview?: string;
}

/** Linha "pensando" com Pac-Man, verbo, cronômetro e prévia do raciocínio do modelo. */
export function ThinkingIndicator({ messageId, startedAt, tokens, preview }: ThinkingIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Só o cronômetro precisa de estado; o Pac-Man anima por CSS.
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const verb = `${thinkingVerb(messageId)}…`;
  const stats = [formatElapsed(startedAt ? now - startedAt : 0), tokens ? `${formatTokenCount(tokens)} tokens de raciocínio` : undefined, "esc para interromper"].filter(Boolean).join(" · ");
  return <div className="thinking-indicator" role="status" aria-label={`${verb} ${stats}`}>
    <div className="thinking-line">
      <PacmanLoader />
      <span className="thinking-verb">{verb}</span>
      <span className="thinking-stats">({stats})</span>
    </div>
    {preview && <div className="thinking-preview"><span>{preview.slice(-420)}</span></div>}
  </div>;
}

/** Resumo depois que o modelo terminou de pensar: "Pensou por 12s · 345 tokens". */
export function thinkingSummary(thinkingMs?: number, tokens?: number): string {
  const parts = [thinkingMs !== undefined ? `Pensou por ${formatElapsed(thinkingMs)}` : "Raciocínio do modelo"];
  if (tokens) parts.push(`${formatTokenCount(tokens)} tokens`);
  return parts.join(" · ");
}
