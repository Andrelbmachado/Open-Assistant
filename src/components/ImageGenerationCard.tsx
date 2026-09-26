import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Gamepad2, ImageOff, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GeneratedImage } from "../store/store";
import { imageModelById } from "../utils/imageCatalog";
import { SnakeGame } from "./SnakeGame";

const urls = new Map<string, string>();

/** Lê a imagem do disco uma vez e devolve uma URL de blob reutilizável. */
async function imageUrl(path: string): Promise<string> {
  const cached = urls.get(path);
  if (cached) return cached;
  const bytes = await invoke<ArrayBuffer>("image_read", { path });
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  urls.set(path, url);
  return url;
}

interface Props {
  image: GeneratedImage;
  onCancel?: () => void;
}

/**
 * Imagem gerada no chat. Enquanto gera: prévia quadrada preta (cantos arredondados) com pontinhos e um
 * brilho colado na borda (magenta, violeta, azul e ciano) que gira e respira como líquido; clicar nela abre o jogo da cobrinha, que some na hora em que a imagem fica pronta.
 */
export function ImageGenerationCard({ image, onCancel }: Props) {
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const model = imageModelById(image.modelId);

  useEffect(() => {
    if (image.status !== "done" || !image.path) return;
    let alive = true;
    imageUrl(image.path).then((value) => { if (alive) setUrl(value); }).catch((error) => { if (alive) setLoadError(String(error)); });
    return () => { alive = false; };
  }, [image.status, image.path]);

  if (image.status === "done") {
    return <figure className="generated-image">
      {url ? <img src={url} alt={image.prompt} /> : <div className="generated-image-missing">{loadError ? <><ImageOff size={20} />{loadError}</> : <LoaderCircle size={18} className="spin" />}</div>}
      <figcaption>
        <span>{model?.name ?? image.modelId}{image.elapsedMs ? ` · ${(image.elapsedMs / 1000).toFixed(1)} s` : ""}{image.seed !== undefined ? ` · semente ${image.seed}` : ""}</span>
        {image.path && <button className="flat-button" onClick={() => void invoke("image_reveal", { path: image.path })} title="Mostrar no Explorador de Arquivos"><FolderOpen size={13} />Abrir pasta</button>}
      </figcaption>
    </figure>;
  }

  if (image.status === "error" || image.status === "cancelled") {
    return <div className={`generated-image-error ${image.status}`}><ImageOff size={16} /><span>{image.status === "cancelled" ? "Geração cancelada." : image.error ?? "A geração falhou."}</span></div>;
  }

  const progress = image.total ? Math.round(((image.step ?? 0) / image.total) * 100) : undefined;
  return <div className={`image-loading ${playing ? "playing" : ""}`}>
    <div className="image-loading-frame">
      <div className="image-loading-glow" aria-hidden="true"><i /><i /></div>
      <div className="image-loading-inner" role={playing ? undefined : "button"} tabIndex={playing ? -1 : 0} aria-label="Gerando imagem. Clique para jogar enquanto espera"
        onClick={() => setPlaying(true)} onKeyDown={(event) => { if (!playing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setPlaying(true); } }}>
        {playing ? <SnakeGame /> : <div className="image-loading-copy">
          <strong>{image.phase ?? "Preparando"}{image.total ? ` · ${image.step ?? 0}/${image.total}` : "…"}</strong>
          <small><Gamepad2 size={13} />Clique para jogar enquanto espera</small>
        </div>}
      </div>
      <div className="image-loading-edge" aria-hidden="true"><span><i /><i /></span></div>
    </div>
    <div className="image-loading-footer">
      <div className="image-loading-bar"><i style={{ width: `${progress ?? 0}%` }} /></div>
      <span>{model?.name ?? image.modelId}</span>
      {onCancel && <button className="flat-button" onClick={onCancel}><X size={13} />Cancelar</button>}
    </div>
  </div>;
}
