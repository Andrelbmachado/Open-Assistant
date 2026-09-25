/**
 * Loop do agente que controla o PC (acionado sozinho pelo chat quando o pedido exige agir no computador).
 *
 * 1. Caminho rápido: se a frase bate com um alias do catálogo (`agent_route`) ou com a camada
 *    semântica (`agent_semantic`, n-gramas na CPU), executa o intent sem chamar o modelo —
 *    "abre o chrome" não merece tokens. Quase-acertos viram dica para o modelo.
 * 2. Senão, conversa com o Ollama passando as ferramentas da skill `controle-do-windows`
 *    (`agent_prepare`). Cada ferramenta pedida passa por `agent_tool`, que aplica a política
 *    no Rust e pode devolver `needs_confirm`; aí a interface pergunta ao usuário.
 * 3. Só o print mais recente fica no histórico: imagens custam ~1000 tokens cada.
 */
import { invoke } from "@tauri-apps/api/core";
import { EFFORT_INFO, type EffortLevel } from "./effort";
import { ollamaModelId } from "./aiService";
import { BITNET_MODEL_PREFIX } from "./localCatalog";
import type { ActionCandidate } from "../store/store";

/** Skill principal do agente (o SKILL.md dela já está no prompt de `agent_prepare`). */
const SKILL_NAME = "controle-do-windows";

export type AccessMode = "Perguntar" | "Automático" | "Somente leitura";
export type StepStatus = "running" | "waiting" | "ok" | "error" | "denied" | "cancelled";

/** Um passo visível no chat ("Clicando no elemento [3]"). */
export interface AgentStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  label: string;
  status: StepStatus;
  /** Saída resumida da ferramenta (texto que o modelo recebeu). */
  output?: string;
  /** Motivo do pedido de confirmação ou da recusa. */
  reason?: string;
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
}

interface ToolCall { function: { name: string; arguments: Record<string, unknown> | string } }

interface ToolOutcome { status: "ok" | "error" | "needs_confirm" | "denied"; text: string; image?: string; imageWidth?: number; imageHeight?: number; reason?: string }
interface RouteMatch { id: string; risk: string; slots: Record<string, string>; alias: string }
interface SemanticMatch { action: "run" | "suggest" | "none"; candidates: ActionCandidate[] }

/** O que fazer com a frase antes de chamar um modelo. */
export type ActionMatch = { kind: "run"; candidate: ActionCandidate } | { kind: "suggest"; candidates: ActionCandidate[] } | { kind: "none" };
interface AgentSetup { systemPrompt: string; tools: unknown[]; connectorTools?: unknown[]; pendingConnectors?: string[]; skillDir: string }
interface ChatResult { model: string; content: string; thinking: string; cancelled: boolean; tokensPerSecond?: number | null; evalCount?: number | null; promptEvalCount?: number | null; toolCalls: ToolCall[] }

export interface AgentRunOptions {
  model: string;
  /** Conversa anterior (só texto). */
  history: { role: "user" | "assistant"; content: string }[];
  userText: string;
  images?: string[];
  access: AccessMode;
  effort?: EffortLevel;
  requestId: string;
  onStep: (step: AgentStep) => void;
  /** Resolve `true` quando o usuário permite. `always` libera o resto da tarefa. */
  confirm: (step: AgentStep) => Promise<"allow" | "always" | "deny">;
  isCancelled: () => boolean;
  maxSteps?: number;
  /** Bloco de memória do usuário (`memoryPrompt`), somado ao prompt da skill. */
  memory?: string;
  /** "@conector": só as ferramentas deste servidor MCP ficam disponíveis. */
  mcpServer?: string;
  /** "/skill": nome da skill pedida (hoje só `controle-do-windows`). */
  skill?: string;
}

export interface AgentResult {
  text: string;
  steps: AgentStep[];
  source: string;
  tokens?: number;
  tokensPerSecond?: number;
}

const NUM_CTX = 16384;
const MAX_TOOL_OUTPUT = 5000;

/** Rótulo curto e humano para cada chamada de ferramenta. */
export function describeToolCall(name: string, args: Record<string, unknown>): string {
  const text = (key: string) => String(args[key] ?? "").trim();
  const short = (value: string, size = 70) => (value.length > size ? `${value.slice(0, size)}…` : value);
  switch (name) {
    case "run_intent": {
      const slots = args.slots && typeof args.slots === "object" ? Object.values(args.slots as Record<string, unknown>).map(String).filter(Boolean) : [];
      return `Ação ${text("id")}${slots.length ? ` · ${short(slots.join(", "), 50)}` : ""}`;
    }
    case "run_command": return `Comando ${text("shell") === "cmd" ? "cmd" : "PowerShell"}: ${short(text("command"))}`;
    case "look": return text("mode") === "elements" || !text("mode") ? "Lendo os elementos da tela" : "Tirando print da tela";
    case "click": return args.element !== undefined ? `Clicando no elemento [${text("element")}]` : `Clicando em (${text("x")}, ${text("y")})`;
    case "type_text": return `Digitando "${short(text("text"), 50)}"${args.enter ? " + Enter" : ""}`;
    case "press_keys": return `Atalho ${text("keys")}`;
    case "scroll": return `Rolando ${Number(args.amount) < 0 ? "para cima" : "para baixo"}`;
    case "focus_window": return `Trazendo "${text("query")}" para frente`;
    case "web_search": return `Pesquisando "${short(text("query"), 60)}"`;
    case "read_url": return `Lendo ${short(text("url"), 60)}`;
    case "read_skill_file": return `Consultando ${text("path")}`;
    case "ask_user": return "Pergunta para você";
    case "mcp_tools": return `Consultando as ferramentas de ${text("server")}`;
    case "mcp_call": return `Conector ${text("server")} · ${text("tool")}`;
    default: return name.startsWith("mcp__") ? `Conector ${name.split("__")[1]} · ${name.split("__").slice(2).join("__")}` : name;
  }
}

/** Rótulo da ação rápida ("Abrir calculadora") e a resposta curta depois de executá-la ("Abri a calculadora."). */
export function catalogLabel(id: string, slots: Record<string, string>): string {
  const target = (slots.app ?? slots.url ?? "").replace(/^shell:AppsFolder\\.*$/i, "o app").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  if ((id === "open_app" || id === "open_url") && target) return `Abrir ${target}`;
  if (id === "open_browser") return "Abrir o navegador";
  if (id === "browser_search" && slots.query) return `Pesquisar "${slots.query}"`;
  if (id === "run_command" && slots.command) return describeToolCall("run_command", { command: slots.command });
  return describeToolCall("run_intent", { id, slots });
}

export function catalogReply(label: string, output: string): string {
  if (/^Abrir /.test(label)) return `Abri ${label.slice(6)}.`;
  const first = output.split("\n").find((line) => line.trim())?.replace(/^OK:\s*/, "").trim();
  return first ? `Pronto: ${first}` : "Pronto.";
}

/** Argumentos chegam como objeto (Ollama) ou string JSON (outros runtimes). */
export function parseArguments(raw: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { const value = JSON.parse(raw); return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}

/** Remove imagens antigas: o modelo só precisa do print mais recente. */
export function keepLatestImage(messages: AgentMessage[]): AgentMessage[] {
  let seen = false;
  return [...messages].reverse().map((message) => {
    if (!message.images?.length) return message;
    if (!seen) { seen = true; return message; }
    return { ...message, images: undefined, content: `${message.content} (print antigo removido)` };
  }).reverse();
}

function clip(text: string, size = MAX_TOOL_OUTPUT) {
  return text.length > size ? `${text.slice(0, size)}\n…(cortado)` : text;
}

let cachedSetup: Promise<AgentSetup> | undefined;

/** Prepara o agente em segundo plano (liga os conectores MCP) para a 1ª tarefa não esperar. */
export function warmAgent() {
  void prepare().catch(() => undefined);
}

/** Descarta o prompt/ferramentas em cache (chame depois de mudar conectores MCP ou a skill). */
export function resetAgentSetup() {
  cachedSetup = undefined;
}
function prepare(): Promise<AgentSetup> {
  cachedSetup ??= invoke<AgentSetup>("agent_prepare")
    // Conector ainda ligando: a próxima tarefa prepara de novo para já incluí-lo.
    .then((setup) => { if (setup.pendingConnectors?.length) cachedSetup = undefined; return setup; })
    .catch((error) => { cachedSetup = undefined; throw error; });
  return cachedSetup;
}

/** Nome do servidor como aparece nas ferramentas (`mcp__<servidor>__<ferramenta>`), igual ao `mcp.rs::exposed_name`. */
export function mcpToolPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_-]/g, "_")}__`;
}

/**
 * Reconhece a frase sem modelo: alias exato do catálogo → executa; camada semântica
 * ≥ 0,82 → executa; 0,65–0,82 → sugestões; abaixo disso → conversa normal.
 */
export async function matchAction(text: string): Promise<ActionMatch> {
  const route = await invoke<RouteMatch | null>("agent_route", { text }).catch(() => null);
  if (route) return { kind: "run", candidate: { id: route.id, risk: route.risk, slots: route.slots, label: catalogLabel(route.id, route.slots) } };
  const semantic = await invoke<SemanticMatch>("agent_semantic", { text }).catch(() => undefined);
  if (semantic?.action === "run" && semantic.candidates[0]) return { kind: "run", candidate: semantic.candidates[0] };
  if (semantic?.action === "suggest" && semantic.candidates.length) return { kind: "suggest", candidates: semantic.candidates };
  return { kind: "none" };
}

/** Executa uma ação do catálogo (sem modelo) com a mesma política e confirmação do agente. */
export async function runCatalogAction(candidate: ActionCandidate, options: Pick<AgentRunOptions, "access" | "onStep" | "confirm">): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  const onStep = (step: AgentStep) => { const index = steps.findIndex((item) => item.id === step.id); if (index >= 0) steps[index] = step; else steps.push(step); options.onStep(step); };
  const step: AgentStep = { id: crypto.randomUUID(), tool: "run_intent", args: { id: candidate.id, slots: candidate.slots }, label: candidate.label || describeToolCall("run_intent", { id: candidate.id, slots: candidate.slots }), status: "running" };
  try {
    const outcome = await runStep(step, { access: options.access }, { ...options, onStep } as AgentRunOptions);
    const text = outcome.status === "ok" ? catalogReply(step.label, outcome.text) : outcome.status === "denied" ? `Não executei: ${outcome.reason ?? outcome.text}` : `Não consegui: ${outcome.text}`;
    return { text, steps, source: `Catálogo (${candidate.id})` };
  } finally {
    void invoke("agent_finish").catch(() => undefined);
  }
}

async function callTool(name: string, args: Record<string, unknown>, access: AccessMode, confirmed: boolean): Promise<ToolOutcome> {
  return invoke<ToolOutcome>("agent_tool", { name, args, access, confirmed });
}

/** Executa uma ferramenta com a política do Rust, perguntando ao usuário quando preciso. */
async function runStep(step: AgentStep, state: { access: AccessMode }, options: AgentRunOptions): Promise<ToolOutcome> {
  options.onStep({ ...step });
  let outcome = await callTool(step.tool, step.args, state.access, false);
  if (outcome.status === "needs_confirm") {
    step.status = "waiting";
    step.reason = outcome.reason;
    options.onStep({ ...step });
    const answer = await options.confirm({ ...step });
    if (answer === "always") state.access = "Automático";
    outcome = answer === "deny"
      ? { status: "denied", text: "O usuário não permitiu esta ação. Pergunte o que ele prefere ou siga outro caminho." }
      : await callTool(step.tool, step.args, state.access, true);
  }
  step.status = outcome.status === "ok" ? "ok" : outcome.status === "denied" ? "denied" : "error";
  step.output = clip(outcome.text, 1200);
  if (outcome.status === "denied") step.reason = outcome.reason ?? outcome.text;
  options.onStep({ ...step });
  return outcome;
}

/** Executa um pedido do usuário no modo agente; veja o comentário do módulo. */
export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  const state = { access: options.access };
  const track = (step: AgentStep) => { const index = steps.findIndex((item) => item.id === step.id); if (index >= 0) steps[index] = step; else steps.push(step); };
  const onStep = options.onStep;
  const wrapped: AgentRunOptions = { ...options, onStep: (step) => { track(step); onStep(step); } };

  let hint = "";
  try {
    // 1. Caminho rápido pelo catálogo (sem imagem anexada, porque aí o pedido é sobre a imagem;
    //    nem com "@conector", porque aí o usuário escolheu a ferramenta).
    if (!options.images?.length && !options.mcpServer) {
      const match = await matchAction(options.userText);
      if (match.kind === "run") {
        const { candidate } = match;
        const step: AgentStep = { id: crypto.randomUUID(), tool: "run_intent", args: { id: candidate.id, slots: candidate.slots }, label: candidate.label || describeToolCall("run_intent", { id: candidate.id, slots: candidate.slots }), status: "running" };
        const outcome = await runStep(step, state, wrapped);
        if (outcome.status === "ok") return { text: catalogReply(step.label, outcome.text), steps, source: `Catálogo (${candidate.id})` };
        if (outcome.status === "denied") return { text: `Não executei: ${outcome.reason ?? outcome.text}`, steps, source: `Catálogo (${candidate.id})` };
        // Erro no caminho rápido (ex.: app com outro nome): o modelo tenta resolver com as ferramentas.
      } else if (match.kind === "suggest") {
        // Quase-acerto: o modelo escolhe entre poucas opções em vez de explorar a tela.
        hint = `\n\n(Ações prováveis reconhecidas pelo app — use run_intent se uma delas servir: ${match.candidates.map((item) => `${item.id} ${JSON.stringify(item.slots)} = "${item.label}"`).join("; ")})`;
      }
    }

    if (options.model.startsWith(BITNET_MODEL_PREFIX)) throw new Error("O BitNet não usa ferramentas. Para controlar o PC, escolha um modelo com ferramentas, como o Qwen3.5.");
    const modelId = ollamaModelId(options.model);
    if (!modelId) throw new Error("Escolha um modelo local do Ollama com ferramentas (ex.: qwen3.5:9b) para controlar o PC.");

    // 2. Loop com o modelo.
    const setup = await prepare();
    const effort = options.effort ? EFFORT_INFO[options.effort] : undefined;
    let tools = setup.tools;
    let focus = "";
    if (options.mcpServer) {
      const prefix = mcpToolPrefix(options.mcpServer);
      const toolName = (tool: unknown) => (tool as { function?: { name?: string } }).function?.name ?? "";
      tools = [...setup.tools.filter((tool) => toolName(tool) === "ask_user"), ...(setup.connectorTools ?? setup.tools).filter((tool) => toolName(tool).startsWith(prefix))];
      if (tools.length <= 1) throw new Error(`O conector @${options.mcpServer} não está rodando ou não tem ferramentas. Ligue-o em Configurações › Conectores MCP.`);
      focus = `\n\n## Pedido com @${options.mcpServer}\nO usuário escolheu o conector ${options.mcpServer}: resolva usando as ferramentas ${prefix}*.`;
      hint = `\n\n(Use o conector @${options.mcpServer}: chame uma das ferramentas ${prefix}* antes de responder.)`;
    } else if (options.skill === SKILL_NAME) {
      focus = `\n\n## Pedido com /${options.skill}\nO usuário invocou esta skill: siga o SKILL.md acima à risca.`;
    } else if (options.skill) {
      // Outra skill ("/abrir-programas"): o texto dela entra no prompt só nesta tarefa.
      const skillText = await invoke<string>("read_skill", { name: options.skill }).catch(() => "");
      focus = `\n\n## Skill /${options.skill} (pedida pelo usuário — siga à risca)\n${skillText}`;
    }
    let messages: AgentMessage[] = [
      { role: "system", content: `${setup.systemPrompt}${focus}${options.memory ?? ""}` },
      ...options.history.slice(-8).map((item) => ({ role: item.role, content: clip(item.content, 2000) })),
      { role: "user", content: `${options.userText}${hint}`, images: options.images?.length ? options.images : undefined },
    ];
    let last: ChatResult | undefined;
    const maxSteps = options.maxSteps ?? 24;
    for (let turn = 0; turn < maxSteps; turn++) {
      if (options.isCancelled()) return { text: "Tarefa interrompida.", steps, source: `Agente · Ollama (${modelId})` };
      last = await invoke<ChatResult>("ollama_chat", {
        requestId: options.requestId,
        model: modelId,
        messages: keepLatestImage(messages),
        think: effort?.think ?? false,
        thinkLevel: effort?.think ? effort.thinkLevel : undefined,
        options: { tools, numCtx: NUM_CTX },
      });
      if (last.cancelled || options.isCancelled()) return { text: "Tarefa interrompida.", steps, source: `Agente · Ollama (${modelId})` };
      const calls = last.toolCalls ?? [];
      if (!calls.length) {
        return { text: last.content.trim() || "Pronto.", steps, source: `Agente · Ollama (${modelId})`, tokens: last.evalCount ?? undefined, tokensPerSecond: last.tokensPerSecond ?? undefined };
      }
      messages.push({ role: "assistant", content: last.content ?? "", tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name ?? "";
        const args = parseArguments(call.function?.arguments);
        if (name === "ask_user") {
          const question = String(args.question ?? "Pode confirmar?");
          track({ id: crypto.randomUUID(), tool: name, args, label: describeToolCall(name, args), status: "ok", output: question });
          return { text: question, steps, source: `Agente · Ollama (${modelId})`, tokens: last.evalCount ?? undefined };
        }
        const step: AgentStep = { id: crypto.randomUUID(), tool: name, args, label: describeToolCall(name, args), status: "running" };
        const outcome = await runStep(step, state, wrapped);
        messages.push({ role: "tool", tool_name: name, content: clip(outcome.text || `(status: ${outcome.status})`) });
        if (outcome.image) {
          messages.push({ role: "user", content: `Print atual da janela (${outcome.imageWidth}x${outcome.imageHeight} px). Coordenadas de clique são em pixels desta imagem.`, images: [outcome.image] });
        }
        if (options.isCancelled()) return { text: "Tarefa interrompida.", steps, source: `Agente · Ollama (${modelId})` };
      }
      messages = keepLatestImage(messages);
    }
    return { text: `Parei depois de ${maxSteps} passos para não ficar em loop. Diga como quer continuar.`, steps, source: `Agente · Ollama (${modelId})`, tokens: last?.evalCount ?? undefined };
  } finally {
    void invoke("agent_finish").catch(() => undefined);
  }
}
