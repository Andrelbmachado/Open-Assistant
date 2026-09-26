import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ChevronRight, ChevronsDownUp, Copy, Database, ExternalLink, File, FileArchive, FileCode2, FileImage, FileJson, FileLock2, FileTerminal, FileText, Folder, FolderCog, FolderOpen, FolderSearch, GitBranch, LoaderCircle, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { projectPath, useStore } from "../store/store";
import { fileIcon, formatSize, gitMarkColor, type FileIconKind } from "../utils/fileIcons";
import { isQAOffline } from "../utils/qaMode";
import { Dropdown } from "./Dropdown";
import { PageHeader } from "./PageHeader";

interface FsEntry { name: string; path: string; isDir: boolean; size: number; modified: number; link: boolean; virtual?: boolean }
interface FsPreview { path: string; size: number; text: string | null; truncated: boolean }
type Listing = FsEntry[] | { error: string } | "loading";

const KIND_ICON: Record<FileIconKind, typeof File> = {
  code: FileCode2, json: FileJson, text: FileText, markdown: FileText, image: FileImage, archive: FileArchive, config: Settings2,
  script: FileTerminal, binary: File, lock: FileLock2, git: GitBranch, html: FileCode2, style: FileCode2,
};

/** Linha visível da árvore (a árvore é "achatada" na ordem em que aparece). */
interface Row { entry: FsEntry; depth: number }

/**
 * Tela Arquivos: a pasta do projeto selecionado em árvore, igual ao Explorer do VS Code — da pasta raiz
 * até o último arquivo, pastas primeiro, com setas, guias de recuo, ícone por linguagem e marcas do git.
 * O projeto do próprio app mostra também "Dados do app" (skills instaladas, conectores MCP, conexões de
 * nuvem, logs). Clicar num arquivo mostra o conteúdo ao lado.
 */
export function FilesView() {
  const { state, dispatch } = useStore();
  const project = state.projects.find((item) => item.id === state.filesProjectId) ?? state.projects[0];
  const root = projectPath(project);
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<FsPreview | { error: string } | "loading">();
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [appData, setAppData] = useState<string>();
  const [rootOpen, setRootOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (path: string) => {
    if (isQAOffline()) return;
    setListings((current) => ({ ...current, [path]: "loading" }));
    try {
      const entries = await invoke<FsEntry[]>("fs_list", { path });
      setListings((current) => ({ ...current, [path]: entries }));
    } catch (error) {
      setListings((current) => ({ ...current, [path]: { error: String(error) } }));
    }
  }, []);

  const refresh = useCallback(() => {
    if (!root || isQAOffline()) return;
    void load(root);
    expanded.forEach((path) => void load(path));
    void invoke<Record<string, string>>("fs_git_status", { root }).then(setMarks).catch(() => setMarks({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, load, expanded]);

  // Trocou de projeto: começa do zero, com a raiz aberta.
  useEffect(() => {
    setListings({}); setExpanded(new Set()); setSelected(undefined); setPreview(undefined); setRootOpen(true);
    if (!root || isQAOffline()) return;
    void load(root);
    void invoke<Record<string, string>>("fs_git_status", { root }).then(setMarks).catch(() => setMarks({}));
    if (project?.id === "open-assistant") void invoke<string>("app_data_dir").then(setAppData).catch(() => undefined);
  }, [root, project?.id, load]);

  const rootChildren = useMemo(() => {
    const listing = root ? listings[root] : undefined;
    if (!Array.isArray(listing)) return listing;
    // Projeto do app: os dados que ficam fora da pasta (skills instaladas, MCP, nuvem, logs) aparecem junto.
    return appData ? [...listing, { name: "Dados do app", path: appData, isDir: true, size: 0, modified: 0, link: false, virtual: true }] : listing;
  }, [root, listings, appData]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (entries: FsEntry[], depth: number) => {
      for (const entry of entries) {
        out.push({ entry, depth });
        const children = listings[entry.path];
        if (entry.isDir && expanded.has(entry.path) && Array.isArray(children)) walk(children, depth + 1);
      }
    };
    if (rootOpen && Array.isArray(rootChildren)) walk(rootChildren, 0);
    return out;
  }, [rootChildren, listings, expanded, rootOpen]);

  function toggle(entry: FsEntry) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) next.delete(entry.path);
      else { next.add(entry.path); if (!listings[entry.path] || !Array.isArray(listings[entry.path])) void load(entry.path); }
      return next;
    });
  }

  async function open(entry: FsEntry) {
    setSelected(entry.path);
    if (entry.isDir) { toggle(entry); return; }
    setPreview("loading");
    try { setPreview(await invoke<FsPreview>("fs_read", { path: entry.path })); }
    catch (error) { setPreview({ error: String(error) }); }
  }

  function onKey(event: KeyboardEvent) {
    const index = rows.findIndex((row) => row.entry.path === selected);
    const row = rows[index];
    if (event.key === "ArrowDown") { event.preventDefault(); const next = rows[Math.min(rows.length - 1, index + 1)]; if (next) setSelected(next.entry.path); }
    else if (event.key === "ArrowUp") { event.preventDefault(); const next = rows[Math.max(0, index - 1)]; if (next) setSelected(next.entry.path); }
    else if (event.key === "ArrowRight" && row?.entry.isDir && !expanded.has(row.entry.path)) { event.preventDefault(); toggle(row.entry); }
    else if (event.key === "ArrowLeft" && row?.entry.isDir && expanded.has(row.entry.path)) { event.preventDefault(); toggle(row.entry); }
    else if (event.key === "Enter" && row) { event.preventDefault(); void open(row.entry); }
  }

  async function chooseFolder() {
    const path = await invoke<string | null>("fs_pick_folder").catch(() => null);
    if (path && project) dispatch({ type: "setProjectPath", projectId: project.id, path });
  }

  const markOf = (path: string) => marks[path.toLowerCase()];
  const rootName = root ? root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? root : "";
  const previewing = selected && preview && !rows.find((row) => row.entry.path === selected)?.entry.isDir;

  return <section className={`view page-view files-view ${previewing ? "previewing" : ""}`}>
    <PageHeader eyebrow="Projeto" title="Arquivos" icon={<FolderOpen size={17} />}>
      <Dropdown ariaLabel="Projeto" value={project?.id ?? ""} onChange={(projectId) => dispatch({ type: "openProjectFiles", projectId })}
        options={state.projects.map((item) => ({ value: item.id, label: item.name, description: projectPath(item) ?? "sem pasta", icon: <Folder size={14} /> }))} />
    </PageHeader>
    {!root
      ? <div className="page-empty"><FolderSearch size={28} /><h3>{project?.name ?? "Projeto"} ainda não tem pasta</h3><p>Escolha a pasta do PC que tem os arquivos deste projeto.</p><button className="primary-button" onClick={() => void chooseFolder()}><FolderCog size={14} />Escolher pasta</button></div>
      : <div className="files-layout">
        <aside className="files-tree" tabIndex={0} onKeyDown={onKey} aria-label="Arquivos do projeto">
          <div className="files-tree-head">
            <span>Explorer</span>
            <div>
              <button onClick={() => void chooseFolder()} title="Trocar a pasta do projeto" aria-label="Trocar a pasta do projeto"><FolderCog size={14} /></button>
              <button onClick={refresh} title="Atualizar" aria-label="Atualizar"><RefreshCw size={14} /></button>
              <button onClick={() => setExpanded(new Set())} title="Recolher pastas" aria-label="Recolher pastas"><ChevronsDownUp size={14} /></button>
              <button onClick={() => void invoke("fs_open", { path: root })} title="Abrir no Explorador de Arquivos" aria-label="Abrir no Explorador de Arquivos"><ExternalLink size={14} /></button>
            </div>
          </div>
          <button className={`files-root ${rootOpen ? "open" : ""}`} onClick={() => setRootOpen((value) => !value)} title={root}><ChevronRight size={14} className="files-chevron" /><span>{rootName}</span></button>
          <div className="files-rows" role="tree">
            {rootChildren === "loading" && <p className="files-note"><LoaderCircle size={13} className="spin" />Lendo a pasta…</p>}
            {rootChildren && !Array.isArray(rootChildren) && rootChildren !== "loading" && <p className="files-note error">{rootChildren.error}</p>}
            {rows.map(({ entry, depth }) => {
              const icon = fileIcon(entry.name);
              const Icon = entry.isDir ? entry.virtual ? Database : expanded.has(entry.path) ? FolderOpen : Folder : KIND_ICON[icon.kind];
              const mark = markOf(entry.path);
              const listing = listings[entry.path];
              return <button key={entry.path} role="treeitem" aria-expanded={entry.isDir ? expanded.has(entry.path) : undefined} aria-selected={selected === entry.path}
                className={`files-row ${selected === entry.path ? "selected" : ""} ${entry.virtual ? "virtual" : ""} ${entry.name.startsWith(".") || entry.name.startsWith("_") ? "dim" : ""}`}
                style={{ paddingLeft: 10 + depth * 14 }} onClick={() => void open(entry)} onDoubleClick={() => { if (!entry.isDir) void invoke("fs_open", { path: entry.path }); }}
                title={entry.virtual ? `${entry.path}\nSkills instaladas, conectores MCP, conexões de nuvem, memória da IA e logs` : entry.path}>
                {Array.from({ length: depth }, (_, level) => <i key={level} className="files-guide" style={{ left: 17 + level * 14 }} />)}
                {entry.isDir ? listing === "loading" ? <LoaderCircle size={13} className="files-chevron spin" /> : <ChevronRight size={14} className={`files-chevron ${expanded.has(entry.path) ? "open" : ""}`} /> : <span className="files-chevron" />}
                <Icon size={15} className="files-icon" style={entry.isDir ? undefined : { color: icon.color }} />
                <span className="files-name" style={mark && mark !== "•" ? { color: gitMarkColor(mark) } : undefined}>{entry.name}</span>
                {entry.virtual && <span className="files-badge">app</span>}
                {entry.link && <span className="files-badge">atalho</span>}
                {mark && <span className={`files-mark ${mark === "•" ? "dot" : ""}`} style={{ color: gitMarkColor(mark) }}>{mark === "•" ? "" : mark}</span>}
              </button>;
            })}
          </div>
        </aside>
        <main className="files-preview">
          {!selected || !previewing
            ? <div className="page-empty compact"><FileText size={24} /><p>Escolha um arquivo para ver o conteúdo.</p><small>Duplo clique abre no programa padrão do Windows.</small></div>
            : preview === "loading"
              ? <div className="page-empty compact"><LoaderCircle size={20} className="spin" /></div>
              : preview && "error" in preview
                ? <div className="page-empty compact error"><p>{preview.error}</p></div>
                : preview && <>
                  <div className="files-preview-head">
                    <button className="files-back" onClick={() => setSelected(undefined)} aria-label="Voltar para a árvore"><ArrowLeft size={14} /></button>
                    <span className="files-crumb" title={preview.path}>{preview.path.slice(root.length > 2 ? 0 : 0).split(/[\\/]/).slice(-3).join(" › ")}</span>
                    <small>{formatSize(preview.size)}{preview.text !== null ? ` · ${preview.text.split("\n").length} linhas` : ""}</small>
                    <button onClick={() => { void navigator.clipboard.writeText(preview.path); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copiar caminho"><Copy size={13} />{copied ? "Copiado" : "Caminho"}</button>
                    <button onClick={() => void invoke("fs_reveal", { path: preview.path })} title="Mostrar no Explorador de Arquivos"><FolderOpen size={13} />Mostrar</button>
                    <button onClick={() => void invoke("fs_open", { path: preview.path })} title="Abrir no programa padrão"><ExternalLink size={13} />Abrir</button>
                  </div>
                  {preview.text === null
                    ? <div className="page-empty compact"><File size={24} /><p>{fileIcon(preview.path).label}: arquivo binário.</p><button className="flat-button" onClick={() => void invoke("fs_open", { path: preview.path })}><ExternalLink size={13} />Abrir no Windows</button></div>
                    : <pre className="files-code">{preview.text.split("\n").map((line, index) => <div key={index}><span>{index + 1}</span><code>{line || " "}</code></div>)}{preview.truncated && <div className="more"><span /><code>… (arquivo grande: mostrando o primeiro 1 MB)</code></div>}</pre>}
                </>}
        </main>
      </div>}
  </section>;
}
