import { Check, Download, ImageIcon, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "../store/store";
import { useLocalModels } from "../store/localModelsStore";
import { cancelTool, dismissToolProgress, installTool, removeTool, useTools, type ToolProgress } from "../store/toolsStore";
import { formatBytes } from "../utils/localCatalog";
import { IMAGE_ENGINES, IMAGE_MODELS, imageModelFit, resolveImageModel, type ImageModelInfo } from "../utils/imageCatalog";

const GB = 1024 ** 3;

function Progress({ progress }: { progress: ToolProgress }) {
  const percent = progress.totalBytes ? Math.min(100, Math.round(((progress.completedBytes ?? 0) / progress.totalBytes) * 100)) : undefined;
  const speed = progress.bytesPerSecond ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : "";
  return <div className={`pull-progress ${progress.state}`} aria-live="polite">
    <div className="pull-progress-head"><strong>{progress.phase}</strong><span>{percent !== undefined ? `${percent}%` : ""}</span></div>
    <div className="pull-bar"><i style={{ width: `${percent ?? 0}%` }} /></div>
    <small>{progress.error ?? (progress.completedBytes ? `${formatBytes(progress.completedBytes)}${progress.totalBytes ? ` de ${formatBytes(progress.totalBytes)}` : ""}${speed}` : progress.message ?? "Preparando…")}</small>
  </div>;
}

/** Configurações › Modelos locais › Modelos de imagem: baixar, usar e remover cada modelo aberto. */
export function ImageModelsSection() {
  const { state, dispatch } = useStore();
  const tools = useTools();
  const local = useLocalModels();
  const [confirming, setConfirming] = useState<string>();
  const current = resolveImageModel(state.preferredImageModel, tools.installed, local.hardware);
  const installed = IMAGE_MODELS.filter((model) => tools.installed.has(model.id));
  const available = IMAGE_MODELS.filter((model) => !tools.installed.has(model.id));

  function card(model: ImageModelInfo) {
    const isInstalled = tools.installed.has(model.id);
    const progress = tools.progress[model.id];
    const running = progress?.state === "running";
    const fit = imageModelFit(model, local.hardware);
    const engine = IMAGE_ENGINES[model.engine];
    const engineMissing = !tools.installed.has(model.engine);
    const download = model.sizeGb + (engineMissing ? engine.sizeGb : 0);
    const inUse = current?.id === model.id;
    return <article key={model.id} className={`model-card image-model-card ${isInstalled ? "installed" : ""} fit-${fit.fit}`}>
      <span className="runtime-logo"><ImageIcon size={17} /></span>
      <div className="runtime-copy">
        <div>
          <h4>{model.name}</h4>
          {isInstalled && <span className="status-badge installed">Instalado</span>}
          {model.recommended && <span className="status-badge recommended">Recomendado</span>}
          <span className={`status-badge ${model.commercial ? "commercial" : "personal"}`} title={model.license}>{model.commercial ? "Uso comercial" : "Só uso pessoal"}</span>
          {fit.fit === "heavy" && <span className="status-badge missing">Pesado para este PC</span>}
        </div>
        <p>{model.author} · {model.license} · {formatBytes(model.sizeGb * GB)}</p>
        <small>{model.description} {model.strengths.join(" · ")}. {fit.reason}{engineMissing && !isInstalled ? ` Na primeira vez baixa também o motor ${engine.name} (${formatBytes(engine.sizeGb * GB)}).` : ""}</small>
        {progress && progress.state !== "completed" && progress.state !== "cancelled" && <Progress progress={progress} />}
        {confirming === model.id && <div className="model-confirm" role="group">
          <span>Baixar {formatBytes(download * GB)} para este computador?</span>
          <button className="primary-button" onClick={() => { setConfirming(undefined); void installTool(model.id); }}><Download size={13} />Confirmar download</button>
          <button className="flat-button" onClick={() => setConfirming(undefined)}>Agora não</button>
        </div>}
      </div>
      <div className="model-card-actions">
        {isInstalled && <button className="primary-button use-model-button" onClick={() => dispatch({ type: "setImageModel", model: model.id })}>{inUse ? <Check size={14} /> : <ImageIcon size={14} />}{inUse ? "Em uso" : "Usar"}</button>}
        {isInstalled && <button className="flat-button" title="Apagar do disco" aria-label={`Apagar ${model.name}`} onClick={() => void removeTool(model.id)}><Trash2 size={13} /></button>}
        {!isInstalled && running && <button className="flat-button" onClick={() => void cancelTool(model.id)}><X size={13} />Cancelar</button>}
        {!isInstalled && !running && progress?.state === "failed" && <button className="flat-button" onClick={() => { dismissToolProgress(model.id); void installTool(model.id); }}>Tentar de novo</button>}
        {!isInstalled && !running && progress?.state !== "failed" && confirming !== model.id && <button className="flat-button" onClick={() => setConfirming(model.id)}><Download size={14} />Baixar</button>}
      </div>
    </article>;
  }

  return <section id="model-card-image-models" className="image-models-section">
    <h5 className="model-section-title">Modelos de imagem <span>{installed.length}/{IMAGE_MODELS.length}</span></h5>
    <p className="model-empty">Geram imagens aqui no PC a partir de texto: peça no chat "gere uma imagem de…" ou use + › Gerar imagem. Salvas em Imagens\Open Assistant.</p>
    <div className="runtime-list model-list">{installed.map(card)}{available.map(card)}</div>
  </section>;
}
