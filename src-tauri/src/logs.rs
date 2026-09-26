//! Logs do app: um arquivo JSON Lines em `%LOCALAPPDATA%\com.openassistant.windows\logs\open-assistant.log`
//! (gira em 2 MB → `open-assistant.1.log`). Cada linha: `{"t":"2026-09-26 01:20:03","level":"erro",
//! "source":"imagem","message":"..."}`. Aparece em Configurações › Logs e o agente lê com `read_logs` —
//! assim qualquer IA consegue analisar os erros com o contexto real do sistema.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
static FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct LogEntry {
    /// Data e hora local, "AAAA-MM-DD HH:MM:SS".
    pub t: String,
    /// "erro", "aviso" ou "info".
    pub level: String,
    /// Parte do app: "ia", "imagem", "voz", "agente", "memoria", "interface"…
    pub source: String,
    pub message: String,
}

/// Liga o arquivo de log (chamado no `setup`) e registra os panics do Rust.
pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_local_data_dir().map(|dir| dir.join("logs")) else { return };
    let _ = fs::create_dir_all(&dir);
    if let Ok(mut file) = FILE.lock() {
        *file = Some(dir.join("open-assistant.log"));
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write("erro", "rust", &format!("panic: {info}"));
        previous(info);
    }));
    write("info", "app", &format!("Open Assistant {} iniciado", app.package_info().version));
}

pub fn path() -> Option<PathBuf> {
    FILE.lock().ok().and_then(|file| file.clone())
}

/// Hora local sem depender de crates de data: `GetLocalTime` do Windows.
fn now() -> String {
    let time = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", time.wYear, time.wMonth, time.wDay, time.wHour, time.wMinute, time.wSecond)
}

/// Grava uma linha (nunca falha: log não pode derrubar o app).
pub fn write(level: &str, source: &str, message: &str) {
    let Some(path) = path() else { return };
    let entry = LogEntry { t: now(), level: level.into(), source: source.into(), message: message.chars().take(8000).collect() };
    let Ok(line) = serde_json::to_string(&entry) else { return };
    let _guard = FILE.lock();
    if fs::metadata(&path).map(|meta| meta.len() > MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, path.with_file_name("open-assistant.1.log"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{line}");
    }
}

pub fn error(source: &str, message: &str) {
    write("erro", source, message);
}

pub fn warn(source: &str, message: &str) {
    write("aviso", source, message);
}

pub fn info(source: &str, message: &str) {
    write("info", source, message);
}

/// Últimas entradas (mais novas no fim), filtradas por nível e texto.
pub fn read(limit: usize, level: Option<&str>, query: Option<&str>) -> Vec<LogEntry> {
    let Some(path) = path() else { return Vec::new() };
    let mut text = fs::read_to_string(path.with_file_name("open-assistant.1.log")).unwrap_or_default();
    text.push_str(&fs::read_to_string(&path).unwrap_or_default());
    let query = query.map(str::to_lowercase).filter(|query| !query.trim().is_empty());
    let level = level.filter(|level| !level.is_empty() && *level != "todos");
    let entries: Vec<LogEntry> = text
        .lines()
        .filter_map(|line| serde_json::from_str::<LogEntry>(line).ok())
        .filter(|entry| level.is_none_or(|level| entry.level == level))
        .filter(|entry| query.as_ref().is_none_or(|query| entry.message.to_lowercase().contains(query) || entry.source.to_lowercase().contains(query)))
        .collect();
    let skip = entries.len().saturating_sub(limit.clamp(1, 5000));
    entries.into_iter().skip(skip).collect()
}

/// Texto para a IA: uma entrada por linha.
pub fn as_text(entries: &[LogEntry]) -> String {
    if entries.is_empty() {
        return "Nenhuma entrada no log.".into();
    }
    entries.iter().map(|entry| format!("{} [{}] [{}] {}", entry.t, entry.level, entry.source, entry.message)).collect::<Vec<_>>().join("\n")
}

#[tauri::command]
pub fn logs_read(limit: Option<usize>, level: Option<String>, query: Option<String>) -> Vec<LogEntry> {
    read(limit.unwrap_or(500), level.as_deref(), query.as_deref())
}

/// A interface registra os erros dela aqui (erros de IA, voz, telas que quebraram…).
#[tauri::command]
pub fn logs_write(level: String, source: String, message: String) {
    let level = match level.as_str() {
        "erro" | "error" => "erro",
        "aviso" | "warn" | "warning" => "aviso",
        _ => "info",
    };
    write(level, &source, &message);
}

#[tauri::command]
pub fn logs_clear() -> Result<(), String> {
    let path = path().ok_or("log não iniciado")?;
    let _ = fs::remove_file(path.with_file_name("open-assistant.1.log"));
    fs::write(&path, "").map_err(|error| error.to_string())
}

#[tauri::command]
pub fn logs_folder() -> Result<String, String> {
    let path = path().ok_or("log não iniciado")?;
    let dir = path.parent().ok_or("sem pasta")?.to_path_buf();
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_filters_entries() {
        let dir = std::env::temp_dir().join(format!("oa-logs-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        *FILE.lock().unwrap() = Some(dir.join("open-assistant.log"));
        write("erro", "imagem", "cudaMalloc failed: out of memory");
        write("info", "app", "iniciado");
        let errors = read(10, Some("erro"), None);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].source, "imagem");
        assert_eq!(read(10, None, Some("INICIADO")).len(), 1);
        assert!(as_text(&errors).contains("[erro] [imagem] cudaMalloc"));
        let _ = fs::remove_dir_all(dir);
    }
}
