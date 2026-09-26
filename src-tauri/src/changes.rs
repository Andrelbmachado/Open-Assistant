//! Arquivos que a IA altera numa tarefa, como no Claude Code: antes da primeira mudança em cada arquivo
//! o app guarda o conteúdo original; no fim da tarefa compara com o que está no disco (diff por linha,
//! +/−, primeiro trecho alterado) e deixa **desfazer** tudo. O registro fica em disco
//! (`%LOCALAPPDATA%\com.openassistant.windows\alteracoes\<tarefa>.json`), então o "Desfazer" funciona
//! mesmo depois de reabrir o app.
//!
//! As ferramentas do agente `read_file`, `write_file` e `edit_file` passam por aqui. Se depois a IA
//! mexer no mesmo arquivo pelo PowerShell, o diff do fim também mostra (ele compara com o disco).

use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Maior arquivo de texto que a IA lê/edita (e cujo original o app guarda).
const MAX_TEXT_BYTES: usize = 2 * 1024 * 1024;
/// Linhas do trecho mostrado ao abrir um arquivo no cartão.
const MAX_HUNK_LINES: usize = 120;
/// Registros de tarefas mantidos em disco (os mais antigos saem).
const MAX_TASKS: usize = 200;

/// Um registro por vez (várias ferramentas podem terminar juntas).
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Tracked {
    path: String,
    /// `None` = o arquivo não existia (a IA criou).
    original: Option<String>,
    /// Impressão do conteúdo que a IA deixou (para não desfazer por cima de uma edição sua).
    #[serde(default)]
    after: Option<u64>,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
struct TaskLog {
    files: Vec<Tracked>,
    #[serde(default)]
    undone: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// "+", "-" ou " ".
    pub kind: String,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub name: String,
    /// "added", "modified" ou "deleted".
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    /// Primeiro trecho alterado (com 3 linhas de contexto), como no Claude Code.
    pub hunk: Vec<DiffLine>,
    /// O trecho foi cortado em `MAX_HUNK_LINES`.
    pub truncated: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    pub task: String,
    pub files: Vec<FileChange>,
    pub additions: u32,
    pub deletions: u32,
    pub undone: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    pub restored: u32,
    /// Arquivos que você mudou depois da IA: ficam como estão.
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------- caminhos

/// Caminho absoluto a partir do que a IA mandou (`~`, `%USERPROFILE%`, relativo = pasta do usuário).
pub fn resolve(raw: &str) -> Result<PathBuf, String> {
    if raw.trim().is_empty() {
        return Err("Informe o caminho do arquivo (path).".into());
    }
    let path = crate::workflow::expand_path(raw);
    let path = if path.is_absolute() { path } else { PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join(path) };
    Ok(path)
}

/// Pastas do sistema que a IA não pode alterar.
pub fn protected(path: &Path) -> Option<&'static str> {
    let text = path.to_string_lossy().to_lowercase().replace('/', "\\");
    let windows = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()).to_lowercase();
    let blocked = [
        (windows.as_str(), "na pasta do Windows"),
        ("c:\\program files", "em Arquivos de Programas"),
        ("c:\\programdata", "em ProgramData"),
    ];
    blocked.iter().find(|(prefix, _)| text.starts_with(prefix)).map(|(_, label)| *label)
}

fn read_text(path: &Path) -> Result<Option<String>, String> {
    match fs::read(path) {
        Ok(bytes) if bytes.len() > MAX_TEXT_BYTES => Err(format!("{} passa de 2 MB; edite por outro caminho.", path.display())),
        Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| format!("{} não é um arquivo de texto (UTF-8).", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Não consegui ler {}: {error}", path.display())),
    }
}

/// FNV-1a de 64 bits: estável entre versões do app (o `DefaultHasher` do Rust não é).
fn fingerprint(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ byte as u64).wrapping_mul(0x0100_0000_01b3))
}

fn same_path(a: &str, b: &Path) -> bool {
    a.eq_ignore_ascii_case(&b.to_string_lossy())
}

// ---------------------------------------------------------------- registro em disco

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("alteracoes");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn log_path(app: &AppHandle, task: &str) -> Result<PathBuf, String> {
    let safe: String = task.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(80).collect();
    if safe.is_empty() {
        return Err("tarefa sem id".into());
    }
    Ok(log_dir(app)?.join(format!("{safe}.json")))
}

fn load(app: &AppHandle, task: &str) -> Result<TaskLog, String> {
    let path = log_path(app, task)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|error| error.to_string()),
        Err(_) => Ok(TaskLog::default()),
    }
}

fn save(app: &AppHandle, task: &str, log: &TaskLog) -> Result<(), String> {
    let path = log_path(app, task)?;
    let is_new = !path.exists();
    fs::write(&path, serde_json::to_string(log).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    if is_new {
        prune(&log_dir(app)?);
    }
    Ok(())
}

fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut logs: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    if logs.len() <= MAX_TASKS {
        return;
    }
    logs.sort();
    for (_, path) in logs.iter().take(logs.len() - MAX_TASKS) {
        let _ = fs::remove_file(path);
    }
}

/// Guarda o original do arquivo antes da primeira mudança nesta tarefa.
fn track(app: &AppHandle, task: &str, path: &Path, original: &Option<String>) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|error| error.to_string())?;
    let mut log = load(app, task)?;
    if log.files.iter().any(|file| same_path(&file.path, path)) {
        return Ok(());
    }
    log.files.push(Tracked { path: path.to_string_lossy().into_owned(), original: original.clone(), after: None });
    log.undone = false;
    save(app, task, &log)
}

// ---------------------------------------------------------------- ferramentas do agente

/// `read_file`: texto com números de linha (a IA usa para achar o trecho exato antes de editar).
pub fn read_file(raw: &str, offset: Option<usize>, limit: Option<usize>) -> Result<String, String> {
    let path = resolve(raw)?;
    let text = read_text(&path)?.ok_or_else(|| format!("{} não existe.", path.display()))?;
    let start = offset.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(400).clamp(1, 2000);
    let lines: Vec<&str> = text.lines().collect();
    let shown: Vec<String> = lines.iter().enumerate().skip(start - 1).take(limit).map(|(index, line)| format!("{:>5}\t{line}", index + 1)).collect();
    let rest = lines.len().saturating_sub(start - 1 + shown.len());
    let tail = if rest > 0 { format!("\n… mais {rest} linhas (use offset={}).", start + shown.len()) } else { String::new() };
    Ok(format!("{} ({} linhas)\n{}{tail}", path.display(), lines.len(), shown.join("\n")))
}

/// `write_file`: cria ou reescreve o arquivo inteiro.
pub fn write_file(app: &AppHandle, task: &str, raw: &str, content: &str) -> Result<String, String> {
    let path = resolve(raw)?;
    if let Some(label) = protected(&path) {
        return Err(format!("Não altero arquivos {label}."));
    }
    let original = read_text(&path)?;
    track(app, task, &path, &original)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Não consegui criar a pasta {}: {error}", parent.display()))?;
    }
    fs::write(&path, content).map_err(|error| format!("Não consegui salvar {}: {error}", path.display()))?;
    let lines = content.lines().count();
    Ok(match original {
        None => format!("Criei {} ({lines} linhas).", path.display()),
        Some(_) => format!("Reescrevi {} ({lines} linhas).", path.display()),
    })
}

/// `edit_file`: troca um trecho exato por outro (o trecho precisa ser único, ou `replace_all`).
pub fn edit_file(app: &AppHandle, task: &str, raw: &str, old_text: &str, new_text: &str, replace_all: bool) -> Result<String, String> {
    let path = resolve(raw)?;
    if let Some(label) = protected(&path) {
        return Err(format!("Não altero arquivos {label}."));
    }
    if old_text.is_empty() {
        return Err("old_text vazio: para criar ou reescrever o arquivo use write_file.".into());
    }
    let original = read_text(&path)?.ok_or_else(|| format!("{} não existe (para criar use write_file).", path.display()))?;
    // Arquivos do Windows costumam ter \r\n; a IA quase sempre manda \n.
    let crlf = original.contains("\r\n");
    let (old_text, new_text) = if crlf && !old_text.contains("\r\n") {
        (old_text.replace('\n', "\r\n"), new_text.replace('\n', "\r\n"))
    } else {
        (old_text.to_string(), new_text.to_string())
    };
    let count = original.matches(&old_text).count();
    if count == 0 {
        return Err(format!("Não achei o trecho em {}. Leia o arquivo com read_file e copie o trecho exato (com os espaços).", path.display()));
    }
    if count > 1 && !replace_all {
        return Err(format!("O trecho aparece {count} vezes em {}. Inclua mais linhas ao redor para ficar único, ou use replace_all=true.", path.display()));
    }
    let updated = if replace_all { original.replace(&old_text, &new_text) } else { original.replacen(&old_text, &new_text, 1) };
    track(app, task, &path, &Some(original.clone()))?;
    fs::write(&path, &updated).map_err(|error| format!("Não consegui salvar {}: {error}", path.display()))?;
    let (additions, deletions) = count_lines(&original, &updated);
    Ok(format!("Editei {} ({} troca{}: +{additions} −{deletions} linhas).", path.display(), if replace_all { count } else { 1 }, if replace_all && count > 1 { "s" } else { "" }))
}

// ---------------------------------------------------------------- diff

fn count_lines(old: &str, new: &str) -> (u32, u32) {
    let diff = TextDiff::from_lines(old, new);
    diff.iter_all_changes().fold((0, 0), |(add, del), change| match change.tag() {
        ChangeTag::Insert => (add + 1, del),
        ChangeTag::Delete => (add, del + 1),
        ChangeTag::Equal => (add, del),
    })
}

/// +/− e o primeiro trecho alterado de `old` → `new`.
pub fn diff_file(path: &str, old: Option<&str>, new: Option<&str>) -> Option<FileChange> {
    if old == new {
        return None;
    }
    let status = match (old, new) {
        (None, Some(_)) => "added",
        (Some(_), None) => "deleted",
        _ => "modified",
    };
    let (old, new) = (old.unwrap_or_default(), new.unwrap_or_default());
    let diff = TextDiff::from_lines(old, new);
    let (additions, deletions) = count_lines(old, new);
    let mut hunk = Vec::new();
    let mut truncated = false;
    if let Some(group) = diff.grouped_ops(3).into_iter().next() {
        'ops: for op in group {
            for change in diff.iter_changes(&op) {
                if hunk.len() >= MAX_HUNK_LINES {
                    truncated = true;
                    break 'ops;
                }
                let kind = match change.tag() {
                    ChangeTag::Insert => "+",
                    ChangeTag::Delete => "-",
                    ChangeTag::Equal => " ",
                };
                let text = change.value().trim_end_matches(['\n', '\r']);
                let text = if text.chars().count() > 400 { format!("{}…", text.chars().take(400).collect::<String>()) } else { text.to_string() };
                hunk.push(DiffLine { kind: kind.into(), old: change.old_index().map(|index| index as u32 + 1), new: change.new_index().map(|index| index as u32 + 1), text });
            }
        }
    }
    let name = Path::new(path).file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string());
    Some(FileChange { path: path.to_string(), name, status: status.into(), additions, deletions, hunk, truncated })
}

/// Tudo o que mudou nos arquivos desta tarefa (vazio se a IA não mexeu em nada).
pub fn summary(app: &AppHandle, task: &str) -> Result<ChangeSet, String> {
    let _guard = LOCK.lock().map_err(|error| error.to_string())?;
    let mut log = load(app, task)?;
    let mut set = ChangeSet { task: task.to_string(), undone: log.undone, ..Default::default() };
    for file in &mut log.files {
        let current = read_text(Path::new(&file.path)).unwrap_or(None);
        if !log.undone {
            file.after = current.as_deref().map(fingerprint);
        }
        if let Some(change) = diff_file(&file.path, file.original.as_deref(), current.as_deref()) {
            set.additions += change.additions;
            set.deletions += change.deletions;
            set.files.push(change);
        }
    }
    if !log.files.is_empty() && !log.undone {
        save(app, task, &log)?;
    }
    Ok(set)
}

/// Desfaz a tarefa: devolve o conteúdo original e manda para a Lixeira o que a IA criou.
pub fn undo(app: &AppHandle, task: &str) -> Result<UndoResult, String> {
    let _guard = LOCK.lock().map_err(|error| error.to_string())?;
    let mut log = load(app, task)?;
    if log.undone {
        return Err("Estas alterações já foram desfeitas.".into());
    }
    let mut result = UndoResult::default();
    for file in &log.files {
        let path = Path::new(&file.path);
        let current = read_text(path).unwrap_or(None);
        if current.as_deref() == file.original.as_deref() {
            continue;
        }
        if file.after.is_some() && current.as_deref().map(fingerprint) != file.after {
            result.skipped.push(file.path.clone());
            continue;
        }
        let restored = match &file.original {
            Some(text) => fs::write(path, text).map_err(|error| error.to_string()),
            None => recycle(path),
        };
        match restored {
            Ok(()) => result.restored += 1,
            Err(error) => result.errors.push(format!("{}: {error}", file.path)),
        }
    }
    log.undone = true;
    save(app, task, &log)?;
    Ok(result)
}

/// Manda um arquivo para a Lixeira (dá para recuperar).
fn recycle(path: &Path) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE, SHFILEOPSTRUCTW};
    if !path.exists() {
        return Ok(());
    }
    // pFrom termina com dois zeros.
    let mut from: Vec<u16> = path.as_os_str().to_string_lossy().encode_utf16().collect();
    from.extend([0, 0]);
    let mut operation = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_NOERRORUI.0 | FOF_SILENT.0) as u16,
        ..Default::default()
    };
    let code = unsafe { SHFileOperationW(&mut operation) };
    if code == 0 { Ok(()) } else { Err(format!("não consegui mandar para a Lixeira (código {code})")) }
}

// ---------------------------------------------------------------- comandos

#[tauri::command]
pub async fn changes_summary(app: AppHandle, task: String) -> Result<ChangeSet, String> {
    tauri::async_runtime::spawn_blocking(move || summary(&app, &task)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn changes_undo(app: AppHandle, task: String) -> Result<UndoResult, String> {
    tauri::async_runtime::spawn_blocking(move || undo(&app, &task)).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_counts_lines_and_keeps_the_first_hunk() {
        let old = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\n";
        let new = "a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\n";
        let change = diff_file("C:\\x\\app.ts", Some(old), Some(new)).unwrap();
        assert_eq!((change.status.as_str(), change.additions, change.deletions, change.name.as_str()), ("modified", 2, 1, "app.ts"));
        // Primeiro trecho: a troca de "b" com 3 linhas de contexto, sem chegar no "n" do fim.
        let kinds: String = change.hunk.iter().map(|line| line.kind.as_str()).collect();
        assert_eq!(kinds, " -+   ");
        assert_eq!(change.hunk[1], DiffLine { kind: "-".into(), old: Some(2), new: None, text: "b".into() });
        assert_eq!(change.hunk[2], DiffLine { kind: "+".into(), old: None, new: Some(2), text: "B".into() });
    }

    #[test]
    fn created_and_deleted_files() {
        let added = diff_file("novo.md", None, Some("um\ndois\n")).unwrap();
        assert_eq!((added.status.as_str(), added.additions, added.deletions), ("added", 2, 0));
        let deleted = diff_file("velho.md", Some("um\n"), None).unwrap();
        assert_eq!((deleted.status.as_str(), deleted.additions, deleted.deletions), ("deleted", 0, 1));
        assert!(diff_file("igual.md", Some("x"), Some("x")).is_none());
    }

    #[test]
    fn system_folders_are_protected() {
        assert!(protected(Path::new("C:\\Windows\\System32\\drivers\\etc\\hosts")).is_some());
        assert!(protected(Path::new("C:\\Program Files\\App\\x.ini")).is_some());
        assert!(protected(Path::new("C:\\Users\\andre\\Desktop\\projeto\\main.py")).is_none());
    }

    #[test]
    fn read_file_numbers_lines() {
        let dir = std::env::temp_dir().join(format!("oa-changes-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.txt");
        fs::write(&file, "um\ndois\ntrês\n").unwrap();
        let text = read_file(&file.to_string_lossy(), Some(2), Some(1)).unwrap();
        assert!(text.contains("    2\tdois"), "{text}");
        assert!(text.contains("mais 1 linhas"), "{text}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn fingerprint_is_stable() {
        assert_eq!(fingerprint(""), 0xcbf2_9ce4_8422_2325);
        assert_ne!(fingerprint("a"), fingerprint("b"));
    }
}
