//! Rede de computadores do Open Assistant (ROADMAP §15): um app usa a IA (Ollama/GPU) de outro.
//! Design: docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md
pub mod identity;
pub mod control;
pub mod mcp;
pub mod netlog;
pub mod node;
pub mod pairing;
pub mod protocol;
pub mod update;

use std::os::windows::process::CommandExt;
use std::sync::atomic::AtomicBool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use node::{AgentExecutor, AgentTaskData, ChatExecutor, NetDeviceView, Node, NodeConfig, UpdateAsker, UpdateInstaller, UpdateOfferData};
use update::UpdateDecision;
use pairing::Permissions;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const DEVICES_EVENT: &str = "net-devices-changed";
/// Outro computador está usando a IA deste (início/fim), para o fluxo do sistema na tela.
pub const SERVE_EVENT: &str = "net-chat-served";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServeEvent {
    phase: &'static str,
    from_name: String,
    model: String,
    text: String,
}

/// Tarefa de agente vinda de outro computador: a tela deste PC confirma (se preciso), roda o agente e responde.
pub const AGENT_TASK_EVENT: &str = "net-agent-task";

#[derive(Default)]
pub struct NetState {
    /// Troca de nó ao ligar/desligar Internet (sem reabrir o app).
    node: RwLock<Option<Node>>,
    error: Mutex<Option<String>>,
    restarting: tokio::sync::Mutex<()>,
    /// Tarefas remotas esperando a tela responder (`net_agent_reply`).
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<Result<String, String>>>>,
    /// Ofertas de atualização esperando a tela responder (`net_update_reply`).
    pending_updates: Mutex<HashMap<String, tokio::sync::oneshot::Sender<UpdateDecision>>>,
}

/// Outro computador quer instalar uma versão do app aqui: a tela mostra o cartão "Instalar agora / Depois".
pub const UPDATE_OFFER_EVENT: &str = "net-update-offer";
/// Progresso do envio do instalador para outro computador.
pub const UPDATE_PROGRESS_EVENT: &str = "net-update-progress";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateOfferEvent {
    id: String,
    from_id: String,
    from_name: String,
    version: String,
    file_name: String,
    size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressEvent {
    device_id: String,
    sent: u64,
    total: u64,
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
    pub fn node(&self) -> Result<Node, String> {
        if let Some(node) = self.node.read().map_err(|_| "estado da rede indisponível")?.clone() {
            return Ok(node);
        }
        Err(self.error.lock().ok().and_then(|error| error.clone()).unwrap_or_else(|| "A rede ainda está iniciando.".into()))
    }

    fn set_node(&self, node: Option<Node>, error: Option<String>) {
        if let Ok(mut current) = self.node.write() {
            *current = node;
        }
        if let Ok(mut current) = self.error.lock() {
            *current = error;
        }
    }
}

/// Liga a rede em segundo plano ao abrir o app (não atrasa a janela).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match start_node(&app).await {
            Ok(node) => {
                ensure_firewall_rule(&node);
                app.state::<NetState>().set_node(Some(node), None);
                let _ = app.emit(DEVICES_EVENT, ());
            }
            Err(error) => {
                crate::logs::error("rede", &format!("não iniciou: {error}"));
                app.state::<NetState>().set_node(None, Some(format!("A rede não iniciou: {error}")));
                return;
            }
        }
        control::start(&app);
        // `estado.json` a cada 5 s (diagnóstico por IA / MCP com o app fechado).
        let state_app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                write_state_file(&state_app);
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
        // Modelos do Ollama deste computador (o que os outros podem usar), atualizados a cada minuto.
        loop {
            let models = tauri::async_runtime::spawn_blocking(crate::ollama_model_names).await.unwrap_or_default();
            if let Ok(node) = app.state::<NetState>().node() {
                node.set_models(models);
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

/// Fecha o nó e abre de novo com a configuração salva (ex.: Internet ligada/desligada), sem reabrir o app.
pub async fn restart_node(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<NetState>();
    let _guard = state.restarting.lock().await;
    let old = state.node.write().map_err(|_| "estado da rede indisponível")?.take();
    if let Some(old) = old {
        old.shutdown().await;
        drop(old);
    }
    match start_node(app).await {
        Ok(node) => {
            let models = tauri::async_runtime::spawn_blocking(crate::ollama_model_names).await.unwrap_or_default();
            node.set_models(models);
            ensure_firewall_rule(&node);
            state.set_node(Some(node), None);
            let _ = app.emit(DEVICES_EVENT, ());
            Ok(())
        }
        Err(error) => {
            crate::logs::error("rede", &format!("não reiniciou: {error}"));
            state.set_node(None, Some(format!("A rede não iniciou: {error}")));
            let _ = app.emit(DEVICES_EVENT, ());
            Err(error)
        }
    }
}

/// Estado para diagnóstico: o que o nó sabe + onde estão os arquivos.
pub fn state_snapshot(node: &Node) -> serde_json::Value {
    let dir = node.dir();
    let mut value = node.diagnostics();
    value["atualizadoEm"] = serde_json::Value::from(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0));
    value["servicoRodando"] = serde_json::Value::Bool(true);
    value["arquivos"] = serde_json::json!({
        "log": dir.join(netlog::LOG_FILE),
        "logAnterior": dir.join(netlog::OLD_LOG_FILE),
        "estado": dir.join(STATE_FILE),
        "confiaveis": dir.join("confiaveis.json"),
        "porta": dir.join(node::PORT_FILE),
        "config": dir.join("config.json"),
    });
    value
}

pub const STATE_FILE: &str = "estado.json";

fn write_state_file(app: &AppHandle) {
    if let Ok(node) = app.state::<NetState>().node() {
        let snapshot = state_snapshot(&node);
        if let Ok(text) = serde_json::to_string_pretty(&snapshot) {
            let _ = std::fs::write(node.dir().join(STATE_FILE), text);
        }
    }
}

/// Regra do Firewall do Windows para a porta UDP fixa (Privado; Público só com Internet). Precisa de administrador:
/// sem permissão, fica registrado no log e vale a regra do programa que o Windows cria ao abrir o app.
fn ensure_firewall_rule(node: &Node) {
    let port = node.port();
    if port == 0 {
        return;
    }
    let profile = if node.internet() { "private,public" } else { "private" };
    let log_node = node.clone();
    std::thread::spawn(move || {
        let name = format!("Open Assistant rede (UDP {port}, {profile})");
        let exists = std::process::Command::new("netsh")
            .args(["advfirewall", "firewall", "show", "rule", &format!("name={name}")])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        if exists {
            return;
        }
        let added = std::process::Command::new("netsh")
            .args(["advfirewall", "firewall", "add", "rule", &format!("name={name}"), "dir=in", "action=allow", "protocol=UDP", &format!("localport={port}"), &format!("profile={profile}")])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match added {
            Ok(output) if output.status.success() => log_node.log().info("firewall_regra_criada", serde_json::json!({ "porta": port, "perfil": profile })),
            _ => log_node.log().info("firewall_sem_regra", serde_json::json!({ "porta": port, "perfil": profile, "dica": "Sem administrador não dá para criar a regra da porta; vale a regra do programa (o Windows pergunta na primeira abertura)." })),
        }
    });
}

/// Registra no log da rede o resultado de um comando da tela/MCP.
pub fn log_command<T>(node: &Node, command: &str, device_id: Option<&str>, result: &Result<T, String>) {
    match result {
        Ok(_) => node.log().info("comando", serde_json::json!({ "comando": command, "deviceId": device_id })),
        Err(error) => node.log().warn("comando_falhou", serde_json::json!({ "comando": command, "deviceId": device_id, "erro": error })),
    }
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
    let served_app = app.clone();
    let executor: ChatExecutor = Arc::new(move |request, on_delta| {
        // A tela deste PC acende o fluxo "Atender outro computador" (§11).
        let _ = served_app.emit(SERVE_EVENT, ServeEvent { phase: "start", from_name: request.from_name.clone(), model: request.model.clone(), text: String::new() });
        let outcome = serve_chat(request, on_delta);
        let (phase, text) = match &outcome {
            Ok(value) => ("done", value.get("content").and_then(|content| content.as_str()).unwrap_or_default().chars().take(200).collect()),
            Err(error) => ("error", error.clone()),
        };
        let _ = served_app.emit(SERVE_EVENT, ServeEvent { phase, from_name: String::new(), model: String::new(), text });
        outcome
    });
    fn serve_chat(request: node::ChatRequestData, on_delta: &mut dyn FnMut(serde_json::Value)) -> Result<serde_json::Value, String> {
        let messages: Vec<crate::ChatMessageInput> = serde_json::from_value(request.messages).map_err(|error| error.to_string())?;
        let options: crate::ChatOptions = match request.options {
            Some(value) if !value.is_null() => serde_json::from_value(value).map_err(|error| error.to_string())?,
            _ => Default::default(),
        };
        let result = crate::run_chat_with(&request.request_id, &request.model, &messages, request.think, request.think_level.as_deref(), &options, &request.cancel, &mut |delta| {
            on_delta(serde_json::to_value(delta).unwrap_or_default())
        })?;
        serde_json::to_value(result).map_err(|error| error.to_string())
    }
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
    let offers_app = app.clone();
    let update_asker: UpdateAsker = Arc::new(move |offer: UpdateOfferData| {
        let app = offers_app.clone();
        Box::pin(async move {
            let id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = tokio::sync::oneshot::channel();
            let registered = match app.state::<NetState>().pending_updates.lock() {
                Ok(mut pending) => pending.insert(id.clone(), sender).is_none(),
                Err(_) => false,
            };
            if !registered {
                return UpdateDecision::Later;
            }
            let event = UpdateOfferEvent { id: id.clone(), from_id: offer.from_id, from_name: offer.from_name, version: offer.version, file_name: offer.file_name, size: offer.size };
            if app.emit(UPDATE_OFFER_EVENT, event).is_err() {
                return UpdateDecision::Later;
            }
            let decision = tokio::time::timeout(Duration::from_secs(290), receiver).await;
            if let Ok(mut pending) = app.state::<NetState>().pending_updates.lock() {
                pending.remove(&id);
            }
            match decision {
                Ok(Ok(decision)) => decision,
                _ => UpdateDecision::Later,
            }
        })
    });
    let installer_app = app.clone();
    let update_installer: UpdateInstaller = Arc::new(move |path| run_installer(&installer_app, &path));
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
        update_asker,
        update_installer,
        reconnect_loop: true,
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
    /// Modo internet ligado agora.
    internet: bool,
    /// Modo internet escolhido (igual ao de agora: ligar/desligar reinicia o nó na hora).
    internet_saved: bool,
    port: u16,
}

#[tauri::command]
pub fn net_status(app: AppHandle, state: State<NetState>) -> Result<NetStatus, String> {
    let node = state.node()?;
    Ok(NetStatus { self_info: node.info(), visible: node.visible(), internet: node.internet(), internet_saved: load_config(&net_dir(&app)?).internet, port: node.port() })
}

/// Liga/desliga a conexão pela internet e reinicia a rede na hora (sem reabrir o app).
pub async fn set_internet(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let dir = net_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let config = NetConfig { internet: enabled };
    std::fs::write(dir.join("config.json"), serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let result = restart_node(app).await;
    if let Ok(node) = app.state::<NetState>().node() {
        log_command(&node, if enabled { "internet_ligada" } else { "internet_desligada" }, None, &result);
    }
    result
}

#[tauri::command]
pub async fn net_set_internet(app: AppHandle, enabled: bool) -> Result<(), String> {
    set_internet(&app, enabled).await
}

#[tauri::command]
pub fn net_devices(state: State<NetState>) -> Result<Vec<NetDeviceView>, String> {
    Ok(state.node()?.devices())
}

#[tauri::command]
pub fn net_show_code(state: State<NetState>) -> Result<String, String> {
    Ok(state.node()?.show_code())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentCode {
    code: String,
    expires_in: u64,
}

/// Código que fica sempre no topo da tela Remoto (troca sozinho quando expira ou é usado).
#[tauri::command]
pub fn net_current_code(state: State<NetState>) -> Result<CurrentCode, String> {
    let (code, expires_in) = state.node()?.current_code();
    Ok(CurrentCode { code, expires_in })
}

/// Reconecta a um computador do histórico só clicando nele (prazo de 12 s; erro em português com dica).
#[tauri::command]
pub async fn net_reconnect(state: State<'_, NetState>, device_id: String) -> Result<(), String> {
    let node = state.node()?;
    let result = node.reconnect(&device_id).await.map(|_| ());
    log_command(&node, "reconectar", Some(&device_id), &result);
    result
}

/// Reconecta todos os pareados; devolve os ids que responderam.
#[tauri::command]
pub async fn net_reconnect_all(state: State<'_, NetState>) -> Result<Vec<String>, String> {
    let node = state.node()?;
    let answered = node.reconnect_all().await;
    log_command::<()>(&node, "reconectar_todos", None, &Ok(()));
    Ok(answered)
}

#[tauri::command]
pub async fn net_pair(state: State<'_, NetState>, device_id: String, code: String) -> Result<(), String> {
    let node = state.node()?;
    let addr = node.addr_of(&device_id)?;
    let internet = node.internet();
    let result = tokio::time::timeout(Duration::from_secs(20), node.pair_with(addr, code.trim())).await.map_err(|_| node::dica_conexao(node::SEM_RESPOSTA, internet, None)).and_then(|result| result);
    log_command(&node, "parear", Some(&device_id), &result);
    result
}

/// "+ › Copiar relatório para IA": estado + últimas 80 linhas do log, em Markdown.
#[tauri::command]
pub fn net_report(state: State<NetState>) -> Result<String, String> {
    let node = state.node()?;
    let snapshot = serde_json::to_string_pretty(&state_snapshot(&node)).map_err(|error| error.to_string())?;
    let lines = netlog::read_tail(&node.dir(), 80, false).iter().map(|line| line.to_string()).collect::<Vec<_>>().join("\n");
    Ok(format!("# Relatório da rede do Open Assistant (Windows)\n\n## Estado (`estado.json`)\n\n```json\n{snapshot}\n```\n\n## Últimas 80 linhas de `log.jsonl`\n\n```jsonl\n{lines}\n```\n"))
}

/// Configurações › Conectores MCP: comando para registrar o MCP da rede deste app no Claude Code.
#[tauri::command]
pub fn net_mcp_command() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(format!("claude mcp add open-assistant-rede -- \"{}\" --mcp-rede", exe.display()))
}

/// "+ › Abrir logs da rede": pasta `rede` no Explorador.
#[tauri::command]
pub fn net_open_logs(app: AppHandle) -> Result<(), String> {
    let dir = net_dir(&app)?;
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn net_forget(state: State<NetState>, device_id: String) -> Result<(), String> {
    let node = state.node()?;
    let result = node.forget(&device_id);
    log_command(&node, "esquecer", Some(&device_id), &result);
    result
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

/// Mostra no Explorador o instalador (ou, se não houver, o próprio app) para copiar a outro computador.
#[tauri::command]
pub fn net_reveal_installer(app: AppHandle) -> Result<(), String> {
    let file = match update::find_installer(&installer_dirs(&app)) {
        Some(installer) => installer.path,
        None => std::env::current_exe().map_err(|error| error.to_string())?,
    };
    std::process::Command::new("explorer").arg(format!("/select,{}", file.display())).spawn().map_err(|error| error.to_string())?;
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
    let node = state.node()?;
    send_agent_task(&node, &device_id, &request_id, &task).await
}

pub async fn send_agent_task(node: &Node, device_id: &str, request_id: &str, task: &str) -> Result<String, String> {
    let addr = node.addr_of(device_id)?;
    let result = node.remote_agent(addr, request_id, task).await;
    log_command(node, "tarefa_enviada", Some(device_id), &result);
    result
}

/// Texto entre aspas simples para o PowerShell.
fn ps_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "''"))
}

/// Script que espera este app fechar, instala em silêncio (NSIS `/S`, por usuário, sem pedir administrador) e
/// reabre o app instalado (ou este mesmo arquivo, se a instalação não criar outro).
pub fn install_script(installer: &std::path::Path, current_exe: &std::path::Path) -> String {
    format!(
        "Start-Sleep -Seconds 2; Start-Process -FilePath {} -ArgumentList '/S' -Wait; \
         $app = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Open Assistant') -Filter *.exe -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -notlike 'uninstall*' }} | Select-Object -First 1 -ExpandProperty FullName; \
         if (-not $app) {{ $app = {} }}; Start-Process -FilePath $app",
        ps_quote(&installer.display().to_string()),
        ps_quote(&current_exe.display().to_string())
    )
}

/// Chamado depois que o usuário DESTE PC aceitou e o instalador passou nas conferências.
fn run_installer(app: &AppHandle, installer: &std::path::Path) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    // Testes de ponta a ponta: recebe e confere tudo, mas não instala nem fecha o app.
    if std::env::var_os("OPEN_ASSISTANT_UPDATE_DRY_RUN").is_some() {
        crate::logs::error("rede", &format!("atualização conferida (teste, não instalada): {}", installer.display()));
        return Ok(());
    }
    crate::logs::error("rede", &format!("instalando atualização recebida: {}", installer.display()));
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &install_script(installer, &exe)])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar o instalador: {error}"))?;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        app.exit(0);
    });
    Ok(())
}

/// Pastas onde procurar o instalador para enviar: `Instalador\` ao lado do app, a pasta do app e `rede\instalador\`.
fn installer_dirs(app: &AppHandle) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(folder) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.to_path_buf())) {
        dirs.push(folder.join("Instalador"));
        dirs.push(folder);
    }
    if let Ok(dir) = net_dir(app) {
        dirs.push(dir.join("instalador"));
    }
    dirs
}

/// Instalador que seria enviado (a página Rede mostra nome, versão e data).
#[tauri::command]
pub fn net_installer_info(app: AppHandle) -> Option<update::InstallerFile> {
    update::find_installer(&installer_dirs(&app))
}

/// Manda o instalador para outro computador pareado; lá aparece o cartão "Instalar agora / Depois".
#[tauri::command]
pub async fn net_send_update(app: AppHandle, state: State<'_, NetState>, device_id: String) -> Result<String, String> {
    let node = state.node()?;
    let file = update::find_installer(&installer_dirs(&app)).ok_or("Nenhum instalador encontrado. Gere com `npm run build:installer` e coloque o arquivo \"Open Assistant_…-setup.exe\" na pasta Instalador, ao lado do app.")?;
    let path = file.path.clone();
    let sha256 = tauri::async_runtime::spawn_blocking(move || update::sha256_file(&path)).await.map_err(|error| error.to_string())??;
    let addr = node.addr_of(&device_id)?;
    let log_id = device_id.clone();
    let progress_app = app.clone();
    let mut on_progress = move |sent: u64, total: u64| {
        let _ = progress_app.emit(UPDATE_PROGRESS_EVENT, UpdateProgressEvent { device_id: device_id.clone(), sent, total });
    };
    let result = tokio::time::timeout(Duration::from_secs(900), node.send_update(addr, &file, &sha256, &mut on_progress)).await.map_err(|_| "O envio passou de 15 minutos.".to_string()).and_then(|result| result);
    log_command(&node, "enviar_atualizacao", Some(&log_id), &result);
    result
}

/// A tela deste PC respondeu a uma oferta de atualização.
#[tauri::command]
pub fn net_update_reply(state: State<NetState>, id: String, install: bool) -> Result<(), String> {
    let sender = state.pending_updates.lock().map_err(|_| "estado da rede indisponível")?.remove(&id).ok_or("Oferta não encontrada (pode ter expirado).")?;
    let _ = sender.send(if install { UpdateDecision::Now } else { UpdateDecision::Later });
    Ok(())
}

/// Cancelamento do chat remoto usa o mesmo mapa do `ollama_cancel_chat`.
pub fn chat_request(request_id: &str, model: &str, messages: serde_json::Value, think: Option<bool>, think_level: Option<String>, options: Option<serde_json::Value>, cancel: Arc<AtomicBool>) -> node::ChatRequestData {
    node::ChatRequestData { request_id: request_id.into(), model: model.into(), messages, think, think_level, options, cancel, from_name: String::new() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_script_quotes_paths_and_runs_silently() {
        let script = install_script(std::path::Path::new(r"C:\Users\O'Neil\rede\atualizacoes\Open Assistant_0.2.0_x64-setup.exe"), std::path::Path::new(r"C:\Apps\Open Assistant.exe"));
        assert!(script.contains(r"-FilePath 'C:\Users\O''Neil\rede\atualizacoes\Open Assistant_0.2.0_x64-setup.exe' -ArgumentList '/S' -Wait"));
        assert!(script.contains(r"$app = 'C:\Apps\Open Assistant.exe'"));
        assert!(script.starts_with("Start-Sleep"));
    }

    #[test]
    fn parses_arp_lines_and_skips_multicast() {
        let text = "192.168.0.10,a0-b1-c2-d3-e4-f5\r\n224.0.0.22,01-00-5E-00-00-16\r\n192.168.0.255,FF-FF-FF-FF-FF-FF\r\n192.168.0.1,00-00-00-00-00-00\r\n";
        assert_eq!(parse_neighbors(text), vec![Neighbor { ip: "192.168.0.10".into(), mac: "A0:B1:C2:D3:E4:F5".into() }]);
    }
}
