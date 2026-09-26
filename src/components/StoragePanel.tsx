import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowRightLeft, HardDrive, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { refreshInstalledModels } from "../store/localModelsStore";
import { refreshTools } from "../store/toolsStore";
import { formatBytes } from "../utils/localCatalog";
import { isQAOffline } from "../utils/qaMode";

interface Disk { root: string; label: string; totalBytes: number; freeBytes: number }
interface ModelsLocation { path: string; root: string; bytes: number }
interface StorageOverview { disks: Disk[]; textModels: ModelsLocation; appModels: ModelsLocation; moving: boolean }
interface MoveProgress { state: "running" | "completed" | "failed"; phase: string; copiedBytes: number; totalBytes: number; error?: string }

/** "C:\" + rótulo → "C: · Sistema" */
const diskName = (disk: Disk) => `${disk.root.replace("\\", "")}${disk.label ? ` · ${disk.label}` : ""}`;

/**
 * Barra do disco onde os modelos ficam (espaço usado/livre) e troca de disco sem baixar de novo:
 * modelos de texto (Ollama) e modelos de imagem/voz do app.
 */
export function StoragePanel() {
  const [overview, setOverview] = useState<StorageOverview>();
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [groups, setGroups] = useState<Record<"text" | "app", boolean>>({ text: true, app: true });
  const [progress, setProgress] = useState<MoveProgress>();
  const [error, setError] = useState("");

  const refresh = () => { if (!isQAOffline()) invoke<StorageOverview>("storage_overview").then(setOverview).catch((reason) => setError(String(reason))); };
  useEffect(() => {
    refresh();
    if (isQAOffline()) return;
    let stop: () => void = () => undefined;
    listen<MoveProgress>("storage-progress", (event) => {
      setProgress(event.payload);
      if (event.payload.state !== "running") { refresh(); void refreshInstalledModels(); void refreshTools(); }
    }).then((unlisten) => { stop = unlisten; }).catch(() => undefined);
    return () => stop();
  }, []);

  if (!overview) return error ? <p className="settings-message">{error}</p> : null;
  const home = overview.disks.find((disk) => disk.root === overview.textModels.root) ?? overview.disks[0];
  const used = home ? home.totalBytes - home.freeBytes : 0;
  const modelBytes = overview.textModels.bytes + (overview.appModels.root === home?.root ? overview.appModels.bytes : 0);
  const others = overview.disks.filter((disk) => disk.root !== home?.root || overview.appModels.root !== disk.root);
  const moving = overview.moving || progress?.state === "running";
  const needed = (groups.text && overview.textModels.root !== target ? overview.textModels.bytes : 0) + (groups.app && overview.appModels.root !== target ? overview.appModels.bytes : 0);
  const targetDisk = overview.disks.find((disk) => disk.root === target);

  async function startMove() {
    setError("");
    try {
      await invoke("storage_move", { targetRoot: target, groups: (Object.keys(groups) as ("text" | "app")[]).filter((key) => groups[key]) });
      setProgress({ state: "running", phase: "Preparando", copiedBytes: 0, totalBytes: needed });
      setMoveOpen(false);
    } catch (reason) {
      setError(String(reason));
    }
  }

  return <div className="storage-panel">
    {home && <div className="storage-disk" title={`Modelos de texto em ${overview.textModels.path}\nModelos de imagem e voz em ${overview.appModels.path}`}>
      <HardDrive size={22} className="storage-icon" />
      <div className="storage-copy">
        <div className="storage-head"><strong>Disco {diskName(home)}</strong><span>{formatBytes(home.freeBytes)} livres de {formatBytes(home.totalBytes)}</span></div>
        <div className="storage-bar" role="meter" aria-valuemin={0} aria-valuemax={home.totalBytes} aria-valuenow={used} aria-label={`Espaço usado no disco ${home.root}`}>
          <i className="used" style={{ width: `${(used / home.totalBytes) * 100}%` }} />
          <i className="models" style={{ width: `${(modelBytes / home.totalBytes) * 100}%` }} />
        </div>
        <small>Modelos de IA: {formatBytes(overview.textModels.bytes)} de texto{overview.appModels.root === home.root ? ` + ${formatBytes(overview.appModels.bytes)} de imagem e voz` : ` · imagem e voz no disco ${overview.appModels.root.replace("\\", "")} (${formatBytes(overview.appModels.bytes)})`}</small>
      </div>
      <button className="flat-button" disabled={moving || overview.disks.length < 2} onClick={() => { setMoveOpen((open) => !open); setTarget(others.find((disk) => disk.root !== home.root)?.root ?? ""); }} title={overview.disks.length < 2 ? "Só há um disco neste computador" : "Levar os modelos para outro disco sem baixar de novo"}>
        <ArrowRightLeft size={14} />Mover para outro disco
      </button>
    </div>}
    {moveOpen && <div className="storage-move" role="group" aria-label="Mover modelos para outro disco">
      <div className="storage-move-head"><strong>Mover modelos para outro disco</strong><button className="icon-button" aria-label="Fechar" onClick={() => setMoveOpen(false)}><X size={14} /></button></div>
      <div className="storage-targets">{overview.disks.map((disk) => <button key={disk.root} className={target === disk.root ? "active" : ""} onClick={() => setTarget(disk.root)}>
        <HardDrive size={15} /><span><b>{diskName(disk)}</b><small>{formatBytes(disk.freeBytes)} livres</small></span>
        <i><em style={{ width: `${((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100}%` }} /></i>
      </button>)}</div>
      <label className="storage-group"><input type="checkbox" checked={groups.text} onChange={(event) => setGroups((value) => ({ ...value, text: event.target.checked }))} /><span>Modelos de texto (Ollama) · {formatBytes(overview.textModels.bytes)}{overview.textModels.root === target ? " · já estão neste disco" : ""}</span></label>
      <label className="storage-group"><input type="checkbox" checked={groups.app} onChange={(event) => setGroups((value) => ({ ...value, app: event.target.checked }))} /><span>Modelos de imagem e voz · {formatBytes(overview.appModels.bytes)}{overview.appModels.root === target ? " · já estão neste disco" : ""}</span></label>
      <p className="storage-note">Os arquivos são copiados para <code>{target}Open Assistant</code> e apagados do disco atual. O Ollama é reiniciado; nada precisa ser baixado de novo.</p>
      {targetDisk && needed > targetDisk.freeBytes && <p className="settings-message">Não cabe: precisa de {formatBytes(needed)}.</p>}
      <div className="storage-move-actions">
        <button className="primary-button" disabled={!target || needed === 0 || (targetDisk ? needed > targetDisk.freeBytes : true)} onClick={() => void startMove()}><ArrowRightLeft size={14} />Mover {needed ? formatBytes(needed) : ""}</button>
        <button className="flat-button" onClick={() => setMoveOpen(false)}>Cancelar</button>
      </div>
    </div>}
    {progress && progress.state !== "completed" && <div className={`pull-progress ${progress.state}`} aria-live="polite">
      <div className="pull-progress-head"><strong>{progress.state === "running" && <LoaderCircle size={12} className="spin" />} {progress.phase}</strong><span>{progress.totalBytes ? `${Math.round((progress.copiedBytes / progress.totalBytes) * 100)}%` : ""}</span></div>
      <div className="pull-bar"><i style={{ width: `${progress.totalBytes ? (progress.copiedBytes / progress.totalBytes) * 100 : 0}%` }} /></div>
      {progress.error ? <small>{progress.error}</small> : <small>{formatBytes(progress.copiedBytes)} de {formatBytes(progress.totalBytes)}</small>}
    </div>}
    {progress?.state === "completed" && <p className="settings-message">Modelos movidos. Tudo continua funcionando no novo disco.</p>}
    {error && <p className="settings-message">{error}</p>}
  </div>;
}
