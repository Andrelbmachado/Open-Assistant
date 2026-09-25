import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EFFORT_INFO, type EffortLevel } from "./effort";
import { BITNET_MODEL_PREFIX, OLLAMA_MODEL_PREFIX } from "./localCatalog";
import { allCloudProviders, cloudDisplayName, parseCloudModel } from "./cloudModels";
import { createOfflineQAReply, isQAOffline } from "./qaMode";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Imagens em base64 (sem `data:`), lidas por modelos com visão. */
  images?: string[];
}

export interface AIReply {
  text: string;
  source: string;
  thinking?: string;
  tokensPerSecond?: number;
  /** Tokens gerados na resposta (sem contar o prompt). */
  tokens?: number;
  /** Tokens gastos no raciocínio, contados pelo backend. */
  thinkingTokens?: number;
  cancelled?: boolean;
  /** O modelo pediu para controlar o PC (ferramenta `controlar_computador` ou marcador): o chat chama o agente. */
  wantsComputer?: boolean;
}

export interface AIDelta {
  content: string;
  thinking: string;
  thinkingTokens?: number;
}

export interface AskOptions {
  requestId?: string;
  /** Ativa o raciocínio em modelos que suportam `think` no Ollama. */
  think?: boolean;
  /** Nível do slider de esforço; tem prioridade sobre `think`. */
  effort?: EffortLevel;
  onDelta?: (delta: AIDelta) => void;
  /** Bloco de memória do usuário (`memoryPrompt`), somado ao prompt de sistema. */
  memory?: string;
  /** Deixa o modelo decidir controlar o PC (ferramenta no Ollama, marcador nos outros). */
  allowComputerControl?: boolean;
}

interface OllamaChatResult {
  model: string;
  content: string;
  thinking: string;
  cancelled: boolean;
  tokensPerSecond?: number | null;
  evalCount?: number | null;
  thinkingTokens?: number | null;
  toolCalls?: { function?: { name?: string } }[];
}

interface OllamaChatDelta extends AIDelta {
  requestId: string;
}

/** Erro mostrado quando o chat não tem modelo local escolhido. */
export const NO_LOCAL_MODEL_ERROR = "Nenhum modelo local selecionado. Baixe um modelo em Configurações › Modelos locais ou escolha um modelo instalado em + › Modelo de IA.";

const SYSTEM_PROMPT = "Você é o Open Assistant, um assistente pessoal que roda localmente no computador Windows do usuário. Responda no idioma do usuário (por padrão, português do Brasil), de forma clara, direta e útil.";
/**
 * O app controla o PC sozinho quando o modelo decide que precisa. Sem isto o modelo respondia
 * "não consigo abrir o PowerShell, sou só um modelo de texto".
 */
const APP_CAPABILITIES = "Você controla este computador Windows pelo app Open Assistant: abre programas e sites, clica, digita, executa comandos do PowerShell, lê a tela e usa conectores MCP. Nunca diga que não consegue agir no computador nem que é só um modelo de texto.";
/** Ferramenta única do chat comum: chamar = passar o pedido para o agente que controla o PC. */
export const COMPUTER_TOOL_NAME = "controlar_computador";
const COMPUTER_TOOL = {
  type: "function",
  function: {
    name: COMPUTER_TOOL_NAME,
    description: "Assume o controle do computador do usuário para cumprir o pedido. Chame quando o usuário pedir para agir no PC (abrir programas ou sites, clicar, digitar, executar comandos, ver a tela, mexer em arquivos, tocar um vídeo) ou quando você não conseguir cumprir a tarefa só respondendo com texto.",
    parameters: { type: "object", properties: { motivo: { type: "string", description: "o que precisa ser feito no PC" } }, required: ["motivo"] },
  },
};
const TOOL_INSTRUCTION = `Se o pedido exigir agir no computador, chame a ferramenta ${COMPUTER_TOOL_NAME} em vez de responder.`;
/** Modelos sem ferramentas (nuvem, BitNet) pedem o controle com este marcador. */
export const COMPUTER_MARKER = "[[CONTROLAR_PC]]";
const MARKER_INSTRUCTION = `Se o pedido exigir agir no computador, responda somente ${COMPUTER_MARKER} e nada mais: o app assume o controle.`;

/** Extrai o id do Ollama de `Ollama: <id>` (undefined para outros formatos). */
export function ollamaModelId(model: string): string | undefined {
  if (!model.startsWith(OLLAMA_MODEL_PREFIX)) return undefined;
  return model.slice(OLLAMA_MODEL_PREFIX.length).trim() || undefined;
}

/**
 * Envia a conversa ao Ollama local pelo backend. Não há fallback para nuvem nem
 * resposta simulada: qualquer falha do Ollama é repassada ao chat.
 */
export function systemPromptFor(effort?: EffortLevel, memory = "", control: "tool" | "marker" | "none" = "none"): string {
  const instruction = effort ? EFFORT_INFO[effort].instruction : undefined;
  const controlText = control === "tool" ? ` ${TOOL_INSTRUCTION}` : control === "marker" ? ` ${MARKER_INSTRUCTION}` : "";
  return `${SYSTEM_PROMPT} ${APP_CAPABILITIES}${controlText}${instruction ? ` ${instruction}` : ""}${memory}`;
}

/** Marcador de controle no texto de modelos sem ferramentas. */
export function hasComputerMarker(text: string): boolean {
  return text.includes(COMPUTER_MARKER) || text.includes("CONTROLAR_PC");
}

const qaCancelled = new Set<string>();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Prévia QA no navegador: simula raciocínio e streaming sem tocar no Ollama. */
async function simulateQAReply(model: string, messages: AIMessage[], requestId: string, options: AskOptions): Promise<AIReply> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const reply = createOfflineQAReply(lastUserMsg, model);
  const think = options.effort ? EFFORT_INFO[options.effort].think : options.think;
  let thinking = "";
  let thinkingTokens = 0;
  if (think) {
    const words = "Vou entender o pedido, separar as partes principais, conferir o contexto do projeto e montar uma resposta curta e verificável.".split(" ");
    for (const word of words) {
      if (qaCancelled.delete(requestId)) return { ...reply, thinking, thinkingTokens, cancelled: true };
      await wait(110);
      thinking += `${word} `;
      thinkingTokens += 1;
      options.onDelta?.({ content: "", thinking: `${word} `, thinkingTokens: 1 });
    }
  } else {
    await wait(700);
  }
  for (const piece of reply.text.match(/.{1,6}/gs) ?? []) {
    if (qaCancelled.delete(requestId)) return { ...reply, thinking: thinking.trim() || undefined, thinkingTokens, cancelled: true };
    await wait(28);
    options.onDelta?.({ content: piece, thinking: "" });
  }
  return { ...reply, thinking: thinking.trim() || undefined, thinkingTokens };
}

/** Envia a conversa ao modelo local (Ollama ou BitNet) com streaming; sem fallback para nuvem. */
export async function askAI(model: string, messages: AIMessage[], options: AskOptions = {}): Promise<AIReply> {
  const requestId = options.requestId ?? crypto.randomUUID();
  if (isQAOffline()) return simulateQAReply(model, messages, requestId, options);
  if (model.startsWith(BITNET_MODEL_PREFIX)) return askBitnet(messages, requestId, options);
  const cloud = parseCloudModel(model);
  if (cloud) return askCloud(cloud.providerId, cloud.model, messages, requestId, options);
  const modelId = ollamaModelId(model);
  if (!modelId) throw new Error(NO_LOCAL_MODEL_ERROR);
  const effort = options.effort ? EFFORT_INFO[options.effort] : undefined;

  const stopListening = await listen<OllamaChatDelta>("ollama-chat-delta", (event) => {
    if (event.payload.requestId === requestId) options.onDelta?.(event.payload);
  });
  try {
    const result = await invoke<OllamaChatResult>("ollama_chat", {
      requestId,
      model: modelId,
      messages: [{ role: "system", content: systemPromptFor(options.effort, options.memory, options.allowComputerControl ? "tool" : "none") }, ...messages],
      think: effort?.think ?? options.think ?? false,
      thinkLevel: effort?.think ? effort.thinkLevel : undefined,
      options: options.allowComputerControl ? { tools: [COMPUTER_TOOL] } : undefined,
    });
    const wantsComputer = Boolean(result.toolCalls?.some((call) => call.function?.name === COMPUTER_TOOL_NAME)) || hasComputerMarker(result.content);
    return {
      wantsComputer,
      text: result.content.trim(),
      thinking: result.thinking.trim() || undefined,
      source: `Ollama (${result.model})`,
      tokensPerSecond: result.tokensPerSecond ?? undefined,
      tokens: result.evalCount ?? undefined,
      thinkingTokens: result.thinkingTokens ?? undefined,
      cancelled: result.cancelled,
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    stopListening();
  }
}

/** Microsoft BitNet no bitnet.cpp: mesmo evento de streaming e mesmo cancelamento do Ollama. */
async function askBitnet(messages: AIMessage[], requestId: string, options: AskOptions): Promise<AIReply> {
  const stopListening = await listen<OllamaChatDelta>("ollama-chat-delta", (event) => {
    if (event.payload.requestId === requestId) options.onDelta?.(event.payload);
  });
  try {
    const result = await invoke<OllamaChatResult>("bitnet_chat", {
      requestId,
      messages: [{ role: "system", content: systemPromptFor(options.effort, options.memory, options.allowComputerControl ? "marker" : "none") }, ...messages],
    });
    return { wantsComputer: options.allowComputerControl && hasComputerMarker(result.content), text: result.content.trim(), source: "BitNet (bitnet.cpp)", tokensPerSecond: result.tokensPerSecond ?? undefined, tokens: result.evalCount ?? undefined, cancelled: result.cancelled };
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    stopListening();
  }
}

/** Interrompe a geração em andamento pelo id da requisição. */
/** Provedor em nuvem pelo Rust (a chave fica no Gerenciador de Credenciais). */
async function askCloud(providerId: string, model: string, messages: AIMessage[], requestId: string, options: AskOptions): Promise<AIReply> {
  const baseUrl = allCloudProviders().find((provider) => provider.id === providerId)?.baseUrl;
  const stopListening = await listen<OllamaChatDelta>("ollama-chat-delta", (event) => {
    if (event.payload.requestId === requestId) options.onDelta?.(event.payload);
  });
  try {
    const result = await invoke<OllamaChatResult>("cloud_chat", {
      requestId, providerId, model, baseUrl,
      messages: [{ role: "system", content: systemPromptFor(options.effort, options.memory, options.allowComputerControl ? "marker" : "none") }, ...messages],
    });
    return { wantsComputer: options.allowComputerControl && hasComputerMarker(result.content), text: result.content.trim(), source: cloudDisplayName(`Nuvem: ${providerId}/${model}`) ?? providerId, tokensPerSecond: result.tokensPerSecond ?? undefined, tokens: result.evalCount ?? undefined, cancelled: result.cancelled };
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    stopListening();
  }
}

export function cancelAI(requestId: string): Promise<void> {
  if (isQAOffline()) { qaCancelled.add(requestId); return Promise.resolve(); }
  return invoke<void>("ollama_cancel_chat", { requestId }).catch(() => undefined);
}
