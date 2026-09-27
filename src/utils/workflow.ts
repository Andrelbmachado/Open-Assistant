/**
 * Editor de nodes: tipos, catálogo de nodes (fonte da verdade para a interface, o motor e a IA),
 * validação, organização automática e modelos prontos.
 *
 * Um workflow é um grafo da esquerda para a direita. Cada node recebe **itens** (lista de objetos com
 * `text`, `path`, `name`, `url`…) de quem está ligado na entrada, faz uma coisa e entrega itens na
 * saída. Documentação para pessoas e IAs: `docs/NODE_EDITOR.md` (skill `node-editor`).
 */

export type ParamType = "text" | "longtext" | "number" | "boolean" | "select" | "folder" | "model" | "imageModel" | "remote";

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamType;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  /** Aceita `{{campo}}` com dados do item que chega. */
  template?: boolean;
  help?: string;
  placeholder?: string;
}

export type NodeCategory = "gatilho" | "web" | "arquivos" | "nuvem" | "ia" | "fluxo" | "saida" | "sistema";

export interface NodeKindSpec {
  kind: string;
  label: string;
  category: NodeCategory;
  description: string;
  /** Tem porta de entrada (gatilhos não têm). */
  input: boolean;
  /** Tem porta de saída. */
  output: boolean;
  /** `each` = roda uma vez por item que chega; `all` = recebe a lista inteira de uma vez; `once` = roda uma vez. */
  mode: "each" | "all" | "once";
  params: ParamSpec[];
  /** O que sai: campos dos itens produzidos (documentação). */
  produces: string;
  /** Node do sistema: só mostra uma etapa que o código do app faz (não roda no motor, não aparece na paleta). */
  traceOnly?: boolean;
}

export type ParamValue = string | number | boolean;

export interface FlowNode {
  id: string;
  kind: string;
  title?: string;
  x: number;
  y: number;
  params: Record<string, ParamValue>;
}

export interface FlowConnection { id: string; from: string; to: string }

export interface FlowFrame { id: string; title: string; x: number; y: number; width: number; height: number }

export interface WorkflowDoc {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  connections: FlowConnection[];
  frames: FlowFrame[];
  createdAt: number;
  updatedAt: number;
  /** Última execução agendada (ms), para o agendador saber quando rodar de novo. */
  lastRunAt?: number;
  /** Memória entre execuções (ex.: arquivos já vistos por um node "só novos"). */
  memory?: Record<string, string[]>;
  /** Agendamento ligado (gatilhos "A cada X minutos"). */
  scheduleEnabled?: boolean;
}

/** Dado que passa de um node para outro. */
export interface FlowItem {
  text?: string;
  name?: string;
  path?: string;
  url?: string;
  /** Caminho de imagem (gerada, editada ou baixada). */
  image?: string;
  /** Caminho dentro da nuvem (`Pasta/arquivo.docx`). */
  remotePath?: string;
  remote?: string;
  modified?: string | number;
  size?: number;
  json?: unknown;
  [key: string]: unknown;
}

const BROWSERS = [{ value: "padrao", label: "Padrão do Windows" }, { value: "chrome", label: "Chrome" }, { value: "edge", label: "Edge" }, { value: "firefox", label: "Firefox" }];
const WRITE_MODES = [{ value: "unique", label: "Novo arquivo (numera se existir)" }, { value: "overwrite", label: "Sobrescrever" }, { value: "append", label: "Acrescentar no fim" }];

/** Catálogo de nodes. Ao criar um kind novo: executor em `workflowEngine.ts` + seção em `docs/NODE_EDITOR.md`. */
export const NODE_KINDS: NodeKindSpec[] = [
  // Gatilhos
  { kind: "trigger.manual", label: "Iniciar manualmente", category: "gatilho", description: "Começa o fluxo quando você clica em Executar (ou a IA roda o workflow).", input: false, output: true, mode: "once", params: [], produces: "1 item vazio" },
  { kind: "trigger.schedule", label: "A cada X minutos", category: "gatilho", description: "Roda o fluxo sozinho de tempos em tempos enquanto o Open Assistant estiver aberto.", input: false, output: true, mode: "once", params: [
    { key: "minutes", label: "Intervalo (min)", type: "number", default: 30, help: "Mínimo 1 minuto." },
  ], produces: "1 item com `date` e `time` da execução" },
  // Web
  { kind: "web.open", label: "Abrir site", category: "web", description: "Abre um endereço no navegador.", input: true, output: true, mode: "each", params: [
    { key: "url", label: "Endereço", type: "text", default: "https://", template: true, placeholder: "https://g1.globo.com" },
    { key: "browser", label: "Navegador", type: "select", default: "padrao", options: BROWSERS },
  ], produces: "o item recebido + `url`" },
  { kind: "web.read", label: "Ler página", category: "web", description: "Baixa o texto principal de uma página (sem abrir o navegador).", input: true, output: true, mode: "each", params: [
    { key: "url", label: "Endereço", type: "text", default: "{{url}}", template: true },
  ], produces: "`text` (texto da página), `url`" },
  { kind: "web.search", label: "Pesquisar na web", category: "web", description: "Pesquisa e devolve títulos, links e resumos.", input: true, output: true, mode: "each", params: [
    { key: "query", label: "Pesquisa", type: "text", default: "", template: true },
  ], produces: "`text` com os resultados" },
  { kind: "http.request", label: "Requisição HTTP", category: "web", description: "Chama uma API (GET/POST).", input: true, output: true, mode: "each", params: [
    { key: "method", label: "Método", type: "select", default: "GET", options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ value, label: value })) },
    { key: "url", label: "URL", type: "text", default: "https://", template: true },
    { key: "body", label: "Corpo", type: "longtext", default: "", template: true },
  ], produces: "`text` (resposta), `json` (se for JSON), `status`" },
  // Arquivos
  { kind: "file.list", label: "Listar pasta", category: "arquivos", description: "Lista os arquivos de uma pasta do PC.", input: true, output: true, mode: "once", params: [
    { key: "folder", label: "Pasta", type: "folder", default: "{desktop}", template: true },
    { key: "pattern", label: "Filtro", type: "text", default: "*.*", placeholder: "*.pdf;*.docx" },
    { key: "onlyNew", label: "Só arquivos novos", type: "boolean", default: false, help: "Lembra o que já passou e entrega só o que chegou depois." },
    { key: "recursive", label: "Incluir subpastas", type: "boolean", default: false },
  ], produces: "um item por arquivo: `path`, `name`, `size`, `modified`" },
  { kind: "file.read", label: "Ler arquivo", category: "arquivos", description: "Lê o texto de txt, md, csv, json, html, docx, xlsx, pptx e pdf.", input: true, output: true, mode: "each", params: [
    { key: "path", label: "Arquivo", type: "text", default: "{{path}}", template: true },
  ], produces: "o item recebido + `text`" },
  { kind: "file.write", label: "Salvar arquivo", category: "arquivos", description: "Grava um texto num arquivo do PC (cria a pasta se preciso).", input: true, output: true, mode: "each", params: [
    { key: "folder", label: "Pasta", type: "folder", default: "{desktop}", template: true },
    { key: "fileName", label: "Nome do arquivo", type: "text", default: "resultado {{date}}.md", template: true },
    { key: "content", label: "Conteúdo", type: "longtext", default: "{{text}}", template: true },
    { key: "mode", label: "Se já existir", type: "select", default: "unique", options: WRITE_MODES },
  ], produces: "o item recebido + `path` do arquivo salvo" },
  { kind: "file.copy", label: "Copiar/mover arquivo", category: "arquivos", description: "Copia ou move o arquivo do item para uma pasta.", input: true, output: true, mode: "each", params: [
    { key: "path", label: "Arquivo", type: "text", default: "{{path}}", template: true },
    { key: "folder", label: "Para a pasta", type: "folder", default: "{desktop}", template: true },
    { key: "move", label: "Mover (em vez de copiar)", type: "boolean", default: false },
  ], produces: "o item com o novo `path`" },
  // Nuvem
  { kind: "cloud.list", label: "Listar pasta na nuvem", category: "nuvem", description: "Lista arquivos de uma pasta do Google Drive, OneDrive, Dropbox… (conta conectada).", input: true, output: true, mode: "once", params: [
    { key: "remote", label: "Conta", type: "remote", default: "gdrive" },
    { key: "folder", label: "Pasta na nuvem", type: "text", default: "", placeholder: "Relatórios/Entrada" },
    { key: "onlyNew", label: "Só arquivos novos", type: "boolean", default: true },
    { key: "recursive", label: "Incluir subpastas", type: "boolean", default: false },
  ], produces: "um item por arquivo: `name`, `remotePath`, `remote`, `modified`, `size`" },
  { kind: "cloud.download", label: "Baixar da nuvem", category: "nuvem", description: "Baixa o arquivo do item para o PC (Google Docs viram .docx/.xlsx/.pptx).", input: true, output: true, mode: "each", params: [
    { key: "folder", label: "Pasta local", type: "folder", default: "{documents}\\Open Assistant\\Nuvem", template: true },
  ], produces: "o item + `path` local" },
  { kind: "cloud.upload", label: "Enviar para a nuvem", category: "nuvem", description: "Envia o arquivo do item para uma pasta da nuvem (a conta precisa de permissão de escrita).", input: true, output: true, mode: "each", params: [
    { key: "remote", label: "Conta", type: "remote", default: "gdrive" },
    { key: "folder", label: "Pasta na nuvem", type: "text", default: "" },
  ], produces: "o item + `remotePath`" },
  // IA
  { kind: "ai.prompt", label: "Pedir à IA", category: "ia", description: "Manda uma instrução para o modelo de IA (local ou nuvem) com os dados do item.", input: true, output: true, mode: "each", params: [
    { key: "instruction", label: "Instrução", type: "longtext", default: "Resuma em 5 tópicos:\n\n{{text}}", template: true },
    { key: "model", label: "Modelo", type: "model", default: "", help: "Vazio = o modelo padrão do chat." },
  ], produces: "o item + `text` (resposta da IA)" },
  { kind: "ai.summarize", label: "Resumir documento", category: "ia", description: "Resume o `text` do item em português.", input: true, output: true, mode: "each", params: [
    { key: "style", label: "Estilo", type: "select", default: "topicos", options: [{ value: "topicos", label: "Tópicos" }, { value: "curto", label: "Um parágrafo" }, { value: "relatorio", label: "Relatório completo" }] },
    { key: "model", label: "Modelo", type: "model", default: "" },
  ], produces: "o item + `text` (resumo) + `original`" },
  { kind: "image.generate", label: "Gerar imagem", category: "ia", description: "Cria uma imagem aqui no PC a partir de um texto.", input: true, output: true, mode: "each", params: [
    { key: "prompt", label: "Descrição", type: "longtext", default: "{{text}}", template: true },
    { key: "model", label: "Modelo de imagem", type: "imageModel", default: "" },
  ], produces: "o item + `image` e `path` da imagem" },
  { kind: "image.edit", label: "Editar foto com IA", category: "ia", description: "Refaz uma foto seguindo uma descrição (img2img), mantendo a composição.", input: true, output: true, mode: "each", params: [
    { key: "path", label: "Foto", type: "text", default: "{{path}}", template: true },
    { key: "prompt", label: "Como deve ficar", type: "longtext", default: "a mesma foto em estilo aquarela", template: true },
    { key: "strength", label: "Quanto mudar (0,1–0,9)", type: "number", default: .5 },
    { key: "model", label: "Modelo de imagem", type: "imageModel", default: "" },
  ], produces: "o item + `image` e `path` da foto editada" },
  // Fluxo
  { kind: "flow.merge", label: "Juntar em um texto", category: "fluxo", description: "Junta todos os itens em um só (ex.: vários resumos → um relatório).", input: true, output: true, mode: "all", params: [
    { key: "itemTemplate", label: "Cada item vira", type: "longtext", default: "## {{name}}\n\n{{text}}", template: true },
    { key: "header", label: "Cabeçalho", type: "longtext", default: "# Relatório de {{date}}", template: true },
    { key: "separator", label: "Separador", type: "text", default: "\n\n" },
  ], produces: "1 item: `text` (tudo junto), `count`" },
  { kind: "flow.filter", label: "Filtrar", category: "fluxo", description: "Deixa passar só os itens em que o campo contém o texto.", input: true, output: true, mode: "all", params: [
    { key: "field", label: "Campo", type: "text", default: "name" },
    { key: "contains", label: "Contém", type: "text", default: "" },
    { key: "invert", label: "Inverter (não contém)", type: "boolean", default: false },
  ], produces: "os itens que passaram" },
  { kind: "flow.stopIfEmpty", label: "Parar se vazio", category: "fluxo", description: "Encerra o fluxo em silêncio quando nada chegou (ex.: nenhum arquivo novo).", input: true, output: true, mode: "all", params: [], produces: "os mesmos itens" },
  // Saída
  { kind: "output.chat", label: "Mostrar no chat", category: "saida", description: "Mostra o resultado numa conversa \"Automação: <nome do workflow>\".", input: true, output: false, mode: "all", params: [
    { key: "message", label: "Mensagem", type: "longtext", default: "{{text}}", template: true },
  ], produces: "—" },
  { kind: "output.notify", label: "Notificação do Windows", category: "saida", description: "Mostra um aviso no canto da tela.", input: true, output: true, mode: "all", params: [
    { key: "title", label: "Título", type: "text", default: "Open Assistant", template: true },
    { key: "message", label: "Mensagem", type: "text", default: "{{count}} itens processados", template: true },
  ], produces: "os mesmos itens" },
  // Sistema
  { kind: "system.powershell", label: "PowerShell", category: "sistema", description: "Roda um comando (a política de segurança do agente vale aqui: comandos perigosos pedem confirmação ou são bloqueados).", input: true, output: true, mode: "each", params: [
    { key: "command", label: "Comando", type: "longtext", default: "Get-Date", template: true },
  ], produces: "o item + `text` (saída do comando)" },
  { kind: "agent.task", label: "Agente do PC", category: "sistema", description: "Entrega uma tarefa ao agente que controla o computador (abrir apps, clicar, mover janelas…).", input: true, output: true, mode: "each", params: [
    { key: "instruction", label: "Tarefa", type: "longtext", default: "", template: true },
  ], produces: "o item + `text` (resposta do agente)" },
  // Sistema (só visualização): etapas que o próprio app executa, acesas ao vivo pelo rastro (`store/systemTrace.ts`).
  { kind: "trace.start", label: "Início do sistema", category: "sistema", description: "Onde um fluxo do próprio app começa (ex.: uma mensagem do chat).", input: false, output: true, mode: "once", traceOnly: true, params: [
    { key: "about", label: "O que faz", type: "longtext", default: "" },
    { key: "code", label: "Onde no código", type: "text", default: "" },
  ], produces: "—" },
  { kind: "trace.step", label: "Etapa do sistema", category: "sistema", description: "Uma etapa que o próprio app executa; acende quando acontece de verdade.", input: true, output: true, mode: "each", traceOnly: true, params: [
    { key: "about", label: "O que faz", type: "longtext", default: "" },
    { key: "code", label: "Onde no código", type: "text", default: "" },
  ], produces: "—" },
];

export const KIND_BY_ID = new Map(NODE_KINDS.map((spec) => [spec.kind, spec]));

export const CATEGORY_LABEL: Record<NodeCategory, string> = { gatilho: "Gatilho", web: "Web", arquivos: "Arquivos", nuvem: "Nuvem", ia: "IA", fluxo: "Fluxo", saida: "Saída", sistema: "Sistema" };

/** Parâmetros padrão do kind, completados com os informados. */
export function withDefaults(kind: string, params: Record<string, ParamValue> = {}): Record<string, ParamValue> {
  const spec = KIND_BY_ID.get(kind);
  const result: Record<string, ParamValue> = {};
  for (const param of spec?.params ?? []) if (param.default !== undefined) result[param.key] = param.default;
  return { ...result, ...params };
}

export function nodeTitle(node: FlowNode): string {
  return node.title?.trim() || KIND_BY_ID.get(node.kind)?.label || node.kind;
}

// ---------------------------------------------------------------- textos com {{campos}}

const pad = (value: number) => String(value).padStart(2, "0");

/** Valores de data/hora usados nos modelos (`{{date}}` = 2026-09-25, `{{time}}` = 14-30). */
export function clockFields(now = new Date()): Record<string, string> {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return { date, time, datetime: `${date} ${time}`, dataBR: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}` };
}

/**
 * `{{campo}}` → valor do item (ou do contexto: `date`, `time`, `count`, `index`, `workflow`).
 * `{desktop}`, `{documents}`, `{downloads}`, `{pictures}`, `{home}`, `{temp}` → pastas do usuário.
 * Campo que não existe vira texto vazio.
 */
export function renderTemplate(template: string, item: FlowItem = {}, context: Record<string, unknown> = {}, folders: Record<string, string> = {}): string {
  const withFolders = template.replace(/\{(desktop|documents|downloads|pictures|home|temp)\}/g, (_, key: string) => folders[key] ?? `{${key}}`);
  return withFolders.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split(".").reduce<unknown>((current, part) => (current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined), { ...context, ...item });
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

// ---------------------------------------------------------------- grafo

export interface ValidationIssue { nodeId?: string; message: string }

/** Nodes em ordem de execução (topológica). Ciclos → erro. */
export function executionOrder(doc: Pick<WorkflowDoc, "nodes" | "connections">): FlowNode[] {
  const incoming = new Map(doc.nodes.map((node) => [node.id, 0]));
  for (const connection of doc.connections) if (incoming.has(connection.to) && incoming.has(connection.from)) incoming.set(connection.to, (incoming.get(connection.to) ?? 0) + 1);
  const queue = doc.nodes.filter((node) => incoming.get(node.id) === 0).sort((a, b) => a.x - b.x || a.y - b.y);
  const order: FlowNode[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    order.push(node);
    for (const connection of doc.connections.filter((item) => item.from === node.id)) {
      const left = (incoming.get(connection.to) ?? 0) - 1;
      incoming.set(connection.to, left);
      if (left === 0) { const next = doc.nodes.find((item) => item.id === connection.to); if (next) queue.push(next); }
    }
  }
  if (order.length !== doc.nodes.length) throw new Error("O workflow tem um ciclo (uma ligação volta para um node anterior).");
  return order;
}

/** Problemas que impedem rodar (a IA recebe esta lista para corrigir o que montou). */
export function validateWorkflow(doc: Pick<WorkflowDoc, "nodes" | "connections">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const node of doc.nodes) {
    if (ids.has(node.id)) issues.push({ nodeId: node.id, message: `id repetido: ${node.id}` });
    ids.add(node.id);
    const spec = KIND_BY_ID.get(node.kind);
    if (!spec) { issues.push({ nodeId: node.id, message: `kind desconhecido: ${node.kind}. Kinds válidos: ${NODE_KINDS.map((item) => item.kind).join(", ")}` }); continue; }
    for (const key of Object.keys(node.params ?? {})) if (!spec.params.some((param) => param.key === key)) issues.push({ nodeId: node.id, message: `${node.kind} não tem o parâmetro "${key}" (tem: ${spec.params.map((param) => param.key).join(", ") || "nenhum"})` });
    if (spec.input && !doc.connections.some((connection) => connection.to === node.id)) issues.push({ nodeId: node.id, message: `"${nodeTitle(node)}" não recebe nada: ligue a saída de outro node na entrada dele.` });
  }
  for (const connection of doc.connections) {
    const from = doc.nodes.find((node) => node.id === connection.from);
    const to = doc.nodes.find((node) => node.id === connection.to);
    if (!from || !to) { issues.push({ message: `ligação ${connection.from} → ${connection.to} aponta para node inexistente` }); continue; }
    if (KIND_BY_ID.get(from.kind)?.output === false) issues.push({ nodeId: from.id, message: `"${nodeTitle(from)}" não tem saída.` });
    if (KIND_BY_ID.get(to.kind)?.input === false) issues.push({ nodeId: to.id, message: `"${nodeTitle(to)}" é um gatilho e não tem entrada.` });
  }
  if (!doc.nodes.some((node) => node.kind.startsWith("trigger.") || node.kind === "trace.start")) issues.push({ message: "Falta um gatilho (trigger.manual ou trigger.schedule) no começo." });
  try { executionOrder(doc); } catch (error) { issues.push({ message: (error as Error).message }); }
  return issues;
}

export const NODE_WIDTH = 260;
const COLUMN_GAP = 330;
const ROW_GAP = 230;

/** Organiza da esquerda para a direita por camadas (usado quando a IA não informa x/y). */
export function autoLayout(nodes: FlowNode[], connections: FlowConnection[]): FlowNode[] {
  const depth = new Map<string, number>();
  let order: FlowNode[];
  try { order = executionOrder({ nodes, connections }); } catch { order = nodes; }
  for (const node of order) {
    const parents = connections.filter((connection) => connection.to === node.id).map((connection) => depth.get(connection.from) ?? 0);
    depth.set(node.id, parents.length ? Math.max(...parents) + 1 : 0);
  }
  const rows = new Map<number, number>();
  return nodes.map((node) => {
    const column = depth.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...node, x: 80 + column * COLUMN_GAP, y: 90 + row * ROW_GAP };
  });
}

/** Workflow montado pela IA (ou por um modelo): ids, padrões e posições completados. */
export function buildWorkflow(input: { name: string; description?: string; nodes: { id?: string; kind: string; title?: string; params?: Record<string, ParamValue>; x?: number; y?: number }[]; connections?: { from: string; to: string }[] }, now = Date.now()): WorkflowDoc {
  const nodes: FlowNode[] = input.nodes.map((node, index) => ({ id: node.id?.trim() || `n${index + 1}`, kind: node.kind, title: node.title, x: node.x ?? NaN, y: node.y ?? NaN, params: withDefaults(node.kind, node.params ?? {}) }));
  const connections: FlowConnection[] = (input.connections ?? []).map((connection, index) => ({ id: `c${index + 1}`, from: connection.from, to: connection.to }));
  const needsLayout = nodes.some((node) => !Number.isFinite(node.x) || !Number.isFinite(node.y));
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Workflow",
    description: input.description,
    nodes: needsLayout ? autoLayout(nodes, connections) : nodes,
    connections,
    frames: [],
    createdAt: now,
    updatedAt: now,
    scheduleEnabled: nodes.some((node) => node.kind === "trigger.schedule"),
  };
}

/** Workflow novo com só o gatilho manual. */
export function blankWorkflow(name: string, now = Date.now()): WorkflowDoc {
  return buildWorkflow({ name, nodes: [{ id: "inicio", kind: "trigger.manual", x: 90, y: 150 }] }, now);
}

/** Minutos do gatilho de agendamento (ou `undefined` se não houver). */
export function scheduleMinutes(doc: WorkflowDoc): number | undefined {
  const trigger = doc.nodes.find((node) => node.kind === "trigger.schedule");
  return trigger ? Math.max(1, Number(trigger.params.minutes) || 30) : undefined;
}

/** Hora de rodar de novo? */
export function isDue(doc: WorkflowDoc, now = Date.now()): boolean {
  const minutes = scheduleMinutes(doc);
  if (!minutes || doc.scheduleEnabled === false) return false;
  return doc.lastRunAt === undefined || now - doc.lastRunAt >= minutes * 60_000;
}

// ---------------------------------------------------------------- modelos prontos (exemplos reais)

export interface WorkflowTemplate { id: string; name: string; description: string; build: () => WorkflowDoc }

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "abrir-site",
    name: "Abrir um site",
    description: "Clique em Executar e o site abre no navegador.",
    build: () => buildWorkflow({ name: "Abrir um site", nodes: [
      { id: "inicio", kind: "trigger.manual" },
      { id: "site", kind: "web.open", params: { url: "https://g1.globo.com", browser: "padrao" } },
    ], connections: [{ from: "inicio", to: "site" }] }),
  },
  {
    id: "editar-foto",
    name: "Editar foto com IA",
    description: "Pega as fotos novas de uma pasta, refaz cada uma em outro estilo e salva o resultado.",
    build: () => buildWorkflow({ name: "Editar foto com IA", nodes: [
      { id: "inicio", kind: "trigger.manual" },
      { id: "fotos", kind: "file.list", params: { folder: "{desktop}\\Fotos para editar", pattern: "*.png;*.jpg;*.jpeg", onlyNew: true } },
      { id: "editar", kind: "image.edit", params: { path: "{{path}}", prompt: "a mesma foto em estilo pintura a óleo, cores quentes", strength: .5 } },
      { id: "copiar", kind: "file.copy", params: { path: "{{image}}", folder: "{desktop}\\Fotos editadas", move: false } },
    ], connections: [{ from: "inicio", to: "fotos" }, { from: "fotos", to: "editar" }, { from: "editar", to: "copiar" }] }),
  },
  {
    id: "drive-resumos",
    name: "Resumos do Google Drive a cada 30 min",
    description: "Olha uma pasta do Google Drive a cada 30 minutos, baixa os documentos novos, resume cada um e salva um relatório em Área de Trabalho\\resumos.",
    build: () => buildWorkflow({ name: "Resumos do Google Drive", description: "Relatório dos documentos que entram numa pasta do Drive.", nodes: [
      { id: "agenda", kind: "trigger.schedule", params: { minutes: 30 } },
      { id: "drive", kind: "cloud.list", params: { remote: "gdrive", folder: "Entrada", onlyNew: true } },
      { id: "vazio", kind: "flow.stopIfEmpty" },
      { id: "baixar", kind: "cloud.download", params: { folder: "{documents}\\Open Assistant\\Nuvem" } },
      { id: "ler", kind: "file.read", params: { path: "{{path}}" } },
      { id: "resumir", kind: "ai.summarize", params: { style: "topicos" } },
      { id: "juntar", kind: "flow.merge", params: { header: "# Resumos de {{dataBR}}\n\n{{count}} documentos novos na pasta do Drive.", itemTemplate: "## {{name}}\n\n{{text}}" } },
      { id: "salvar", kind: "file.write", params: { folder: "{desktop}\\resumos", fileName: "resumos {{date}} {{time}}.md", content: "{{text}}", mode: "unique" } },
      { id: "avisar", kind: "output.notify", params: { title: "Resumos prontos", message: "Relatório salvo em resumos na Área de Trabalho" } },
    ], connections: [
      { from: "agenda", to: "drive" }, { from: "drive", to: "vazio" }, { from: "vazio", to: "baixar" }, { from: "baixar", to: "ler" },
      { from: "ler", to: "resumir" }, { from: "resumir", to: "juntar" }, { from: "juntar", to: "salvar" }, { from: "salvar", to: "avisar" },
    ] }),
  },
  {
    id: "pasta-local-resumos",
    name: "Resumir documentos de uma pasta do PC",
    description: "Lê os documentos novos de uma pasta local, resume com a IA e salva um relatório.",
    build: () => buildWorkflow({ name: "Resumir pasta do PC", nodes: [
      { id: "inicio", kind: "trigger.manual" },
      { id: "pasta", kind: "file.list", params: { folder: "{documents}", pattern: "*.pdf;*.docx;*.txt;*.md", onlyNew: true } },
      { id: "vazio", kind: "flow.stopIfEmpty" },
      { id: "ler", kind: "file.read" },
      { id: "resumir", kind: "ai.summarize", params: { style: "curto" } },
      { id: "juntar", kind: "flow.merge" },
      { id: "salvar", kind: "file.write", params: { folder: "{desktop}\\resumos", fileName: "resumo {{date}} {{time}}.md", mode: "unique" } },
    ], connections: [
      { from: "inicio", to: "pasta" }, { from: "pasta", to: "vazio" }, { from: "vazio", to: "ler" }, { from: "ler", to: "resumir" },
      { from: "resumir", to: "juntar" }, { from: "juntar", to: "salvar" },
    ] }),
  },
];

/** Converte o canvas antigo (tipos input/agent/tool/output só visuais) em um workflow de verdade. */
export function migrateLegacyCanvas(nodes: { id: string; title: string; type: string; x: number; y: number }[], connections: { from: string; to: string }[], frames: FlowFrame[] = [], now = Date.now()): WorkflowDoc {
  const kindFor = (type: string, title: string) => type === "input" ? "trigger.manual" : type === "agent" ? "ai.prompt" : type === "output" ? "output.chat" : /powershell/i.test(title) ? "system.powershell" : "agent.task";
  return {
    id: crypto.randomUUID(),
    name: "Fluxo principal",
    nodes: nodes.map((node) => ({ id: node.id, kind: kindFor(node.type, node.title), title: node.title, x: node.x, y: node.y, params: withDefaults(kindFor(node.type, node.title)) })),
    connections: connections.map((connection, index) => ({ id: `c${index + 1}`, from: connection.from, to: connection.to })),
    frames,
    createdAt: now,
    updatedAt: now,
  };
}
