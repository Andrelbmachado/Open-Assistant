//! Espaço em disco e troca de disco dos modelos (Configurações › Modelos locais).
//!
//! Dois grupos de modelos podem mudar de disco sem baixar de novo:
//! - **texto (Ollama)**: a pasta `models` do Ollama; o novo lugar vai na variável de usuário
//!   `OLLAMA_MODELS` e o Ollama é reiniciado com ela;
//! - **imagem e voz (app)**: a pasta `tools` do app; o novo lugar vai em `tools-location.txt`.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

use super::tools;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const PROGRESS_EVENT: &str = "storage-progress";
const CLEANUP_FILE: &str = "tools-cleanup.txt";
static MOVING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    /// `C:\`
    root: String,
    label: String,
    total_bytes: u64,
    free_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsLocation {
    path: String,
    /// Disco onde a pasta está (`C:\`).
    root: String,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    disks: Vec<Disk>,
    text_models: ModelsLocation,
    app_models: ModelsLocation,
    moving: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MoveProgress {
    state: String,
    phase: String,
    copied_bytes: u64,
    total_bytes: u64,
    error: Option<String>,
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Discos fixos (HD/SSD) com tamanho e espaço livre.
pub fn fixed_disks() -> Vec<Disk> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW};
    const DRIVE_FIXED: u32 = 3;
    let mask = unsafe { GetLogicalDrives() };
    let mut disks = Vec::new();
    for index in 0..26u32 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let root = format!("{}:\\", (b'A' + index as u8) as char);
        let root_w = wide(&root);
        unsafe {
            if GetDriveTypeW(PCWSTR(root_w.as_ptr())) != DRIVE_FIXED {
                continue;
            }
            let (mut free, mut total) = (0u64, 0u64);
            if GetDiskFreeSpaceExW(PCWSTR(root_w.as_ptr()), Some(&mut free), Some(&mut total), None).is_err() {
                continue;
            }
            let mut name = [0u16; 261];
            let _ = GetVolumeInformationW(PCWSTR(root_w.as_ptr()), Some(&mut name), None, None, None, None);
            let label = String::from_utf16_lossy(&name).trim_end_matches('\0').to_string();
            disks.push(Disk { root, label, total_bytes: total, free_bytes: free });
        }
    }
    disks
}

fn drive_root(path: &Path) -> String {
    path.to_string_lossy().chars().take(2).collect::<String>().to_uppercase() + "\\"
}

fn user_profile() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into()))
}

/// `OLLAMA_MODELS` do usuário (registro), mesmo que este processo tenha sido aberto antes da mudança.
pub fn ollama_models_env() -> Option<String> {
    let output = Command::new("reg")
        .args(["query", "HKCU\\Environment", "/v", "OLLAMA_MODELS"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find(|line| line.contains("OLLAMA_MODELS"))
        .and_then(|line| line.split("REG_").nth(1))
        .and_then(|rest| rest.split_once(char::is_whitespace).map(|(_, value)| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var("OLLAMA_MODELS").ok().filter(|value| !value.is_empty()))
}

pub fn ollama_models_dir() -> PathBuf {
    ollama_models_env().map(PathBuf::from).unwrap_or_else(|| user_profile().join(".ollama").join("models"))
}

fn location(path: PathBuf) -> ModelsLocation {
    ModelsLocation { root: drive_root(&path), bytes: tools::folder_size(&path), path: path.to_string_lossy().to_string() }
}

/// Uma troca de disco anterior pode ter deixado arquivos em uso (DLLs de voz); apaga agora.
fn finish_pending_cleanup(app: &AppHandle) {
    let Ok(default) = tools::default_tools_root(app) else { return };
    let Some(file) = default.parent().map(|dir| dir.join(CLEANUP_FILE)) else { return };
    let Ok(old) = fs::read_to_string(&file) else { return };
    let old = PathBuf::from(old.trim());
    let current = tools::tools_root(app).unwrap_or_default();
    if old != current && (!old.exists() || fs::remove_dir_all(&old).is_ok()) {
        let _ = fs::remove_file(file);
    }
}

#[tauri::command]
pub fn storage_overview(app: AppHandle) -> Result<StorageOverview, String> {
    finish_pending_cleanup(&app);
    Ok(StorageOverview {
        disks: fixed_disks(),
        text_models: location(ollama_models_dir()),
        app_models: location(tools::tools_root(&app)?),
        moving: MOVING.load(Ordering::SeqCst),
    })
}

fn emit(app: &AppHandle, state: &str, phase: &str, copied: u64, total: u64, error: Option<String>) {
    let _ = app.emit(PROGRESS_EVENT, MoveProgress { state: state.into(), phase: phase.into(), copied_bytes: copied, total_bytes: total, error });
}

/// Copia uma pasta inteira, arquivo a arquivo, informando os bytes copiados.
pub fn copy_dir(source: &Path, target: &Path, copied: &mut u64, on_progress: &mut dyn FnMut(u64)) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("Não foi possível criar {}: {error}", target.display()))?;
    let entries = fs::read_dir(source).map_err(|error| format!("Não foi possível ler {}: {error}", source.display()))?;
    let mut buffer = vec![0u8; 4 * 1024 * 1024];
    let mut last = Instant::now();
    for entry in entries.flatten() {
        let from = entry.path();
        let to = target.join(entry.file_name());
        if from.is_dir() {
            copy_dir(&from, &to, copied, on_progress)?;
            continue;
        }
        let mut input = fs::File::open(&from).map_err(|error| format!("Não foi possível abrir {}: {error}", from.display()))?;
        let mut output = fs::File::create(&to).map_err(|error| format!("Não foi possível gravar {}: {error}", to.display()))?;
        loop {
            let read = input.read(&mut buffer).map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            output.write_all(&buffer[..read]).map_err(|error| format!("Falha ao gravar no disco de destino: {error}"))?;
            *copied += read as u64;
            if last.elapsed() >= Duration::from_millis(300) {
                on_progress(*copied);
                last = Instant::now();
            }
        }
        output.flush().map_err(|error| error.to_string())?;
    }
    on_progress(*copied);
    Ok(())
}

/// Leva `source` para `target`: no mesmo disco só renomeia; em outro, copia e depois apaga a origem.
/// Devolve `false` se sobraram arquivos em uso na origem.
fn relocate(app: &AppHandle, phase: &str, source: &Path, target: &Path, copied: &mut u64, total: u64) -> Result<bool, String> {
    if !source.exists() {
        fs::create_dir_all(target).map_err(|error| error.to_string())?;
        return Ok(true);
    }
    if target.exists() && fs::read_dir(target).map(|mut entries| entries.next().is_some()).unwrap_or(false) {
        return Err(format!("A pasta de destino {} já existe e não está vazia.", target.display()));
    }
    if drive_root(source) == drive_root(target) {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        if fs::rename(source, target).is_ok() {
            *copied += tools::folder_size(target);
            emit(app, "running", phase, *copied, total, None);
            return Ok(true);
        }
    }
    copy_dir(source, target, copied, &mut |bytes| emit(app, "running", phase, bytes, total, None))?;
    Ok(fs::remove_dir_all(source).is_ok())
}

fn kill(image: &str) {
    let _ = Command::new("taskkill").args(["/F", "/IM", image]).creation_flags(CREATE_NO_WINDOW).status();
}

fn move_text_models(app: &AppHandle, target_root: &str, copied: &mut u64, total: u64) -> Result<(), String> {
    let source = ollama_models_dir();
    let home_default = user_profile().join(".ollama").join("models");
    let target = if drive_root(&home_default) == target_root { home_default.clone() } else { PathBuf::from(target_root).join("Open Assistant").join("ollama-models") };
    if source == target {
        return Ok(());
    }
    emit(app, "running", "Parando o Ollama", *copied, total, None);
    kill("ollama app.exe");
    kill("ollama.exe");
    std::thread::sleep(Duration::from_millis(1200));
    relocate(app, "Movendo os modelos de texto (Ollama)", &source, &target, copied, total)?;
    // Variável de usuário: vale para o Ollama aberto pelo Windows no próximo login também.
    let status = if target == home_default {
        Command::new("reg").args(["delete", "HKCU\\Environment", "/v", "OLLAMA_MODELS", "/f"]).creation_flags(CREATE_NO_WINDOW).status()
    } else {
        Command::new("setx").arg("OLLAMA_MODELS").arg(&target).creation_flags(CREATE_NO_WINDOW).status()
    };
    if !status.map(|status| status.success()).unwrap_or(false) && target != home_default {
        return Err("Os modelos foram movidos, mas não consegui gravar OLLAMA_MODELS. Defina essa variável manualmente.".into());
    }
    emit(app, "running", "Reiniciando o Ollama", *copied, total, None);
    let tray = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Programs").join("Ollama").join("ollama app.exe");
    let mut command = if tray.is_file() { Command::new(tray) } else { let mut serve = Command::new("ollama.exe"); serve.arg("serve"); serve };
    if target != home_default {
        command.env("OLLAMA_MODELS", &target);
    } else {
        command.env_remove("OLLAMA_MODELS");
    }
    command.creation_flags(CREATE_NO_WINDOW).spawn().map_err(|error| format!("Modelos movidos, mas o Ollama não reiniciou: {error}"))?;
    Ok(())
}

fn move_app_models(app: &AppHandle, target_root: &str, copied: &mut u64, total: u64) -> Result<(), String> {
    let source = tools::tools_root(app)?;
    let default = tools::default_tools_root(app)?;
    let target = if drive_root(&default) == target_root { default.clone() } else { PathBuf::from(target_root).join("Open Assistant").join("modelos-do-app") };
    if source == target {
        return Ok(());
    }
    super::bitnet::stop_server(app);
    let clean = relocate(app, "Movendo os modelos de imagem e voz", &source, &target, copied, total)?;
    let settings = default.parent().ok_or("pasta do app inválida")?;
    if target == default {
        let _ = fs::remove_file(settings.join(tools::LOCATION_FILE));
    } else {
        fs::write(settings.join(tools::LOCATION_FILE), target.to_string_lossy().as_bytes()).map_err(|error| error.to_string())?;
    }
    if !clean {
        // Voz carregada na memória trava algumas DLLs; apaga na próxima vez que o app abrir.
        let _ = fs::write(settings.join(CLEANUP_FILE), source.to_string_lossy().as_bytes());
    }
    Ok(())
}

/// Move modelos para o disco `target_root` (`E:\`). `groups`: `text` (Ollama) e/ou `app` (imagem e voz).
#[tauri::command]
pub fn storage_move(app: AppHandle, target_root: String, groups: Vec<String>) -> Result<(), String> {
    let target_root = target_root.to_uppercase();
    let disk = fixed_disks().into_iter().find(|disk| disk.root == target_root).ok_or("Disco de destino não encontrado.")?;
    let text = groups.iter().any(|group| group == "text");
    let app_models = groups.iter().any(|group| group == "app");
    let mut total = 0;
    if text && drive_root(&ollama_models_dir()) != target_root {
        total += tools::folder_size(&ollama_models_dir());
    }
    if app_models && drive_root(&tools::tools_root(&app)?) != target_root {
        total += tools::folder_size(&tools::tools_root(&app)?);
    }
    if total + 512 * 1024 * 1024 > disk.free_bytes {
        return Err(format!("O disco {} não tem espaço: precisa de {:.1} GB e tem {:.1} GB livres.", disk.root, total as f64 / 1e9, disk.free_bytes as f64 / 1e9));
    }
    if MOVING.swap(true, Ordering::SeqCst) {
        return Err("Já existe uma troca de disco em andamento.".into());
    }
    std::thread::spawn(move || {
        let mut copied = 0;
        let result = (|| {
            if text {
                move_text_models(&app, &target_root, &mut copied, total)?;
            }
            if app_models {
                move_app_models(&app, &target_root, &mut copied, total)?;
            }
            Ok::<(), String>(())
        })();
        MOVING.store(false, Ordering::SeqCst);
        match result {
            Ok(()) => emit(&app, "completed", "Pronto", copied, total, None),
            Err(error) => emit(&app, "failed", "Falhou", copied, total, Some(error)),
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_at_least_the_system_disk() {
        let disks = fixed_disks();
        assert!(disks.iter().any(|disk| disk.root == "C:\\" && disk.total_bytes > disk.free_bytes));
    }

    #[test]
    fn copies_nested_folders_and_counts_bytes() {
        let base = std::env::temp_dir().join(format!("oa-copy-{}", std::process::id()));
        let source = base.join("origem");
        fs::create_dir_all(source.join("blobs")).unwrap();
        fs::write(source.join("manifest"), b"abc").unwrap();
        fs::write(source.join("blobs").join("sha256-1"), vec![7u8; 5000]).unwrap();
        let mut copied = 0;
        let mut reports = 0;
        copy_dir(&source, &base.join("destino"), &mut copied, &mut |_| reports += 1).unwrap();
        assert_eq!(copied, 5003);
        assert!(reports >= 1);
        assert_eq!(fs::read(base.join("destino").join("blobs").join("sha256-1")).unwrap().len(), 5000);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn drive_root_is_normalized() {
        assert_eq!(drive_root(Path::new("e:\\Open Assistant\\x")), "E:\\");
    }
}
