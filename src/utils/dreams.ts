/**
 * "Sonhos" (ROADMAP §11, fase 3): à noite o modelo local lê as conversas e a memória do dia e propõe skills
 * (instruções SKILL.md) e conectores (MCP) que facilitariam o dia seguinte. Tudo vira proposta: nada é
 * ativado sem o usuário aprovar na tela Agentes › Agentes do sistema.
 */

export type ProposalKind = "skill" | "conector";
export type ProposalStatus = "pendente" | "aprovada" | "recusada";

export interface DreamProposal {
  id: string;
  kind: ProposalKind;
  /** Nome curto (skill: vira a pasta `skills/<slug>`). */
  name: string;
  description: string;
  /** Skill: corpo do SKILL.md. Conector: por que e como configurar. */
  content: string;
  status: ProposalStatus;
  createdAt: number;
}

export const MAX_DREAM_MESSAGES = 40;

export function buildDreamPrompt(messages: string[], memory: string[]): string {
  const talk = messages.slice(-MAX_DREAM_MESSAGES).map((text) => `- ${text.replace(/\s+/g, " ").slice(0, 240)}`).join("\n") || "- (nenhuma conversa hoje)";
  const facts = memory.map((fact) => `- ${fact}`).join("\n") || "- (vazia)";
  return `Você é o Open Assistant revendo o dia do usuário para ajudá-lo amanhã. Leia os pedidos de hoje e a memória.
Proponha no máximo 3 SKILLS (instruções reutilizáveis para tarefas que se repetiram ou deram trabalho) e no máximo 2 CONECTORES (serviços MCP que ajudariam, como Google Agenda, GitHub, Gmail).
Só proponha o que tiver ligação clara com os pedidos. Se não houver nada útil, devolva listas vazias.
Responda SOMENTE com JSON válido neste formato, em português do Brasil:
{"skills":[{"name":"nome-curto","description":"quando usar, em uma frase","instructions":"passo a passo em Markdown"}],"connectors":[{"name":"Nome do serviço","reason":"por que ajudaria e como configurar"}]}

Pedidos de hoje:
${talk}

Memória do usuário:
${facts}`;
}

/** Nome → id de pasta seguro (`resumo-de-reunioes`). */
export function slugify(name: string): string {
  return name.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "skill";
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Extrai as propostas da resposta do modelo (aceita texto antes/depois do JSON e cercas ```json). */
export function parseDreamProposals(reply: string, now = Date.now()): DreamProposal[] {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let data: { skills?: unknown; connectors?: unknown };
  try { data = JSON.parse(reply.slice(start, end + 1)); } catch { return []; }
  const proposals: DreamProposal[] = [];
  for (const [index, raw] of (Array.isArray(data.skills) ? data.skills : []).slice(0, 3).entries()) {
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 60);
    const instructions = text(item.instructions, 6000);
    if (!name || !instructions) continue;
    proposals.push({ id: `sonho-${now}-s${index}`, kind: "skill", name: slugify(name), description: text(item.description, 300), content: instructions, status: "pendente", createdAt: now });
  }
  for (const [index, raw] of (Array.isArray(data.connectors) ? data.connectors : []).slice(0, 2).entries()) {
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 60);
    if (!name) continue;
    proposals.push({ id: `sonho-${now}-c${index}`, kind: "conector", name, description: text(item.reason, 300), content: text(item.reason, 2000), status: "pendente", createdAt: now });
  }
  return proposals;
}

/** Hora de sonhar: madrugada (2h–5h59), uma vez por dia. */
export function isDreamTime(date: Date, lastDreamDay: string | undefined): boolean {
  const hour = date.getHours();
  return hour >= 2 && hour < 6 && lastDreamDay !== dayKey(date);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
