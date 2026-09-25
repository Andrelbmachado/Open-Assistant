//! Cliente MCP (Model Context Protocol) via stdio, para o agente usar conectores como
//! Playwright, Windows-MCP e Fetch.
//!
//! Configuração no formato do Claude Desktop em
//! `%LOCALAPPDATA%\com.openassistant.windows\mcp.json`:
//! `{ "mcpServers": { "nome": { "command": "npx", "args": [...], "env": {...}, "disabled": false } } }`.
//! Cada servidor é um processo filho; mensagens JSON-RPC 2.0, uma por linha.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, State};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PROTOCOL_VERSION: &str = "2025-06-18";
/// A primeira execução de `npx`/`uvx` baixa o pacote; o `initialize` pode demorar.
const START_TIMEOUT: Duration = Duration::from_secs(120);
const CALL_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct ServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    #[serde(default)]
    pub mcp_servers: HashMap<String, ServerConfig>,
}

type Pending = Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>;

struct Running {
    child: Child,
    stdin: ChildStdin,
    pending: Pending,
    next_id: AtomicU64,
    tools: Vec<Value>,
}

#[derive(Default)]
pub struct McpState {
    servers: Mutex<HashMap<String, Running>>,
    errors: Mutex<HashMap<String, String>>,
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("mcp.json"))
        .map_err(|error| format!("Pasta de dados do app indisponível: {error}"))
}

pub fn load_config(app: &AppHandle) -> McpConfig {
    config_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn send(stdin: &mut ChildStdin, message: &Value) -> Result<(), String> {
    let line = serde_json::to_string(message).map_err(|error| error.to_string())?;
    stdin
        .write_all(format!("{line}\n").as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("O conector fechou a conexão: {error}"))
}

fn request(running: &mut Running, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
    let id = running.next_id.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = mpsc::channel();
    running.pending.lock().map_err(|_| "estado MCP indisponível")?.insert(id, sender);
    send(&mut running.stdin, &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?;
    let response = receiver.recv_timeout(timeout).map_err(|_| format!("O conector não respondeu a {method} em {} s.", timeout.as_secs()))?;
    if let Some(error) = response.get("error") {
        return Err(format!("Erro do conector: {}", error.get("message").and_then(Value::as_str).unwrap_or("desconhecido")));
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

/// Inicia o servidor, faz o handshake e lista as ferramentas.
fn start(name: &str, config: &ServerConfig) -> Result<Running, String> {
    // `npx`/`uvx` são .cmd no Windows: passar pelo cmd resolve a extensão.
    let mut command = Command::new("cmd.exe");
    command.arg("/d").arg("/c").arg(&config.command).args(&config.args);
    for (key, value) in &config.env {
        command.env(key, value);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar {name}: {error}"))?;
    let stdin = child.stdin.take().ok_or("sem stdin")?;
    let stdout = child.stdout.take().ok_or("sem stdout")?;
    let pending: Pending = Arc::default();
    let reader_pending = pending.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
            // Só respostas (com id e sem method) interessam; notificações e pedidos do servidor são ignorados.
            if message.get("method").is_some() {
                continue;
            }
            if let Some(id) = message.get("id").and_then(Value::as_u64) {
                if let Some(sender) = reader_pending.lock().ok().and_then(|mut pending| pending.remove(&id)) {
                    let _ = sender.send(message);
                }
            }
        }
    });
    let mut running = Running { child, stdin, pending, next_id: AtomicU64::new(1), tools: Vec::new() };
    let initialized = request(
        &mut running,
        "initialize",
        json!({ "protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": { "name": "open-assistant", "version": "0.1.0" } }),
        START_TIMEOUT,
    );
    if let Err(error) = initialized {
        let _ = running.child.kill();
        return Err(error);
    }
    send(&mut running.stdin, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))?;
    let listed = request(&mut running, "tools/list", json!({}), START_TIMEOUT)?;
    running.tools = listed.get("tools").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(running)
}

/// Nome exposto ao modelo: `mcp__<servidor>__<ferramenta>` (só [a-zA-Z0-9_-]).
pub fn exposed_name(server: &str, tool: &str) -> String {
    let clean = |text: &str| text.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect::<String>();
    format!("mcp__{}__{}", clean(server), clean(tool))
}

/// Liga os servidores habilitados que ainda não estão rodando.
pub fn ensure_started(app: &AppHandle) {
    let config = load_config(app);
    let state = app.state::<McpState>();
    for (name, server) in config.mcp_servers.iter().filter(|(_, server)| !server.disabled) {
        let running = state.servers.lock().map(|servers| servers.contains_key(name)).unwrap_or(true);
        if running {
            continue;
        }
        match start(name, server) {
            Ok(running) => {
                if let Ok(mut servers) = state.servers.lock() {
                    servers.insert(name.clone(), running);
                }
                if let Ok(mut errors) = state.errors.lock() {
                    errors.remove(name);
                }
            }
            Err(error) => {
                if let Ok(mut errors) = state.errors.lock() {
                    errors.insert(name.clone(), error);
                }
            }
        }
    }
}

/// Ferramentas MCP no formato do Ollama. Descrições são cortadas: cada token de prompt pesa num 9B.
pub fn tool_definitions(app: &AppHandle) -> Vec<Value> {
    let state = app.state::<McpState>();
    let Ok(servers) = state.servers.lock() else { return Vec::new() };
    let mut definitions = Vec::new();
    for (server, running) in servers.iter() {
        for tool in &running.tools {
            let Some(name) = tool.get("name").and_then(Value::as_str) else { continue };
            let description: String = tool.get("description").and_then(Value::as_str).unwrap_or_default().chars().take(240).collect();
            let schema = tool.get("inputSchema").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
            definitions.push(json!({ "type": "function", "function": {
                "name": exposed_name(server, name),
                "description": format!("[{server}] {description}"),
                "parameters": schema,
            }}));
        }
    }
    definitions
}

pub struct CallOutput {
    pub text: String,
    pub image: Option<String>,
    pub is_error: bool,
}

/// Executa `mcp__servidor__ferramenta` com os argumentos do modelo.
pub fn call(app: &AppHandle, exposed: &str, args: &Value) -> Result<CallOutput, String> {
    let state = app.state::<McpState>();
    let mut servers = state.servers.lock().map_err(|_| "estado MCP indisponível")?;
    let (server, tool) = servers
        .iter()
        .find_map(|(server, running)| {
            running.tools.iter().filter_map(|tool| tool.get("name").and_then(Value::as_str)).find_map(|tool| {
                (exposed_name(server, tool) == exposed).then(|| (server.clone(), tool.to_string()))
            })
        })
        .ok_or_else(|| format!("Conector não encontrado para {exposed}. Ele pode ter sido desligado."))?;
    let running = servers.get_mut(&server).ok_or("conector parado")?;
    let result = request(running, "tools/call", json!({ "name": tool, "arguments": args }), CALL_TIMEOUT)?;
    let mut texts = Vec::new();
    let mut image = None;
    for item in result.get("content").and_then(Value::as_array).cloned().unwrap_or_default() {
        match item.get("type").and_then(Value::as_str) {
            Some("text") => texts.push(item.get("text").and_then(Value::as_str).unwrap_or_default().to_string()),
            Some("image") if image.is_none() => image = item.get("data").and_then(Value::as_str).map(str::to_string),
            Some(other) => texts.push(format!("[{other}]")),
            None => {}
        }
    }
    Ok(CallOutput { text: texts.join("\n"), image, is_error: result.get("isError").and_then(Value::as_bool).unwrap_or(false) })
}

fn stop(state: &McpState, name: &str) {
    if let Ok(mut servers) = state.servers.lock() {
        if let Some(mut running) = servers.remove(name) {
            // Os servidores Node/Python rodam sob o cmd: /T derruba a árvore toda.
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &running.child.id().to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            let _ = running.child.wait();
        }
    }
}

pub fn stop_all(app: &AppHandle) {
    if let Some(state) = app.try_state::<McpState>() {
        let names: Vec<String> = state.servers.lock().map(|servers| servers.keys().cloned().collect()).unwrap_or_default();
        for name in names {
            stop(&state, &name);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    name: String,
    command: String,
    args: Vec<String>,
    disabled: bool,
    running: bool,
    tools: Vec<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOverview {
    servers: Vec<ServerStatus>,
    config_path: String,
    /// `npx` (Node.js) e `uvx` (uv) disponíveis? A maioria dos conectores precisa de um deles.
    has_npx: bool,
    has_uvx: bool,
}

fn on_path(executable: &str) -> bool {
    Command::new("where.exe")
        .arg(executable)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
        || (executable == "uvx"
            && std::env::var("USERPROFILE").map(|home| PathBuf::from(home).join(".local\\bin\\uvx.exe").is_file()).unwrap_or(false))
}

/// Estado dos conectores configurados + presença de npx/uvx.
#[tauri::command]
pub fn mcp_overview(app: AppHandle, state: State<McpState>) -> Result<McpOverview, String> {
    let config = load_config(&app);
    let servers = state.servers.lock().map_err(|_| "estado MCP indisponível")?;
    let errors = state.errors.lock().map_err(|_| "estado MCP indisponível")?;
    let mut list: Vec<ServerStatus> = config
        .mcp_servers
        .iter()
        .map(|(name, server)| ServerStatus {
            name: name.clone(),
            command: server.command.clone(),
            args: server.args.clone(),
            disabled: server.disabled,
            running: servers.contains_key(name),
            tools: servers
                .get(name)
                .map(|running| running.tools.iter().filter_map(|tool| tool.get("name").and_then(Value::as_str).map(str::to_string)).collect())
                .unwrap_or_default(),
            error: errors.get(name).cloned(),
        })
        .collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(McpOverview {
        servers: list,
        config_path: config_path(&app)?.to_string_lossy().into_owned(),
        has_npx: on_path("npx"),
        has_uvx: on_path("uvx"),
    })
}

/// Grava a configuração inteira (JSON no formato do Claude Desktop) e para os servidores removidos/desligados.
#[tauri::command]
pub fn mcp_save_config(app: AppHandle, state: State<McpState>, json_text: String) -> Result<(), String> {
    let config: McpConfig = serde_json::from_str(&json_text).map_err(|error| format!("JSON inválido: {error}"))?;
    for (name, server) in &config.mcp_servers {
        if server.command.trim().is_empty() {
            return Err(format!("O conector \"{name}\" precisa de \"command\"."));
        }
    }
    let path = config_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let running: Vec<String> = state.servers.lock().map(|servers| servers.keys().cloned().collect()).unwrap_or_default();
    for name in running {
        let keep = config.mcp_servers.get(&name).is_some_and(|server| !server.disabled);
        if !keep {
            stop(&state, &name);
        }
    }
    Ok(())
}

/// Inicia os conectores habilitados que estão parados.
#[tauri::command]
pub async fn mcp_start(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ensure_started(&app)).await.map_err(|error| error.to_string())
}

/// Para um conector (mata a árvore de processos).
#[tauri::command]
pub fn mcp_stop(state: State<McpState>, name: String) {
    stop(&state, &name);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposed_names_are_safe_for_tool_calling() {
        assert_eq!(exposed_name("playwright", "browser_click"), "mcp__playwright__browser_click");
        assert_eq!(exposed_name("windows mcp", "Click-Tool"), "mcp__windows_mcp__Click-Tool");
    }

    #[test]
    fn claude_desktop_config_format_parses() {
        let config: McpConfig = serde_json::from_str(r#"{ "mcpServers": { "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] } } }"#).unwrap();
        let fetch = &config.mcp_servers["fetch"];
        assert_eq!(fetch.command, "uvx");
        assert_eq!(fetch.args, vec!["mcp-server-fetch"]);
        assert!(!fetch.disabled);
    }
}
