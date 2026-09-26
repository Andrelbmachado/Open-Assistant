import { useState } from "react";
import { ChevronRight, CodeXml, FileDiff, FileMinus2, FilePlus2, Undo2 } from "lucide-react";
import { changesTitle, languageOf, shortFolder, undoChanges, VISIBLE_FILES, type ChangeSet, type FileChange, type UndoResult } from "../utils/fileChanges";

interface FileChangesCardProps {
  changes: ChangeSet;
  /** Resultado do "Desfazer" (a mensagem guarda que foi desfeito). */
  onUndone: (result: UndoResult) => void;
  note?: string;
}

/**
 * Fim da resposta do agente: os arquivos que a IA alterou, como no Claude Code. Cabeçalho com
 * "Editou N arquivos · Desfazer · +X −Y"; uma linha por arquivo com +/−; a seta de cada arquivo abre
 * o trecho exato que mudou (o primeiro, se mudou em vários lugares).
 */
export function FileChangesCard({ changes, onUndone, note }: FileChangesCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | undefined>();
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const files = showAll ? changes.files : changes.files.slice(0, VISIBLE_FILES);
  const hidden = changes.files.length - files.length;

  async function undo() {
    setUndoing(true);
    setError(undefined);
    try {
      onUndone(await undoChanges(changes.task));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setUndoing(false);
    }
  }

  return <section className={`file-changes ${changes.undone ? "undone" : ""}`} aria-label={changesTitle(changes.files)}>
    <header className="file-changes-head">
      <button className="file-changes-toggle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        <FileDiff size={15} />
        <strong>{changesTitle(changes.files)}</strong>
      </button>
      {changes.undone
        ? <span className="file-changes-undone">Desfeito</span>
        : <button className="file-changes-undo" onClick={() => void undo()} disabled={undoing} title="Volta os arquivos ao que eram antes desta resposta (o que a IA criou vai para a Lixeira)" aria-label="Desfazer"><Undo2 size={13} /><span>{undoing ? "Desfazendo…" : "Desfazer"}</span></button>}
      <Stat additions={changes.additions} deletions={changes.deletions} />
      <button className={`file-changes-chevron ${collapsed ? "" : "open"}`} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Mostrar arquivos" : "Esconder arquivos"}><ChevronRight size={15} /></button>
    </header>
    {(note || error) && <p className={`file-changes-note ${error ? "error" : ""}`}>{error ?? note}</p>}
    {!collapsed && <ul className="file-changes-list">
      {files.map((file) => <FileRow key={file.path} file={file} open={open === file.path} onToggle={() => setOpen((value) => value === file.path ? undefined : file.path)} />)}
      {hidden > 0 && <li><button className="file-changes-more" onClick={() => setShowAll(true)}>Mostrar mais {hidden}<ChevronRight size={14} /></button></li>}
    </ul>}
  </section>;
}

function Stat({ additions, deletions }: { additions: number; deletions: number }) {
  return <span className="file-changes-stat"><span className="add">+{additions}</span><span className="del">-{deletions}</span></span>;
}

function FileRow({ file, open, onToggle }: { file: FileChange; open: boolean; onToggle: () => void }) {
  const Icon = file.status === "added" ? FilePlus2 : file.status === "deleted" ? FileMinus2 : CodeXml;
  const folder = shortFolder(file.path);
  return <li className={`file-change ${open ? "open" : ""}`}>
    <button className="file-change-row" onClick={onToggle} aria-expanded={open} title={file.path}>
      <Icon size={14} className={`file-change-icon ${file.status}`} />
      <span className="file-change-name">{file.name}</span>
      {folder && <span className="file-change-folder">{folder}</span>}
      {file.status !== "modified" && <span className={`file-change-badge ${file.status}`}>{file.status === "added" ? "novo" : "apagado"}</span>}
      <Stat additions={file.additions} deletions={file.deletions} />
      <ChevronRight size={15} className="file-change-chevron" />
    </button>
    {open && <Hunk file={file} />}
  </li>;
}

/** O trecho alterado: números de linha, − em vermelho, + em verde, 3 linhas de contexto. */
function Hunk({ file }: { file: FileChange }) {
  return <div className="file-change-hunk">
    <div className="file-change-hunk-head">
      <span>{languageOf(file.name)}</span>
      <span>{hunkRange(file)}{file.additions + file.deletions > countChanged(file.hunk) ? " · primeira de várias alterações" : ""}</span>
    </div>
    <pre>{file.hunk.map((line, index) => <div key={index} className={`diff-line ${line.kind === "+" ? "add" : line.kind === "-" ? "del" : ""}`}>
      <span className="diff-num">{line.kind === "-" ? line.old ?? "" : line.new ?? line.old ?? ""}</span>
      <span className="diff-sign">{line.kind === " " ? "" : line.kind}</span>
      <code>{line.text || " "}</code>
    </div>)}{file.truncated && <div className="diff-line more"><span className="diff-num" /><span className="diff-sign" /><code>…</code></div>}</pre>
  </div>;
}

function countChanged(lines: FileChange["hunk"]): number {
  return lines.filter((line) => line.kind !== " ").length;
}

function hunkRange(file: FileChange): string {
  const numbers = file.hunk.map((line) => line.new ?? line.old).filter((value): value is number => typeof value === "number");
  if (!numbers.length) return "";
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  return first === last ? `linha ${first}` : `linhas ${first}–${last}`;
}
