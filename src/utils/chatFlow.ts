/**
 * Fluxo do sistema "Responder no chat" (`systemWorkflows.ts`): mostra no editor de nodes qual caminho cada
 * mensagem tomou (imagem, calculadora, outro computador, ação rápida, agente do PC ou modelo de IA).
 */
import type { SystemTrace } from "../store/systemTrace";

export const CHAT_BRANCHES = ["imagem", "calculadora", "rede", "acao", "agente", "modelo"] as const;
export type ChatBranch = (typeof CHAT_BRANCHES)[number];

export const CHAT_BRANCH_LABEL: Record<ChatBranch, string> = {
  imagem: "Gerar imagem",
  calculadora: "Calculadora do app",
  rede: "Outro computador da rede",
  acao: "Ação rápida (sem modelo)",
  agente: "Agente do PC",
  modelo: "Modelo de IA",
};

export interface ChatFlow {
  /** O chat escolheu um caminho (pode escolher outro depois: o modelo pede o agente). */
  route(branch: ChatBranch, sample?: string): void;
  /** Mais detalhe do caminho atual (ex.: quantos passos o agente deu). */
  detail(sample: string): void;
  done(reply: string): void;
  fail(message: string): void;
}

export function startChatFlow(open: () => SystemTrace, text: string): ChatFlow {
  const trace = open();
  trace.step("mensagem", text || "(anexo)");
  const taken = new Set<ChatBranch>();
  let current: ChatBranch | undefined;
  let finished = false;
  const closeUnused = () => { for (const branch of CHAT_BRANCHES) if (!taken.has(branch)) trace.skip(branch); };
  return {
    route(branch, sample) {
      if (finished) return;
      if (!taken.size) trace.step("rotear", CHAT_BRANCH_LABEL[branch]);
      taken.add(branch);
      current = branch;
      trace.step(branch, sample);
    },
    detail(sample) {
      if (!finished && current) trace.step(current, sample);
    },
    done(reply) {
      if (finished) return;
      finished = true;
      if (!taken.size) trace.step("rotear", "sem caminho");
      closeUnused();
      trace.step("resposta", reply || "(resposta sem texto)");
      trace.end(current ? CHAT_BRANCH_LABEL[current] : "Resposta");
    },
    fail(message) {
      if (finished) return;
      finished = true;
      closeUnused();
      trace.fail(current ?? "rotear", message);
    },
  };
}
