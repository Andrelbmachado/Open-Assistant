import type { AgentStep } from "./agentRunner";
import { thinkingVerb } from "./messageMeta";

/**
 * O que a IA está fazendo **de verdade** agora, para a linha do indicador ("Pensando" só quando está
 * pensando). Ferramenta rodando → o nome da atividade; esperando você → "Aguardando sua confirmação";
 * acabou uma ferramenta → "Analisando o resultado"; senão os verbos de pensar, trocando a cada 6 s.
 */
const TOOL_ACTIVITY: Record<string, string> = {
  web_search: "Navegando na internet",
  read_url: "Lendo uma página da internet",
  look: "Olhando a tela",
  click: "Clicando",
  type_text: "Digitando",
  press_keys: "Usando o teclado",
  scroll: "Rolando a tela",
  drag: "Arrastando",
  move_window: "Movendo uma janela",
  move_file: "Movendo um arquivo",
  open_file: "Abrindo um arquivo",
  focus_window: "Trazendo a janela para frente",
  list_windows: "Vendo as janelas abertas",
  desktop_items: "Vendo a área de trabalho",
  read_file: "Lendo arquivos",
  write_file: "Criando um arquivo",
  edit_file: "Editando o código",
  read_logs: "Lendo os logs do app",
  read_skill_file: "Consultando a base de conhecimento",
  run_command: "Executando um comando",
  run_intent: "Executando ferramentas",
  mcp_tools: "Acessando os conectores",
  ask_user: "Preparando uma pergunta",
};

/** Conectores que são bancos de dados ou planilhas: "Acessando a base de dados". */
const DATABASE = /(sql|postgres|mysql|sqlite|mongo|supabase|firebase|airtable|notion|sheets|planilha|database|banco|redis|bigquery)/i;

/** Nome da atividade de uma ferramenta do agente. */
export function toolActivity(step: Pick<AgentStep, "tool" | "args">): string {
  const known = TOOL_ACTIVITY[step.tool];
  if (known) return known;
  if (step.tool === "mcp_call" || step.tool.startsWith("mcp__")) {
    const server = String(step.args.server ?? step.tool.split("__")[1] ?? "");
    const tool = String(step.args.tool ?? step.tool.split("__")[2] ?? "");
    if (DATABASE.test(`${server} ${tool}`)) return "Acessando a base de dados";
    return server ? `Acessando ${server}` : "Acessando um conector";
  }
  return "Executando ferramentas";
}

/** Troca o verbo de pensar a cada `period` ms, começando num verbo estável por mensagem. */
export function rotatingVerb(seed: string, elapsedMs: number, period = 6000): string {
  return thinkingVerb(seed, Math.floor(Math.max(0, elapsedMs) / period));
}

export function currentActivity(options: { seed: string; elapsedMs: number; steps?: AgentStep[] }): string {
  const steps = options.steps ?? [];
  if (steps.some((step) => step.status === "waiting")) return "Aguardando sua confirmação";
  const running = [...steps].reverse().find((step) => step.status === "running");
  if (running) return toolActivity(running);
  if (steps.length) return "Analisando o resultado";
  return rotatingVerb(options.seed, options.elapsedMs);
}
