import { ArrowUp, AtSign, AudioLines, Ban, Bot, Brain, Check, ChevronRight, KeyRound, Cloud, CircleAlert, CircleCheck, CircleX, Copy, Cpu, Download, FileText, Folder, Image, ImagePlus, Infinity as InfinityIcon, LoaderCircle, Lock, LockOpen, Mic, Rabbit, Turtle, Play, Plus, ShieldCheck, Sparkles, Square, Volume2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type ActionCandidate, type GeneratedImage, type Invocation } from "../store/store";
import { refreshInstalledModels, scanHardware, startOllama, useLocalModels } from "../store/localModelsStore";
import { SpeechController, transcribe } from "../utils/SpeechController";
import { crossingSeconds, ROBOT_SPEEDS, robotSpeedIndex } from "../utils/robotSpeed";
import { refreshTools, useTools } from "../store/toolsStore";
import { resolveAsrModel, resolveTtsVoice, SYSTEM_VOICE_ID } from "../utils/toolCatalog";
import { VoiceCapture, type CaptureResult } from "../utils/voiceCapture";
import { DICTATION_ENDPOINTER, type EndpointerOptions } from "../utils/endpointer";
import { BargeInDetector, DEFAULT_BARGE_IN } from "../utils/bargeIn";
import { FloatingFace, type ChatBounds } from "./FloatingFace";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { imageFallbackPrompt, imagePromptFrom, resolveImageModel, startsImageRequest } from "../utils/imageCatalog";
import { listen } from "@tauri-apps/api/event";
import { matchAction, runAgent, runCatalogAction, warmAgent, type AccessMode, type AgentResult, type AgentStep } from "../utils/agentRunner";
import { invoke } from "@tauri-apps/api/core";
import { allCloudProviders, CLOUD_PRODUCT_NAMES, cloudModelValue, providerModels } from "../utils/cloudModels";
import { memoryPrompt } from "../utils/memory";
import { learnWithTrace } from "../utils/memoryFlow";
import { traceSystem } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "../utils/systemWorkflows";
import { looksLikePcAction } from "../utils/pcIntent";
import { looksLikeWorkflowRequest } from "../utils/workflowService";
import { parseCalculation } from "../utils/calc";
import { CalculatorCard } from "./CalculatorCard";
import { findMention } from "../utils/composerMentions";
import type { ProviderConfig } from "../utils/providers";
import { cleanModelTitle, titlePrompt } from "../utils/chatTitle";
import { askAI, cancelAI, COMPUTER_MARKER, NO_LOCAL_MODEL_ERROR, ollamaModelId } from "../utils/aiService";
import { EffortControl } from "./EffortControl";
import type { SpeechPulse } from "./RobotFace";
import { ThinkingIndicator, thinkingSummary } from "./ThinkingIndicator";
import { FileChangesCard } from "./FileChangesCard";
import { useDismiss } from "../utils/useDismiss";
import { appLog } from "../utils/appLog";
import { undoSummary } from "../utils/fileChanges";
import { activityLabel, nextOrbitalState, type OrbitalState } from "../utils/orbitalState";
import { isQAOffline } from "../utils/qaMode";
import { getAIMeterSummary } from "../utils/aiMeter";
import { appendDictation, getVisibleTokensPerSecond, nextComposerPopover, type ComposerPopover, type GenerationMetric } from "../utils/composerState";
import { BITNET_MODEL, buildLocalModelOptions, formatBytes, OLLAMA_MODEL_PREFIX, resolveChatModel, type LocalModelOption } from "../utils/localCatalog";
import { describePull } from "../utils/localOperation";
import { headingText, tokenizeInline } from "../utils/inlineMarkdown";
import { estimateTokens, modelDisplayName, replyFooter } from "../utils/messageMeta";
import { detectSpeechExpression, type RobotExpression } from "../utils/robotExpression";

const speech = new SpeechController();
/** Microfone aberto enquanto o robô fala, só para perceber quando a pessoa o interrompe. */
const MONITOR_ENDPOINTER: EndpointerOptions = { silenceMs: 1e9, noSpeechMs: 1e9, maxMs: 1e9, minSpeechMs: 1e9 };
type ApprovalMode = AccessMode;
/** Slider de acesso: mínimo = só leitura (cadeado fechado), meio = pergunta antes de agir, máximo = acesso total (cadeado aberto). */
const ACCESS_STEPS: ApprovalMode[] = ["Somente leitura", "Perguntar", "Automático"];
const ACCESS_LABELS: Record<ApprovalMode, string> = { "Somente leitura": "Somente leitura", Perguntar: "Pergunta antes de agir", "Automático": "Acesso total" };
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
/** Chat de uma área do workspace; `chatId` é a conversa daquela área (cada área tem a sua). */
export function ChatView({ chatId }: { chatId?: string } = {}) {
  const { state, dispatch } = useStore();
  const local = useLocalModels();
  const tools = useTools();
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  /** Modo voz contínuo: depois de cada resposta falada ele volta a ouvir, até a pessoa desligar. */
  const [voiceConversation, setVoiceConversation] = useState(false);
  const conversationRef = useRef(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNeedsSetup, setVoiceNeedsSetup] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  /** Ditado: o microfone escreve no compositor sem abrir o modo voz nem enviar. */
  const [dictating, setDictating] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  /** Modo imagem (+ › Gerar imagem): a próxima mensagem vira uma imagem. */
  const [imageMode, setImageMode] = useState(false);
  /** Modo imagem ligado sozinho porque o texto começou com "gere uma imagem…" (desliga se o texto mudar). */
  const [imageModeAuto, setImageModeAuto] = useState(false);
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
  /** Pedidos que a pessoa cancelou: nada que chegar deles depois muda o chat. */
  const cancelledRequests = useRef(new Set<string>());
  /** Muda quando a conversa por voz termina (troca de conversa, Esc): respostas antigas não são faladas. */
  const voiceSession = useRef(0);
  /** Muda a cada fala nova ou interrompida: eventos de falas antigas são ignorados. */
  const speechToken = useRef(0);
  /** Volume atual da fala do robô, para não confundir o eco dela com a pessoa falando. */
  const ttsLevel = useRef(0);
  /** Ditado ao vivo: texto que já estava no campo e transcrições parciais em andamento. */
  const dictationBase = useRef("");
  const dictationRun = useRef(0);
  const partialTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Modo voz: o que a pessoa está dizendo, transcrito na hora e mostrado no chat como a próxima mensagem. */
  const [liveTranscript, setLiveTranscript] = useState("");
  const voicePartialTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
  /** Onde fica o texto desta área de chat: o robô do modo voz só flutua nas laterais livres. */
  const chatBounds = useCallback((): ChatBounds | undefined => {
    const list = messagesRef.current;
    const composer = composerRef.current?.querySelector(".composer") ?? composerRef.current;
    if (!list || !composer) return undefined;
    const rect = list.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(list).paddingLeft) || 0;
    // Sem a barra de rolagem: ela não é texto, mas o robô não deve ficar em cima dela.
    return { messages: { left: rect.left, top: rect.top, right: rect.left + list.clientWidth, bottom: rect.bottom }, paddingX: padding, composerTop: composer.getBoundingClientRect().top };
  }, []);
  // Segue a resposta em streaming, a menos que o usuário tenha rolado para ler algo acima.
  const followLatest = useRef(true);
  const capture = useRef(new VoiceCapture());
  const dictation = useRef(new VoiceCapture());
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chat = state.chats.find((item) => item.id === (chatId ?? state.activeChatId)) ?? state.chats[0];
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
  const voiceActive = voiceConversation || voiceMode || listening || orbitalState === "speaking";
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

  const shownChat = useRef(chat.id);
  useEffect(() => {
    followLatest.current = true;
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    if (shownChat.current === chat.id) return;
    shownChat.current = chat.id;
    // Outra conversa na mesma janela: a conversa por voz acaba e o foco vai para a nova.
    if (conversationRef.current || voiceMode || listening || transcribing || orbitalState === "speaking") stopVoiceSession();
    if (dictating) cancelDictation();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [chat.id]);

  // Erros de voz também vão para Configurações › Logs (a IA consegue ler e diagnosticar).
  useEffect(() => { if (voiceError) appLog("erro", "voz", voiceError); }, [voiceError]);

  // Clicou fora do menu aberto (+, modelos, projeto, medidor): fecha. Os botões que abrem cada menu
  // contam como "dentro" — eles mesmos alternam aberto/fechado.
  useDismiss(Boolean(activePopover), [], () => { setActivePopover(null); setModelMenuOpen(false); }, ".composer-popover, .composer-plus, .project-context, .ai-meter");

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

  /** Encerra a conversa por voz inteira: microfone, fala e qualquer resposta ainda por falar. */
  function stopVoiceSession() {
    conversationRef.current = false;
    setVoiceConversation(false);
    voiceSession.current += 1;
    speechToken.current += 1;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    capture.current.stop("stopped", false);
    stopVoicePartials();
    setLiveTranscript("");
    speech.stopSpeaking();
    ttsLevel.current = 0;
    setListening(false);
    setVoiceMode(false);
    setTranscribing(false);
    setAudioLevel(undefined);
    setExpression("idle");
    setOrbitalState(nextOrbitalState("reset"));
  }

  function stopSpeaking() {
    speechToken.current += 1;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    capture.current.stop("stopped", false);
    speech.stopSpeaking();
    ttsLevel.current = 0;
    setAudioLevel(undefined);
    setVoiceMode(false);
    setOrbitalState(nextOrbitalState("speech-end"));
  }

  /** Enquanto o robô fala, escuta o microfone: se a pessoa falar por cima, ele para e passa a ouvir. */
  function startBargeMonitor(token: number) {
    const asrModel = resolveAsrModel(state.voice.asrModel, tools.installed);
    if (!asrModel) return;
    // A voz do Windows não passa pelo WebView2, então o cancelamento de eco não a conhece: exige mais volume.
    const systemVoice = resolveTtsVoice(state.voice.ttsVoice, tools.installed) === SYSTEM_VOICE_ID;
    const detector = new BargeInDetector(systemVoice ? { ...DEFAULT_BARGE_IN, minLevel: .38 } : DEFAULT_BARGE_IN);
    let last = performance.now();
    void capture.current.start({
      onLevel: (level) => {
        const now = performance.now();
        const elapsed = now - last;
        last = now;
        if (token === speechToken.current && detector.push(level, ttsLevel.current, elapsed)) interruptSpeaking(asrModel);
      },
      onFinish: () => undefined,
    }, state.voice.micDeviceId || undefined, MONITOR_ENDPOINTER).catch(() => undefined);
  }

  /** A pessoa começou a falar: corta a fala e continua a mesma gravação como pergunta nova. */
  function interruptSpeaking(asrModel: string) {
    speechToken.current += 1;
    speech.stopSpeaking();
    ttsLevel.current = 0;
    if (!capture.current.retarget({ onLevel: (level) => setAudioLevel(level), onFinish: (result) => void finishCapture(result, asrModel) })) return;
    startVoicePartials(asrModel);
    setExpression("stopping");
    setVoiceMode(true);
    setListening(true);
    setAudioLevel(undefined);
    setOrbitalState(nextOrbitalState("voice-start"));
  }

  /** Fala o texto; `conversation` = resposta do modo voz (pode ser interrompida pela pessoa). */
  function startSpeaking(text: string, conversation = false) {
    const token = ++speechToken.current;
    const current = () => token === speechToken.current;
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
      onLevel: (level) => { if (!current()) return; ttsLevel.current = level; setAudioLevel(level || undefined); },
      onStart: () => { if (!current()) return; setOrbitalState(nextOrbitalState("speech-start")); if (conversation) startBargeMonitor(token); },
      onBoundary: () => { if (current()) speechPulse.current = { at: performance.now(), supported: true }; },
      onEnd: () => {
        if (!current()) return;
        capture.current.stop("stopped", false);
        ttsLevel.current = 0;
        setAudioLevel(undefined);
        setExpression("stopping");
        setOrbitalState(nextOrbitalState("speech-end"));
        // Conversa por voz continua: terminou de falar, volta a ouvir.
        if (conversation && conversationRef.current) void startListening();
        else setVoiceMode(false);
      },
      onError: (message) => { if (!current()) return; capture.current.stop("stopped", false); resetOrbitalAfterError(message); },
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
    let steps: AgentStep[] = [];
    const cancelled = () => cancelledRequests.current.has(params.requestId);
    const result = await runAgent({
      model: params.model,
      history: params.history,
      userText: params.userText,
      images: params.images,
      access: state.access,
      effort: state.effort,
      requestId: params.requestId,
      memory: params.memory,
      skill: params.invocations?.find((item) => item.kind === "skill")?.id ?? (looksLikeWorkflowRequest(params.userText) ? "node-editor" : undefined),
      mcpServer: params.invocations?.find((item) => item.kind === "mcp")?.id,
      onStep: (step) => { if (cancelled()) return; steps = upsertStep(steps, step); dispatch({ type: "updateMessage", chatId: params.chatId, messageId: params.assistantMsgId, patch: { steps } }); },
      confirm: (step) => new Promise<ConfirmAnswer>((resolve) => setConfirmRequest({ step, resolve })),
      isCancelled: cancelled,
    });
    if (cancelled()) return result;
    if (result.tokensPerSecond) setLastGeneration({ chatId: params.chatId, model: params.model, tokensPerSecond: result.tokensPerSecond });
    dispatch({ type: "updateMessage", chatId: params.chatId, messageId: params.assistantMsgId, patch: { text: result.text, steps: result.steps, changes: result.changes, loading: false, source: result.source, tokens: result.tokens, tokensPerSecond: result.tokensPerSecond } });
    return result;
  }

  /** Ação reconhecida sem modelo (catálogo/semântica), executada na mensagem do assistente. */
  async function catalogTurn(chatId: string, assistantMsgId: string, candidate: ActionCandidate, requestId: string): Promise<AgentResult> {
    let steps: AgentStep[] = [];
    const cancelled = () => cancelledRequests.current.has(requestId);
    const result = await runCatalogAction(candidate, {
      access: state.access,
      onStep: (step) => { if (cancelled()) return; steps = upsertStep(steps, step); dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { steps } }); },
      confirm: (step) => new Promise<ConfirmAnswer>((resolve) => setConfirmRequest({ step, resolve })),
    });
    if (cancelled()) return result;
    dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: result.text, steps: result.steps, loading: false, source: result.source } });
    return result;
  }

  /** Gera a imagem com o modelo local escolhido e mostra a prévia/jogo até ela ficar pronta. */
  async function imageTurn(chatId: string, assistantMsgId: string, requestId: string, prompt: string) {
    const cancelled = () => cancelledRequests.current.has(requestId);
    const model = resolveImageModel(state.preferredImageModel, tools.installed, local.hardware);
    if (!model) {
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { loading: false, needsImageModel: true, source: "Geração de imagem", text: "Para gerar imagens aqui no seu PC, baixe um modelo de imagem em Configurações › Modelos locais › Modelos de imagem. O recomendado é o Z-Image Turbo (6,7 GB, rápido e liberado para uso comercial)." } });
      return;
    }
    let image: GeneratedImage = { status: "generating", modelId: model.id, prompt, requestId, phase: "Preparando" };
    const show = (patch: Partial<GeneratedImage>) => {
      if (cancelled()) return;
      image = { ...image, ...patch };
      // Sem `model`: o rodapé mostra o modelo de imagem, não o modelo de texto do chat.
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { loading: false, text: "", image, source: model.name, model: undefined } });
    };
    show({});
    let lastUpdate = 0;
    const stop = await listen<{ requestId: string; phase: string; step?: number; total?: number }>("image-progress", (event) => {
      if (event.payload.requestId !== requestId) return;
      const now = performance.now();
      // Muitas linhas por segundo: atualiza a mensagem no máximo ~6 vezes por segundo.
      if (now - lastUpdate < 160 && event.payload.step !== event.payload.total) return;
      lastUpdate = now;
      show({ phase: event.payload.phase, step: event.payload.step ?? image.step, total: event.payload.total ?? image.total });
    }).catch(() => () => undefined);
    try {
      const result = await invoke<{ path: string; seed: number; elapsedMs: number }>("image_generate", { request: { requestId, modelId: model.id, prompt } });
      show({ status: "done", path: result.path, seed: result.seed, elapsedMs: result.elapsedMs, phase: undefined });
    } catch (error) {
      show({ status: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      stop();
    }
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
    const cancelled = () => cancelledRequests.current.has(requestId);
    // Resposta do modo voz só é falada se a conversa por voz ainda for a mesma.
    const session = voiceSession.current;
    const speakReply = (replyText: string) => Boolean(options.speakAfter && replyText && session === voiceSession.current);
    const model = resolveChatModel(chat.model, installedIds, state.preferredModel);
    if (model && model !== chat.model) dispatch({ type: "setModel", chatId, model });

    const isFirstQuestion = !chat.messages.some((message) => message.sender === "user");
    dispatch({ type: "addMessage", chatId, message: { id: userMsgId, sender: "user", text, time: "agora", invocations: sentInvocations.length ? sentInvocations : undefined } });
    setDraft(""); setAttachments([]); setInvocations([]); setMention(undefined);
    if (imageModeAuto) { setImageMode(false); setImageModeAuto(false); }
    setActivePopover(null); setModelMenuOpen(false);
    followLatest.current = true;
    setOrbitalState(nextOrbitalState("request-start"));
    const startedAt = Date.now();
    // Memória: "não use emojis", "me chame de…" valem já nesta resposta e nas próximas conversas.
    let memory = state.memory;
    let memoryNote: string[] | undefined;
    if (memory.learn && sourceText) {
      const learned = learnWithTrace(memory, sourceText, () => traceSystem(SYS_MEMORY_SAVE, { chatId }));
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
    const resumeListening = () => { if (options.speakAfter && session === voiceSession.current && conversationRef.current) void startListening(); };
    const finish = (replyText: string) => {
      if (cancelled()) return;
      if (speakReply(replyText)) startSpeaking(replyText, true);
      else { setOrbitalState(nextOrbitalState("reset")); resumeListening(); }
    };
    /** Controle do PC: o agente executa ferramentas e mostra cada passo na mesma mensagem. */
    const controlComputer = async () => {
      const agentModel = agentModelFor(model);
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: "", thinking: undefined, loading: true, model: agentModel } });
      const result = await agentTurn({ chatId, assistantMsgId, requestId, model: agentModel, memory: memoryBlock, invocations: sentInvocations, history: agentHistory(), userText: attached.text ? `${sourceText}\n\n${attached.text}` : sourceText, images: attached.images });
      if (isFirstQuestion && sourceText) refineTitle(chatId, agentModel, sourceText);
      if (await imageInstead(result.text)) return;
      finish(result.text);
    };
    /** O modelo de texto disse que não gera imagem: o app chama o gerador de imagem gratuito sozinho. */
    const imageInstead = async (replyText: string) => {
      const prompt = !cancelled() && sourceText ? imageFallbackPrompt(sourceText, replyText) : undefined;
      if (!prompt) return false;
      appLog("info", "imagem", `O modelo de texto não gera imagens; chamei o gerador de imagem: "${prompt}"`);
      await imageTurn(chatId, assistantMsgId, requestId, prompt);
      finish("");
      return true;
    };
    try {
      const plainText = sourceText && !attached.images.length && !attached.text && !sentInvocations.length;
      // 0. Imagem: modo imagem ligado ou pedido claro ("gere uma imagem de…").
      const imagePrompt = options.text === undefined && imageMode && sourceText ? imagePromptFrom(sourceText) ?? sourceText : plainText ? imagePromptFrom(sourceText) : undefined;
      if (imagePrompt) {
        await imageTurn(chatId, assistantMsgId, requestId, imagePrompt);
        if (isFirstQuestion && sourceText && model) refineTitle(chatId, model, sourceText);
        finish("");
        return;
      }
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
          if (cancelled()) return;
          if (match.kind === "run") {
            const result = await catalogTurn(chatId, assistantMsgId, match.candidate, requestId);
            finish(result.text);
            return;
          }
          // 4. Pedido claro de ação no PC ("abre o chrome e entra no youtube"): o agente assume sozinho.
          // 4b. Automação/workflow ("todo dia às 8h resuma…", "crie um workflow…"): o agente monta no editor de nodes.
          if (looksLikePcAction(sourceText) || looksLikeWorkflowRequest(sourceText) || match.kind === "suggest") { await controlComputer(); return; }
        }
      }
      if (!model) throw new Error(NO_LOCAL_MODEL_ERROR);
      // 5. Conversa normal; se o modelo decidir que precisa agir no PC, ele pede e o agente assume.
      const reply = await askAI(model, history, {
        requestId,
        memory: memoryBlock,
        effort: state.effort,
        allowComputerControl: !isQAOffline(),
        voice: options.speakAfter,
        onDelta: (delta) => {
          if (cancelled()) return;
          content += delta.content.replace(COMPUTER_MARKER, "");
          thinking += delta.thinking;
          thinkingTokens += delta.thinkingTokens ?? estimateTokens(delta.thinking);
          if (content && thinkingMs === undefined) thinkingMs = Date.now() - startedAt;
          dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: content, thinking: thinking || undefined, thinkingTokens: thinkingTokens || undefined, thinkingMs, loading: !content } });
        },
      });
      if (cancelled()) return;
      if (reply.wantsComputer && !reply.cancelled) { await controlComputer(); return; }
      if (!reply.cancelled && await imageInstead(reply.text)) { if (isFirstQuestion && sourceText) refineTitle(chatId, model, sourceText); return; }
      const tokensPerSecond = isQAOffline() ? 28 : reply.tokensPerSecond;
      if (tokensPerSecond) setLastGeneration({ chatId, model, tokensPerSecond });
      const fallbackText = reply.cancelled ? "Resposta interrompida." : "O modelo não retornou texto.";
      const totalThinkingTokens = reply.thinkingTokens ?? (thinkingTokens || undefined);
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: reply.text || fallbackText, thinking: reply.thinking, thinkingTokens: reply.thinking ? totalThinkingTokens : undefined, thinkingMs: reply.thinking ? thinkingMs ?? Date.now() - startedAt : undefined, loading: false, source: reply.cancelled ? `${reply.source} · interrompida` : reply.source, tokensPerSecond, tokens: reply.tokens } });
      if (isFirstQuestion && sourceText && !reply.cancelled) refineTitle(chatId, model, sourceText);
      if (speakReply(reply.text)) startSpeaking(reply.text, true);
      else { setOrbitalState(nextOrbitalState("reset")); resumeListening(); }
    } catch (err) {
      if (cancelled()) return;
      const message = err instanceof Error ? err.message : String(err);
      const modelId = model ? ollamaModelId(model) : undefined;
      appLog("erro", "ia", `${model || "sem modelo"}: ${message}`);
      dispatch({ type: "updateMessage", chatId, messageId: assistantMsgId, patch: { text: message, loading: false, error: true, source: modelId ? `Ollama (${modelId})` : undefined } });
      setVoiceMode(false);
      setOrbitalState(nextOrbitalState("error"));
      if (errorTimer.current) clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setOrbitalState(nextOrbitalState("reset")), 1800);
      if (local.ollama !== "checking") void refreshInstalledModels();
    } finally {
      // Se foi cancelado, o botão Parar já liberou o chat (e pode haver outro pedido rodando).
      setPendingRequest((current) => current?.requestId === requestId ? undefined : current);
      if (!cancelled()) setConfirmRequest(undefined);
    }
  }

  /** Parar: cancela a geração e, no agente, também o próximo passo e qualquer confirmação aberta. */
  function stopGeneration() {
    confirmRequest?.resolve("deny");
    setConfirmRequest(undefined);
    const pending = pendingRequest;
    if (!pending) return;
    // Para na hora: a mensagem fecha com o que já chegou e o chat fica livre para outra pergunta,
    // mesmo que o Ollama ainda esteja carregando o modelo ou o agente no meio de um passo.
    cancelledRequests.current.add(pending.requestId);
    void cancelAI(pending.requestId);
    void invoke("image_cancel", { requestId: pending.requestId }).catch(() => undefined);
    const message = state.chats.find((item) => item.id === pending.chatId)?.messages.find((item) => item.id === pending.assistantId);
    if (message?.image) {
      dispatch({ type: "updateMessage", chatId: pending.chatId, messageId: pending.assistantId, patch: { loading: false, image: { ...message.image, status: "cancelled" } } });
      setPendingRequest(undefined);
      setOrbitalState(nextOrbitalState("reset"));
      return;
    }
    const steps = message?.steps?.map((step) => step.status === "running" || step.status === "waiting" ? { ...step, status: "cancelled" as const } : step);
    dispatch({ type: "updateMessage", chatId: pending.chatId, messageId: pending.assistantId, patch: { loading: false, text: message?.text || "Resposta interrompida.", source: `${message?.source ?? "Resposta"} · interrompida`, steps } });
    setPendingRequest(undefined);
    setOrbitalState(nextOrbitalState("reset"));
  }

  function answerConfirm(answer: ConfirmAnswer) {
    confirmRequest?.resolve(answer);
    setConfirmRequest(undefined);
  }

  // Pedido de permissão aberto: Enter permite, Esc nega (sem precisar do mouse — o robô está apontando).
  useEffect(() => {
    if (!confirmRequest) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      if (event.key === "Enter" && (event.shiftKey || (event.target as HTMLElement | null)?.tagName === "TEXTAREA" && (event.target as HTMLTextAreaElement).value.trim())) return;
      event.preventDefault();
      event.stopPropagation();
      confirmRequest.resolve(event.key === "Enter" ? "allow" : "deny");
      setConfirmRequest(undefined);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmRequest]);

  async function finishCapture(result: CaptureResult, asrModel: string) {
    stopVoicePartials();
    setListening(false);
    setAudioLevel(undefined);
    const seconds = result.samples.length / result.sampleRate;
    if (result.reason === "no-speech" || seconds < 0.4) {
      // No modo voz contínuo o silêncio não encerra nada: continua ouvindo até a pessoa desligar.
      if (conversationRef.current) { void startListening(); return; }
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
        setLiveTranscript("");
        if (conversationRef.current) { void startListening(); return; }
        setVoiceMode(false);
        resetOrbitalAfterError("Não entendi o que foi dito. Tente de novo, mais perto do microfone.");
        return;
      }
      setLiveTranscript("");
      void send({ text: text.trim(), speakAfter: true });
    } catch (error) {
      setLiveTranscript("");
      setVoiceMode(false);
      resetOrbitalAfterError(`Falha ao transcrever: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTranscribing(false);
    }
  }

  /** Abre o microfone para a próxima fala da conversa por voz. */
  async function startListening() {
    const asrModel = resolveAsrModel(state.voice.asrModel, tools.installed);
    if (!asrModel || !conversationRef.current) return;
    setVoiceMode(true);
    setListening(true);
    setOrbitalState(nextOrbitalState("voice-start"));
    try {
      await capture.current.start({ onLevel: (level) => setAudioLevel(level), onFinish: (result) => void finishCapture(result, asrModel) }, state.voice.micDeviceId || undefined);
      startVoicePartials(asrModel);
    } catch (error) {
      stopVoiceSession();
      resetOrbitalAfterError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Botão de voz: liga o modo voz contínuo ou, se já estiver ligado, desliga tudo. */
  async function toggleVoice() {
    if (conversationRef.current || listening || orbitalState === "speaking") {
      if (pendingRequest) stopGeneration();
      stopVoiceSession();
      return;
    }
    if (transcribing || dictating || dictationBusy) return;
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
    conversationRef.current = true;
    setVoiceConversation(true);
    await startListening();
  }

  async function toggleDictation() {
    // Clicar de novo encerra e transcreve o que já foi dito.
    if (dictating) { dictation.current.stop("stopped", true); return; }
    if (dictationBusy || voiceActive || transcribing) return;
    setVoiceError("");
    setVoiceNeedsSetup(false);
    if (isQAOffline()) {
      setDictating(true);
      setTimeout(() => { setDictating(false); setDraft((current) => appendDictation(current, "Texto ditado no modo QA offline")); }, 750);
      return;
    }
    const asrModel = resolveAsrModel(state.voice.asrModel, tools.installed);
    if (!asrModel) {
      setVoiceNeedsSetup(true);
      setVoiceError("Para ditar, baixe um modelo de reconhecimento local (o WebView2 do Windows não reconhece fala offline).");
      return;
    }
    setDictating(true);
    dictationBase.current = draft;
    try {
      await dictation.current.start({ onFinish: (result) => void finishDictation(result, asrModel) }, state.voice.micDeviceId || undefined, DICTATION_ENDPOINTER);
      startPartials(asrModel);
    } catch (error) {
      setDictating(false);
      setVoiceError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Transcreve o que já foi dito a cada instante, para o texto aparecer na hora no campo. */
  function startPartials(asrModel: string) {
    stopPartials();
    const run = ++dictationRun.current;
    let busy = false;
    let lastLength = 0;
    partialTimer.current = setInterval(() => {
      if (busy) return;
      const snapshot = dictation.current.snapshot();
      if (!snapshot || snapshot.samples.length < snapshot.sampleRate * .4 || snapshot.samples.length - lastLength < snapshot.sampleRate * .3) return;
      busy = true;
      lastLength = snapshot.samples.length;
      transcribe(snapshot.samples, snapshot.sampleRate, asrModel, state.voice.language)
        .then(({ text }) => { if (run === dictationRun.current && partialTimer.current && text.trim()) setDraft(appendDictation(dictationBase.current, text)); })
        .catch(() => undefined)
        .finally(() => { busy = false; });
    }, 300);
  }

  /**
   * Modo voz: transcreve a fala enquanto a pessoa ainda fala e mostra no chat como a mensagem dela
   * (nada vai para o campo de texto). Quando ela para, a transcrição final vira o prompt enviado.
   */
  function startVoicePartials(asrModel: string) {
    stopVoicePartials();
    setLiveTranscript("");
    const session = voiceSession.current;
    let busy = false;
    let lastLength = 0;
    const timer = setInterval(() => {
      if (busy) return;
      const snapshot = capture.current.snapshot();
      if (!snapshot || snapshot.samples.length < snapshot.sampleRate * .4 || snapshot.samples.length - lastLength < snapshot.sampleRate * .3) return;
      busy = true;
      lastLength = snapshot.samples.length;
      transcribe(snapshot.samples, snapshot.sampleRate, asrModel, state.voice.language)
        .then(({ text }) => { if (voicePartialTimer.current === timer && session === voiceSession.current && text.trim()) setLiveTranscript(text.trim()); })
        .catch(() => undefined)
        .finally(() => { busy = false; });
    }, 300);
    voicePartialTimer.current = timer;
  }

  function stopVoicePartials() {
    if (voicePartialTimer.current) clearInterval(voicePartialTimer.current);
    voicePartialTimer.current = null;
  }

  function stopPartials() {
    if (partialTimer.current) clearInterval(partialTimer.current);
    partialTimer.current = null;
  }

  /** Cancela o ditado sem transcrever e devolve o campo como estava. */
  function cancelDictation() {
    stopPartials();
    dictationRun.current += 1;
    dictation.current.stop("stopped", false);
    setDictating(false);
    setDraft(dictationBase.current);
  }

  async function finishDictation(result: CaptureResult, asrModel: string) {
    stopPartials();
    const run = ++dictationRun.current;
    setDictating(false);
    if (result.reason === "no-speech" || result.samples.length / result.sampleRate < 0.4) {
      if (result.reason === "no-speech") setVoiceError("Não ouvi nada. Confira o microfone em Configurações › Voz.");
      return;
    }
    setDictationBusy(true);
    try {
      const { text } = await transcribe(result.samples, result.sampleRate, asrModel, state.voice.language);
      if (run !== dictationRun.current) return;
      if (!text.trim()) { setDraft(dictationBase.current); setVoiceError("Não entendi o que foi dito. Tente de novo, mais perto do microfone."); return; }
      setDraft(appendDictation(dictationBase.current, text));
      requestAnimationFrame(() => { const area = textareaRef.current; if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } });
    } catch (error) {
      setVoiceError(`Falha ao transcrever: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDictationBusy(false);
    }
  }

  useEffect(() => () => { voiceSession.current += 1; speechToken.current += 1; stopPartials(); stopVoicePartials(); capture.current.stop("stopped", false); dictation.current.stop("stopped", false); if (voiceTimer.current) clearTimeout(voiceTimer.current); if (errorTimer.current) clearTimeout(errorTimer.current); speech.stopSpeaking(); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activePopover) {
        event.preventDefault();
        setActivePopover(null);
        setModelMenuOpen(false);
       
        return;
      }
      if (event.key === "Escape" && dictating) {
        event.preventDefault();
        cancelDictation();
        return;
      }
      if (event.key === "Escape" && (conversationRef.current || listening || orbitalState === "speaking")) {
        event.preventDefault();
        if (conversationRef.current || listening) stopVoiceSession(); else stopSpeaking();
        return;
      }
      if (event.key === "Escape" && pendingRequest && !document.querySelector(".modal-backdrop")) {
        event.preventDefault();
        stopGeneration();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePopover, listening, dictating, orbitalState, pendingRequest]);

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
    // "gere uma imagem de…" liga o modo imagem na hora, com o melhor modelo instalado.
    const wantsImage = startsImageRequest(value);
    if (wantsImage && !imageMode) { setImageMode(true); setImageModeAuto(true); }
    else if (!wantsImage && imageMode && imageModeAuto) { setImageMode(false); setImageModeAuto(false); }
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
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "rgba(255,255,255,0.04)", fontSize: "calc(11px * var(--fs-subtitle))", opacity: 0.8 }}>
              <span>{lang || "code"}</span>
              <CopyButton text={code} label="Copiar" className="code-copy" />
            </div>
            <pre style={{ margin: 0, padding: "12px", fontSize: "calc(13px * var(--fs-body))", fontFamily: "Consolas, monospace", overflowX: "auto" }}><code>{code}</code></pre>
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
            ? <ThinkingIndicator messageId={message.id} startedAt={message.startedAt} tokens={message.thinkingTokens} preview={message.thinking} model={message.model} steps={message.steps} />
            : message.error
              ? <div className="message-error"><p>{message.text}</p><div>{local.ollama === "offline" && <button onClick={() => startOllama()}><Play size={12} />Iniciar Ollama</button>}<button onClick={() => openModelSettings()}><Bot size={12} />Modelos locais</button></div></div>
              : <>{message.thinking && <details className="message-thinking"><summary>{thinkingSummary(message.thinkingMs, message.thinkingTokens)}</summary><p>{message.thinking}</p></details>}{message.image ? <ImageGenerationCard image={message.image} onCancel={message.image.status === "generating" && pendingRequest?.assistantId === message.id ? stopGeneration : undefined} /> : message.calc ? <CalculatorCard expression={message.calc.expression} result={message.calc.result} /> : <div className={`msg-content ${streaming ? "streaming" : ""}`}>{renderContent(message.text)}</div>}
{message.needsImageModel && <div className="action-offer"><button onClick={() => openModelSettings("image-models")}><ImagePlus size={13} />Escolher um modelo de imagem</button></div>}
</>}
          {!message.loading && !streaming && message.changes && message.changes.files.length > 0 && <FileChangesCard changes={message.changes} note={message.changesNote} onUndone={(result) => dispatch({ type: "updateMessage", chatId: chat.id, messageId: message.id, patch: { changes: { ...message.changes!, undone: true }, changesNote: undoSummary(result) } })} />}
          {message.memoryNote && message.memoryNote.length > 0 && <button className="memory-note" onClick={() => dispatch({ type: "settings", open: true, tab: "memory" })} title={`Aprendi: ${message.memoryNote.join(" · ")} — clique para ver ou apagar`}><Brain size={12} />Memória atualizada</button>}
          {!message.loading && !streaming && <footer className="msg-footer">
            <span className="msg-meta">{replyFooter(message.model, message.source, message.tokens, message.tokensPerSecond)}{interrupted && <span className="msg-tag">interrompida</span>}</span>
            {!message.error && <div className="msg-tools"><CopyButton text={message.text} /><button onClick={() => startSpeaking(message.text)} title="Ler em voz alta"><Volume2 size={13} /></button></div>}
          </footer>}
        </article>;
      })}
      {liveTranscript && <article className="msg msg-user live-transcript" aria-live="polite"><div className="msg-bubble">{liveTranscript}</div></article>}
    </div>
    {stageVisible && <FloatingFace skin={state.orbitalSkin} state={orbitalState} expression={expression} audioLevel={audioLevel} reducedMotion={reducedMotion} speechPulse={speechPulse} status={activityLabel(orbitalState)} leaving={!voiceActive} getBounds={chatBounds} onClose={voiceConversation ? () => { if (pendingRequest) stopGeneration(); stopVoiceSession(); } : undefined} />}
    <div className="composer-wrap apple-composer-wrap" ref={composerRef}>
      {confirmRequest && <div className="agent-confirm" role="alertdialog" aria-labelledby="agent-confirm-title" aria-describedby="agent-confirm-reason">
        <span className="agent-confirm-icon" aria-hidden="true"><ShieldCheck size={16} /></span>
        <div className="agent-confirm-copy">
          <span className="agent-confirm-eyebrow">Pedido de permissão</span>
          <strong id="agent-confirm-title">{confirmRequest.step.label}</strong>
          {confirmRequest.step.reason && <small id="agent-confirm-reason">{confirmRequest.step.reason}</small>}
          {confirmRequest.step.tool === "run_command" && <code>{String(confirmRequest.step.args.command ?? "")}</code>}
        </div>
        <div className="agent-confirm-actions">
          <button className="agent-confirm-button deny" onClick={() => answerConfirm("deny")} title="Não fazer isto (Esc)">Negar<kbd>Esc</kbd></button>
          <button className="agent-confirm-button always" onClick={() => answerConfirm("always")} title="Libera mouse, teclado e comandos até o fim desta tarefa (bloqueios de segurança continuam valendo)">Nesta tarefa</button>
          <button className="agent-confirm-button allow" autoFocus onClick={() => answerConfirm("allow")} title="Permitir só esta ação (Enter)">Permitir<kbd>Enter</kbd></button>
        </div>
      </div>}
      {voiceError && <div className="inline-error">{voiceError}{(voiceNeedsSetup || orbitalState === "error") && <button onClick={openVoiceSettings}><Mic size={12} />Configurar voz</button>}<button aria-label="Fechar aviso" onClick={() => { setVoiceError(""); setVoiceNeedsSetup(false); }}><X size={12} /></button></div>}
      <div className={`composer apple-composer ${listening ? "listening" : ""} ${dictating ? "dictating" : ""}`}>
        {mention && <div className="composer-popover mention-popover" role="listbox" aria-label={mention.kind === "skill" ? "Skills" : "Conectores MCP"}>
          <span className="menu-section-label">{mention.kind === "skill" ? "Skills · /" : "Conectores MCP · @"}</span>
          {mentionItems.map((item, index) => <button key={item.id} role="option" aria-selected={index === mentionIndex} aria-disabled={item.disabled} className={`${index === mentionIndex ? "active" : ""} ${item.disabled ? "disabled" : ""}`} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); chooseMention(item); }}>
            <span className="mention-icon">{item.kind === "skill" ? <Sparkles size={14} /> : <AtSign size={14} />}</span>
            <span className="mention-copy"><b>{item.label}</b><small>{item.description}</small></span>
          </button>)}
          {mentionItems.length === 0 && <small className="local-model-empty">{(mention.kind === "skill" ? skills : mcpServers) === undefined ? "Carregando…" : mention.kind === "skill" ? "Nenhuma skill encontrada" : "Nenhum conector MCP configurado"}</small>}
          {mention.kind === "mcp" && <button className="mention-manage" onMouseDown={(event) => { event.preventDefault(); setMention(undefined); dispatch({ type: "settings", open: true, tab: "mcp" }); }}><ChevronRight size={13} />Gerenciar conectores</button>}
        </div>}
        {imageMode && <div className="attachment-chips invocation-chips"><span className="invocation-chip image-mode-chip" title="A próxima mensagem vira uma imagem gerada neste PC"><ImagePlus size={12} />Imagem · {resolveImageModel(state.preferredImageModel, tools.installed, local.hardware)?.name ?? "nenhum modelo baixado"}{imageModeAuto && <small className="chip-note">automático</small>}<button aria-label="Sair do modo imagem" onClick={() => { setImageMode(false); setImageModeAuto(false); }}><X size={11} /></button></span></div>}
        {invocations.length > 0 && <div className="attachment-chips invocation-chips">{invocations.map((item) => <span key={`${item.kind}-${item.id}`} className={`invocation-chip ${item.kind}`} title={item.kind === "skill" ? "Esta mensagem usa a skill (liga o agente só para ela)" : "Esta mensagem usa só as ferramentas deste conector"}>{item.kind === "skill" ? <Sparkles size={12} /> : <AtSign size={12} />}{item.label.replace(/^[/@]/, "")}<button aria-label={`Remover ${item.label}`} onClick={() => setInvocations((items) => items.filter((current) => current !== item))}><X size={11} /></button></span>)}</div>}
        {attachments.length > 0 && <div className="attachment-chips">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={12} />{file.name}<button onClick={() => setAttachments((items) => items.filter((item) => item !== file))}><X size={11} /></button></span>)}</div>}
        <textarea ref={textareaRef} value={draft} onChange={(event) => updateDraft(event.target.value, event.target.selectionStart ?? event.target.value.length)} onKeyDown={onComposerKeyDown} onBlur={() => setMention(undefined)} readOnly={dictating} placeholder={imageMode ? "Descreva a imagem — ex.: um gato astronauta flutuando sobre a Terra, estilo foto" : dictating ? "Ditando… (clique no microfone para terminar)" : dictationBusy ? "Transcrevendo…" : invocations.length ? "Descreva o que fazer com a skill/conector escolhido" : "Pergunte o que quiser, é de graça..."} rows={1} />
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
              <EffortControl value={state.effort} onChange={(effort) => dispatch({ type: "setEffort", effort })} reducedMotion={reducedMotion} skin={state.effortSkin} />
              <i className="menu-divider" />
              <label className="access-level-control"><span><strong>Acesso ao computador</strong><small>{ACCESS_LABELS[approval]}</small></span><input type="range" min="0" max="2" step="1" value={ACCESS_STEPS.indexOf(approval)} aria-label="Nível de acesso ao computador" aria-valuetext={ACCESS_LABELS[approval]} onChange={(event) => setApproval(ACCESS_STEPS[Number(event.target.value)])} /><span className="access-scale"><span title="Somente leitura"><Lock size={13} aria-label="Nenhum acesso" /></span><span title="Acesso total"><LockOpen size={13} aria-label="Acesso total" /></span></span></label>
              <label className="access-level-control robot-speed-control" title={`Atravessa a tela em cerca de ${crossingSeconds(ROBOT_SPEEDS[robotSpeedIndex(state.robotSpeed)].speed)} s carregando uma pasta ou janela`}><span><strong>Velocidade do robô</strong><small>{ROBOT_SPEEDS[robotSpeedIndex(state.robotSpeed)].label}</small></span><input type="range" min="0" max={ROBOT_SPEEDS.length - 1} step="1" value={robotSpeedIndex(state.robotSpeed)} aria-label="Velocidade do robô na tela" aria-valuetext={ROBOT_SPEEDS[robotSpeedIndex(state.robotSpeed)].label} onChange={(event) => dispatch({ type: "setRobotSpeed", speed: ROBOT_SPEEDS[Number(event.target.value)].speed })} /><span className="access-scale"><span title="Mais devagar"><Turtle size={13} aria-label="Mais devagar" /></span><span title="Mais rápido"><Rabbit size={13} aria-label="Mais rápido" /></span></span></label>
              <i className="menu-divider" />
              <button className={imageMode ? "active" : ""} onClick={() => { setImageMode((value) => !value); setImageModeAuto(false); setActivePopover(null); setModelMenuOpen(false); requestAnimationFrame(() => textareaRef.current?.focus()); }}><span><ImagePlus size={14} />Gerar imagem</span><small>{imageMode ? "Ligado" : resolveImageModel(state.preferredImageModel, tools.installed, local.hardware)?.name ?? "Baixar modelo"}</small></button>
              <button onClick={chooseFiles}><span><FileText size={14} />Anexar documento</span></button>
              <button onClick={chooseFiles}><span><Image size={14} />Anexar foto</span></button>
            </div>}
            <span className="project-context-wrap">
              <button className={`project-context ${projectOpen ? "active" : ""}`} title="Projeto de contexto" aria-expanded={projectOpen} onClick={() => { setActivePopover(nextComposerPopover(activePopover, "project")); setModelMenuOpen(false); }}><Folder size={14} /><span>{contextProject}</span></button>
              {contextProject !== "Sem projeto" && <button className="project-context-clear" title="Fechar projeto" aria-label={`Fechar projeto ${contextProject}`} onClick={() => chooseProject("Sem projeto")}><X size={10} strokeWidth={2.6} /></button>}
            </span>
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
            <button className={`ai-meter ${aiMeter.kind}`} title={`${aiMeter.label}. ${aiMeter.throughput}`} aria-label={`Uso de IA: ${aiMeter.label}. ${aiMeter.throughput}`} aria-expanded={meterOpen} onClick={() => setActivePopover(nextComposerPopover(activePopover, "meter"))}><i>{aiMeter.kind === "local" ? <InfinityIcon className="ai-meter-infinity" size={20} strokeWidth={2.2} aria-hidden="true" /> : <b>{aiMeter.kind === "qa" ? "QA" : "—"}</b>}</i></button>
            {meterOpen && <div className="composer-popover meter-popover"><strong>{aiMeter.label}</strong><small>{aiMeter.detail}</small><span>{aiMeter.throughput}</span></div>}
            <button className={`dictate-button ${dictating ? "active" : ""}`} onClick={() => void toggleDictation()} disabled={dictationBusy || voiceActive} aria-pressed={dictating} title={dictating ? "Parar ditado e escrever o texto" : dictationBusy ? "Transcrevendo…" : "Ditar mensagem (escreve sem enviar)"} aria-label={dictating ? "Parar ditado" : "Ditar mensagem"}>{dictationBusy ? <LoaderCircle size={16} className="spin" /> : <Mic size={16} />}</button>
            <button className={`send-button apple-send ${voiceConversation ? "voice-on" : ""}`} onClick={voiceConversation ? toggleVoice : generating ? stopGeneration : canSend ? () => send() : toggleVoice} title={voiceConversation ? "Desligar modo voz" : generating ? "Parar resposta" : canSend ? "Enviar" : "Ligar modo voz"} aria-label={voiceConversation ? "Desligar modo voz" : generating ? "Parar resposta" : canSend ? "Enviar" : "Ligar modo voz"}>{voiceConversation || generating ? <Square size={14} /> : canSend ? <ArrowUp size={17} /> : <AudioLines size={16} />}</button>
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
