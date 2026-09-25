import { ArrowUp, AtSign, AudioLines, Ban, Bot, Brain, Check, ChevronRight, KeyRound, Cloud, CircleAlert, CircleCheck, CircleX, Copy, Cpu, Download, FileText, Folder, Image, LoaderCircle, Mic, Play, Plus, ShieldCheck, Sparkles, Square, Volume2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type ActionCandidate, type Invocation } from "../store/store";
import { refreshInstalledModels, scanHardware, startOllama, useLocalModels } from "../store/localModelsStore";
import { SpeechController, transcribe } from "../utils/SpeechController";
import { refreshTools, useTools } from "../store/toolsStore";
import { resolveAsrModel, resolveTtsVoice } from "../utils/toolCatalog";
import { VoiceCapture, type CaptureResult } from "../utils/voiceCapture";
import { matchAction, runAgent, runCatalogAction, warmAgent, type AccessMode, type AgentResult, type AgentStep } from "../utils/agentRunner";
import { invoke } from "@tauri-apps/api/core";
import { allCloudProviders, CLOUD_PRODUCT_NAMES, cloudModelValue, providerModels } from "../utils/cloudModels";
import { applyDetected, detectMemory, memoryPrompt } from "../utils/memory";
import { looksLikePcAction } from "../utils/pcIntent";
import { parseCalculation } from "../utils/calc";
import { CalculatorCard } from "./CalculatorCard";
import { findMention } from "../utils/composerMentions";
import type { ProviderConfig } from "../utils/providers";
import { cleanModelTitle, titlePrompt } from "../utils/chatTitle";
import { askAI, cancelAI, COMPUTER_MARKER, NO_LOCAL_MODEL_ERROR, ollamaModelId } from "../utils/aiService";
import { AssistantFace } from "./AssistantFace";
import { EffortControl } from "./EffortControl";
import type { SpeechPulse } from "./RobotFace";
import { ThinkingIndicator, thinkingSummary } from "./ThinkingIndicator";
import { activityLabel, nextOrbitalState, type OrbitalState } from "../utils/orbitalState";
import { isQAOffline } from "../utils/qaMode";
import { getAIMeterSummary } from "../utils/aiMeter";
import { getVisibleTokensPerSecond, nextComposerPopover, type ComposerPopover, type GenerationMetric } from "../utils/composerState";
import { BITNET_MODEL, buildLocalModelOptions, formatBytes, OLLAMA_MODEL_PREFIX, resolveChatModel, type LocalModelOption } from "../utils/localCatalog";
import { describePull } from "../utils/localOperation";
import { headingText, tokenizeInline } from "../utils/inlineMarkdown";
import { estimateTokens, modelDisplayName, replyFooter } from "../utils/messageMeta";
import { detectSpeechExpression, type RobotExpression } from "../utils/robotExpression";

const speech = new SpeechController();
type ApprovalMode = AccessMode;
/** Slider de acesso: mínimo = só leitura, meio = pergunta antes de agir, máximo = age sozinho. */
const ACCESS_STEPS: ApprovalMode[] = ["Somente leitura", "Perguntar", "Automático"];
const ACCESS_LABELS: Record<ApprovalMode, string> = { "Somente leitura": "Somente leitura", Perguntar: "Pergunta antes de agir", "Automático": "Total (age sozinho)" };
type ConfirmAnswer = "allow" | "always" | "deny";

/** Passo do agente como linha do chat: ícone de estado + rótulo + saída recolhível. */
function AgentSteps({ steps }: { steps: AgentStep[] }) {
  return <ol className="agent-steps">{steps.map((step) => {
    const Icon = step.status === "ok" ? CircleCheck : step.status === "running" ? LoaderCircle : step.status === "waiting" ? CircleAlert : CircleX;
    return <li key={step.id} className={`agent-step ${step.status}`}>
      <details>
        <summary><Icon size={13} className={step.status === "running" ? "spin" : undefined} /><span>{step.label}</span>{step.status === "waiting" && <em>aguardando você</em>}{step.status === "denied" && <em>não permitido</em>}</summary>
        {step.output && <pre>{step.output}</pre>}
      </details>
    </li>;
  })}</ol>;
}

/** Copiar com confirmação: vira ✓ por 3 s e volta a ser Copiar (dá para copiar de novo). */
export function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(text); }
    catch {
      // Sem permissão da Clipboard API (janela sem foco): cópia pelo jeito antigo.
      const area = Object.assign(document.createElement("textarea"), { value: text });
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 3000);
  }
  const title = copied ? "Copiado" : "Copiar";
  return <button className={`copy-button ${copied ? "copied" : ""} ${className}`} onClick={() => void copy()} title={title} aria-label={title}>
    {copied ? <Check size={13} /> : <Copy size={13} />}{label && <span>{copied ? "Copiado" : label}</span>}
  </button>;
}

/** Item do menu de "/" (skills) e "@" (conectores MCP). */
interface MentionItem { kind: Invocation["kind"]; id: string; label: string; description: string; disabled?: boolean }
interface SkillInfo { id: string; name: string; description: string }
interface McpServerStatus { name: string; disabled: boolean; running: boolean; tools: string[]; error?: string }

function upsertStep(steps: AgentStep[], step: AgentStep): AgentStep[] {
  const index = steps.findIndex((item) => item.id === step.id);
  if (index < 0) return [...steps, step];
  const next = [...steps];
  next[index] = step;
  return next;
}

/** Anexos enviados nesta sessão, por id da mensagem, para as perguntas seguintes ainda verem a imagem. */
const sessionAttachments = new Map<string, { images: string[]; text: string }>();
const TEXT_FILE = /\.(txt|md|json|jsonc|ya?ml|toml|ini|csv|log|xml|html?|css|scss|js|jsx|ts|tsx|mjs|cjs|py|rs|go|java|kt|cs|cpp|cc|c|h|hpp|rb|php|sh|ps1|bat|sql|swift|vue|svelte)$/i;
const MAX_TEXT_FILE = 200_000;
const FENCE = "```";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error(`Não foi possível ler ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Imagens vão para modelos com visão; arquivos de texto (código, logs) entram no prompt. */
async function readAttachments(files: File[]): Promise<{ images: string[]; text: string }> {
  const images: string[] = [];
  const parts: string[] = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) images.push(await fileToBase64(file));
    else if ((file.type.startsWith("text/") || TEXT_FILE.test(file.name)) && file.size <= MAX_TEXT_FILE) parts.push(`Arquivo anexado ${file.name}:\n${FENCE}\n${await file.text()}\n${FENCE}`);
  }
  return { images, text: parts.join("\n\n") };
}

/**
 * Tela de chat: mensagens, compositor (anexos, modelo, esforço, acesso), voz local e controle do PC automático.
 * Ordem de cada envio: calculadora → "/"/"@" → ação rápida do catálogo → ação clara no PC (agente) → modelo,
 * que pode pedir o controle do PC pela ferramenta `controlar_computador`.
 */
export function ChatView() {
  const { state, dispatch } = useStore();
  const local = useLocalModels();
  const tools = useTools();
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNeedsSetup, setVoiceNeedsSetup] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [orbitalState, setOrbitalState] = useState<OrbitalState>("idle");
  const [audioLevel, setAudioLevel] = useState<number | undefined>();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [activePopover, setActivePopover] = useState<ComposerPopover | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [contextProject, setContextProject] = useState("Open Assistant");
  const approval = state.access;
  const setApproval = (access: ApprovalMode) => dispatch({ type: "setAccess", access });
  const [confirmRequest, setConfirmRequest] = useState<{ step: AgentStep; resolve: (answer: ConfirmAnswer) => void }>();
  const agentCancel = useRef(false);
  /** Skills ("/") e conectores ("@") escolhidos para a próxima mensagem. */
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [mention, setMention] = useState<{ kind: Invocation["kind"]; query: string; start: number }>();
  const [mentionIndex, setMentionIndex] = useState(0);
  const [skills, setSkills] = useState<SkillInfo[]>();
  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Provedores em nuvem com chave salva (só o "tem ou não"; a chave fica no Rust). */
  const [cloudKeys, setCloudKeys] = useState<Record<string, boolean>>({});
  const [expression, setExpression] = useState<RobotExpression>("idle");
  const [stageVisible, setStageVisible] = useState(false);
  const [lastGeneration, setLastGeneration] = useState<GenerationMetric>();
  const [pendingRequest, setPendingRequest] = useState<{ requestId: string; chatId: string; assistantId: string }>();
  const speechPulse = useRef<SpeechPulse>({ at: 0, supported: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  // Segue a resposta em streaming, a menos que o usuário tenha rolado para ler algo acima.
  const followLatest = useRef(true);
  const capture = useRef(new VoiceCapture());
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chat = state.chats.find((item) => item.id === state.activeChatId) ?? state.chats[0];
  const suggestions = useMemo(() => ["Criar um plano de implementação", "Revisar os arquivos do projeto", "Abrir um terminal PowerShell"], []);
  const localOptions = buildLocalModelOptions(local.hardware, local.installed);
  const installedIds = local.installed.map((model) => model.name);
  const chatModel = resolveChatModel(chat.model, installedIds, state.preferredModel);
  // Uma geração por vez: o Ollama processaria em fila e o botão Parar precisa de um alvo único.
  const generating = Boolean(pendingRequest);
  const canSend = Boolean(draft.trim() || attachments.length);
  const quickMenuOpen = activePopover === "quick";
  const projectOpen = activePopover === "project";
  const meterOpen = activePopover === "meter";
  const lastTokensPerSecond = getVisibleTokensPerSecond(lastGeneration, chat.id, chatModel ?? chat.model);
  const aiMeter = getAIMeterSummary(chatModel ?? "", lastTokensPerSecond, isQAOffline());
  // O rosto do assistente só aparece enquanto a conversa por voz está ativa.
  const voiceActive = voiceMode || listening || orbitalState === "speaking";
  const filteredProjects = state.projects.filter((project) => project.name.toLocaleLowerCase().includes(projectSearch.trim().toLocaleLowerCase()));

  useEffect(() => {
    void refreshInstalledModels();
    void scanHardware();
    void refreshTools();
    // Modelos baixados por fora (ex.: `ollama pull` no terminal) aparecem ao voltar para o app.
    const onFocus = () => { void refreshInstalledModels(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const list = messagesRef.current;
    if (list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [chat.messages]);

  // O agente (skill + conectores MCP) sobe em segundo plano logo que o chat abre: quando a IA decidir
  // controlar o PC, não precisa esperar os conectores.
  useEffect(() => { if (isQAOffline()) return; const timer = setTimeout(warmAgent, 4000); return () => clearTimeout(timer); }, []);

  useEffect(() => {
    followLatest.current = true;
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.id]);

  useEffect(() => {
    if (!activePopover) return;
    const onMouseDown = (event: MouseEvent) => {
      if (composerRef.current?.contains(event.target as Node)) return;
      setActivePopover(null);
      setModelMenuOpen(false);
     
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [activePopover]);

  useEffect(() => {
    if (voiceActive) { setStageVisible(true); return; }
    // Mantém o rosto por um instante para mostrar a transição de "parando de falar".
    const timer = setTimeout(() => setStageVisible(false), 1300);
    return () => clearTimeout(timer);
  }, [voiceActive]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function resetOrbitalAfterError(message: string) {
    setVoiceError(message);
    setOrbitalState(nextOrbitalState("error"));
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setOrbitalState(nextOrbitalState("reset")), 1800);
  }

  function stopVoiceSession() {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    capture.current.stop("stopped", false);
    setListening(false);
    setVoiceMode(false);
    setAudioLevel(undefined);
    setOrbitalState(nextOrbitalState("reset"));
  }

  function stopSpeaking() {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    speech.stopSpeaking();
    setVoiceMode(false);
    setOrbitalState(nextOrbitalState("speech-end"));
  }

  function startSpeaking(text: string) {
    setExpression(detectSpeechExpression(text));
    speechPulse.current = { at: 0, supported: false };
    setOrbitalState(nextOrbitalState("speech-start"));
    if (isQAOffline()) {
      if (voiceTimer.current) clearTimeout(voiceTimer.current);
      voiceTimer.current = setTimeout(() => {
        setVoiceMode(false);
        setExpression("stopping");
        setOrbitalState(nextOrbitalState("speech-end"));
      }, Math.min(3200, Math.max(900, text.length * 18)));
      return;
    }
    speech.speak(text, {
      voiceId: resolveTtsVoice(state.voice.ttsVoice, tools.installed),
      onLevel: (level) => setAudioLevel(level || undefined),
      onStart: () => setOrbitalState(nextOrbitalState("speech-start")),
      onBoundary: () => { speechPulse.current = { at: performance.now(), supported: true }; },
      onEnd: () => { setVoiceMode(false); setAudioLevel(undefined); setExpression("stopping"); setOrbitalState(nextOrbitalState("speech-end")); },
      onError: resetOrbitalAfterError,
    });
  }

  function openVoiceSettings() {
    dispatch({ type: "settings", open: true, tab: "voice" });
    setVoiceError("");
    setVoiceNeedsSetup(false);
  }

  function openToolsSettings(focusModel?: string) {
    dispatch({ type: "settings", open: true, tab: "tools", focusModel });
    setActivePopover(null);
    setModelMenuOpen(false);
  }

  function selectBitnet() {
    dispatch({ type: "setModel", chatId: chat.id, model: BITNET_MODEL });
    setModelMenuOpen(false);
    setActivePopover(null);
  }

  // Ao abrir o seletor de modelos, confere quais provedores em nuvem já têm chave.
  useEffect(() => {
    if (!modelMenuOpen || isQAOffline()) return;
    for (const provider of allCloudProviders()) {
      invoke<boolean>("has_credential", { account: provider.id }).then((has) => setCloudKeys((keys) => ({ ...keys, [provider.id]: has }))).catch(() => undefined);
    }
  }, [modelMenuOpen]);

  /** Depois da primeira resposta, pede ao modelo local um título curto com o assunto (em segundo plano). */
  function refineTitle(chatId: string, model: string, firstMessage: string) {
    if (!model.startsWith(OLLAMA_MODEL_PREFIX) || isQAOffline()) return;
    void askAI(model, [{ role: "user", content: titlePrompt(firstMessage) }], { effort: "fast" })
      .then((reply) => { const title = cleanModelTitle(reply.text); if (title) dispatch({ type: "renameChat", chatId, title }); })
      .catch(() => undefined);
  }

  /** Provedor com chave: uma linha por modelo. Sem chave: linhas inativas que levam a Provedores. */
  function cloudRows(provider: ProviderConfig) {
    const product = CLOUD_PRODUCT_NAMES[provider.id] ?? provider.name;
    // Sem chave, uma linha por provedor basta (todas levariam ao mesmo lugar).
    const models = cloudKeys[provider.id] ? providerModels(provider) : providerModels(provider).slice(0, 1);
    return models.map((model) => {
      const value = cloudModelValue(provider.id, model);
      const active = chatModel === value;
      const name = <span className="model-row-name"><b>{product}</b><code title={model}>{model.split("/").pop()}</code></span>;
      if (cloudKeys[provider.id]) return <button key={value} className={`model-mode-row ${active ? "active" : ""}`} title={`${provider.name} · ${model}`} onClick={() => { dispatch({ type: "setModel", chatId: chat.id, model: value }); setModelMenuOpen(false); setActivePopover(null); }}>{name}<small>Nuvem</small>{active ? <Check size={14} /> : <Cloud size={13} />}</button>;
      return <button key={value} className="model-mode-row cloud-locked" aria-disabled="true" title="Inativo: adicione uma chave de API para usar este modelo" onClick={() => { dispatch({ type: "settings", open: true, tab: "providers", focusModel: provider.id, notice: `Adicione uma chave de API da ${provider.name} para usar ${product} (${model}).` }); setModelMenuOpen(false); setActivePopover(null); }}>{name}<small>Sem chave</small><KeyRound size={13} /></button>;
    });
  }

  function openModelSettings(focusModel?: string) {
    dispatch({ type: "settings", open: true, tab: "models", focusModel });
    setActivePopover(null);
    setModelMenuOpen(false);
  }

  function selectModel(option: LocalModelOption) {
    dispatch({ type: "setModel", chatId: chat.id, model: `${OLLAMA_MODEL_PREFIX}${option.id}` });
    setModelMenuOpen(false);
    setActivePopover(null);
  }

  /** O agente usa o Ollama (ferramentas); com modelo em nuvem/BitNet no chat, usa o modelo local preferido. */
  function agentModelFor(model: string | undefined): string {
    if (model && ollamaModelId(model)) return model;
    const preferred = state.preferredModel && ollamaModelId(state.preferredModel) ? state.preferredModel : undefined;
    const installed = preferred ?? (installedIds[0] ? `${OLLAMA_MODEL_PREFIX}${installedIds[0]}` : undefined);
    if (!installed) throw new Error("Para controlar o PC, baixe um modelo local com ferramentas (ex.: qwen3.5:9b) em Configurações › Modelos locais.");
    return installed;
  }

  /** Roda o agente e grava passos/resposta na mensagem do assistente. */
  async function agentTurn(params: { chatId: string; assistantMsgId: string; requestId: string; model: string; history: { role: "user" | "assistant"; content: string }[]; userText: string; images?: string[]; memory: string; invocations?: Invocation[] }): Promise<AgentResult> {
    agentCancel.current = false;
    let steps: AgentStep[] = [];
    const result = await runAgent({
      model: params.model,
      history: params.history,
      userText: params.userText,
      images: params.images,
      access: state.access,
      effort: state.effort,
      requestId: params.requestId,
      memory: params.memory,
      skill: params.invocations?.find((item) => item.kind === "skill")?.id,
      mcpServer: params.invocations?.find((item) => item.kind === "mcp")?.id,
      onStep: (step) => { steps = upsertStep(steps, step); dispatch({ type: "updateMessage", chatId: params.chatId, messageId: params.assistantMsgId, patch: { steps } }); },
      confirm: (step) => new Promise<ConfirmAnswer>((resolve) => setConfirmRequest({ step, resolve })),
      isCancelled: () => agentCancel.current,
    });
    if (result.tokensPerSecond) setLastGeneration({ chatId: params.chatId, model: params.model, tokensPerSecond: result.tokensPerSecond });
    dispatch({ type: "updateMessage", chatId: params.chatId, messageId: params.assistantMsgId, patch: { text: result.text, steps: result.steps, loading: false, source: result.source, tokens: result.tokens, tokensPerSecond: result.tokensPerSecond } });
    return result;
  }

  /** Ação reconhecida sem modelo (catálogo/semântica), executada na mensagem do assistente. */
  async function catalogTurn(chatId: string, assistantMsgId: string, candidate: ActionCandidate): Promise<AgentResult> {
    let steps: AgentStep[] = [];
    const result = await runCatalogAction(candidate, {
      access: state.access,
      onStep: (step) => { steps = upsertStep(steps, step); dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { steps } }); },
      confirm: (step) => new Promise<ConfirmAnswer>((resolve) => setConfirmRequest({ step, resolve })),
    });
    dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: result.text, steps: result.steps, loading: false, source: result.source } });
    return result;
  }

  async function send(options: { text?: string; speakAfter?: boolean } = {}) {
    if (generating) return;
    const sourceText = options.text ?? draft.trim();
    if (!sourceText && !attachments.length) return;
    const sentInvocations = options.text === undefined ? invocations : [];
    const sentFiles = attachments;
    const attachmentText = sentFiles.length ? `[Anexos: ${sentFiles.map((file) => file.name).join(", ")}]` : "";
    const text = [sourceText, attachmentText].filter(Boolean).join("\n");
    const chatId = chat.id;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const model = resolveChatModel(chat.model, installedIds, state.preferredModel);
    if (model && model !== chat.model) dispatch({ type: "setModel", chatId, model });

    const isFirstQuestion = !chat.messages.some((message) => message.sender === "user");
    dispatch({ type: "addMessage", chatId, message: { id: userMsgId, sender: "user", text, time: "agora", invocations: sentInvocations.length ? sentInvocations : undefined } });
    setDraft(""); setAttachments([]); setInvocations([]); setMention(undefined);
    setActivePopover(null); setModelMenuOpen(false);
    followLatest.current = true;
    setOrbitalState(nextOrbitalState("request-start"));
    const startedAt = Date.now();
    // Memória: "não use emojis", "me chame de…" valem já nesta resposta e nas próximas conversas.
    let memory = state.memory;
    let memoryNote: string[] | undefined;
    if (memory.learn && sourceText) {
      const learned = applyDetected(memory, detectMemory(sourceText));
      if (learned.changes.length) { memory = learned.memory; memoryNote = learned.changes; dispatch({ type: "setMemory", patch: learned.memory }); }
    }
    const memoryBlock = memoryPrompt(memory);
    dispatch({ type: "addMessage", chatId, message: { id: assistantMsgId, sender: "assistant", text: "", time: "agora", loading: true, model, startedAt, memoryNote } });

    setPendingRequest({ requestId, chatId, assistantId: assistantMsgId });
    let attached = { images: [] as string[], text: "" };
    try { attached = await readAttachments(sentFiles); }
    catch (error) { attached.text = `(Não foi possível ler um anexo: ${error instanceof Error ? error.message : String(error)})`; }
    if (attached.images.length || attached.text) sessionAttachments.set(userMsgId, attached);
    const history = [...chat.messages.filter((m) => !m.loading && !m.error && m.sender !== "system"), { id: userMsgId, sender: "user" as const, text }]
      .map((m) => {
        const extra = sessionAttachments.get(m.id);
        return { role: m.sender, content: extra?.text ? `${m.text}\n\n${extra.text}` : m.text, images: extra?.images.length ? extra.images : undefined };
      });

    let content = "";
    let thinking = "";
    let thinkingTokens = 0;
    let thinkingMs: number | undefined;
    const agentHistory = () => history.slice(0, -1).filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role as "user" | "assistant", content: item.content }));
    const finish = (replyText: string) => {
      if (options.speakAfter && replyText) startSpeaking(replyText);
      else setOrbitalState(nextOrbitalState("reset"));
    };
    /** Controle do PC: o agente executa ferramentas e mostra cada passo na mesma mensagem. */
    const controlComputer = async () => {
      const agentModel = agentModelFor(model);
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: "", thinking: undefined, loading: true, model: agentModel } });
      const result = await agentTurn({ chatId, assistantMsgId, requestId, model: agentModel, memory: memoryBlock, invocations: sentInvocations, history: agentHistory(), userText: attached.text ? `${sourceText}\n\n${attached.text}` : sourceText, images: attached.images });
      if (isFirstQuestion && sourceText) refineTitle(chatId, agentModel, sourceText);
      finish(result.text);
    };
    try {
      const plainText = sourceText && !attached.images.length && !attached.text && !sentInvocations.length;
      // 1. Conta básica: calculadora do app, zero tokens.
      const calculation = plainText ? parseCalculation(sourceText) : undefined;
      if (calculation) {
        dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: `${calculation.expression} = ${calculation.result}`, calc: { expression: calculation.expression, result: calculation.result }, loading: false, source: "Calculadora" } });
        finish(`${calculation.expression} = ${calculation.result}`);
        return;
      }
      if (!isQAOffline()) {
        // 2. "/skill" ou "@conector": direto para o agente.
        if (sentInvocations.length) { await controlComputer(); return; }
        if (plainText) {
          // 3. Pedido conhecido ("abre o powershell"): catálogo, sem modelo.
          const match = await matchAction(sourceText);
          if (match.kind === "run") {
            const result = await catalogTurn(chatId, assistantMsgId, match.candidate);
            finish(result.text);
            return;
          }
          // 4. Pedido claro de ação no PC ("abre o chrome e entra no youtube"): o agente assume sozinho.
          if (looksLikePcAction(sourceText) || match.kind === "suggest") { await controlComputer(); return; }
        }
      }
      if (!model) throw new Error(NO_LOCAL_MODEL_ERROR);
      // 5. Conversa normal; se o modelo decidir que precisa agir no PC, ele pede e o agente assume.
      const reply = await askAI(model, history, {
        requestId,
        memory: memoryBlock,
        effort: state.effort,
        allowComputerControl: !isQAOffline(),
        onDelta: (delta) => {
          content += delta.content.replace(COMPUTER_MARKER, "");
          thinking += delta.thinking;
          thinkingTokens += delta.thinkingTokens ?? estimateTokens(delta.thinking);
          if (content && thinkingMs === undefined) thinkingMs = Date.now() - startedAt;
          dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: content, thinking: thinking || undefined, thinkingTokens: thinkingTokens || undefined, thinkingMs, loading: !content } });
        },
      });
      if (reply.wantsComputer && !reply.cancelled) { await controlComputer(); return; }
      const tokensPerSecond = isQAOffline() ? 28 : reply.tokensPerSecond;
      if (tokensPerSecond) setLastGeneration({ chatId, model, tokensPerSecond });
      const fallbackText = reply.cancelled ? "Resposta interrompida." : "O modelo não retornou texto.";
      const totalThinkingTokens = reply.thinkingTokens ?? (thinkingTokens || undefined);
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: reply.text || fallbackText, thinking: reply.thinking, thinkingTokens: reply.thinking ? totalThinkingTokens : undefined, thinkingMs: reply.thinking ? thinkingMs ?? Date.now() - startedAt : undefined, loading: false, source: reply.cancelled ? `${reply.source} · interrompida` : reply.source, tokensPerSecond, tokens: reply.tokens } });
      if (isFirstQuestion && sourceText && !reply.cancelled) refineTitle(chatId, model, sourceText);
      if (options.speakAfter && reply.text) startSpeaking(reply.text);
      else setOrbitalState(nextOrbitalState("reset"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const modelId = model ? ollamaModelId(model) : undefined;
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: message, loading: false, error: true, source: modelId ? `Ollama (${modelId})` : undefined } });
      setVoiceMode(false);
      setOrbitalState(nextOrbitalState("error"));
      if (errorTimer.current) clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setOrbitalState(nextOrbitalState("reset")), 1800);
      if (local.ollama !== "checking") void refreshInstalledModels();
    } finally {
      setPendingRequest(undefined);
      setConfirmRequest(undefined);
    }
  }

  /** Parar: cancela a geração e, no agente, também o próximo passo e qualquer confirmação aberta. */
  function stopGeneration() {
    agentCancel.current = true;
    confirmRequest?.resolve("deny");
    setConfirmRequest(undefined);
    if (pendingRequest) void cancelAI(pendingRequest.requestId);
  }

  function answerConfirm(answer: ConfirmAnswer) {
    confirmRequest?.resolve(answer);
    setConfirmRequest(undefined);
  }

  async function finishCapture(result: CaptureResult, asrModel: string) {
    setListening(false);
    setAudioLevel(undefined);
    const seconds = result.samples.length / result.sampleRate;
    if (result.reason === "no-speech" || seconds < 0.4) {
      setVoiceMode(false);
      setOrbitalState(nextOrbitalState("reset"));
      if (result.reason === "no-speech") setVoiceError("Não ouvi nada. Confira o microfone em Configurações › Voz.");
      return;
    }
    setOrbitalState(nextOrbitalState("voice-end"));
    setTranscribing(true);
    try {
      const { text } = await transcribe(result.samples, result.sampleRate, asrModel, state.voice.language);
      if (!text.trim()) {
        setVoiceMode(false);
        resetOrbitalAfterError("Não entendi o que foi dito. Tente de novo, mais perto do microfone.");
        return;
      }
      void send({ text: text.trim(), speakAfter: true });
    } catch (error) {
      setVoiceMode(false);
      resetOrbitalAfterError(`Falha ao transcrever: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleVoice() {
    if (orbitalState === "speaking") { stopSpeaking(); return; }
    // Parar manualmente envia o que já foi dito.
    if (listening) { capture.current.stop("stopped", true); return; }
    if (transcribing) return;
    setVoiceError("");
    setVoiceNeedsSetup(false);
    if (isQAOffline()) {
      setVoiceMode(true);
      setListening(true);
      setOrbitalState(nextOrbitalState("voice-start"));
      voiceTimer.current = setTimeout(() => {
        setListening(false);
        send({ text: "Teste de conversa por voz no modo QA offline", speakAfter: true });
      }, 750);
      return;
    }
    const asrModel = resolveAsrModel(state.voice.asrModel, tools.installed);
    if (!asrModel) {
      setVoiceNeedsSetup(true);
      setVoiceError("Para conversar por voz, baixe um modelo de reconhecimento local (o WebView2 do Windows não reconhece fala offline).");
      return;
    }
    setVoiceMode(true);
    setListening(true);
    setOrbitalState(nextOrbitalState("voice-start"));
    try {
      await capture.current.start({ onLevel: (level) => setAudioLevel(level), onFinish: (result) => void finishCapture(result, asrModel) }, state.voice.micDeviceId || undefined);
    } catch (error) {
      setListening(false);
      setVoiceMode(false);
      setAudioLevel(undefined);
      resetOrbitalAfterError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => () => { capture.current.stop("stopped", false); if (voiceTimer.current) clearTimeout(voiceTimer.current); if (errorTimer.current) clearTimeout(errorTimer.current); speech.stopSpeaking(); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activePopover) {
        event.preventDefault();
        setActivePopover(null);
        setModelMenuOpen(false);
       
        return;
      }
      if (event.key === "Escape" && (listening || orbitalState === "speaking")) {
        event.preventDefault();
        if (listening) stopVoiceSession(); else stopSpeaking();
        return;
      }
      if (event.key === "Escape" && pendingRequest && !document.querySelector(".modal-backdrop")) {
        event.preventDefault();
        void cancelAI(pendingRequest.requestId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePopover, listening, orbitalState, pendingRequest]);

  function chooseFiles() { fileInput.current?.click(); setActivePopover(null); setModelMenuOpen(false); }

  // Carrega skills e conectores na primeira vez que o usuário digita "/" ou "@".
  useEffect(() => {
    if (!mention || isQAOffline()) return;
    if (mention.kind === "skill" && !skills) invoke<SkillInfo[]>("list_skills").then(setSkills).catch(() => setSkills([]));
    if (mention.kind === "mcp" && !mcpServers) invoke<{ servers: McpServerStatus[] }>("mcp_overview").then((overview) => setMcpServers(overview.servers)).catch(() => setMcpServers([]));
  }, [mention, skills, mcpServers]);

  const mentionItems: MentionItem[] = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLocaleLowerCase();
    const items: MentionItem[] = mention.kind === "skill"
      ? (skills ?? []).map((skill) => ({ kind: "skill", id: skill.name, label: `/${skill.name}`, description: skill.description }))
      : (mcpServers ?? []).map((server) => ({ kind: "mcp", id: server.name, label: `@${server.name}`, description: server.disabled ? "Desligado — ligue em Configurações › Conectores MCP" : server.running ? `${server.tools.length} ferramentas` : server.error ? `Erro: ${server.error}` : "Liga ao enviar", disabled: server.disabled }));
    return items.filter((item) => item.label.toLocaleLowerCase().includes(query) || item.description.toLocaleLowerCase().includes(query)).slice(0, 12);
  }, [mention, skills, mcpServers]);

  function updateDraft(value: string, caret: number) {
    setDraft(value);
    const found = findMention(value, caret);
    setMention(found);
    if (found?.kind !== mention?.kind || found?.query !== mention?.query) setMentionIndex(0);
  }

  function chooseMention(item: MentionItem) {
    if (!mention || item.disabled) return;
    const caret = textareaRef.current?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mention.start)}${draft.slice(caret)}`.replace(/^\s+/, "");
    setDraft(next);
    // Uma skill e um conector por mensagem: escolher outro troca o anterior.
    setInvocations((items) => [...items.filter((current) => current.kind !== item.kind), { kind: item.kind, id: item.id, label: item.label }]);
    setMention(undefined);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(mention.start, mention.start); });
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention) {
      const enabled = mentionItems.filter((item) => !item.disabled);
      if (event.key === "ArrowDown" && mentionItems.length) { event.preventDefault(); setMentionIndex((index) => (index + 1) % mentionItems.length); return; }
      if (event.key === "ArrowUp" && mentionItems.length) { event.preventDefault(); setMentionIndex((index) => (index - 1 + mentionItems.length) % mentionItems.length); return; }
      if ((event.key === "Enter" || event.key === "Tab") && enabled.length) { event.preventDefault(); chooseMention(mentionItems[mentionIndex]?.disabled ? enabled[0] : mentionItems[mentionIndex] ?? enabled[0]); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMention(undefined); return; }
    }
    if (event.key === "Backspace" && !draft && invocations.length) { setInvocations((items) => items.slice(0, -1)); return; }
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  function chooseProject(name: string) {
    setContextProject(name);
    setActivePopover(null);
    setProjectSearch("");
  }

  function createProjectFromComposer() {
    const name = `Novo projeto ${state.projects.length + 1}`;
    dispatch({ type: "newProject" });
    chooseProject(name);
  }

  function renderRichText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, lineIndex) => {
      const heading = headingText(line);
      const content = heading !== undefined
        ? <strong className="md-heading">{heading}</strong>
        : tokenizeInline(line).map((token, index) => token.type === "bold" ? <strong key={index}>{token.value}</strong> : token.type === "code" ? <code key={index} className="md-inline-code">{token.value}</code> : token.value);
      return <Fragment key={lineIndex}>{content}{lineIndex < lines.length - 1 ? "\n" : null}</Fragment>;
    });
  }

  function renderContent(text: string) {
    if (!text.includes("```")) {
      return <p style={{ whiteSpace: "pre-wrap" }}>{renderRichText(text)}</p>;
    }
    const parts = text.split(/(```[\s\S]*?```)/g);
    return <div>
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          const match = part.match(/^```(\w*)\n([\s\S]*?)```$/);
          const lang = match ? match[1] : "";
          const code = match ? match[2] : part.slice(3, -3);
          return <div key={index} className="code-block" style={{ margin: "10px 0", background: "rgba(0,0,0,0.35)", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "rgba(255,255,255,0.04)", fontSize: "11px", opacity: 0.8 }}>
              <span>{lang || "code"}</span>
              <CopyButton text={code} label="Copiar" className="code-copy" />
            </div>
            <pre style={{ margin: 0, padding: "12px", fontSize: "13px", fontFamily: "Consolas, monospace", overflowX: "auto" }}><code>{code}</code></pre>
          </div>;
        }
        return <p key={index} style={{ whiteSpace: "pre-wrap" }}>{renderRichText(part)}</p>;
      })}
    </div>;
  }

  function modelRow(option: LocalModelOption) {
    const active = chatModel === `${OLLAMA_MODEL_PREFIX}${option.id}`;
    const pull = local.pulls[option.id];
    const name = <span className="model-row-name"><b>{option.label}{option.recommended && <em>Recomendado</em>}</b><code>{option.id}</code>{option.status === "incompatible" && <i className="model-row-reason">{option.reason}</i>}</span>;
    if (option.status === "installed") {
      return <button key={option.id} className={`model-mode-row ${active ? "active" : ""}`} title={`${option.id} · ${formatBytes(option.sizeBytes)}`} onClick={() => selectModel(option)}>{name}<small>{formatBytes(option.sizeBytes)}</small>{active ? <Check size={14} /> : <span />}</button>;
    }
    if (option.status === "incompatible") {
      return <button key={option.id} className="model-mode-row unavailable" aria-disabled="true" title={option.reason} onClick={(event) => event.preventDefault()}>{name}<small>{formatBytes(option.sizeBytes)}</small><Ban size={13} /></button>;
    }
    const downloading = pull?.state === "running";
    return <button key={option.id} className="model-mode-row downloadable" title={`${option.reason} Clique para baixar.`} onClick={() => openModelSettings(option.id)}>{name}<small>{downloading ? `${describePull(pull).percent ?? 0}%` : formatBytes(option.sizeBytes)}</small><Download size={13} /></button>;
  }

  function bitnetRow() {
    const installed = tools.installed.has("bitnet-2b4t");
    const active = chatModel === BITNET_MODEL;
    const progress = tools.progress["bitnet-2b4t"];
    const name = <span className="model-row-name"><b>BitNet b1.58 2B4T</b><code>bitnet.cpp · CPU</code></span>;
    if (installed) return <button className={`model-mode-row ${active ? "active" : ""}`} title="Modelo de 1 bit da Microsoft rodando na CPU (melhor em inglês)" onClick={selectBitnet}>{name}<small>1,1 GB</small>{active ? <Check size={14} /> : <Cpu size={13} />}</button>;
    return <button className="model-mode-row downloadable" title="Baixar e compilar em Configurações › Ferramentas de IA" onClick={() => openToolsSettings("bitnet-2b4t")}>{name}<small>{progress?.state === "running" ? progress.phase : "1,1 GB"}</small><Download size={13} /></button>;
  }

  const installedOptions = localOptions.filter((option) => option.status === "installed");
  const availableOptions = localOptions.filter((option) => option.status === "available").sort((a, b) => Number(b.recommended) - Number(a.recommended));
  const incompatibleOptions = localOptions.filter((option) => option.status === "incompatible");
  const needsModel = !isQAOffline() && !chatModel && local.ollama !== "unknown" && local.ollama !== "checking";

  return <section className="view chat-view">
    <div className="messages" ref={messagesRef} onScroll={(event) => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }}>
      {chat.messages.length === 0 && <div className="empty-chat"><span><Bot size={26} /></span><h3>Como posso ajudar?</h3>
        {needsModel ? <p className="empty-chat-setup">{local.ollama === "offline" ? "O Ollama não está rodando neste computador." : "Nenhum modelo local foi baixado ainda."}</p> : <p>Comece uma conversa ou escolha uma sugestão.</p>}
        <div>
          {needsModel && local.ollama === "offline" && <button onClick={() => startOllama()}><Play size={13} /> Iniciar Ollama</button>}
          {needsModel && local.ollama === "online" && <button onClick={() => openModelSettings(availableOptions.find((option) => option.recommended)?.id)}><Download size={13} /> Escolher e baixar um modelo</button>}
          {!needsModel && suggestions.map((value) => <button key={value} onClick={() => setDraft(value)}>{value}</button>)}
        </div>
      </div>}
      {chat.messages.map((message) => {
        if (message.sender === "user") return <article key={message.id} className="msg msg-user">
          <div className="msg-bubble">{message.invocations && <div className="msg-invocations">{message.invocations.map((item) => <span key={`${item.kind}-${item.id}`} className={`invocation-chip ${item.kind}`}>{item.kind === "skill" ? <Sparkles size={11} /> : <AtSign size={11} />}{item.label.replace(/^[/@]/, "")}</span>)}</div>}{renderContent(message.text)}</div>
          <div className="msg-user-tools"><CopyButton text={message.text} /></div>
        </article>;
        const streaming = pendingRequest?.assistantId === message.id && !message.loading;
        const interrupted = message.source?.includes("interrompida");
        return <article key={message.id} className={`msg msg-assistant ${message.error ? "error" : ""}`}>
          {message.steps && message.steps.length > 0 && <AgentSteps steps={message.steps} />}
          {message.loading
            ? <ThinkingIndicator messageId={message.id} startedAt={message.startedAt} tokens={message.thinkingTokens} preview={message.thinking} />
            : message.error
              ? <div className="message-error"><p>{message.text}</p><div>{local.ollama === "offline" && <button onClick={() => startOllama()}><Play size={12} />Iniciar Ollama</button>}<button onClick={() => openModelSettings()}><Bot size={12} />Modelos locais</button></div></div>
              : <>{message.thinking && <details className="message-thinking"><summary>{thinkingSummary(message.thinkingMs, message.thinkingTokens)}</summary><p>{message.thinking}</p></details>}{message.calc ? <CalculatorCard expression={message.calc.expression} result={message.calc.result} /> : <div className={`msg-content ${streaming ? "streaming" : ""}`}>{renderContent(message.text)}</div>}
</>}
          {message.memoryNote && message.memoryNote.length > 0 && <button className="memory-note" onClick={() => dispatch({ type: "settings", open: true, tab: "memory" })} title={`Aprendi: ${message.memoryNote.join(" · ")} — clique para ver ou apagar`}><Brain size={12} />Memória atualizada</button>}
          {!message.loading && !streaming && <footer className="msg-footer">
            <span className="msg-meta">{replyFooter(message.model, message.source, message.tokens, message.tokensPerSecond)}{interrupted && <span className="msg-tag">interrompida</span>}</span>
            {!message.error && <div className="msg-tools"><CopyButton text={message.text} /><button onClick={() => startSpeaking(message.text)} title="Ler em voz alta"><Volume2 size={13} /></button></div>}
          </footer>}
        </article>;
      })}
    </div>
    {stageVisible && <section className={`voice-stage ${voiceActive ? "" : "leaving"}`} aria-label="Conversa por voz">
      <AssistantFace skin={state.orbitalSkin} state={orbitalState} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} className="orbital-canvas voice-face" />
      <p className="orbital-status" aria-live="polite">{activityLabel(orbitalState)}</p>
    </section>}
    <div className="composer-wrap apple-composer-wrap" ref={composerRef}>
      {confirmRequest && <div className="agent-confirm" role="alertdialog" aria-label="Confirmar ação do agente">
        <ShieldCheck size={18} />
        <div className="agent-confirm-copy">
          <strong>{confirmRequest.step.label}</strong>
          <small>{confirmRequest.step.reason}</small>
          {confirmRequest.step.tool === "run_command" && <code>{String(confirmRequest.step.args.command ?? "")}</code>}
        </div>
        <div className="agent-confirm-actions">
          <button className="primary-button" onClick={() => answerConfirm("allow")}>Permitir</button>
          <button className="flat-button" onClick={() => answerConfirm("always")} title="Libera mouse, teclado e comandos até o fim desta tarefa (bloqueios de segurança continuam valendo)">Permitir nesta tarefa</button>
          <button className="flat-button" onClick={() => answerConfirm("deny")}>Negar</button>
        </div>
      </div>}
      {voiceError && <div className="inline-error">{voiceError}{(voiceNeedsSetup || orbitalState === "error") && <button onClick={openVoiceSettings}><Mic size={12} />Configurar voz</button>}<button aria-label="Fechar aviso" onClick={() => { setVoiceError(""); setVoiceNeedsSetup(false); }}><X size={12} /></button></div>}
      <div className={`composer apple-composer ${listening ? "listening" : ""}`}>
        {listening && <div className="voice-wave"><i /><i /><i /><i /><i /><i /><i /></div>}
        {mention && <div className="composer-popover mention-popover" role="listbox" aria-label={mention.kind === "skill" ? "Skills" : "Conectores MCP"}>
          <span className="menu-section-label">{mention.kind === "skill" ? "Skills · /" : "Conectores MCP · @"}</span>
          {mentionItems.map((item, index) => <button key={item.id} role="option" aria-selected={index === mentionIndex} aria-disabled={item.disabled} className={`${index === mentionIndex ? "active" : ""} ${item.disabled ? "disabled" : ""}`} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); chooseMention(item); }}>
            <span className="mention-icon">{item.kind === "skill" ? <Sparkles size={14} /> : <AtSign size={14} />}</span>
            <span className="mention-copy"><b>{item.label}</b><small>{item.description}</small></span>
          </button>)}
          {mentionItems.length === 0 && <small className="local-model-empty">{(mention.kind === "skill" ? skills : mcpServers) === undefined ? "Carregando…" : mention.kind === "skill" ? "Nenhuma skill encontrada" : "Nenhum conector MCP configurado"}</small>}
          {mention.kind === "mcp" && <button className="mention-manage" onMouseDown={(event) => { event.preventDefault(); setMention(undefined); dispatch({ type: "settings", open: true, tab: "mcp" }); }}><ChevronRight size={13} />Gerenciar conectores</button>}
        </div>}
        {invocations.length > 0 && <div className="attachment-chips invocation-chips">{invocations.map((item) => <span key={`${item.kind}-${item.id}`} className={`invocation-chip ${item.kind}`} title={item.kind === "skill" ? "Esta mensagem usa a skill (liga o agente só para ela)" : "Esta mensagem usa só as ferramentas deste conector"}>{item.kind === "skill" ? <Sparkles size={12} /> : <AtSign size={12} />}{item.label.replace(/^[/@]/, "")}<button aria-label={`Remover ${item.label}`} onClick={() => setInvocations((items) => items.filter((current) => current !== item))}><X size={11} /></button></span>)}</div>}
        {attachments.length > 0 && <div className="attachment-chips">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={12} />{file.name}<button onClick={() => setAttachments((items) => items.filter((item) => item !== file))}><X size={11} /></button></span>)}</div>}
        <textarea ref={textareaRef} value={draft} onChange={(event) => updateDraft(event.target.value, event.target.selectionStart ?? event.target.value.length)} onKeyDown={onComposerKeyDown} onBlur={() => setMention(undefined)} placeholder={listening ? "Ouvindo… (clique no quadrado para enviar)" : transcribing ? "Transcrevendo…" : invocations.length ? "Descreva o que fazer com a skill/conector escolhido" : "Pergunte ou peça algo no PC — ex.: abre o chrome e entra no youtube · / skills · @ conectores"} rows={1} />
        <div className="composer-toolbar apple-composer-toolbar">
          <div className="composer-left-actions">
            <button className={`composer-plus ${quickMenuOpen ? "active" : ""}`} title="Mais opções" aria-label="Mais opções" aria-expanded={quickMenuOpen} onClick={() => { setActivePopover(nextComposerPopover(activePopover, "quick")); setModelMenuOpen(false); }}><Plus size={17} /></button>
            {quickMenuOpen && <div className="composer-popover quick-actions-popover">
              <button onClick={() => { setModelMenuOpen((open) => !open); void refreshInstalledModels(); }}><span><Sparkles size={14} />Modelo de IA</span><small>{chatModel ? ollamaModelId(chatModel) ?? modelDisplayName(chatModel) : "Nenhum"}<ChevronRight size={14} /></small></button>
              {modelMenuOpen && <div className="model-mode-menu quick-submenu model-picker">
                {local.ollama === "offline" && <button className="model-mode-row ollama-offline" onClick={() => startOllama()} title={local.ollamaError}><span className="model-row-name"><b>Ollama parado</b><code>127.0.0.1:11434</code></span><small>Iniciar</small><Play size={13} /></button>}
                {local.ollama === "checking" && <small className="local-model-empty">Verificando o Ollama…</small>}
                <span className="menu-section-label">Instalados</span>
                {installedOptions.length === 0 && <small className="local-model-empty">{local.ollama === "online" ? "Nenhum modelo baixado ainda" : "Inicie o Ollama para listar os modelos"}</small>}
                {installedOptions.map(modelRow)}
                <span className="menu-section-label">Nuvem · chave de API</span>
                {allCloudProviders().flatMap(cloudRows)}
                <span className="menu-section-label">Microsoft BitNet · 1 bit</span>
                {bitnetRow()}
                {availableOptions.length > 0 && <span className="menu-section-label">Disponíveis para este PC</span>}
                {availableOptions.map(modelRow)}
                {incompatibleOptions.length > 0 && <span className="menu-section-label">Incompatíveis</span>}
                {incompatibleOptions.map(modelRow)}
                <i className="model-mode-divider" />
                <button className="model-mode-row" onClick={() => openModelSettings()}><span>Gerenciar modelos locais</span><small /><ChevronRight size={16} /></button>
              </div>}
              <EffortControl value={state.effort} onChange={(effort) => dispatch({ type: "setEffort", effort })} reducedMotion={reducedMotion} />
              <i className="menu-divider" />
              <label className="access-level-control"><span><strong>Acesso ao computador</strong><small>{ACCESS_LABELS[approval]}</small></span><input type="range" min="0" max="2" step="1" value={ACCESS_STEPS.indexOf(approval)} aria-label="Nível de acesso ao computador" aria-valuetext={ACCESS_LABELS[approval]} onChange={(event) => setApproval(ACCESS_STEPS[Number(event.target.value)])} /><span className="access-scale"><span>Somente leitura</span><span>Total</span></span></label>
              <i className="menu-divider" />
              <button onClick={chooseFiles}><span><FileText size={14} />Anexar documento</span></button>
              <button onClick={chooseFiles}><span><Image size={14} />Anexar foto</span></button>
            </div>}
            <button className={`project-context ${projectOpen ? "active" : ""}`} title="Projeto de contexto" aria-expanded={projectOpen} onClick={() => { setActivePopover(nextComposerPopover(activePopover, "project")); setModelMenuOpen(false); }}><Folder size={14} /><span>{contextProject}</span></button>
            {projectOpen && <div className="composer-popover project-popover">
              <input autoFocus value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Buscar projetos" aria-label="Buscar projetos" />
              <span className="menu-section-label">Projetos</span>
              {filteredProjects.map((project) => <button key={project.id} onClick={() => chooseProject(project.name)}><span><Folder size={13} />{project.name}</span>{contextProject === project.name && <Check size={13} />}</button>)}
              <button onClick={() => chooseProject("Sem projeto")}><span><X size={13} />Sem projeto</span>{contextProject === "Sem projeto" && <Check size={13} />}</button>
              <i className="menu-divider" />
              <button onClick={createProjectFromComposer}><span><Plus size={14} />Novo projeto</span></button>
            </div>}
          </div>
          <div className="composer-right-actions">
            <button className={`ai-meter ${aiMeter.kind}`} title={`${aiMeter.label}. ${aiMeter.throughput}`} aria-label={`Uso de IA: ${aiMeter.label}. ${aiMeter.throughput}`} aria-expanded={meterOpen} onClick={() => setActivePopover(nextComposerPopover(activePopover, "meter"))}><i><b>{aiMeter.kind === "local" ? "∞" : aiMeter.kind === "qa" ? "QA" : "—"}</b></i></button>
            {meterOpen && <div className="composer-popover meter-popover"><strong>{aiMeter.label}</strong><small>{aiMeter.detail}</small><span>{aiMeter.throughput}</span></div>}
            <button className="send-button apple-send" onClick={generating ? stopGeneration : listening || orbitalState === "speaking" ? toggleVoice : canSend ? () => send() : toggleVoice} title={generating ? "Parar resposta" : listening ? "Parar ditado" : orbitalState === "speaking" ? "Parar fala" : canSend ? "Enviar" : "Iniciar conversa por voz"}>{generating || listening || orbitalState === "speaking" ? <Square size={14} /> : canSend ? <ArrowUp size={17} /> : <AudioLines size={16} />}</button>
          </div>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(event) => {
          // Copia antes de limpar o input: o updater roda depois, quando `files` já estaria vazio.
          const picked = Array.from(event.currentTarget.files ?? []);
          setAttachments((files) => [...files, ...picked]);
          event.currentTarget.value = "";
        }} />
      </div>
      <span className="composer-hint">Enter envia · Shift + Enter quebra linha</span>
    </div>
  </section>;
}
