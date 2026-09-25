/**
 * Memória do usuário: o que ele contou em Configurações › Memória (nome, estilo) e o que a IA
 * aprendeu nas conversas ("não use emojis", "me chame de Dé"). Vira um bloco no prompt de sistema
 * de TODAS as conversas: chat comum, agente "Controlar o PC" e modelos em nuvem.
 *
 * A detecção é por frases (sem modelo), então não gasta tokens e funciona offline.
 */

export interface MemoryFact {
  id: string;
  text: string;
  /** `auto` = aprendido na conversa; `manual` = escrito em Configurações. */
  source: "auto" | "manual";
  createdAt: number;
}

export interface UserMemory {
  /** Nome do usuário. */
  name: string;
  /** Como a IA deve chamá-lo (apelido); vazio = usa o nome. */
  callMe: string;
  /** Estilos escolhidos em Configurações (ids de `STYLE_OPTIONS`). */
  styles: string[];
  /** Instruções livres sobre o jeito de conversar. */
  about: string;
  facts: MemoryFact[];
  /** Aprender sozinho com pedidos como "não use emojis". */
  learn: boolean;
}

export const EMPTY_MEMORY: UserMemory = { name: "", callMe: "", styles: [], about: "", facts: [], learn: true };

/** Estilos de conversa com a instrução que entra no prompt. */
export const STYLE_OPTIONS: { id: string; label: string; instruction: string }[] = [
  { id: "direct", label: "Direto e curto", instruction: "Seja direto e responda de forma curta." },
  { id: "detailed", label: "Detalhado", instruction: "Explique com detalhes e exemplos quando ajudar." },
  { id: "casual", label: "Descontraído", instruction: "Use um tom descontraído e amigável." },
  { id: "formal", label: "Formal", instruction: "Use um tom formal e profissional." },
  { id: "no-emoji", label: "Sem emojis", instruction: "Nunca use emojis." },
  { id: "simple", label: "Linguagem simples", instruction: "Evite jargão técnico; explique como para um iniciante." },
];

const MAX_FACTS = 40;
const MAX_FACT_LENGTH = 200;

/** O que uma mensagem ensinou: fatos novos e/ou como chamar o usuário. */
export interface DetectedMemory {
  facts: string[];
  callMe?: string;
  name?: string;
}

const sentenceCase = (text: string) => text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
const clean = (text: string) => text.trim().replace(/\s+/g, " ").replace(/[\s,;:]+$/, "").replace(/[.!]+$/, "");

/** Palavras que não são nome ("me chame de novo", "meu nome é importante"). */
const NOT_A_NAME = /^(novo|nada|isso|aquilo|importante|segredo|voce|você|ninguem|ninguém|volta|depois|mais|outro|outra)$/i;
const isName = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words.length <= 3 && !NOT_A_NAME.test(words[0] ?? "");
};

/**
 * Lê pedidos de preferência na mensagem do usuário. Só frases explícitas contam:
 * "não use emojis", "sempre responda em inglês", "me chame de Dé", "lembre que eu uso Windows 11".
 */
export function detectMemory(message: string): DetectedMemory {
  const detected: DetectedMemory = { facts: [] };
  const text = message.split("\n").find((line) => line.trim() && !line.startsWith("[Anexos:"))?.trim() ?? "";
  if (!text || text.length > 400) return detected;

  const callMe = text.match(/\b(?:me\s+cham[ae]|pode\s+me\s+chamar|quero\s+ser\s+chamad[oa])\s+(?:de|como)\s+([\p{L}][\p{L}' -]{0,28}?)(?=[.,!?;]|\s+(?:e|por favor|daqui|a partir|sempre)\b|$)/iu)?.[1];
  if (callMe && isName(callMe)) detected.callMe = sentenceCase(clean(callMe));
  const name = text.match(/\bmeu\s+nome\s+(?:é|e)\s+([\p{L}][\p{L}' -]{0,28}?)(?=[.,!?;]|\s+(?:e|mas)\b|$)/iu)?.[1];
  if (name && isName(name)) detected.name = sentenceCase(clean(name));

  const rules: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/\b(?:n[ãa]o|nunca)\s+(?:use|usa|usar|coloque|coloca|mande|manda|ponha|p[õo]e)\s+(?:mais\s+)?emojis?\b/iu, () => "Não usar emojis nas respostas."],
    [/\b(?:pare\s+de|para\s+de|chega\s+de)\s+(?:usar\s+)?emojis?\b/iu, () => "Não usar emojis nas respostas."],
    [/\b(?:lembre(?:-se)?|lembra|guarde|grave|memorize|anote)\s+(?:(?:de\s+)?que|isso|disso|:)\s*:?\s*(.{4,180})$/iu, (match) => sentenceCase(clean(match[1]))],
    [/(?:^|[.!;]\s*|,\s*|\bpor favor,?\s+)(sempre|nunca)\s+((?:responda|fale|escreva|use|me\s+(?:responda|trate|chame)|seja|explique|traga|mande|coloque)\b.{2,160})$/iu, (match) => sentenceCase(clean(`${match[1]} ${match[2]}`))],
    [/\b(?:a\s+partir\s+de\s+agora|daqui\s+(?:pra|para)\s+frente|de\s+agora\s+em\s+diante),?\s+(.{4,160})$/iu, (match) => sentenceCase(clean(match[1]))],
    [/\b(?:prefiro|eu\s+prefiro|gosto\s+(?:mais\s+)?de|eu\s+gosto\s+de)\s+(respostas?\s.{2,140}|que\s+voc[êe]\s.{2,140})$/iu, (match) => sentenceCase(clean(`Prefere ${match[1]}`))],
    [/\b(?:n[ãa]o\s+gosto\s+(?:de|quando))\s+(.{3,140})$/iu, (match) => sentenceCase(clean(`Não gosta de ${match[1]}`))],
  ];
  for (const [pattern, toFact] of rules) {
    const match = text.match(pattern);
    if (!match) continue;
    const fact = toFact(match).slice(0, MAX_FACT_LENGTH);
    if (fact.length >= 4 && !detected.facts.includes(fact)) detected.facts.push(fact);
  }
  // "Não use emojis" já cobre o "sempre/nunca" da mesma frase.
  if (detected.facts.includes("Não usar emojis nas respostas.")) detected.facts = detected.facts.filter((fact) => fact === "Não usar emojis nas respostas." || !/emoji/i.test(fact));
  return detected;
}

const comparable = (text: string) => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();

/** Junta o que foi detectado à memória; devolve a memória nova e o que mudou (para o aviso). */
export function applyDetected(memory: UserMemory, detected: DetectedMemory, now = Date.now()): { memory: UserMemory; changes: string[] } {
  const changes: string[] = [];
  let next = memory;
  if (detected.callMe && detected.callMe !== memory.callMe) { next = { ...next, callMe: detected.callMe }; changes.push(`Vou te chamar de ${detected.callMe}`); }
  if (detected.name && detected.name !== memory.name) { next = { ...next, name: detected.name }; changes.push(`Seu nome: ${detected.name}`); }
  const known = new Set(next.facts.map((fact) => comparable(fact.text)));
  const fresh = detected.facts.filter((fact) => !known.has(comparable(fact)));
  if (fresh.length) {
    const facts = [...next.facts, ...fresh.map((text, index) => ({ id: `mem-${now}-${index}`, text, source: "auto" as const, createdAt: now }))];
    next = { ...next, facts: facts.slice(-MAX_FACTS) };
    changes.push(...fresh);
  }
  return { memory: next, changes };
}

/** Bloco para o prompt de sistema; vazio quando não há nada salvo. */
export function memoryPrompt(memory: UserMemory | undefined): string {
  if (!memory) return "";
  const lines: string[] = [];
  const callMe = memory.callMe.trim() || memory.name.trim();
  if (memory.name.trim()) lines.push(`- O usuário se chama ${memory.name.trim()}.`);
  if (callMe) lines.push(`- Ao falar com o usuário, chame-o de "${callMe}" (é o apelido dele, não o seu).`);
  for (const style of STYLE_OPTIONS.filter((option) => memory.styles.includes(option.id))) lines.push(`- ${style.instruction}`);
  if (memory.about.trim()) lines.push(`- ${memory.about.trim()}`);
  for (const fact of memory.facts) lines.push(`- ${fact.text}`);
  if (!lines.length) return "";
  return `\n\n## Memória sobre o usuário\nPreferências salvas pelo usuário. Siga-as em todas as respostas sem comentar que são uma memória. Elas não mudam a tarefa: continue respondendo exatamente ao que foi pedido.\n${lines.join("\n")}`;
}

/** Restaura a memória salva ignorando campos quebrados. */
export function restoreMemory(value: unknown): UserMemory {
  if (!value || typeof value !== "object") return EMPTY_MEMORY;
  const raw = value as Partial<UserMemory>;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    callMe: typeof raw.callMe === "string" ? raw.callMe : "",
    styles: Array.isArray(raw.styles) ? raw.styles.filter((item): item is string => typeof item === "string") : [],
    about: typeof raw.about === "string" ? raw.about : "",
    facts: Array.isArray(raw.facts) ? raw.facts.filter((fact): fact is MemoryFact => Boolean(fact && typeof fact.text === "string" && typeof fact.id === "string")) : [],
    learn: raw.learn !== false,
  };
}
