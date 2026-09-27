//! Rede de computadores do Open Assistant (ROADMAP §15): um app usa a IA (Ollama/GPU) de outro.
//! Design: docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md
pub mod identity;
pub mod node;
pub mod pairing;
pub mod protocol;

use std::os::windows::process::CommandExt;
use std::sync::atomic::AtomicBool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use node::{AgentExecutor, AgentTaskData, ChatExecutor, NetDeviceView, Node, NodeConfig};
use pairing::Permissions;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const DEVICES_EVENT: &str = "net-devices-changed";
/// Tarefa de agente vinda de outro computador: a tela deste PC confirma (se preciso), roda o agente e responde.
pub const AGENT_TASK_EVENT: &str = "net-agent-task";

#[derive(Default)]
pub struct NetState {
    node: OnceLock<Node>,
    error: OnceLock<String>,
    /// Tarefas remotas esperando a tela responder (`net_agent_reply`).
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<Result<String, String>>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentTaskEvent {
    id: String,
    from_id: String,
    from_name: String,
    task: String,
    needs_confirm: bool,
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
    let dir = net_dir(app)?;
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
    let tasks_app = app.clone();
    let agent: AgentExecutor = Arc::new(move |task: AgentTaskData| {
        let app = tasks_app.clone();
        Box::pin(async move {
            let id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = tokio::sync::oneshot::channel();
            app.state::<NetState>().pending.lock().map_err(|_| "estado da rede indisponível")?.insert(id.clone(), sender);
            let event = AgentTaskEvent { id: id.clone(), from_id: task.from_id, from_name: task.from_name, task: task.task, needs_confirm: task.needs_confirm };
            app.emit(AGENT_TASK_EVENT, event).map_err(|error| error.to_string())?;
            let outcome = tokio::time::timeout(Duration::from_secs(590), receiver).await;
            if let Ok(mut pending) = app.state::<NetState>().pending.lock() {
                pending.remove(&id);
            }
            match outcome {
                Ok(Ok(result)) => result,
                Ok(Err(_)) => Err("O app do outro computador fechou antes de responder.".into()),
                Err(_) => Err("Ninguém respondeu no outro computador.".into()),
            }
        })
    });
    let internet = load_config(&dir).internet;
    let emitter = app.clone();
    Node::start(NodeConfig {
        internet,
        dir,
        key,
        info,
        mdns: true,
        executor,
        agent,
        on_change: Arc::new(move || {
            let _ = emitter.emit(DEVICES_EVENT, ());
        }),
    })
    .await
}

/// `rede\config.json`: escolhas do usuário para a rede.
#[derive(Serialize, serde::Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct NetConfig {
    /// Conectar fora de casa pelos servidores públicos do iroh (n0). Desligado até o usuário ligar.
    pub internet: bool,
}

fn net_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    match std::env::var_os("OPEN_ASSISTANT_NET_DIR") {
        Some(dir) => Ok(std::path::PathBuf::from(dir)),
        None => Ok(app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("rede")),
    }
}

fn load_config(dir: &std::path::Path) -> NetConfig {
    std::fs::read_to_string(dir.join("config.json")).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetStatus {
    self_info: identity::DeviceInfo,
    visible: bool,
    /// Modo internet ligado agora (o que o app abriu usando).
    internet: bool,
    /// Modo internet escolhido (vale ao reabrir o app).
    internet_saved: bool,
}

#[tauri::command]
pub fn net_status(app: AppHandle, state: State<NetState>) -> Result<NetStatus, String> {
    let node = state.node()?;
    Ok(NetStatus { self_info: node.info(), visible: node.visible(), internet: node.internet(), internet_saved: load_config(&net_dir(&app)?).internet })
}

/// Liga/desliga a conexão pela internet (vale ao reabrir o app).
#[tauri::command]
pub fn net_set_internet(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = net_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let config = NetConfig { internet: enabled };
    std::fs::write(dir.join("config.json"), serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
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

/// A tela deste PC terminou (ou recusou) uma tarefa que veio de outro computador.
#[tauri::command]
pub fn net_agent_reply(state: State<NetState>, id: String, ok: bool, text: String) -> Result<(), String> {
    let sender = state.pending.lock().map_err(|_| "estado da rede indisponível")?.remove(&id).ok_or("Tarefa não encontrada (pode ter expirado).")?;
    let _ = sender.send(if ok { Ok(text) } else { Err(text) });
    Ok(())
}

/// Manda uma tarefa para o agente de outro computador (ele controla aquele PC) e devolve a resposta dele.
#[tauri::command]
pub async fn remote_agent(state: State<'_, NetState>, device_id: String, task: String, request_id: String) -> Result<String, String> {
    let node = state.node()?.clone();
    let addr = node.addr_of(&device_id)?;
    node.remote_agent(addr, &request_id, &task).await
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
