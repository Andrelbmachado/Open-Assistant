//! Rede de computadores do Open Assistant (ROADMAP §15): um app usa a IA (Ollama/GPU) de outro.
//! Design: docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md
pub mod identity;
pub mod node;
pub mod pairing;
pub mod protocol;

use std::os::windows::process::CommandExt;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use node::{ChatExecutor, NetDeviceView, Node, NodeConfig};
use pairing::Permissions;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const DEVICES_EVENT: &str = "net-devices-changed";

#[derive(Default)]
pub struct NetState {
    node: OnceLock<Node>,
    error: OnceLock<String>,
}

impl NetState {
    pub fn node(&self) -> Result<&Node, String> {
        self.node.get().ok_or_else(|| self.error.get().cloned().unwrap_or_else(|| "A rede ainda está iniciando.".into()))
    }
}

/// Liga a rede em segundo plano ao abrir o app (não atrasa a janela).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match start_node(&app).await {
            Ok(node) => {
                let _ = app.state::<NetState>().node.set(node.clone());
                let _ = app.emit(DEVICES_EVENT, ());
                // Modelos do Ollama deste computador (o que os outros podem usar), atualizados a cada minuto.
                loop {
                    let models = tauri::async_runtime::spawn_blocking(crate::ollama_model_names).await.unwrap_or_default();
                    node.set_models(models);
                    tokio::time::sleep(Duration::from_secs(60)).await;
                }
            }
            Err(error) => {
                crate::logs::error("rede", &format!("não iniciou: {error}"));
                let _ = app.state::<NetState>().error.set(format!("A rede não iniciou: {error}"));
            }
        }
    });
}

async fn start_node(app: &AppHandle) -> Result<Node, String> {
    // OPEN_ASSISTANT_NET_DIR: outra identidade na rede (testar dois apps no mesmo PC).
    let dir = match std::env::var_os("OPEN_ASSISTANT_NET_DIR") {
        Some(dir) => std::path::PathBuf::from(dir),
        None => app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("rede"),
    };
    let key = identity::load_or_create_key(&dir)?;
    let rename = std::env::var("OPEN_ASSISTANT_NET_NAME").ok();
    let info = tauri::async_runtime::spawn_blocking({
        let key = key.clone();
        move || identity::local_info(&key)
    })
    .await
    .map_err(|error| error.to_string())?;
    let info = identity::DeviceInfo { name: rename.unwrap_or(info.name), ..info };
    let executor: ChatExecutor = Arc::new(|request, on_delta| {
        let messages: Vec<crate::ChatMessageInput> = serde_json::from_value(request.messages).map_err(|error| error.to_string())?;
        let options: crate::ChatOptions = match request.options {
            Some(value) if !value.is_null() => serde_json::from_value(value).map_err(|error| error.to_string())?,
            _ => Default::default(),
        };
        let result = crate::run_chat_with(&request.request_id, &request.model, &messages, request.think, request.think_level.as_deref(), &options, &request.cancel, &mut |delta| {
            on_delta(serde_json::to_value(delta).unwrap_or_default())
        })?;
        serde_json::to_value(result).map_err(|error| error.to_string())
    });
    let emitter = app.clone();
    Node::start(NodeConfig {
        dir,
        key,
        info,
        mdns: true,
        executor,
        on_change: Arc::new(move || {
            let _ = emitter.emit(DEVICES_EVENT, ());
        }),
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetStatus {
    self_info: identity::DeviceInfo,
    visible: bool,
}

#[tauri::command]
pub fn net_status(state: State<NetState>) -> Result<NetStatus, String> {
    let node = state.node()?;
    Ok(NetStatus { self_info: node.info(), visible: node.visible() })
}

#[tauri::command]
pub fn net_devices(state: State<NetState>) -> Result<Vec<NetDeviceView>, String> {
    Ok(state.node()?.devices())
}

#[tauri::command]
pub fn net_show_code(state: State<NetState>) -> Result<String, String> {
    Ok(state.node()?.show_code())
}

#[tauri::command]
pub async fn net_pair(state: State<'_, NetState>, device_id: String, code: String) -> Result<(), String> {
    let node = state.node()?.clone();
    let addr = node.addr_of(&device_id)?;
    tokio::time::timeout(Duration::from_secs(20), node.pair_with(addr, code.trim())).await.map_err(|_| "O outro computador não respondeu.".to_string())?
}

#[tauri::command]
pub fn net_forget(state: State<NetState>, device_id: String) -> Result<(), String> {
    state.node()?.forget(&device_id)
}

#[tauri::command]
pub fn net_set_permissions(state: State<NetState>, device_id: String, permissions: Permissions) -> Result<(), String> {
    state.node()?.set_permissions(&device_id, permissions)
}

#[tauri::command]
pub fn net_set_visible(state: State<NetState>, visible: bool) -> Result<(), String> {
    state.node()?.set_visible(visible);
    Ok(())
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Neighbor {
    ip: String,
    mac: String,
}

/// Linhas `IP,MAC` do PowerShell → aparelhos (tira multicast/broadcast e MAC zerado).
pub fn parse_neighbors(text: &str) -> Vec<Neighbor> {
    text.lines()
        .filter_map(|line| {
            let (ip, mac) = line.trim().split_once(',')?;
            let mac = mac.trim().replace('-', ":").to_uppercase();
            let ip = ip.trim().to_string();
            let first: u8 = ip.split('.').next()?.parse().ok()?;
            if mac.is_empty() || mac == "00:00:00:00:00:00" || mac == "FF:FF:FF:FF:FF:FF" || (224..=239).contains(&first) || ip.ends_with(".255") {
                return None;
            }
            Some(Neighbor { ip, mac })
        })
        .collect()
}

/// Aparelhos da rede local (tabela ARP do Windows), inclusive os que não têm o Open Assistant.
#[tauri::command]
pub async fn net_lan_neighbors() -> Result<Vec<Neighbor>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-NetNeighbor -AddressFamily IPv4 -State Reachable,Stale,Delay,Probe -ErrorAction SilentlyContinue | ForEach-Object { \"$($_.IPAddress),$($_.LinkLayerAddress)\" }"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| error.to_string())?;
        Ok(parse_neighbors(&String::from_utf8_lossy(&output.stdout)))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Mostra no Explorador o arquivo do app para copiar a outro computador (o instalador `.exe` vem na fase 3).
#[tauri::command]
pub fn net_reveal_installer() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    std::process::Command::new("explorer").arg(format!("/select,{}", exe.display())).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

/// Cancelamento do chat remoto usa o mesmo mapa do `ollama_cancel_chat`.
pub fn chat_request(request_id: &str, model: &str, messages: serde_json::Value, think: Option<bool>, think_level: Option<String>, options: Option<serde_json::Value>, cancel: Arc<AtomicBool>) -> node::ChatRequestData {
    node::ChatRequestData { request_id: request_id.into(), model: model.into(), messages, think, think_level, options, cancel }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_arp_lines_and_skips_multicast() {
        let text = "192.168.0.10,a0-b1-c2-d3-e4-f5\r\n224.0.0.22,01-00-5E-00-00-16\r\n192.168.0.255,FF-FF-FF-FF-FF-FF\r\n192.168.0.1,00-00-00-00-00-00\r\n";
        assert_eq!(parse_neighbors(text), vec![Neighbor { ip: "192.168.0.10".into(), mac: "A0:B1:C2:D3:E4:F5".into() }]);
    }
}
