//! MCP da rede (stdio, JSON-RPC 2.0, uma mensagem por linha): `Open Assistant.exe --mcp-rede`. Mesmas ferramentas do
//! app do Mac: rede_diagnostico, rede_log, rede_dispositivos, rede_reconectar, rede_codigo, rede_internet, rede_tarefa.
//! Fala com o app aberto pelo named pipe (`control.rs`); com o app fechado, as de leitura usam `estado.json` e
//! `log.jsonl` do disco. Não abre a janela nem a rede.
//!
//! Registrar no Claude Code: `claude mcp add open-assistant-rede -- "C:\...\Open Assistant.exe" --mcp-rede`

use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use super::netlog;

pub struct Ctx {
    pub pipe: String,
    pub dir: PathBuf,
}

impl Ctx {
    pub fn from_env() -> Ctx {
        let dir = std::env::var_os("OPEN_ASSISTANT_NET_DIR").map(PathBuf::from).unwrap_or_else(|| {
            let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default();
            base.join("com.openassistant.windows").join("rede")
        });
        Ctx { pipe: super::control::pipe_name(), dir }
    }
}

/// Entrada do modo `--mcp-rede` (bloqueia até o stdin fechar). Devolve o código de saída.
pub fn run() -> i32 {
    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(_) => return 1,
    };
    runtime.block_on(serve_stdio(Ctx::from_env()))
}

async fn serve_stdio(ctx: Ctx) -> i32 {
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut stdout = tokio::io::stdout();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(message) => handle(&ctx, &message).await,
            Err(error) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": format!("JSON inválido: {error}") } })),
        };
        if let Some(reply) = reply {
            if stdout.write_all(format!("{reply}\n").as_bytes()).await.is_err() || stdout.flush().await.is_err() {
                break;
            }
        }
    }
    0
}

/// Uma mensagem JSON-RPC → resposta (`None` para notificações).
pub async fn handle(ctx: &Ctx, message: &Value) -> Option<Value> {
    let id = message.get("id").cloned()?;
    let method = message.get("method").and_then(Value::as_str).unwrap_or_default();
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "open-assistant-rede", "version": env!("CARGO_PKG_VERSION") },
            "instructions": "Rede do Open Assistant (Windows): diagnóstico, log, computadores pareados, reconectar, código, Internet e tarefas para o agente de outro computador."
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or_default();
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            let (text, is_error) = match call_tool(ctx, name, &args).await {
                Ok(value) => (serde_json::to_string_pretty(&value).unwrap_or_default(), false),
                Err(error) => (error, true),
            };
            Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
        }
        other => Err(json!({ "code": -32601, "message": format!("Método desconhecido: {other}") })),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
    })
}

pub fn tools() -> Vec<Value> {
    let empty = json!({ "type": "object", "properties": {} });
    vec![
        json!({ "name": "rede_diagnostico", "description": "Estado da rede deste computador: porta, Internet, pareados (online, última vez visto, endereços) e problemas recentes. Funciona com o app fechado (lê estado.json).", "inputSchema": empty }),
        json!({ "name": "rede_log", "description": "Últimas linhas do log da rede (log.jsonl), uma por evento.", "inputSchema": { "type": "object", "properties": { "limite": { "type": "integer", "description": "Quantas linhas (padrão 50, máx. 500)" }, "soProblemas": { "type": "boolean", "description": "Só avisos e erros" } } } }),
        json!({ "name": "rede_dispositivos", "description": "Computadores pareados e achados na rede, com online/offline.", "inputSchema": empty }),
        json!({ "name": "rede_reconectar", "description": "Reconecta um computador pareado (deviceId) ou todos, sem código.", "inputSchema": { "type": "object", "properties": { "deviceId": { "type": "string" } } } }),
        json!({ "name": "rede_codigo", "description": "Código de 6 dígitos deste computador para parear outro.", "inputSchema": empty }),
        json!({ "name": "rede_internet", "description": "Liga ou desliga a conexão pela internet (reinicia a rede na hora).", "inputSchema": { "type": "object", "properties": { "ligar": { "type": "boolean" } }, "required": ["ligar"] } }),
        json!({ "name": "rede_tarefa", "description": "Manda uma tarefa para o agente de outro computador pareado (ele executa lá, com as confirmações de lá) e devolve a resposta.", "inputSchema": { "type": "object", "properties": { "deviceId": { "type": "string" }, "tarefa": { "type": "string" } }, "required": ["deviceId", "tarefa"] } }),
    ]
}

const APP_CLOSED: &str = "O Open Assistant não está aberto neste computador. Abra o app e tente de novo.";

async fn call_tool(ctx: &Ctx, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "rede_diagnostico" => match call_app(ctx, "diagnostico", json!({})).await {
            Ok(value) => Ok(value),
            Err(AppError::NotRunning) => Ok(offline_state(ctx)),
            Err(AppError::Failed(error)) => Err(error),
        },
        "rede_log" => {
            let limit = args.get("limite").and_then(Value::as_u64).unwrap_or(50).clamp(1, 500);
            let problems_only = args.get("soProblemas").and_then(Value::as_bool).unwrap_or(false);
            match call_app(ctx, "log", json!({ "limit": limit, "problemsOnly": problems_only })).await {
                Err(AppError::NotRunning) => Ok(json!(netlog::read_tail(&ctx.dir, limit as usize, problems_only))),
                other => other.map_err(AppError::text),
            }
        }
        "rede_dispositivos" => match call_app(ctx, "devices", json!({})).await {
            Err(AppError::NotRunning) => Ok(offline_state(ctx).get("dispositivos").cloned().unwrap_or(json!([]))),
            other => other.map_err(AppError::text),
        },
        "rede_reconectar" => {
            let payload = match args.get("deviceId").and_then(Value::as_str) {
                Some(id) => json!({ "deviceId": id }),
                None => json!({}),
            };
            call_app(ctx, "reconnect", payload).await.map_err(AppError::text)
        }
        "rede_codigo" => call_app(ctx, "currentCode", json!({})).await.map_err(AppError::text),
        "rede_internet" => {
            let enabled = args.get("ligar").and_then(Value::as_bool).ok_or("Falta \"ligar\" (true/false).")?;
            call_app(ctx, "setInternet", json!({ "enabled": enabled })).await.map_err(AppError::text)
        }
        "rede_tarefa" => {
            let device_id = args.get("deviceId").and_then(Value::as_str).ok_or("Falta \"deviceId\".")?;
            let task = args.get("tarefa").and_then(Value::as_str).ok_or("Falta \"tarefa\".")?;
            call_app(ctx, "agent", json!({ "deviceId": device_id, "task": task, "requestId": uuid::Uuid::new_v4().to_string() })).await.map_err(AppError::text)
        }
        other => Err(format!("Ferramenta desconhecida: {other}")),
    }
}

/// `estado.json` salvo pelo app, marcado como serviço parado.
fn offline_state(ctx: &Ctx) -> Value {
    let mut state = std::fs::read_to_string(ctx.dir.join(super::STATE_FILE)).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok()).unwrap_or_else(|| json!({ "aviso": "Ainda não há estado salvo (o app nunca abriu a rede neste computador)." }));
    state["servicoRodando"] = Value::Bool(false);
    state
}

enum AppError {
    NotRunning,
    Failed(String),
}

impl AppError {
    fn text(self) -> String {
        match self {
            AppError::NotRunning => APP_CLOSED.into(),
            AppError::Failed(error) => error,
        }
    }
}

/// Um pedido ao app pelo named pipe.
async fn call_app(ctx: &Ctx, command: &str, args: Value) -> Result<Value, AppError> {
    use tokio::net::windows::named_pipe::ClientOptions;
    const PIPE_BUSY: i32 = 231;
    let mut attempts = 0;
    let pipe = loop {
        match ClientOptions::new().open(&ctx.pipe) {
            Ok(pipe) => break pipe,
            Err(error) if error.raw_os_error() == Some(PIPE_BUSY) && attempts < 20 => {
                attempts += 1;
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
            Err(_) => return Err(AppError::NotRunning),
        }
    };
    let (read, mut write) = tokio::io::split(pipe);
    let mut request = args;
    request["id"] = json!("mcp");
    request["command"] = json!(command);
    write.write_all(format!("{request}\n").as_bytes()).await.map_err(|error| AppError::Failed(error.to_string()))?;
    write.flush().await.map_err(|error| AppError::Failed(error.to_string()))?;
    let mut line = String::new();
    // Tarefas de agente podem levar até 10 min no outro computador.
    tokio::time::timeout(std::time::Duration::from_secs(660), BufReader::new(read).read_line(&mut line))
        .await
        .map_err(|_| AppError::Failed("O app não respondeu a tempo.".into()))?
        .map_err(|error| AppError::Failed(error.to_string()))?;
    let reply: Value = serde_json::from_str(&line).map_err(|error| AppError::Failed(format!("Resposta inválida do app: {error}")))?;
    if reply.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(reply.get("result").cloned().unwrap_or(Value::Null))
    } else {
        Err(AppError::Failed(reply.get("error").and_then(Value::as_str).unwrap_or("Erro desconhecido.").to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(name: &str) -> Ctx {
        let dir = std::env::temp_dir().join(format!("oa-mcp-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Ctx { pipe: format!(r"\\.\pipe\oa-mcp-teste-inexistente-{name}-{}", std::process::id()), dir }
    }

    #[tokio::test]
    async fn lists_the_seven_tools_with_the_mac_names() {
        let reply = handle(&ctx("lista"), &json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" })).await.unwrap();
        let names: Vec<&str> = reply["result"]["tools"].as_array().unwrap().iter().map(|tool| tool["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["rede_diagnostico", "rede_log", "rede_dispositivos", "rede_reconectar", "rede_codigo", "rede_internet", "rede_tarefa"]);
        let init = handle(&ctx("init"), &json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } })).await.unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "open-assistant-rede");
        assert!(handle(&ctx("notif"), &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).await.is_none());
        let unknown = handle(&ctx("x"), &json!({ "jsonrpc": "2.0", "id": 9, "method": "nada" })).await.unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }

    #[tokio::test]
    async fn app_closed_reads_the_saved_state_and_log() {
        let ctx = ctx("fechado");
        std::fs::write(ctx.dir.join(super::super::STATE_FILE), r#"{"servicoRodando":true,"porta":57405,"dispositivos":[{"name":"Andres-MacBook-Pro","online":false}]}"#).unwrap();
        netlog::NetLog::new(&ctx.dir).warn("pareado_sem_resposta", json!({ "id": "mac", "erro": "timeout" }));
        let call = |name: &str, args: Value| json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": name, "arguments": args } });
        let reply = handle(&ctx, &call("rede_diagnostico", json!({}))).await.unwrap();
        let state: Value = serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(state["servicoRodando"], false);
        assert_eq!(state["porta"], 57405);
        let devices = handle(&ctx, &call("rede_dispositivos", json!({}))).await.unwrap();
        assert!(devices["result"]["content"][0]["text"].as_str().unwrap().contains("Andres-MacBook-Pro"));
        let log = handle(&ctx, &call("rede_log", json!({ "soProblemas": true }))).await.unwrap();
        assert!(log["result"]["content"][0]["text"].as_str().unwrap().contains("pareado_sem_resposta"));
        let code = handle(&ctx, &call("rede_codigo", json!({}))).await.unwrap();
        assert_eq!(code["result"]["isError"], true);
        assert_eq!(code["result"]["content"][0]["text"], APP_CLOSED);
    }
}
