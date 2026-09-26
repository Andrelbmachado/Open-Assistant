/**
 * Liga o motor de workflows ao app: o `WorkflowHost` real (Tauri/Rust, IA, agente, chat), o disparo
 * manual, o agendador e as ferramentas que a IA usa para criar e rodar workflows (`workflow_*`).
 * O `WorkflowService` (componente montado no App) chama `configureWorkflowService` com o estado atual.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Action, AppState } from "../store/store";
import { finishRun, getWorkflowRun, isRunCancelled, startRun, updateRunNode, type WorkflowRun } from "../store/workflowRuns";
import { getToolsSnapshot } from "../store/toolsStore";
import { getLocalModelsSnapshot } from "../store/localModelsStore";
import { askAI } from "./aiService";
import { resolveImageModel } from "./imageCatalog";
import { runWorkflow, type CloudEntry, type FileEntry, type RunResult, type WorkflowHost } from "./workflowEngine";
import { buildWorkflow, KIND_BY_ID, NODE_KINDS, nodeTitle, scheduleMinutes, validateWorkflow, type ParamValue, type WorkflowDoc } from "./workflow";
import { isQAOffline } from "./qaMode";

interface ServiceDeps {
  getState: () => AppState;
  dispatch: (action: Action) => void;
  /** Roda o agente do PC (ChatView não participa; o workflow usa o acesso atual). */
  runAgent?: (instruction: string) => Promise<string>;
}

let deps: ServiceDeps | undefined;
let folders: Record<string, string> = {};

export function configureWorkflowService(value: ServiceDeps) {
  deps = value;
  if (!Object.keys(folders).length && !isQAOffline()) {
    void invoke<Record<string, string>>("wf_known_folders").then((value) => { folders = value; }).catch(() => undefined);
  }
}

function need(): ServiceDeps {
  if (!deps) throw new Error("O editor de nodes ainda está carregando.");
  return deps;
}

/** Modelo de texto padrão: o preferido nas configurações ou o da conversa ativa. */
function defaultModel(state: AppState): string {
  return state.preferredModel || state.chats.find((chat) => chat.id === state.activeChatId)?.model || "";
}

/** Host real: cada ação vira um comando do Rust (a política de segurança do agente vale nos comandos). */
export function createWorkflowHost(): WorkflowHost {
  const { getState, dispatch, runAgent } = need();
  return {
    folders,
    openUrl: (url, browser) => invoke("wf_open_url", { url, browser: browser === "padrao" ? undefined : browser }),
    readUrl: async (url) => (await invoke<{ status: string; text: string }>("agent_tool", { name: "read_url", args: { url, max_chars: 20000 }, access: "Somente leitura", confirmed: false })).text,
    webSearch: async (query) => (await invoke<{ status: string; text: string }>("agent_tool", { name: "web_search", args: { query }, access: "Somente leitura", confirmed: false })).text,
    http: (method, url, body) => invoke("wf_http", { method, url, body }),
    listFiles: (folder, pattern, recursive) => invoke<FileEntry[]>("wf_list_files", { folder, pattern, recursive }),
    readFile: (path) => invoke<string>("wf_read_file", { path }),
    writeFile: (folder, name, content, mode) => invoke<string>("wf_write_file", { folder, name, content, mode }),
    copyFile: (from, folder, move) => invoke<string>("wf_copy_file", { from, toFolder: folder, moveFile: move }),
    cloudList: (remote, folder, recursive) => invoke<CloudEntry[]>("cloud_list", { remote, folder, recursive }),
    cloudDownload: (remote, path, folder) => invoke<string>("cloud_download", { remote, path, localFolder: folder }),
    cloudUpload: (localPath, remote, folder) => invoke<string>("cloud_upload", { localPath, remote, folder }),
    ai: async (prompt, model) => {
      const chosen = model || defaultModel(getState());
      const reply = await askAI(chosen, [{ role: "user", content: prompt }]);
      return reply.text.trim();
    },
    generateImage: async (prompt, model, edit) => {
      const state = getState();
      const chosen = resolveImageModel(model || state.preferredImageModel, getToolsSnapshot().installed, getLocalModelsSnapshot().hardware);
      if (!chosen) throw new Error("Nenhum modelo de imagem baixado (Configurações › Modelos locais › Modelos de imagem).");
      const result = await invoke<{ path: string }>("image_generate", { request: { requestId: crypto.randomUUID(), modelId: chosen.id, prompt, initImage: edit?.path, strength: edit?.strength } });
      return result.path;
    },
    runCommand: async (command) => {
      const access = getState().access;
      const outcome = await invoke<{ status: string; text: string; reason?: string }>("agent_tool", { name: "run_command", args: { command }, access, confirmed: false });
      if (outcome.status === "needs_confirm") throw new Error(`este comando pede confirmação (${outcome.reason ?? "política"}). Rode pelo chat ou mude o acesso para Automático.`);
      if (outcome.status !== "ok") throw new Error(outcome.reason ?? outcome.text);
      return outcome.text;
    },
    runAgent: async (instruction) => {
      if (!runAgent) throw new Error("o agente do PC não está disponível agora.");
      return runAgent(instruction);
    },
    postToChat: (title, text) => dispatch({ type: "postAutomationMessage", title, text }),
    notify: (title, message) => invoke("wf_notify", { title, message }),
  };
}

/** Roda um workflow salvo e grava o resultado (hora da execução e memória de "só novos"). */
export async function runWorkflowById(id: string, trigger: WorkflowRun["trigger"] = "manual"): Promise<RunResult> {
  const { getState, dispatch } = need();
  const doc = getState().workflows.find((item) => item.id === id);
  if (!doc) throw new Error("Workflow não encontrado.");
  if (getWorkflowRun(id)?.running) throw new Error(`"${doc.name}" já está rodando.`);
  const issues = validateWorkflow(doc);
  if (issues.length) {
    const result: RunResult = { ok: false, error: issues.map((issue) => issue.message).join(" "), outputs: {}, memory: doc.memory ?? {}, ms: 0 };
    startRun(id, trigger);
    finishRun(id, result);
    return result;
  }
  startRun(id, trigger);
  const result = await runWorkflow(doc, createWorkflowHost(), { onNode: (nodeId, info) => updateRunNode(id, nodeId, info), isCancelled: () => isRunCancelled(id) });
  finishRun(id, result);
  dispatch({ type: "wfRunFinished", workflowId: id, at: Date.now(), memory: result.ok ? result.memory : undefined });
  return result;
}

/** Agendador: roda os workflows com "A cada X minutos" que estão na hora. Chamado a cada 30 s. */
export function runDueWorkflows(now = Date.now()) {
  if (!deps) return;
  for (const doc of deps.getState().workflows) {
    const minutes = scheduleMinutes(doc);
    if (!minutes || doc.scheduleEnabled === false || getWorkflowRun(doc.id)?.running) continue;
    if (doc.lastRunAt !== undefined && now - doc.lastRunAt < minutes * 60_000) continue;
    void runWorkflowById(doc.id, "agenda").catch(() => undefined);
  }
}

// ---------------------------------------------------------------- ferramentas da IA

/** Ferramentas que a IA usa para montar workflows (tratadas aqui no front, não no Rust). */
export const WORKFLOW_TOOLS = [
  { type: "function", function: { name: "workflow_kinds", description: "Lista os tipos de node do editor (kind, parâmetros com padrão, o que entra e sai). Consulte antes de montar um workflow.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "workflow_save", description: "Cria (ou substitui, se já existir um com o mesmo nome) um workflow no editor de nodes e o abre. nodes: [{id, kind, title?, params}], connections: [{from, to}] (saída de from → entrada de to). Comece com trigger.manual ou trigger.schedule. Use {{campo}} nos textos para dados do item e {desktop}/{documents} para pastas.", parameters: { type: "object", properties: {
    name: { type: "string" }, description: { type: "string" },
    nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string" }, title: { type: "string" }, params: { type: "object" } }, required: ["id", "kind"] } },
    connections: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } },
    run: { type: "boolean", description: "Executar logo depois de salvar." },
  }, required: ["name", "nodes", "connections"] } } },
  { type: "function", function: { name: "workflow_list", description: "Lista os workflows salvos (nome, nodes, agendamento, última execução).", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "workflow_run", description: "Executa um workflow salvo pelo nome e devolve o resultado de cada node.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
];

/** Catálogo em texto compacto para a IA (gerado do código: nunca desatualiza). */
export function kindsText(): string {
  return NODE_KINDS.map((spec) => {
    const params = spec.params.map((param) => `${param.key}${param.default !== undefined && param.default !== "" ? `=${JSON.stringify(param.default)}` : ""}${param.options ? ` (${param.options.map((option) => option.value).join("|")})` : ""}`).join(", ");
    return `- ${spec.kind} — ${spec.label}: ${spec.description} [${spec.input ? "entrada" : "sem entrada"}; ${spec.mode === "each" ? "roda por item" : spec.mode === "all" ? "recebe todos os itens" : "roda uma vez"}] params: ${params || "nenhum"}. Sai: ${spec.produces}`;
  }).join("\n");
}

function findWorkflow(state: AppState, name: string): WorkflowDoc | undefined {
  const wanted = name.trim().toLowerCase();
  return state.workflows.find((doc) => doc.name.toLowerCase() === wanted) ?? state.workflows.find((doc) => doc.name.toLowerCase().includes(wanted));
}

function describeRun(doc: WorkflowDoc, result: RunResult): string {
  const lines = doc.nodes.map((node) => {
    const run = getWorkflowRun(doc.id)?.nodes[node.id];
    const items = result.outputs[node.id];
    return `- ${nodeTitle(node)} (${node.kind}): ${run?.state ?? "?"}${items ? `, ${items.length} itens` : ""}${run?.message ? ` — ${run.message}` : ""}${run?.sample ? ` — ex.: ${run.sample.slice(0, 160)}` : ""}`;
  });
  return `${result.ok ? result.stopped ? "Parou de propósito (nada novo)." : "Executou com sucesso." : `Falhou: ${result.error}`} (${(result.ms / 1000).toFixed(1)} s)\n${lines.join("\n")}`;
}

/** Executa uma ferramenta `workflow_*` pedida pela IA. Erros voltam como texto para ela corrigir. */
export async function runWorkflowTool(name: string, args: Record<string, unknown>): Promise<{ status: "ok" | "error"; text: string }> {
  const { getState, dispatch } = need();
  try {
    if (name === "workflow_kinds") return { status: "ok", text: kindsText() };
    if (name === "workflow_list") {
      const docs = getState().workflows;
      if (!docs.length) return { status: "ok", text: "Nenhum workflow salvo." };
      return { status: "ok", text: docs.map((doc) => `- "${doc.name}": ${doc.nodes.length} nodes${scheduleMinutes(doc) ? `, a cada ${scheduleMinutes(doc)} min${doc.scheduleEnabled === false ? " (pausado)" : ""}` : ""}${doc.lastRunAt ? `, última execução ${new Date(doc.lastRunAt).toLocaleString("pt-BR")}` : ""}`).join("\n") };
    }
    if (name === "workflow_run") {
      const doc = findWorkflow(getState(), String(args.name ?? ""));
      if (!doc) return { status: "error", text: `Não há workflow "${args.name}". Use workflow_list.` };
      const result = await runWorkflowById(doc.id, "ia");
      return { status: result.ok ? "ok" : "error", text: describeRun(doc, result) };
    }
    if (name === "workflow_save") {
      const nodes = Array.isArray(args.nodes) ? args.nodes as { id?: string; kind: string; title?: string; params?: Record<string, ParamValue> }[] : [];
      const connections = Array.isArray(args.connections) ? args.connections as { from: string; to: string }[] : [];
      const built = buildWorkflow({ name: String(args.name ?? "Workflow da IA"), description: args.description ? String(args.description) : undefined, nodes, connections });
      const issues = validateWorkflow(built);
      if (issues.length) return { status: "error", text: `Não salvei; corrija e chame workflow_save de novo:\n${issues.map((issue) => `- ${issue.nodeId ? `[${issue.nodeId}] ` : ""}${issue.message}`).join("\n")}` };
      const existing = findWorkflow(getState(), built.name);
      const doc = existing && existing.name.toLowerCase() === built.name.toLowerCase() ? { ...built, id: existing.id, createdAt: existing.createdAt, memory: existing.memory } : built;
      dispatch({ type: "wfCreate", doc });
      let text = `Salvei o workflow "${doc.name}" com ${doc.nodes.length} nodes e abri no editor de nodes.${scheduleMinutes(doc) ? ` Ele roda sozinho a cada ${scheduleMinutes(doc)} minutos enquanto o app estiver aberto.` : ""}`;
      const cloud = doc.nodes.find((node) => node.kind.startsWith("cloud."));
      if (cloud) text += ` Para a nuvem, a conta "${cloud.params.remote ?? "gdrive"}" precisa estar conectada (botão "Conectar" no node — o usuário entra no navegador).`;
      if (args.run === true) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const result = await runWorkflowById(doc.id, "ia");
        text += `\n\nExecução:\n${describeRun(doc, result)}`;
      }
      return { status: "ok", text };
    }
    return { status: "error", text: `Ferramenta desconhecida: ${name}` };
  } catch (error) {
    return { status: "error", text: error instanceof Error ? error.message : String(error) };
  }
}

/** Pedido que parece de automação/workflow: a IA recebe a skill do editor de nodes e as ferramentas. */
export function looksLikeWorkflowRequest(text: string): boolean {
  return /\b(workflow|fluxo de trabalho|node editor|editor de nodes?|nodes?\b|automa[çc][ãa]o|automatiz|agend|a cada \d+\s*(min|minutos|hora|horas)|toda (hora|manh[ãa]|noite)|todo dia|diariamente)/i.test(text);
}

export { KIND_BY_ID };
