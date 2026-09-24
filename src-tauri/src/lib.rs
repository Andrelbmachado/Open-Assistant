use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    io::Write,
    net::{SocketAddr, TcpStream},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};

const CREDENTIAL_SERVICE: &str = "com.openassistant.windows";

struct TerminalSession {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
struct AppState {
    terminals: Mutex<HashMap<String, TerminalSession>>,
    qa_credentials: Mutex<HashMap<String, String>>,
}

fn is_qa_app(app: &AppHandle) -> bool {
    app.config().identifier == "com.openassistant.windows.qa"
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
    stream: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    component: String,
    installed: bool,
    running: bool,
    version: Option<String>,
    binary_path: Option<String>,
    port: u16,
    error: Option<String>,
}

fn emit_reader<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    session_id: String,
    mut reader: R,
    stream: &'static str,
) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_id.clone(),
                            data: chunk,
                            stream: stream.to_string(),
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_id.clone(),
                            data: format!("Falha ao ler o terminal: {error}\r\n"),
                            stream: "error".to_string(),
                        },
                    );
                    break;
                }
            }
        }
        let _ = app.emit(
            "terminal-exit",
            serde_json::json!({ "sessionId": session_id }),
        );
    });
}

fn qa_terminal_output(input: &str) -> String {
    format!("[QA offline] Comando simulado: {}\r\n", input.trim())
}

#[tauri::command]
fn spawn_terminal_session(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    shell: Option<String>,
) -> Result<String, String> {
    if is_qa_app(&app) {
        app.emit(
            "terminal-output",
            TerminalOutput {
                session_id: session_id.clone(),
                data: "Open Assistant Terminal · QA Offline\r\n".to_string(),
                stream: "stdout".to_string(),
            },
        )
        .map_err(|error| error.to_string())?;
        return Ok(session_id);
    }
    let requested = shell.unwrap_or_else(|| "powershell".into()).to_lowercase();
    let (program, args): (&str, &[&str]) = if requested == "cmd" {
        ("cmd.exe", &["/Q", "/D", "/K", "chcp 65001>nul"])
    } else {
        (
            "powershell.exe",
            &[
                "-NoLogo",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-NoExit",
                "-Command",
                "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $OutputEncoding = [Console]::OutputEncoding",
            ],
        )
    };

    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("Não foi possível abrir {program}: {error}"))?;

    let stdin = child.stdin.take().ok_or("stdin indisponível")?;
    let stdout = child.stdout.take().ok_or("stdout indisponível")?;
    let stderr = child.stderr.take().ok_or("stderr indisponível")?;

    emit_reader(app.clone(), session_id.clone(), stdout, "stdout");
    emit_reader(app, session_id.clone(), stderr, "stderr");

    state
        .terminals
        .lock()
        .map_err(|_| "estado do terminal indisponível")?
        .insert(session_id.clone(), TerminalSession { child, stdin });

    Ok(session_id)
}

#[tauri::command]
fn write_terminal_session(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    if is_qa_app(&app) {
        app.emit(
            "terminal-output",
            TerminalOutput {
                session_id,
                data: qa_terminal_output(&input),
                stream: "stdout".to_string(),
            },
        )
        .map_err(|error| error.to_string())?;
        return Ok(());
    }
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "estado do terminal indisponível")?;
    let terminal = terminals
        .get_mut(&session_id)
        .ok_or("sessão de terminal não encontrada")?;
    terminal
        .stdin
        .write_all(input.as_bytes())
        .and_then(|_| terminal.stdin.flush())
        .map_err(|error| format!("falha ao escrever no terminal: {error}"))
}

#[tauri::command]
fn terminate_terminal_session(state: State<AppState>, session_id: String) -> Result<(), String> {
    if let Some(mut terminal) = state
        .terminals
        .lock()
        .map_err(|_| "estado do terminal indisponível")?
        .remove(&session_id)
    {
        terminal
            .child
            .kill()
            .map_err(|error| format!("falha ao encerrar o terminal: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn save_credential(
    app: AppHandle,
    state: State<AppState>,
    account: String,
    secret: String,
) -> Result<(), String> {
    if is_qa_app(&app) {
        state
            .qa_credentials
            .lock()
            .map_err(|_| "estado QA de credenciais indisponível".to_string())?
            .insert(account, secret);
        return Ok(());
    }
    keyring::Entry::new(CREDENTIAL_SERVICE, &account)
        .map_err(|error| error.to_string())?
        .set_password(&secret)
        .map_err(|error| format!("falha ao salvar no Gerenciador de Credenciais: {error}"))
}

#[tauri::command]
fn read_credential(
    app: AppHandle,
    state: State<AppState>,
    account: String,
) -> Result<Option<String>, String> {
    if is_qa_app(&app) {
        return state
            .qa_credentials
            .lock()
            .map_err(|_| "estado QA de credenciais indisponível".to_string())
            .map(|credentials| credentials.get(&account).cloned());
    }
    let entry =
        keyring::Entry::new(CREDENTIAL_SERVICE, &account).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("falha ao ler credencial: {error}")),
    }
}

#[tauri::command]
fn delete_credential(
    app: AppHandle,
    state: State<AppState>,
    account: String,
) -> Result<(), String> {
    if is_qa_app(&app) {
        state
            .qa_credentials
            .lock()
            .map_err(|_| "estado QA de credenciais indisponível".to_string())?
            .remove(&account);
        return Ok(());
    }
    let entry =
        keyring::Entry::new(CREDENTIAL_SERVICE, &account).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("falha ao remover credencial: {error}")),
    }
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program)
        .args(args)
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn find_binary(executable: &str) -> Option<String> {
    if let Some(path) = command_output("where.exe", &[executable])
        .and_then(|value| value.lines().next().map(str::to_string))
    {
        return Some(path);
    }
    if executable.to_lowercase().contains("ollama") {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let candidate = std::path::PathBuf::from(local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe");
            if candidate.exists() {
                return candidate.to_str().map(str::to_string);
            }
        }
        let prog_files = std::path::PathBuf::from("C:\\Program Files\\Ollama\\ollama.exe");
        if prog_files.exists() {
            return prog_files.to_str().map(str::to_string);
        }
    }
    None
}

fn check_runtime(component: &str, executable: &str, port: u16) -> RuntimeStatus {
    let binary_path = find_binary(executable);
    let installed = binary_path.is_some();
    let running = SocketAddr::from(([127, 0, 0, 1], port));
    let running = TcpStream::connect_timeout(&running, Duration::from_millis(350)).is_ok();
    let version = if let Some(ref path) = binary_path {
        command_output(path, &["--version"])
    } else {
        None
    };

    RuntimeStatus {
        component: component.to_string(),
        installed,
        running,
        version,
        binary_path,
        port,
        error: None,
    }
}

fn qa_runtime_statuses() -> Vec<RuntimeStatus> {
    vec![
        RuntimeStatus {
            component: "ollama".to_string(),
            installed: true,
            running: false,
            version: Some("QA simulado".to_string()),
            binary_path: Some("Modo QA offline".to_string()),
            port: 11434,
            error: None,
        },
        RuntimeStatus {
            component: "openclaw".to_string(),
            installed: true,
            running: false,
            version: Some("QA simulado".to_string()),
            binary_path: Some("Modo QA offline".to_string()),
            port: 18789,
            error: None,
        },
    ]
}

#[tauri::command]
fn check_local_runtime_status(app: AppHandle) -> Vec<RuntimeStatus> {
    if is_qa_app(&app) {
        return qa_runtime_statuses();
    }
    vec![
        check_runtime("ollama", "ollama.exe", 11434),
        check_runtime("openclaw", "openclaw.exe", 18789),
    ]
}

#[tauri::command]
fn start_runtime(app: AppHandle, component: String) -> Result<String, String> {
    if is_qa_app(&app) {
        return Ok(format!("{component} iniciado em modo QA simulado"));
    }
    let executable = match component.to_lowercase().as_str() {
        "ollama" => "ollama.exe",
        "openclaw" => "openclaw.exe",
        _ => return Err(format!("componente desconhecido: {component}")),
    };

    let binary = find_binary(executable)
        .ok_or_else(|| format!("{executable} não encontrado no sistema."))?;

    if component.to_lowercase() == "ollama" {
        Command::new(&binary)
            .arg("serve")
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Falha ao iniciar {component}: {e}"))?;
    } else {
        Command::new(&binary)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Falha ao iniciar {component}: {e}"))?;
    }

    Ok(format!("{component} iniciado com sucesso"))
}

#[tauri::command]
fn app_ready(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            spawn_terminal_session,
            write_terminal_session,
            terminate_terminal_session,
            save_credential,
            read_credential,
            delete_credential,
            check_local_runtime_status,
            start_runtime,
            app_ready
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Open Assistant");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_status_uses_camel_case_for_frontend() {
        let value = serde_json::to_value(RuntimeStatus {
            component: "ollama".into(),
            installed: false,
            running: false,
            version: None,
            binary_path: Some("C:\\Ollama\\ollama.exe".into()),
            port: 11434,
            error: None,
        })
        .expect("runtime status should serialize");

        assert_eq!(value["binaryPath"], "C:\\Ollama\\ollama.exe");
        assert_eq!(value["port"], 11434);
    }

    #[test]
    fn terminal_output_uses_expected_event_shape() {
        let value = serde_json::to_value(TerminalOutput {
            session_id: "session-1".into(),
            data: "ok\r\n".into(),
            stream: "stdout".into(),
        })
        .expect("terminal output should serialize");

        assert_eq!(value["sessionId"], "session-1");
        assert_eq!(value["stream"], "stdout");
    }

    #[test]
    fn windows_command_roundtrip_works() {
        let output = command_output("cmd.exe", &["/D", "/C", "echo", "terminal-ok"])
            .expect("Windows command shell should be available");

        assert_eq!(output, "terminal-ok");
    }

    #[test]
    fn qa_runtime_statuses_are_safe_simulations() {
        let statuses = qa_runtime_statuses();

        assert_eq!(statuses.len(), 2);
        assert!(statuses
            .iter()
            .all(|status| status.installed && !status.running));
        assert!(statuses
            .iter()
            .all(|status| status.version.as_deref() == Some("QA simulado")));
    }

    #[test]
    fn qa_terminal_output_never_executes_the_requested_command() {
        assert_eq!(
            qa_terminal_output("Get-Location"),
            "[QA offline] Comando simulado: Get-Location\r\n"
        );
    }
}
