//! Tela "Arquivos": a árvore de pastas do projeto como no Explorer do VS Code (pastas primeiro, ordem
//! alfabética, carregando cada pasta ao abrir), a prévia do arquivo e as marcas do git (M/U/D).

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Prévia até 1 MB (arquivos maiores mostram só o começo).
const PREVIEW_BYTES: usize = 1024 * 1024;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// ms desde 1970.
    pub modified: u64,
    /// Atalho de pasta (junção/link): mostrado com seta, como no VS Code.
    pub link: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsPreview {
    pub path: String,
    pub size: u64,
    /// `None` = binário (imagem, exe…).
    pub text: Option<String>,
    pub truncated: bool,
}

/// Conteúdo de uma pasta: pastas primeiro, depois arquivos, sem diferenciar maiúsculas (igual ao VS Code).
pub fn list(dir: &Path) -> Result<Vec<FsEntry>, String> {
    let entries = fs::read_dir(dir).map_err(|error| format!("Não consegui abrir {}: {error}", dir.display()))?;
    let mut list: Vec<FsEntry> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            // Lixo de sistema que o VS Code também esconde.
            if matches!(name.as_str(), ".git" | "desktop.ini" | "Thumbs.db" | "$RECYCLE.BIN") {
                return None;
            }
            let link = entry.file_type().map(|kind| kind.is_symlink()).unwrap_or(false);
            let meta = fs::metadata(entry.path()).ok()?;
            Some(FsEntry {
                name,
                path: entry.path().to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified: meta.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|time| time.as_millis() as u64).unwrap_or(0),
                link,
            })
        })
        .collect();
    list.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(list)
}

pub fn preview(path: &Path) -> Result<FsPreview, String> {
    let meta = fs::metadata(path).map_err(|error| format!("Não consegui ler {}: {error}", path.display()))?;
    let bytes = fs::read(path).map_err(|error| format!("Não consegui ler {}: {error}", path.display()))?;
    let truncated = bytes.len() > PREVIEW_BYTES;
    let head = &bytes[..bytes.len().min(PREVIEW_BYTES)];
    // Binário: tem byte zero no começo.
    let binary = head.iter().take(8000).any(|byte| *byte == 0);
    let text = if binary { None } else { Some(String::from_utf8_lossy(head).into_owned()) };
    Ok(FsPreview { path: path.to_string_lossy().into_owned(), size: meta.len(), text, truncated })
}

/// Marcas do git por caminho absoluto: "M" alterado, "U" novo (não rastreado), "A" adicionado, "D" apagado.
/// Pastas com algo alterado dentro recebem "•". Sem git ou fora de um repositório: vazio.
pub fn git_status(root: &Path) -> HashMap<String, String> {
    let mut marks = HashMap::new();
    let Ok(output) = Command::new("git").arg("-C").arg(root).args(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).creation_flags(CREATE_NO_WINDOW).output() else { return marks };
    if !output.status.success() {
        return marks;
    }
    let top = Command::new("git").arg("-C").arg(root).args(["rev-parse", "--show-toplevel"]).creation_flags(CREATE_NO_WINDOW).output().ok().map(|output| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim().replace('/', "\\")));
    let Some(top) = top else { return marks };
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut records = text.split('\0').filter(|record| record.len() > 3);
    while let Some(record) = records.next() {
        let (code, file) = record.split_at(3);
        let mark = match code.trim() {
            "??" => "U",
            code if code.contains('D') => "D",
            code if code.starts_with('A') => "A",
            code if code.starts_with('R') => {
                records.next();
                "M"
            }
            _ => "M",
        };
        let path = top.join(file.replace('/', "\\"));
        let mut parent = path.parent();
        marks.insert(path.to_string_lossy().to_lowercase(), mark.to_string());
        while let Some(dir) = parent {
            if !dir.starts_with(&top) || dir == top.parent().unwrap_or(&top) {
                break;
            }
            marks.entry(dir.to_string_lossy().to_lowercase()).or_insert_with(|| "•".to_string());
            parent = dir.parent();
        }
    }
    marks
}

/// Janela "Escolher pasta" do Windows (IFileOpenDialog em modo pasta).
fn pick_folder_dialog(owner: Option<isize>) -> Result<Option<String>, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| -> Result<Option<String>, String> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|error| error.to_string())?;
            let options = dialog.GetOptions().map_err(|error| error.to_string())?;
            dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM).map_err(|error| error.to_string())?;
            let title: Vec<u16> = "Escolha a pasta do projeto\0".encode_utf16().collect();
            let _ = dialog.SetTitle(windows::core::PCWSTR(title.as_ptr()));
            if dialog.Show(owner.map(|hwnd| HWND(hwnd as *mut _))).is_err() {
                return Ok(None);
            }
            let item = dialog.GetResult().map_err(|error| error.to_string())?;
            let name = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(|error| error.to_string())?;
            let path = name.to_string().map_err(|error| error.to_string())?;
            CoTaskMemFree(Some(name.0 as *const _));
            Ok(Some(path))
        })();
        CoUninitialize();
        result
    }
}

// ---------------------------------------------------------------- comandos

#[tauri::command]
pub async fn fs_list(path: String) -> Result<Vec<FsEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list(&crate::workflow::expand_path(&path))).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn fs_read(path: String) -> Result<FsPreview, String> {
    tauri::async_runtime::spawn_blocking(move || preview(Path::new(&path))).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn fs_git_status(root: String) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || git_status(&crate::workflow::expand_path(&root))).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn fs_pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let owner = app.get_webview_window("main").and_then(|window| window.hwnd().ok()).map(|hwnd| hwnd.0 as isize);
    tauri::async_runtime::spawn_blocking(move || pick_folder_dialog(owner)).await.map_err(|error| error.to_string())?
}

/// Mostra o arquivo selecionado no Explorador de Arquivos.
#[tauri::command]
pub fn fs_reveal(path: String) -> Result<(), String> {
    Command::new("explorer").arg(format!("/select,{path}")).spawn().map(|_| ()).map_err(|error| error.to_string())
}

/// Abre com o programa padrão do Windows.
#[tauri::command]
pub fn fs_open(path: String) -> Result<(), String> {
    Command::new("cmd").args(["/C", "start", "", &path]).creation_flags(CREATE_NO_WINDOW).spawn().map(|_| ()).map_err(|error| error.to_string())
}

/// Pasta de dados do app (skills instaladas, conectores MCP, conexões de nuvem, logs, memória da IA).
#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path().app_local_data_dir().map(|dir| dir.to_string_lossy().into_owned()).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_folders_first_like_vs_code() {
        let dir = std::env::temp_dir().join(format!("oa-files-{}", std::process::id()));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join(".claude")).unwrap();
        fs::write(dir.join("README.md"), "# oi").unwrap();
        fs::write(dir.join("app.exe"), [0u8, 1, 2]).unwrap();
        fs::write(dir.join("desktop.ini"), "x").unwrap();
        let names: Vec<String> = list(&dir).unwrap().into_iter().map(|entry| entry.name).collect();
        assert_eq!(names, vec![".claude", "src", "app.exe", "README.md"]);
        assert!(preview(&dir.join("app.exe")).unwrap().text.is_none());
        assert_eq!(preview(&dir.join("README.md")).unwrap().text.as_deref(), Some("# oi"));
        let _ = fs::remove_dir_all(dir);
    }
}
