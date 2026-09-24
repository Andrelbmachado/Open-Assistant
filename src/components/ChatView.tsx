import { ArrowUp, AudioLines, Bot, Check, ChevronDown, ChevronRight, Copy, FileText, Folder, Gauge, Image, Mic, Paperclip, RotateCcw, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/store";
import { SpeechController } from "../utils/SpeechController";
import { askAI, getOllamaModels } from "../utils/aiService";

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
  const [voiceError, setVoiceError] = useState("");
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

  async function send() {
    if (!canSend) return;
    const attachmentText = attachments.length ? `[Anexos: ${attachments.map((file) => file.name).join(", ")}]` : "";
    const text = [draft.trim(), attachmentText].filter(Boolean).join("\n");
    const chatId = chat.id;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    dispatch({ type: "addMessage", chatId, message: { id: userMsgId, sender: "user", text, time: "agora" } });
    setDraft(""); setAttachments([]);

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
    } catch (err) {
      dispatch({
        type: "updateMessage",
        chatId,
        messageId: assistantMsgId,
        text: `Erro ao obter resposta da IA: ${err}`,
        loading: false,
      });
    }
  }

  function toggleVoice() {
    if (listening) { speech.stopListening(); setListening(false); return; }
    setVoiceError(""); setListening(true);
    speech.listen(setDraft, () => setListening(false), (error) => { setVoiceError(error); setListening(false); });
  }

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
          {message.sender === "assistant" && !message.loading && <div className="message-tools"><button onClick={() => navigator.clipboard.writeText(message.text)} title="Copiar"><Copy size={13} /></button><button title="Refazer"><RotateCcw size={13} /></button><button onClick={() => speech.speak(message.text)} title="Ler em voz alta"><Volume2 size={13} /></button></div>}
        </div>
      </article>)}
    </div>
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
            <button className={listening ? "active" : ""} onClick={toggleVoice} title={listening ? "Parar ditado" : "Ditado"}>{listening ? <X size={16} /> : <Mic size={16} />}</button>
            <button className="send-button apple-send" onClick={canSend ? send : toggleVoice} title={canSend ? "Enviar" : listening ? "Parar ditado" : "Iniciar conversa por voz"}>{canSend ? <ArrowUp size={17} /> : <AudioLines size={16} />}</button>
          </div>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(event) => { setAttachments((files) => [...files, ...Array.from(event.target.files ?? [])]); event.currentTarget.value = ""; }} />
      </div>
      <span className="composer-hint">Enter envia · Shift + Enter quebra linha</span>
    </div>
  </section>;
}
