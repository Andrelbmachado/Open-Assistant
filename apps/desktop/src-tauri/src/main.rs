// Open Assistant — native shell.
// Owns: window, system tray, secure credential storage, and spawning/monitoring
// the Python sidecar. Business logic lives in the TypeScript packages.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use sysinfo::System;

struct AppState {
    sys: Mutex<System>,
}

#[tauri::command]
fn get_system_metrics(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    
    let mut total_cpu = 0.0;
    let cpus = sys.cpus();
    for cpu in cpus {
        total_cpu += cpu.cpu_usage();
    }
    let cpu_usage = if cpus.len() > 0 { total_cpu / cpus.len() as f32 } else { 0.0 };
    
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let memory_usage = if total_memory > 0 {
        (used_memory as f32 / total_memory as f32) * 100.0
    } else {
        0.0
    };
    
    Ok(serde_json::json!({
        "cpu_usage": cpu_usage,
        "memory_usage": memory_usage,
        "total_memory": total_memory,
        "used_memory": used_memory,
    }))
}

fn main() {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sys: Mutex::new(sys),
        })
        .invoke_handler(tauri::generate_handler![get_system_metrics])
        // TODO: register IPC commands, spawn the Python sidecar, set up tray.
        .run(tauri::generate_context!())
        .expect("error while running Open Assistant");
}
