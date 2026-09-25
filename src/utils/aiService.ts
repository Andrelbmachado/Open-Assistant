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
}

interface OllamaChatResult {
  model: string;
  content: string;
  thinking: string;
  cancelled: boolean;
  tokensPerSecond?: number | null;
  evalCount?: number | null;
  thinkingTokens?: number | null;
}

interface OllamaChatDelta extends AIDelta {
  requestId: string;
}

/** Erro mostrado quando o chat não tem modelo local escolhido. */
export const NO_LOCAL_MODEL_ERROR = "Nenhum modelo local selecionado. Baixe um modelo em Configurações › Modelos locais ou escolha um modelo instalado em + › Modelo de IA.";

const SYSTEM_PROMPT = "Você é o Open Assistant, um assistente pessoal que roda localmente no computador Windows do usuário. Responda no idioma do usuário (por padrão, português do Brasil), de forma clara, direta e útil.";

/** Extrai o id do Ollama de `Ollama: <id>` (undefined para outros formatos). */
export function ollamaModelId(model: string): string | undefined {
  if (!model.startsWith(OLLAMA_MODEL_PREFIX)) return undefined;
  return model.slice(OLLAMA_MODEL_PREFIX.length).trim() || undefined;
}

/**
 * Envia a conversa ao Ollama local pelo backend. Não há fallback para nuvem nem
 * resposta simulada: qualquer falha do Ollama é repassada ao chat.
 */
export function systemPromptFor(effort?: EffortLevel): string {
  const instruction = effort ? EFFORT_INFO[effort].instruction : undefined;
  return instruction ? `${SYSTEM_PROMPT} ${instruction}` : SYSTEM_PROMPT;
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
      messages: [{ role: "system", content: systemPromptFor(options.effort) }, ...messages],
      think: effort?.think ?? options.think ?? false,
      thinkLevel: effort?.think ? effort.thinkLevel : undefined,
    });
    return {
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
      messages: [{ role: "system", content: systemPromptFor(options.effort) }, ...messages],
    });
    return { text: result.content.trim(), source: "BitNet (bitnet.cpp)", tokensPerSecond: result.tokensPerSecond ?? undefined, tokens: result.evalCount ?? undefined, cancelled: result.cancelled };
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
      messages: [{ role: "system", content: systemPromptFor(options.effort) }, ...messages],
    });
    return { text: result.content.trim(), source: cloudDisplayName(`Nuvem: ${providerId}/${model}`) ?? providerId, tokensPerSecond: result.tokensPerSecond ?? undefined, tokens: result.evalCount ?? undefined, cancelled: result.cancelled };
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
