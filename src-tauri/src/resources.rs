//! Recursos do PC: quanto de RAM, memória reservada ("commit") e placa de vídeo sobra, quem está
//! ocupando, e o que o próprio app pode soltar antes de uma tarefa pesada (gerar imagem, carregar um
//! modelo de texto). Quando falta memória, a mensagem de erro diz **quem** está segurando e o que fazer.
//!
//! Por que "commit": no Windows, o CUDA e o Ollama precisam *reservar* memória (RAM + arquivo de
//! paginação) mesmo com a placa de vídeo vazia. Se outro programa reservou quase tudo (ex.: o OneDrive
//! com 18 GB), a alocação falha com "out of memory" apesar de sobrar VRAM.

use serde::Serialize;
use std::process::Command;
use std::os::windows::process::CommandExt;
use tauri::AppHandle;
use windows::Win32::Foundation::{CloseHandle, FILETIME};
use windows::Win32::System::ProcessStatus::{EnumProcesses, GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
use windows::Win32::System::SystemInformation::{GetTickCount64, GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::{GetSystemTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const GB: f64 = 1024.0 * 1024.0 * 1024.0;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessUsage {
    pub name: String,
    pub pid: u32,
    /// Memória reservada pelo processo (bytes privados), em GB.
    pub commit_gb: f64,
    /// Na RAM agora, em GB.
    pub ram_gb: f64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatus {
    pub ram_total_gb: f64,
    pub ram_free_gb: f64,
    pub commit_total_gb: f64,
    pub commit_free_gb: f64,
    pub gpu_name: Option<String>,
    pub gpu_total_gb: Option<f64>,
    pub gpu_free_gb: Option<f64>,
    /// Processos que mais reservam memória (os 8 maiores, somando as cópias do mesmo programa).
    pub top: Vec<ProcessUsage>,
    /// Frase curta quando a memória está apertada (vazio se está tudo bem).
    pub advice: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub memory: MemoryStatus,
    pub cpu_percent: f64,
    pub cpu_name: String,
    pub cores: usize,
    pub disk_total_gb: f64,
    pub disk_free_gb: f64,
    pub uptime_hours: f64,
    pub windows: String,
}

fn round(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn global_memory() -> MEMORYSTATUSEX {
    let mut status = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    unsafe {
        let _ = GlobalMemoryStatusEx(&mut status);
    }
    status
}

/// Nome do executável sem ".exe" ("OneDrive", "chrome").
fn process_name(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 512];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buffer.as_mut_ptr()), &mut size).is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        let file = path.rsplit('\\').next()?.to_string();
        Some(file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(&file).to_string())
    }
}

fn process_memory(pid: u32) -> Option<(u64, u64)> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut counters = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
        let ok = GetProcessMemoryInfo(handle, &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS, counters.cb).is_ok();
        let _ = CloseHandle(handle);
        ok.then_some((counters.PrivateUsage as u64, counters.WorkingSetSize as u64))
    }
}

/// Programas que mais reservam memória, com as cópias do mesmo programa somadas.
pub fn top_processes(limit: usize) -> Vec<ProcessUsage> {
    let mut pids = vec![0u32; 4096];
    let mut needed = 0u32;
    if unsafe { EnumProcesses(pids.as_mut_ptr(), (pids.len() * 4) as u32, &mut needed) }.is_err() {
        return Vec::new();
    }
    pids.truncate(needed as usize / 4);
    let mut by_name: std::collections::HashMap<String, ProcessUsage> = std::collections::HashMap::new();
    for pid in pids.into_iter().filter(|pid| *pid > 4) {
        let (Some(name), Some((commit, ram))) = (process_name(pid), process_memory(pid)) else { continue };
        let entry = by_name.entry(name.to_lowercase()).or_insert_with(|| ProcessUsage { name: name.clone(), pid, ..Default::default() });
        entry.commit_gb += commit as f64 / GB;
        entry.ram_gb += ram as f64 / GB;
    }
    let mut list: Vec<ProcessUsage> = by_name.into_values().map(|mut usage| { usage.commit_gb = round(usage.commit_gb); usage.ram_gb = round(usage.ram_gb); usage }).collect();
    list.sort_by(|a, b| b.commit_gb.total_cmp(&a.commit_gb));
    list.truncate(limit);
    list
}

/// Placa de vídeo NVIDIA pelo `nvidia-smi` (outras placas: sem dado).
fn gpu() -> Option<(String, f64, f64)> {
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.lines().next()?.split(',').map(str::trim);
    let name = parts.next()?.to_string();
    let total: f64 = parts.next()?.parse().ok()?;
    let free: f64 = parts.next()?.parse().ok()?;
    Some((name, round(total / 1024.0), round(free / 1024.0)))
}

/// Quem está apertando a memória e o que fazer (None = folga suficiente).
pub fn advice(status: &MemoryStatus) -> Option<String> {
    let tight = status.commit_free_gb < 8.0 || status.ram_free_gb < 1.5;
    if !tight {
        return None;
    }
    let ours = ["open assistant", "open-assistant", "msedgewebview2", "ollama", "sd-cli", "llama-server"];
    let hogs: Vec<String> = status
        .top
        .iter()
        .filter(|usage| usage.commit_gb >= 2.0 && !ours.iter().any(|name| usage.name.to_lowercase().starts_with(name)))
        .take(3)
        .map(|usage| format!("{} ({:.1} GB)", usage.name, usage.commit_gb))
        .collect();
    let copies = status.top.iter().find(|usage| usage.name.to_lowercase().starts_with("open assistant") && usage.commit_gb > 1.2);
    let mut text = format!(
        "Memória do Windows quase esgotada: sobram {:.1} GB reservados de {:.1} GB (RAM livre {:.1} GB).",
        status.commit_free_gb, status.commit_total_gb, status.ram_free_gb
    );
    if !hogs.is_empty() {
        text.push_str(&format!(" Quem mais segura: {}.", hogs.join(", ")));
    }
    if status.top.iter().any(|usage| usage.name.eq_ignore_ascii_case("onedrive") && usage.commit_gb >= 4.0) {
        text.push_str(" O OneDrive costuma inchar assim — reiniciá-lo (botão em Painel de controle) devolve essa memória.");
    }
    if copies.is_some() {
        text.push_str(" Se houver duas janelas do Open Assistant abertas, feche uma.");
    }
    Some(text)
}

pub fn memory_status(with_gpu: bool) -> MemoryStatus {
    let memory = global_memory();
    let (gpu_name, gpu_total_gb, gpu_free_gb) = if with_gpu { gpu().map(|(name, total, free)| (Some(name), Some(total), Some(free))).unwrap_or_default() } else { (None, None, None) };
    let mut status = MemoryStatus {
        ram_total_gb: round(memory.ullTotalPhys as f64 / GB),
        ram_free_gb: round(memory.ullAvailPhys as f64 / GB),
        commit_total_gb: round(memory.ullTotalPageFile as f64 / GB),
        commit_free_gb: round(memory.ullAvailPageFile as f64 / GB),
        gpu_name,
        gpu_total_gb,
        gpu_free_gb,
        top: top_processes(8),
        advice: None,
    };
    status.advice = advice(&status);
    status
}

/// Solta o que o próprio app segurava e não precisa agora, antes de uma tarefa pesada.
/// `purpose`: "imagem" (tira os modelos de texto e de voz) ou "texto" (tira os de voz).
pub fn free_for(app: &AppHandle, purpose: &str) -> Vec<String> {
    let mut freed = Vec::new();
    if purpose == "imagem" {
        let unloaded = crate::imagegen::unload_ollama_models();
        if !unloaded.is_empty() {
            freed.push(format!("modelos de texto do Ollama ({})", unloaded.join(", ")));
        }
    }
    if crate::speech::release_idle(app) {
        freed.push("modelos de voz ociosos".into());
    }
    if !freed.is_empty() {
        crate::logs::info("memoria", &format!("Liberado para {purpose}: {}", freed.join("; ")));
    }
    freed
}

/// Explica um erro de falta de memória com o estado real do PC (para imagem, Ollama e voz).
pub fn explain_out_of_memory() -> String {
    let status = memory_status(true);
    let text = status.advice.clone().unwrap_or_else(|| {
        format!(
            "RAM livre {:.1} GB, memória reservada livre {:.1} GB{}.",
            status.ram_free_gb,
            status.commit_free_gb,
            status.gpu_free_gb.map(|free| format!(", placa de vídeo livre {free:.1} GB")).unwrap_or_default()
        )
    });
    crate::logs::warn("memoria", &text);
    text
}

fn filetime(value: FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

fn cpu_times() -> Option<(u64, u64)> {
    let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.ok()?;
    Some((filetime(idle), filetime(kernel) + filetime(user)))
}

fn cpu_percent() -> f64 {
    let Some((idle_a, total_a)) = cpu_times() else { return 0.0 };
    std::thread::sleep(std::time::Duration::from_millis(250));
    let Some((idle_b, total_b)) = cpu_times() else { return 0.0 };
    let total = total_b.saturating_sub(total_a);
    if total == 0 {
        return 0.0;
    }
    round(100.0 * (1.0 - idle_b.saturating_sub(idle_a) as f64 / total as f64))
}

fn disk_c() -> (f64, f64) {
    let (mut free, mut total) = (0u64, 0u64);
    let root: Vec<u16> = "C:\\\0".encode_utf16().collect();
    unsafe {
        let _ = windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(windows::core::PCWSTR(root.as_ptr()), None, Some(&mut total), Some(&mut free));
    }
    (round(total as f64 / GB), round(free as f64 / GB))
}

fn registry(value: &str) -> String {
    Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "/v", value])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .and_then(|output| String::from_utf8_lossy(&output.stdout).lines().find(|line| line.contains(value)).and_then(|line| line.split("REG_SZ").nth(1)).map(|text| text.trim().to_string()))
        .unwrap_or_default()
}

/// "Windows 11 Pro 25H2": o registro ainda diz "Windows 10" no 11; o número do build desempata.
fn windows_name() -> String {
    let mut name = registry("ProductName");
    if registry("CurrentBuildNumber").parse::<u32>().unwrap_or(0) >= 22000 {
        name = name.replace("Windows 10", "Windows 11");
    }
    format!("{name} {}", registry("DisplayVersion")).trim().to_string()
}

fn cpu_name() -> String {
    Command::new("reg")
        .args(["query", r"HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0", "/v", "ProcessorNameString"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .and_then(|output| String::from_utf8_lossy(&output.stdout).lines().find_map(|line| line.split("REG_SZ").nth(1).map(|text| text.trim().to_string())))
        .unwrap_or_default()
}

// ---------------------------------------------------------------- comandos

#[tauri::command]
pub async fn system_status() -> Result<SystemStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (disk_total_gb, disk_free_gb) = disk_c();
        SystemStatus {
            memory: memory_status(true),
            cpu_percent: cpu_percent(),
            cpu_name: cpu_name(),
            cores: std::thread::available_parallelism().map(|count| count.get()).unwrap_or(1),
            disk_total_gb,
            disk_free_gb,
            uptime_hours: round(unsafe { GetTickCount64() } as f64 / 3_600_000.0),
            windows: windows_name(),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Botão "Liberar memória": solta os modelos do Ollama e de voz que estão parados.
#[tauri::command]
pub async fn free_memory(app: AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || free_for(&app, "imagem")).await.map_err(|error| error.to_string())
}

/// Reinicia um programa conhecido por inchar a memória (só a lista abaixo, e só por clique do usuário).
#[tauri::command]
pub async fn restart_memory_hog(name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !name.eq_ignore_ascii_case("onedrive") {
            return Err(format!("Não reinicio {name} por aqui."));
        }
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{local}\\Microsoft\\OneDrive\\OneDrive.exe"),
            "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe".to_string(),
            "C:\\Program Files (x86)\\Microsoft OneDrive\\OneDrive.exe".to_string(),
        ];
        let exe = candidates.iter().find(|path| std::path::Path::new(path).is_file()).ok_or("Não achei o OneDrive.exe.")?.clone();
        let before = memory_status(false).commit_free_gb;
        // `/shutdown` fecha o OneDrive do jeito dele (termina uploads em andamento); depois abre de novo.
        let _ = Command::new(&exe).arg("/shutdown").creation_flags(CREATE_NO_WINDOW).status();
        std::thread::sleep(std::time::Duration::from_secs(4));
        Command::new(&exe).arg("/background").creation_flags(CREATE_NO_WINDOW).spawn().map_err(|error| error.to_string())?;
        std::thread::sleep(std::time::Duration::from_secs(2));
        let after = memory_status(false).commit_free_gb;
        let text = format!("OneDrive reiniciado: memória reservada livre foi de {before:.1} GB para {after:.1} GB.");
        crate::logs::info("memoria", &text);
        Ok(text)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage(name: &str, commit_gb: f64) -> ProcessUsage {
        ProcessUsage { name: name.into(), pid: 1, commit_gb, ram_gb: 0.5 }
    }

    #[test]
    fn advice_names_the_memory_hog() {
        let status = MemoryStatus { ram_total_gb: 15.1, ram_free_gb: 2.2, commit_total_gb: 61.1, commit_free_gb: 6.6, top: vec![usage("OneDrive", 18.8), usage("ollama", 1.2), usage("chrome", 0.8)], ..Default::default() };
        let text = advice(&status).unwrap();
        assert!(text.contains("OneDrive (18.8 GB)"), "{text}");
        assert!(text.contains("reiniciá-lo"), "{text}");
        assert!(!text.contains("ollama ("), "{text}");
    }

    #[test]
    fn no_advice_with_room_to_spare() {
        let status = MemoryStatus { ram_free_gb: 8.0, commit_free_gb: 30.0, ..Default::default() };
        assert!(advice(&status).is_none());
    }

    #[test]
    fn live_memory_status_reads_the_machine() {
        let status = memory_status(false);
        assert!(status.ram_total_gb > 1.0);
        assert!(status.commit_total_gb >= status.ram_total_gb * 0.5);
        assert!(!status.top.is_empty());
    }
}
