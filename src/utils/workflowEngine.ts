/**
 * Motor do editor de nodes: roda um workflow node a node, na ordem das ligações, passando itens.
 * Não fala com o sistema direto — tudo passa pelo `WorkflowHost` (o real chama o Rust; os testes
 * usam um falso). Assim a lógica do fluxo é testável e a política de segurança fica no Rust.
 */
import { clockFields, executionOrder, KIND_BY_ID, nodeTitle, renderTemplate, withDefaults, type FlowItem, type FlowNode, type WorkflowDoc } from "./workflow";

export interface FileEntry { path: string; name: string; size: number; modified: number; isDir?: boolean }
export interface CloudEntry { name: string; path: string; size: number; modified: string; mimeType?: string; isDir: boolean }

/** O que o motor pede ao app. */
export interface WorkflowHost {
  folders: Record<string, string>;
  openUrl(url: string, browser?: string): Promise<void>;
  readUrl(url: string): Promise<string>;
  webSearch(query: string): Promise<string>;
  http(method: string, url: string, body?: string): Promise<{ status: number; text: string }>;
  listFiles(folder: string, pattern: string, recursive: boolean): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(folder: string, name: string, content: string, mode: string): Promise<string>;
  copyFile(from: string, folder: string, move: boolean): Promise<string>;
  cloudList(remote: string, folder: string, recursive: boolean): Promise<CloudEntry[]>;
  cloudDownload(remote: string, path: string, folder: string): Promise<string>;
  cloudUpload(localPath: string, remote: string, folder: string): Promise<string>;
  ai(prompt: string, model?: string): Promise<string>;
  generateImage(prompt: string, model?: string, edit?: { path: string; strength: number }): Promise<string>;
  runCommand(command: string): Promise<string>;
  runAgent(instruction: string): Promise<string>;
  postToChat(title: string, text: string): void;
  notify(title: string, message: string): Promise<void>;
}

export type NodeRunState = "waiting" | "running" | "ok" | "error" | "skipped";

export interface NodeRunInfo {
  state: NodeRunState;
  /** Itens que saíram do node. */
  count?: number;
  message?: string;
  /** Amostra do primeiro item (para o painel de execução). */
  sample?: string;
  ms?: number;
}

export interface RunCallbacks {
  onNode?: (nodeId: string, info: NodeRunInfo) => void;
  isCancelled?: () => boolean;
}

export interface RunResult {
  ok: boolean;
  /** Parou de propósito (ex.: "Parar se vazio" sem itens). */
  stopped?: boolean;
  error?: string;
  outputs: Record<string, FlowItem[]>;
  /** Memória nova (arquivos já vistos), só gravada se a execução terminou bem. */
  memory: Record<string, string[]>;
  ms: number;
}

const SUMMARY_STYLE: Record<string, string> = {
  topicos: "Resuma o documento abaixo em português do Brasil, em 3 a 7 tópicos curtos com o que importa (decisões, números, prazos, pessoas).",
  curto: "Resuma o documento abaixo em português do Brasil em um parágrafo de até 5 frases.",
  relatorio: "Escreva um relatório em português do Brasil sobre o documento abaixo: contexto, pontos principais, números e próximos passos, com títulos curtos.",
};

/** Texto curto para mostrar no painel. */
function sampleOf(item: FlowItem | undefined): string | undefined {
  if (!item) return undefined;
  const text = item.text ?? item.path ?? item.url ?? item.name ?? item.remotePath;
  return text ? String(text).slice(0, 280) : undefined;
}

class StopFlow extends Error {}

/** Roda o workflow. Nunca lança: erros viram `ok: false` com a mensagem do node que falhou. */
export async function runWorkflow(doc: WorkflowDoc, host: WorkflowHost, callbacks: RunCallbacks = {}): Promise<RunResult> {
  const started = Date.now();
  const outputs: Record<string, FlowItem[]> = {};
  const memory: Record<string, string[]> = { ...(doc.memory ?? {}) };
  const report = (id: string, info: NodeRunInfo) => callbacks.onNode?.(id, info);
  let order: FlowNode[];
  try { order = executionOrder(doc); } catch (error) { return { ok: false, error: (error as Error).message, outputs, memory: doc.memory ?? {}, ms: 0 }; }
  order.forEach((node) => report(node.id, { state: "waiting" }));
  const clock = clockFields();
  for (const node of order) {
    if (callbacks.isCancelled?.()) return { ok: false, error: "Execução cancelada.", outputs, memory: doc.memory ?? {}, ms: Date.now() - started };
    const spec = KIND_BY_ID.get(node.kind);
    const incoming = doc.connections.filter((connection) => connection.to === node.id);
    const inputs = incoming.flatMap((connection) => outputs[connection.from] ?? []);
    if (spec?.input && incoming.length && !inputs.length && node.kind !== "flow.stopIfEmpty") {
      outputs[node.id] = [];
      report(node.id, { state: "skipped", count: 0, message: "Nada chegou." });
      continue;
    }
    const nodeStart = Date.now();
    report(node.id, { state: "running" });
    try {
      const items = await runNode(node, spec?.kind ? inputs : [], { host, clock, memory, workflow: doc.name });
      outputs[node.id] = items;
      report(node.id, { state: "ok", count: items.length, sample: sampleOf(items[0]), ms: Date.now() - nodeStart });
    } catch (error) {
      if (error instanceof StopFlow) {
        outputs[node.id] = [];
        report(node.id, { state: "ok", count: 0, message: error.message, ms: Date.now() - nodeStart });
        order.slice(order.indexOf(node) + 1).forEach((rest) => report(rest.id, { state: "skipped", message: "Fluxo parado antes." }));
        return { ok: true, stopped: true, outputs, memory, ms: Date.now() - started };
      }
      const message = error instanceof Error ? error.message : String(error);
      report(node.id, { state: "error", message, ms: Date.now() - nodeStart });
      order.slice(order.indexOf(node) + 1).forEach((rest) => report(rest.id, { state: "skipped" }));
      return { ok: false, error: `${nodeTitle(node)}: ${message}`, outputs, memory: doc.memory ?? {}, ms: Date.now() - started };
    }
  }
  return { ok: true, outputs, memory, ms: Date.now() - started };
}

interface NodeContext { host: WorkflowHost; clock: Record<string, string>; memory: Record<string, string[]>; workflow: string }

/** Executa um node sobre os itens que chegaram. */
async function runNode(node: FlowNode, inputs: FlowItem[], context: NodeContext): Promise<FlowItem[]> {
  const spec = KIND_BY_ID.get(node.kind);
  if (!spec) throw new Error(`tipo de node desconhecido: ${node.kind}`);
  const params = withDefaults(node.kind, node.params);
  const { host, clock } = context;
  const base = { ...clock, workflow: context.workflow, count: inputs.length };
  const text = (key: string, item: FlowItem = {}, index = 0) => renderTemplate(String(params[key] ?? ""), item, { ...base, index: index + 1 }, host.folders);
  const flag = (key: string) => params[key] === true || params[key] === "true";
  const each = async (work: (item: FlowItem, index: number) => Promise<FlowItem | FlowItem[] | undefined>) => {
    const out: FlowItem[] = [];
    for (const [index, item] of (inputs.length ? inputs : [{}]).entries()) {
      const result = await work(item, index);
      if (Array.isArray(result)) out.push(...result);
      else if (result) out.push(result);
    }
    return out;
  };
  /** Só o que ainda não passou (chave = caminho + data de modificação). */
  const onlyNew = <T,>(entries: T[], key: (entry: T) => string): T[] => {
    const seen = new Set(context.memory[node.id] ?? []);
    context.memory[node.id] = entries.map(key);
    return entries.filter((entry) => !seen.has(key(entry)));
  };

  switch (node.kind) {
    case "trigger.manual": return [{ ...clock }];
    case "trigger.schedule": return [{ ...clock }];
    case "web.open": return each(async (item, index) => { const url = text("url", item, index); await host.openUrl(url, String(params.browser ?? "padrao")); return { ...item, url }; });
    case "web.read": return each(async (item, index) => { const url = text("url", item, index); return { ...item, url, text: await host.readUrl(url) }; });
    case "web.search": return each(async (item, index) => ({ ...item, text: await host.webSearch(text("query", item, index)) }));
    case "http.request": return each(async (item, index) => {
      const reply = await host.http(String(params.method ?? "GET"), text("url", item, index), text("body", item, index) || undefined);
      let json: unknown;
      try { json = JSON.parse(reply.text); } catch { json = undefined; }
      return { ...item, text: reply.text, json, status: reply.status };
    });
    case "file.list": {
      const files = (await host.listFiles(text("folder"), String(params.pattern ?? ""), flag("recursive"))).filter((file) => !file.isDir);
      const chosen = flag("onlyNew") ? onlyNew(files, (file) => `${file.path}|${file.modified}`) : files;
      return chosen.map((file) => ({ path: file.path, name: file.name, size: file.size, modified: file.modified }));
    }
    case "file.read": return each(async (item, index) => ({ ...item, text: await host.readFile(text("path", item, index)) }));
    case "file.write": return each(async (item, index) => ({ ...item, path: await host.writeFile(text("folder", item, index), text("fileName", item, index), text("content", item, index), String(params.mode ?? "unique")) }));
    case "file.copy": return each(async (item, index) => ({ ...item, path: await host.copyFile(text("path", item, index), text("folder", item, index), flag("move")) }));
    case "cloud.list": {
      const remote = String(params.remote ?? "gdrive");
      const entries = (await host.cloudList(remote, String(params.folder ?? ""), flag("recursive"))).filter((entry) => !entry.isDir);
      const chosen = flag("onlyNew") ? onlyNew(entries, (entry) => `${entry.path}|${entry.modified}`) : entries;
      return chosen.map((entry) => ({ name: entry.name, remotePath: entry.path, remote, modified: entry.modified, size: entry.size }));
    }
    case "cloud.download": return each(async (item, index) => {
      if (!item.remotePath || !item.remote) throw new Error("o item não veio de \"Listar pasta na nuvem\" (falta remotePath).");
      return { ...item, path: await host.cloudDownload(String(item.remote), String(item.remotePath), text("folder", item, index)) };
    });
    case "cloud.upload": return each(async (item) => {
      if (!item.path) throw new Error("o item não tem `path` de um arquivo local.");
      return { ...item, remotePath: await host.cloudUpload(String(item.path), String(params.remote ?? "gdrive"), String(params.folder ?? "")) };
    });
    case "ai.prompt": return each(async (item, index) => ({ ...item, text: await host.ai(text("instruction", item, index), String(params.model ?? "") || undefined) }));
    case "ai.summarize": return each(async (item) => {
      const source = String(item.text ?? "").trim();
      if (!source) return { ...item, text: "(documento vazio ou ilegível)", original: "" };
      const prompt = `${SUMMARY_STYLE[String(params.style)] ?? SUMMARY_STYLE.topicos}\n\nDocumento${item.name ? ` "${item.name}"` : ""}:\n"""\n${source.slice(0, 24_000)}\n"""`;
      return { ...item, original: source.slice(0, 2000), text: await host.ai(prompt, String(params.model ?? "") || undefined) };
    });
    case "image.generate": return each(async (item, index) => { const path = await host.generateImage(text("prompt", item, index), String(params.model ?? "") || undefined); return { ...item, image: path, path }; });
    case "image.edit": return each(async (item, index) => {
      const photo = text("path", item, index);
      if (!photo) throw new Error("falta a foto (campo Foto).");
      const strength = Math.min(.9, Math.max(.1, Number(params.strength) || .5));
      const path = await host.generateImage(text("prompt", item, index), String(params.model ?? "") || undefined, { path: photo, strength });
      return { ...item, image: path, path, source: photo };
    });
    case "flow.merge": {
      const parts = inputs.map((item, index) => renderTemplate(String(params.itemTemplate ?? "{{text}}"), item, { ...base, index: index + 1 }, host.folders));
      const header = text("header");
      const separator = String(params.separator ?? "\n\n").replace(/\\n/g, "\n");
      return [{ text: [header, ...parts].filter(Boolean).join(separator), count: inputs.length, name: context.workflow }];
    }
    case "flow.filter": {
      const field = String(params.field ?? "name");
      const needle = String(params.contains ?? "").toLowerCase();
      const invert = flag("invert");
      return inputs.filter((item) => String(item[field] ?? "").toLowerCase().includes(needle) !== invert);
    }
    case "flow.stopIfEmpty": if (!inputs.length) throw new StopFlow("Nada novo: fluxo encerrado."); return inputs;
    case "output.chat": {
      const message = inputs.length <= 1 ? text("message", inputs[0] ?? {}) : inputs.map((item, index) => text("message", item, index)).join("\n\n");
      host.postToChat(context.workflow, message);
      return [];
    }
    case "output.notify": await host.notify(text("title", inputs[0] ?? {}), text("message", inputs[0] ?? {})); return inputs;
    case "system.powershell": return each(async (item, index) => ({ ...item, text: await host.runCommand(text("command", item, index)) }));
    case "agent.task": return each(async (item, index) => ({ ...item, text: await host.runAgent(text("instruction", item, index)) }));
    default: throw new Error(`o node ${node.kind} ainda não tem executor.`);
  }
}
