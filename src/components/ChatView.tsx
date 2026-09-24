import { ArrowUp, Atom, AudioLines, Bot, Check, ChevronDown, ChevronRight, CircleDot, Copy, FileText, Folder, Gauge, Image, Mic, Paperclip, RotateCcw, ShieldCheck, Sparkles, Square, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/store";
import { SpeechController } from "../utils/SpeechController";
import { askAI, getOllamaModels } from "../utils/aiService";
import { OrbitalCanvas } from "./OrbitalCanvas";
import { VoiceActivityMonitor } from "../utils/VoiceActivityMonitor";
import { activityLabel, nextOrbitalState, shouldProcessVoiceTranscript, type OrbitalSkin, type OrbitalState } from "../utils/orbitalState";
import { isQAOffline } from "../utils/qaMode";

const speech = new SpeechController();
type ApprovalMode = "Perguntar" | "Automático" | "Somente leitura";

const defaultModels = [
  "GPT-5",
  "Claude",
  "Ollama (Local)",
  "DeepSeek",
  "Llama 3.2 (Local)",
];

export function ChatView() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [orbitalState, setOrbitalState] = useState<OrbitalState>("idle");
  const [audioLevel, setAudioLevel] = useState<number | undefined>();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [contextProject, setContextProject] = useState("Open Assistant");
  const [approval, setApproval] = useState<ApprovalMode>("Perguntar");
  const [effort, setEffort] = useState("Alto");
  const [speed, setSpeed] = useState("Padrão");
  const [modelList, setModelList] = useState<string[]>(defaultModels);
  const fileInput = useRef<HTMLInputElement>(null);
  const voiceMonitor = useRef(new VoiceActivityMonitor());
  const voiceDraft = useRef("");
  const voiceRecognitionFailed = useRef(false);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chat = state.chats.find((item) => item.id === state.activeChatId) ?? state.chats[0];
  const suggestions = useMemo(() => ["Criar um plano de implementação", "Revisar os arquivos do projeto", "Abrir um terminal PowerShell"], []);
  const canSend = Boolean(draft.trim() || attachments.length);

  useEffect(() => {
    getOllamaModels().then((models) => {
      if (models.length > 0) {
        setModelList((prev) => Array.from(new Set([...models.map((m) => `Ollama: ${m}`), ...prev])));
      }
    });
  }, []);

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
    speech.stopListening();
    voiceMonitor.current.stop();
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
    setOrbitalState(nextOrbitalState("speech-start"));
    if (isQAOffline()) {
      if (voiceTimer.current) clearTimeout(voiceTimer.current);
      voiceTimer.current = setTimeout(() => {
        setVoiceMode(false);
        setOrbitalState(nextOrbitalState("speech-end"));
      }, Math.min(3200, Math.max(900, text.length * 18)));
      return;
    }
    speech.speak(text, {
      onStart: () => setOrbitalState(nextOrbitalState("speech-start")),
      onBoundary: () => setAudioLevel(undefined),
      onEnd: () => { setVoiceMode(false); setAudioLevel(undefined); setOrbitalState(nextOrbitalState("speech-end")); },
      onError: resetOrbitalAfterError,
    });
  }

  async function send(options: { text?: string; speakAfter?: boolean } = {}) {
    const sourceText = options.text ?? draft.trim();
    if (!sourceText && !attachments.length) return;
    const attachmentText = attachments.length ? `[Anexos: ${attachments.map((file) => file.name).join(", ")}]` : "";
    const text = [sourceText, attachmentText].filter(Boolean).join("\n");
    const chatId = chat.id;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    dispatch({ type: "addMessage", chatId, message: { id: userMsgId, sender: "user", text, time: "agora" } });
    setDraft(""); setAttachments([]);
    setOrbitalState(nextOrbitalState("request-start"));

    dispatch({
      type: "addMessage",
      chatId,
      message: { id: assistantMsgId, sender: "assistant", text: "Pensando...", time: "agora", loading: true },
    });

    const history = [...chat.messages, { id: userMsgId, sender: "user" as const, text, time: "agora" }]
      .map((m) => ({ role: m.sender, content: m.text }));

    try {
      const reply = await askAI(chat.model, history);
      dispatch({
        type: "updateMessage",
        chatId,
        messageId: assistantMsgId,
        text: reply.text,
        loading: false,
      });
      if (options.speakAfter) startSpeaking(reply.text);
      else setOrbitalState(nextOrbitalState("reset"));
    } catch (err) {
      dispatch({
        type: "updateMessage",
        chatId,
        messageId: assistantMsgId,
        text: `Erro ao obter resposta da IA: ${err}`,
        loading: false,
      });
      setVoiceMode(false);
      resetOrbitalAfterError(`Erro ao obter resposta da IA: ${err}`);
    }
  }

  function toggleVoice() {
    if (orbitalState === "speaking") { stopSpeaking(); return; }
    if (listening) { stopVoiceSession(); return; }
    setVoiceError("");
    setVoiceMode(true);
    setListening(true);
    setOrbitalState(nextOrbitalState("voice-start"));
    voiceDraft.current = "";
    voiceRecognitionFailed.current = false;
    if (isQAOffline()) {
      voiceTimer.current = setTimeout(() => {
        setListening(false);
        send({ text: "Teste de conversa por voz no modo QA offline", speakAfter: true });
      }, 750);
      return;
    }
    void voiceMonitor.current.start(setAudioLevel);
    speech.listen((text) => { voiceDraft.current = text; setDraft(text); }, () => {
      voiceMonitor.current.stop();
      setAudioLevel(undefined);
      setListening(false);
      const transcript = voiceDraft.current.trim();
      if (shouldProcessVoiceTranscript(voiceRecognitionFailed.current, transcript)) send({ text: transcript, speakAfter: true });
      else if (!voiceRecognitionFailed.current) { setVoiceMode(false); setOrbitalState(nextOrbitalState("reset")); }
    }, (error) => {
      voiceRecognitionFailed.current = true;
      voiceMonitor.current.stop();
      setAudioLevel(undefined);
      setListening(false);
      setVoiceMode(false);
      resetOrbitalAfterError(error);
    });
  }

  useEffect(() => () => { voiceMonitor.current.stop(); if (voiceTimer.current) clearTimeout(voiceTimer.current); if (errorTimer.current) clearTimeout(errorTimer.current); speech.stopSpeaking(); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (listening || orbitalState === "speaking")) {
        event.preventDefault();
        if (listening) stopVoiceSession(); else stopSpeaking();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening, orbitalState]);

  function chooseFiles() { fileInput.current?.click(); setAttachmentOpen(false); }

  function renderContent(text: string) {
    if (!text.includes("```")) {
      return <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>;
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
              <button onClick={() => navigator.clipboard.writeText(code)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Copy size={11} />Copiar</button>
            </div>
            <pre style={{ margin: 0, padding: "12px", fontSize: "13px", fontFamily: "Consolas, monospace", overflowX: "auto" }}><code>{code}</code></pre>
          </div>;
        }
        return <p key={index} style={{ whiteSpace: "pre-wrap" }}>{part}</p>;
      })}
    </div>;
  }

  return <section className="view chat-view">
    <div className="messages">
      {chat.messages.length === 0 && <div className="empty-chat"><span><Bot size={26} /></span><h3>Como posso ajudar?</h3><p>Comece uma conversa ou escolha uma sugestão.</p><div>{suggestions.map((value) => <button key={value} onClick={() => setDraft(value)}>{value}</button>)}</div></div>}
      {chat.messages.map((message) => <article key={message.id} className={`message ${message.sender}`}>
        <div className="message-avatar">{message.sender === "assistant" ? <Bot size={16} /> : "AM"}</div>
        <div className="message-body"><div className="message-meta"><strong>{message.sender === "assistant" ? "Open Assistant" : "Você"}</strong><time>{message.time}</time></div>
          {message.loading ? <div style={{ display: "flex", alignItems: "center", gap: "8px", fontStyle: "italic", opacity: 0.8 }}><Sparkles size={14} className="spin" />Pensando...</div> : renderContent(message.text)}
          {message.sender === "assistant" && !message.loading && <div className="message-tools"><button onClick={() => navigator.clipboard.writeText(message.text)} title="Copiar"><Copy size={13} /></button><button title="Refazer"><RotateCcw size={13} /></button><button onClick={() => startSpeaking(message.text)} title="Ler em voz alta"><Volume2 size={13} /></button></div>}
        </div>
      </article>)}
    </div>
    <section className={`chat-orbital-stage ${chat.messages.length > 2 ? "compact" : ""} ${voiceMode ? "voice-mode" : ""}`} aria-label="Estado da conversa por voz">
      <OrbitalCanvas skin={state.orbitalSkin} state={orbitalState} audioLevel={audioLevel} reducedMotion={reducedMotion} />
      <p className="orbital-status" aria-live="polite">{activityLabel(orbitalState)}</p>
      <div className="orbital-skin-picker" role="radiogroup" aria-label="Escolher aparência da orbital">
        {([
          ["tentacles", Sparkles, "Tentáculos azuis"],
          ["sphere", CircleDot, "Esfera azul"],
          ["atom", Atom, "Átomo"],
        ] as const).map(([skin, Icon, label]) => <button key={skin} type="button" role="radio" aria-checked={state.orbitalSkin === skin} className={state.orbitalSkin === skin ? "active" : ""} title={label} onClick={() => dispatch({ type: "setOrbitalSkin", skin: skin as OrbitalSkin })}><Icon size={14} /><span className="sr-only">{label}</span></button>)}
      </div>
    </section>
    <div className="composer-wrap apple-composer-wrap">
      {voiceError && <div className="inline-error">{voiceError}</div>}
      <div className={`composer apple-composer ${listening ? "listening" : ""}`}>
        {listening && <div className="voice-wave"><i /><i /><i /><i /><i /><i /><i /></div>}
        {attachments.length > 0 && <div className="attachment-chips">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={12} />{file.name}<button onClick={() => setAttachments((items) => items.filter((item) => item !== file))}><X size={11} /></button></span>)}</div>}
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={listening ? "Ouvindo…" : "Pergunte qualquer coisa"} rows={1} />
        <div className="composer-toolbar apple-composer-toolbar">
          <div className="composer-left-actions">
            <button className="composer-plus" title="Adicionar anexo" onClick={() => setAttachmentOpen((open) => !open)}><Paperclip size={16} /></button>
            {attachmentOpen && <div className="composer-popover attachment-popover"><button onClick={chooseFiles}><FileText size={14} />Arquivo</button><button onClick={chooseFiles}><Image size={14} />Imagem</button></div>}
            <div className="model-mode-control">
              <button className={`model-mode-trigger ${modelMenuOpen ? "active" : ""}`} title="Configurações do modelo" onClick={() => setModelMenuOpen((open) => !open)}><Sparkles size={14} /><span>{chat.model}</span><ChevronDown size={11} /></button>
              {modelMenuOpen && <div className="model-mode-menu" style={{ maxHeight: "320px", overflowY: "auto" }}>
                <span style={{ fontSize: "11px", padding: "6px 12px", opacity: 0.6, textTransform: "uppercase" }}>Escolha o Modelo</span>
                {modelList.map((m) => (
                  <button key={m} className={`model-mode-row ${chat.model === m ? "active" : ""}`} onClick={() => { dispatch({ type: "setModel", chatId: chat.id, model: m }); setModelMenuOpen(false); }}>
                    <span>{m}</span>
                    {chat.model === m ? <Check size={14} /> : <ChevronRight size={14} />}
                  </button>
                ))}
                <i className="model-mode-divider" />
                <button className="model-mode-row" onClick={() => setEffort((value) => value === "Alto" ? "Padrão" : "Alto")}><span>Esforço</span><small>{effort}</small><ChevronRight size={18} /></button>
                <button className="model-mode-row" onClick={() => setSpeed((value) => value === "Padrão" ? "Rápida" : "Padrão")}><span>Velocidade</span><small>{speed}</small><ChevronRight size={18} /></button>
                <i className="model-mode-divider" />
                <button className="model-mode-row reset" onClick={() => { setEffort("Alto"); setSpeed("Padrão"); setModelMenuOpen(false); }}><span>Redefinir para o padrão</span><RotateCcw size={18} /></button>
              </div>}
            </div>
            <button className={`project-context ${projectOpen ? "active" : ""}`} title="Projeto de contexto" onClick={() => setProjectOpen((open) => !open)}><Folder size={14} /><span>{contextProject}</span><ChevronDown size={11} /></button>
            {projectOpen && <div className="composer-popover project-popover"><button onClick={() => { setContextProject("Open Assistant"); setProjectOpen(false); }}><Check size={13} />Open Assistant</button><button onClick={() => { setContextProject("Sem projeto"); setProjectOpen(false); }}><X size={13} />Sem projeto</button></div>}
            <button className={`approval-mode ${approvalOpen ? "active" : ""}`} title="Modo de aprovação" onClick={() => setApprovalOpen((open) => !open)}><ShieldCheck size={14} /><span>{approval}</span><ChevronDown size={11} /></button>
            {approvalOpen && <div className="composer-popover approval-popover">{(["Perguntar", "Automático", "Somente leitura"] as ApprovalMode[]).map((mode) => <button key={mode} onClick={() => { setApproval(mode); setApprovalOpen(false); }}>{approval === mode && <Check size={13} />}{mode}</button>)}</div>}
          </div>
          <div className="composer-right-actions">
            <button className="context-usage" title="Janela de contexto" onClick={() => setContextOpen((open) => !open)}><Gauge size={14} /><span>8k</span></button>
            {contextOpen && <div className="composer-popover context-popover"><strong>Janela de contexto</strong><small>1.2k de 8k tokens usados</small><i><b /></i></div>}
            <button className={listening || orbitalState === "speaking" ? "active" : ""} onClick={toggleVoice} title={listening ? "Parar ditado" : orbitalState === "speaking" ? "Parar fala" : "Ditado"}>{listening || orbitalState === "speaking" ? <Square size={14} /> : <Mic size={16} />}</button>
            <button className="send-button apple-send" onClick={listening || orbitalState === "speaking" ? toggleVoice : canSend ? () => send() : toggleVoice} title={listening ? "Parar ditado" : orbitalState === "speaking" ? "Parar fala" : canSend ? "Enviar" : "Iniciar conversa por voz"}>{listening || orbitalState === "speaking" ? <Square size={14} /> : canSend ? <ArrowUp size={17} /> : <AudioLines size={16} />}</button>
          </div>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(event) => { setAttachments((files) => [...files, ...Array.from(event.target.files ?? [])]); event.currentTarget.value = ""; }} />
      </div>
      <span className="composer-hint">Enter envia · Shift + Enter quebra linha</span>
    </div>
  </section>;
}
