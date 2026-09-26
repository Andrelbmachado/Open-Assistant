import { invoke } from "@tauri-apps/api/core";

/**
 * Arquivos que a IA alterou numa tarefa (`changes.rs`): aparecem no fim da resposta num cartão como o
 * do Claude Code — "Editou N arquivos · Desfazer · +X −Y", uma linha por arquivo e, ao abrir a seta,
 * o primeiro trecho alterado daquele arquivo.
 */

export interface DiffLine {
  /** "+", "-" ou " ". */
  kind: "+" | "-" | " ";
  old?: number | null;
  new?: number | null;
  text: string;
}

export interface FileChange {
  path: string;
  name: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  /** Primeiro trecho alterado, com 3 linhas de contexto. */
  hunk: DiffLine[];
  truncated: boolean;
}

export interface ChangeSet {
  task: string;
  files: FileChange[];
  additions: number;
  deletions: number;
  undone: boolean;
}

export interface UndoResult {
  restored: number;
  skipped: string[];
  errors: string[];
}

/** Arquivos que o cartão mostra antes do "Mostrar mais N". */
export const VISIBLE_FILES = 3;

/** "Editou 3 arquivos", "Criou 1 arquivo", "Alterou 2 arquivos" (criou + editou + apagou). */
export function changesTitle(files: Pick<FileChange, "status">[]): string {
  const count = files.length;
  const noun = count === 1 ? "arquivo" : "arquivos";
  const kinds = new Set(files.map((file) => file.status));
  const verb = kinds.size > 1 ? "Alterou" : kinds.has("added") ? "Criou" : kinds.has("deleted") ? "Apagou" : "Editou";
  return `${verb} ${count} ${noun}`;
}

/** Pasta curta para mostrar ao lado do nome ("…\projeto\src"), sem o nome do arquivo. */
export function shortFolder(path: string, keep = 2): string {
  const parts = path.replace(/\//g, "\\").split("\\").filter(Boolean);
  parts.pop();
  if (parts.length <= keep) return parts.join("\\");
  return `…\\${parts.slice(-keep).join("\\")}`;
}

/** Linguagem pelo nome do arquivo (só para o rótulo do trecho). */
export function languageOf(name: string): string {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const known: Record<string, string> = { ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", rs: "Rust", py: "Python", css: "CSS", html: "HTML", json: "JSON", md: "Markdown", ps1: "PowerShell", cs: "C#", java: "Java", go: "Go", cpp: "C++", c: "C", yml: "YAML", yaml: "YAML", toml: "TOML", sql: "SQL", sh: "Shell", bat: "Batch", txt: "Texto" };
  return known[extension] ?? extension.toUpperCase();
}

/** Busca o que a IA mudou nesta tarefa (vazio se não mexeu em arquivos). Nunca falha a resposta. */
export async function fetchChanges(task: string): Promise<ChangeSet | undefined> {
  try {
    const set = await invoke<ChangeSet>("changes_summary", { task });
    return set.files.length ? set : undefined;
  } catch {
    return undefined;
  }
}

export function undoChanges(task: string): Promise<UndoResult> {
  return invoke<UndoResult>("changes_undo", { task });
}

/** Frase depois do "Desfazer". */
export function undoSummary(result: UndoResult): string {
  const parts = [`${result.restored} ${result.restored === 1 ? "arquivo voltou" : "arquivos voltaram"} ao que era`];
  if (result.skipped.length) parts.push(`${result.skipped.length} ficou como está (você mudou depois)`);
  if (result.errors.length) parts.push(`${result.errors.length} com erro`);
  return parts.join(" · ");
}
