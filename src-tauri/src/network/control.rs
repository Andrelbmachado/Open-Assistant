//! Canal de controle local da rede (mesmos comandos do app do Mac): named pipe
//! `\\.\pipe\open-assistant-rede-<usuário>`, só para o usuário atual (ACL com o SID dele) e sem clientes remotos.
//! Uma linha JSON por pedido `{"id","command",...}` → `{"id","ok","result"|"error"}`. O modo MCP (`--mcp-rede`)
//! fala com o app por aqui.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use super::{log_command, netlog, send_agent_task, set_internet, state_snapshot, NetState};

/// Nome do pipe deste usuário (`OPEN_ASSISTANT_NET_PIPE` troca, para testar dois apps no mesmo PC).
pub fn pipe_name() -> String {
    if let Ok(name) = std::env::var("OPEN_ASSISTANT_NET_PIPE") {
        return name;
    }
    let user: String = std::env::var("USERNAME").unwrap_or_else(|_| "usuario".into()).chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    format!(r"\\.\pipe\open-assistant-rede-{user}")
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = serve(app.clone()).await {
            if let Ok(node) = app.state::<NetState>().node() {
                node.log().warn("controle_falhou", json!({ "erro": error }));
            }
        }
    });
}

/// SDDL que só dá acesso ao usuário atual (e ao sistema).
fn owner_only_sddl() -> Result<String, String> {
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HLOCAL, LocalFree};
    use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).map_err(|error| error.to_string())?;
        let mut size = 0u32;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut size);
        let mut buffer = vec![0u8; size as usize];
        let read = GetTokenInformation(token, TokenUser, Some(buffer.as_mut_ptr().cast()), size, &mut size);
        let _ = CloseHandle(token);
        read.map_err(|error| error.to_string())?;
        let user = &*(buffer.as_ptr() as *const TOKEN_USER);
        let mut text = windows::core::PWSTR::null();
        ConvertSidToStringSidW(user.User.Sid, &mut text).map_err(|error| error.to_string())?;
        let sid = text.to_string().map_err(|error| error.to_string())?;
        let _ = LocalFree(Some(HLOCAL(text.0.cast())));
        Ok(format!("D:P(A;;GA;;;{sid})(A;;GA;;;SY)"))
    }
}

/// `SECURITY_ATTRIBUTES` do pipe (criado uma vez e mantido pelo resto do app; devolvido como endereço para
/// atravessar os `await`).
fn owner_only_attributes() -> Result<usize, String> {
    use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
    use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
    let sddl: Vec<u16> = owner_only_sddl()?.encode_utf16().chain(std::iter::once(0)).collect();
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(windows::core::PCWSTR(sddl.as_ptr()), SDDL_REVISION_1, &mut descriptor, None) }.map_err(|error| error.to_string())?;
    let attributes = Box::leak(Box::new(SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: descriptor.0, bInheritHandle: false.into() }));
    Ok(attributes as *mut SECURITY_ATTRIBUTES as usize)
}

async fn serve(app: AppHandle) -> Result<(), String> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let name = pipe_name();
    let attributes = owner_only_attributes()?;
    let mut first = true;
    loop {
        let mut options = ServerOptions::new();
        options.first_pipe_instance(first).reject_remote_clients(true);
        // SAFETY: `attributes` aponta para um SECURITY_ATTRIBUTES válido que nunca é liberado.
        let server = unsafe { options.create_with_security_attributes_raw(&name, attributes as *mut std::ffi::c_void) }.map_err(|error| format!("pipe {name}: {error}"))?;
        first = false;
        server.connect().await.map_err(|error| error.to_string())?;
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = handle_client(app, server).await;
        });
    }
}

async fn handle_client(app: AppHandle, pipe: tokio::net::windows::named_pipe::NamedPipeServer) -> Result<(), String> {
    let (read, mut write) = tokio::io::split(pipe);
    let mut lines = BufReader::new(read).lines();
    while let Some(line) = lines.next_line().await.map_err(|error| error.to_string())? {
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(request) => {
                let id = request.get("id").cloned().unwrap_or(Value::Null);
                let command = request.get("command").and_then(Value::as_str).unwrap_or_default().to_string();
                match dispatch(&app, &command, &request).await {
                    Ok(result) => json!({ "id": id, "ok": true, "result": result }),
                    Err(error) => json!({ "id": id, "ok": false, "error": error }),
                }
            }
            Err(error) => json!({ "id": null, "ok": false, "error": format!("JSON inválido: {error}") }),
        };
        write.write_all(format!("{reply}\n").as_bytes()).await.map_err(|error| error.to_string())?;
        write.flush().await.map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Os comandos do canal (iguais aos do Mac).
pub async fn dispatch(app: &AppHandle, command: &str, args: &Value) -> Result<Value, String> {
    let node = app.state::<NetState>().node()?;
    match command {
        "diagnostico" => Ok(state_snapshot(&node)),
        "devices" => Ok(json!(node.devices())),
        "log" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(50).clamp(1, 500) as usize;
            let problems_only = args.get("problemsOnly").and_then(Value::as_bool).unwrap_or(false);
            Ok(json!(netlog::read_tail(&node.dir(), limit, problems_only)))
        }
        "reconnect" => match args.get("deviceId").and_then(Value::as_str) {
            Some(id) => {
                let result = node.reconnect(id).await.map(|info| json!({ "respondeu": [id], "nome": info.name }));
                log_command(&node, "reconectar", Some(id), &result);
                result
            }
            None => {
                let answered = node.reconnect_all().await;
                log_command::<()>(&node, "reconectar_todos", None, &Ok(()));
                Ok(json!({ "respondeu": answered }))
            }
        },
        "currentCode" => {
            let (code, expires_in) = node.current_code();
            Ok(json!({ "code": code, "expiresIn": expires_in }))
        }
        "setInternet" => {
            let enabled = args.get("enabled").and_then(Value::as_bool).ok_or("Falta \"enabled\" (true/false).")?;
            drop(node);
            set_internet(app, enabled).await?;
            Ok(json!({ "internet": enabled }))
        }
        "agent" => {
            let device_id = args.get("deviceId").and_then(Value::as_str).ok_or("Falta \"deviceId\".")?;
            let task = args.get("task").and_then(Value::as_str).filter(|task| !task.trim().is_empty()).ok_or("Falta \"task\".")?;
            let request_id = args.get("requestId").and_then(Value::as_str).map(String::from).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let answer = send_agent_task(&node, device_id, &request_id, task).await?;
            Ok(json!({ "resposta": answer }))
        }
        other => Err(format!("Comando desconhecido: {other}")),
    }
}
