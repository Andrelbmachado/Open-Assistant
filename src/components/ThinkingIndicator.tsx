import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { formatElapsed, formatTokenCount, modelDisplayName } from "../utils/messageMeta";
import { currentActivity } from "../utils/activity";
import type { AgentStep } from "../utils/agentRunner";

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
  /** Modelo que está respondendo (ex.: `Ollama: qwen3.5:9b`), mostrado acima do "Pensando". */
  model?: string;
  /** Passos do agente: com uma ferramenta rodando, a linha diz o que ela está fazendo. */
  steps?: AgentStep[];
}

/** Linha com a atividade real ("Pensando", "Navegando na internet"…), Pac-Man, cronômetro e prévia do raciocínio. */
export function ThinkingIndicator({ messageId, startedAt, tokens, preview, model, steps }: ThinkingIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Só o cronômetro precisa de estado; o Pac-Man anima por CSS.
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const elapsed = startedAt ? now - startedAt : 0;
  const verb = currentActivity({ seed: messageId, elapsedMs: elapsed, steps });
  const stats = [formatElapsed(elapsed), tokens ? `${formatTokenCount(tokens)} tokens de raciocínio` : undefined, "esc para interromper"].filter(Boolean).join(" · ");
  return <div className="thinking-indicator" role="status" aria-label={`${model ? `${modelDisplayName(model)}: ` : ""}${verb} ${stats}`}>
    {model && <div className="thinking-model"><Cpu size={11} />{modelDisplayName(model)}</div>}
    <div className="thinking-line">
      <span key={verb} className="thinking-verb">{verb}</span>
      <PacmanLoader />
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
