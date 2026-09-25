import { Check, Mic, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { refreshTools, useTools } from "../store/toolsStore";
import { formatBytes } from "../utils/localCatalog";
import { isQAOffline } from "../utils/qaMode";
import { SpeechController, transcribe } from "../utils/SpeechController";
import { ASR_MODELS, resolveAsrModel, resolveTtsVoice, SYSTEM_VOICE_ID, TTS_VOICES, type ToolInfo } from "../utils/toolCatalog";
import { describeMicError, listMicrophones, VoiceCapture } from "../utils/voiceCapture";
import { RecipeActions, ToolProgressBar } from "./ToolsPanel";

const preview = new SpeechController();
const LANGUAGES = [{ id: "pt", label: "Português" }, { id: "en", label: "Inglês" }, { id: "es", label: "Espanhol" }];

type TestState = { phase: "idle" } | { phase: "listening" } | { phase: "transcribing" } | { phase: "done"; text: string; ms: number; seconds: number } | { phase: "error"; message: string };

/** Aba "Voz": microfone com teste real, idioma, modelo de reconhecimento e voz do assistente. */
export function VoiceSettings() {
  const { state, dispatch } = useStore();
  const tools = useTools();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micError, setMicError] = useState("");
  const [level, setLevel] = useState(0);
  const [test, setTest] = useState<TestState>({ phase: "idle" });
  const [speaking, setSpeaking] = useState(false);
  const capture = useRef(new VoiceCapture());
  const asrModel = resolveAsrModel(state.voice.asrModel, tools.installed);
  const ttsVoice = resolveTtsVoice(state.voice.ttsVoice, tools.installed);

  async function loadMics() {
    setMicError("");
    try {
      let devices = await listMicrophones();
      // Sem permissão o Windows esconde os nomes; pedir uma vez libera a lista completa.
      if (devices.some((device) => !device.label) && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        devices = await listMicrophones();
      }
      setMics(devices);
      if (!devices.length) setMicError("Nenhum microfone encontrado pelo Windows.");
    } catch (error) {
      setMicError(describeMicError(error));
    }
  }

  useEffect(() => {
    void refreshTools();
    if (!isQAOffline()) void loadMics();
    const onChange = () => void loadMics();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
      capture.current.stop("stopped", false);
      preview.stopSpeaking();
    };
  }, []);

  async function runTest() {
    if (test.phase === "listening") { capture.current.stop("stopped", true); return; }
    setTest({ phase: "listening" });
    try {
      await capture.current.start({
        onLevel: setLevel,
        onFinish: async (result) => {
          setLevel(0);
          const seconds = result.samples.length / result.sampleRate;
          if (result.reason === "no-speech") { setTest({ phase: "error", message: "Nenhuma fala detectada. Fale mais perto ou escolha outro microfone." }); return; }
          if (!asrModel) { setTest({ phase: "done", text: "(microfone ok — baixe um modelo abaixo para transcrever)", ms: 0, seconds }); return; }
          setTest({ phase: "transcribing" });
          try {
            const reply = await transcribe(result.samples, result.sampleRate, asrModel, state.voice.language);
            setTest({ phase: "done", text: reply.text || "(silêncio)", ms: reply.elapsedMs, seconds });
          } catch (error) {
            setTest({ phase: "error", message: String(error) });
          }
        },
      }, state.voice.micDeviceId || undefined, { silenceMs: 1000, noSpeechMs: 6000, maxMs: 15000, minSpeechMs: 150 });
    } catch (error) {
      setTest({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function playSample(voiceId: string) {
    if (speaking) { preview.stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    preview.speak("Olá! Esta é a voz que vou usar nas nossas conversas.", {
      voiceId,
      onEnd: () => setSpeaking(false),
      onError: (message) => { setSpeaking(false); window.alert(message); },
    });
  }

  function modelRow(tool: ToolInfo, selected: boolean, onSelect: () => void) {
    const installed = tools.installed.has(tool.id);
    const progress = tools.progress[tool.id];
    return <article key={tool.id} className={`model-card voice-option ${selected ? "focused" : ""}`}>
      <label className="voice-radio">
        <input type="radio" checked={selected} disabled={!installed} onChange={onSelect} />
        <span className="runtime-copy">
          <span><h4>{tool.name}</h4><em>{tool.company}</em>{tool.recommended && <span className="status-badge recommended">Recomendado</span>}</span>
          <p>{formatBytes(tool.sizeBytes)}{tool.languages ? ` · ${tool.languages}` : ""}</p>
          {progress && (progress.state === "running" || progress.state === "failed") && <ToolProgressBar progress={progress} />}
        </span>
      </label>
      <div className="model-card-actions">
        {tool.usage === "voice-output" && installed && <button className="flat-button" onClick={() => playSample(tool.id)}><Play size={13} />Ouvir</button>}
        <RecipeActions tool={tool} installed={installed} progress={progress} />
      </div>
    </article>;
  }

  return <>
    <div className="settings-heading runtime-heading"><div><span>Modo voz local</span><h3>Voz</h3><p>O reconhecimento de fala do WebView2 depende de um serviço em nuvem que não existe no app, por isso a voz roda em modelos locais (NVIDIA NeMo / OpenAI Whisper sobre o ONNX Runtime).</p></div></div>

    <div className="setting-card voice-card">
      <div className="voice-card-head"><label>Microfone</label><button className="flat-button icon-only" title="Atualizar lista" onClick={loadMics}><RefreshCw size={13} /></button></div>
      <select className="voice-select" value={state.voice.micDeviceId ?? ""} onChange={(event) => dispatch({ type: "setVoice", patch: { micDeviceId: event.target.value || undefined } })}>
        <option value="">Padrão do Windows</option>
        {mics.filter((mic) => mic.deviceId !== "default").map((mic) => <option key={mic.deviceId} value={mic.deviceId}>{mic.label || "Microfone"}</option>)}
      </select>
      {micError && <p className="settings-message tool-error">{micError}</p>}
      <div className="mic-test">
        <button className={test.phase === "listening" ? "primary-button" : "flat-button"} onClick={runTest} disabled={test.phase === "transcribing" || isQAOffline()}>{test.phase === "listening" ? <Square size={13} /> : <Mic size={13} />}{test.phase === "listening" ? "Parar e transcrever" : "Testar microfone"}</button>
        <div className="mic-meter" aria-label="Nível do microfone"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
      </div>
      {test.phase === "listening" && <small className="mic-test-result">Fale uma frase; a gravação para sozinha quando você fizer uma pausa.</small>}
      {test.phase === "transcribing" && <small className="mic-test-result">Transcrevendo…</small>}
      {test.phase === "done" && <small className="mic-test-result ok"><Check size={12} />“{test.text}”{test.ms ? ` · ${test.seconds.toFixed(1)} s de áudio em ${test.ms} ms` : ""}</small>}
      {test.phase === "error" && <small className="mic-test-result tool-error">{test.message}</small>}
    </div>

    <h5 className="model-section-title">Reconhecimento de voz <span>{ASR_MODELS.filter((tool) => tools.installed.has(tool.id)).length} instalados</span></h5>
    <div className="setting-card voice-card inline">
      <label>Idioma falado</label>
      <div className="segmented">{LANGUAGES.map((language) => <button key={language.id} className={state.voice.language === language.id ? "active" : ""} onClick={() => dispatch({ type: "setVoice", patch: { language: language.id } })}>{language.label}</button>)}</div>
    </div>
    <div className="runtime-list model-list">{ASR_MODELS.map((tool) => modelRow(tool, asrModel === tool.id, () => dispatch({ type: "setVoice", patch: { asrModel: tool.id } })))}</div>

    <h5 className="model-section-title">Voz do assistente</h5>
    <div className="runtime-list model-list">
      <article className={`model-card voice-option ${ttsVoice === SYSTEM_VOICE_ID ? "focused" : ""}`}>
        <label className="voice-radio">
          <input type="radio" checked={ttsVoice === SYSTEM_VOICE_ID} onChange={() => dispatch({ type: "setVoice", patch: { ttsVoice: SYSTEM_VOICE_ID } })} />
          <span className="runtime-copy"><span><h4>Voz do Windows</h4><em>Microsoft</em></span><p>Já instalada · usa as vozes pt-BR do sistema</p></span>
        </label>
        <div className="model-card-actions"><button className="flat-button" onClick={() => playSample(SYSTEM_VOICE_ID)}><Play size={13} />Ouvir</button></div>
      </article>
      {TTS_VOICES.map((tool) => modelRow(tool, ttsVoice === tool.id, () => dispatch({ type: "setVoice", patch: { ttsVoice: tool.id } })))}
    </div>
  </>;
}
