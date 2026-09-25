use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, VecDeque},
    env,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

mod agent;
mod bitnet;
mod cloud;
mod computer;
mod mcp;
mod semantic;
mod speech;
mod tools;

const CREDENTIAL_SERVICE: &str = "com.openassistant.windows";

struct TerminalSession {
    child: Child,
    stdin: ChildStdin,
}

struct PullHandle {
    operation_id: String,
    control: Arc<AtomicU8>,
}

#[derive(Default)]
struct AppState {
    terminals: Mutex<HashMap<String, TerminalSession>>,
    qa_credentials: Mutex<HashMap<String, String>>,
    local_model_operations: Mutex<HashMap<String, u32>>,
    /// Downloads em andamento, indexados pelo id exato do modelo no Ollama.
    ollama_pulls: Mutex<HashMap<String, PullHandle>>,
    /// Sinal de interrupção de cada geração em andamento, indexado pelo id da requisição.
    ollama_chats: Mutex<HashMap<String, Arc<AtomicBool>>>,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuProfile {
    name: String,
    vram_mb: u64,
    driver_version: Option<String>,
    vendor: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareProfile {
    gpus: Vec<GpuProfile>,
    cpu_name: String,
    ram_mb: u64,
    available_disk_mb: u64,
    warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalModelOperation {
    id: String,
    kind: String,
    state: String,
    message: String,
    model_id: Option<String>,
    progress_percent: Option<u8>,
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

/// Abre uma sessão real de PowerShell/CMD e transmite a saída pelo evento `terminal-output`.
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

/// Envia uma linha de comando para a sessão de terminal.
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

/// Encerra a sessão de terminal e seu processo.
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

/// Guarda uma chave de API no Gerenciador de Credenciais do Windows.
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

/// Lê uma chave salva (ou None).
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

/// Diz se há chave salva sem devolvê-la (o seletor de modelos só precisa saber se existe).
#[tauri::command]
fn has_credential(app: AppHandle, state: State<AppState>, account: String) -> bool {
    read_credential(app, state, account).ok().flatten().is_some_and(|secret| !secret.trim().is_empty())
}

/// Apaga uma chave salva.
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

fn parse_pull_progress(line: &str) -> Option<u8> {
    line.split_whitespace()
        .find_map(|word| word.strip_suffix('%')?.parse::<u8>().ok())
}

fn emit_local_model_operation(app: &AppHandle, operation: LocalModelOperation) {
    let _ = app.emit("local-model-operation", operation);
}

fn stream_local_operation<R: Read + Send + 'static>(
    app: AppHandle,
    id: String,
    kind: String,
    model_id: Option<String>,
    reader: R,
    transcript: Arc<Mutex<Vec<String>>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let message = line.trim().chars().take(180).collect::<String>();
            if message.is_empty() { continue; }
            if let Ok(mut lines) = transcript.lock() { lines.push(message.clone()); }
            emit_local_model_operation(&app, LocalModelOperation {
                id: id.clone(), kind: kind.clone(), state: "running".into(), message,
                model_id: model_id.clone(), progress_percent: parse_pull_progress(&line),
            });
        }
    })
}

fn start_local_operation(
    app: AppHandle,
    state: State<AppState>,
    kind: &str,
    model_id: Option<String>,
    program: &str,
    args: &[&str],
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar {program}: {error}"))?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or("saída do processo indisponível")?;
    let stderr = child.stderr.take().ok_or("erros do processo indisponíveis")?;
    state
        .local_model_operations
        .lock()
        .map_err(|_| "estado de operações locais indisponível")?
        .insert(id.clone(), pid);
    let operation_kind = kind.to_string();
    let emitted_model = model_id.clone();
    let worker_id = id.clone();
    emit_local_model_operation(
        &app,
        LocalModelOperation {
            id: id.clone(),
            kind: operation_kind.clone(),
            state: "running".into(),
            message: "Operação local iniciada.".into(),
            model_id: model_id.clone(),
            progress_percent: Some(0),
        },
    );
    std::thread::spawn(move || {
        let transcript = Arc::new(Mutex::new(Vec::new()));
        let stdout_worker = stream_local_operation(app.clone(), worker_id.clone(), operation_kind.clone(), emitted_model.clone(), stdout, transcript.clone());
        let stderr_worker = stream_local_operation(app.clone(), worker_id.clone(), operation_kind.clone(), emitted_model.clone(), stderr, transcript.clone());
        let output = child.wait();
        let _ = stdout_worker.join();
        let _ = stderr_worker.join();
        let active = app
            .state::<AppState>()
            .local_model_operations
            .lock()
            .ok()
            .and_then(|mut operations| operations.remove(&worker_id))
            .is_some();
        if !active {
            return;
        }
        match output {
            Ok(output) if output.success() => {
                let message = transcript.lock().ok().and_then(|lines| lines.last().cloned()).filter(|line| !line.is_empty()).unwrap_or_else(|| "Operação concluída.".into());
                emit_local_model_operation(
                    &app,
                    LocalModelOperation {
                        id: worker_id,
                        kind: operation_kind,
                        state: "completed".into(),
                        message,
                        model_id: emitted_model,
                        progress_percent: Some(100),
                    },
                );
            }
            Ok(_output) => emit_local_model_operation(
                &app,
                LocalModelOperation {
                    id: worker_id,
                    kind: operation_kind,
                    state: "failed".into(),
                    message: transcript.lock().ok().and_then(|lines| lines.last().cloned()).unwrap_or_else(|| "A operação local falhou.".into()),
                    model_id: emitted_model,
                    progress_percent: None,
                },
            ),
            Err(error) => emit_local_model_operation(
                &app,
                LocalModelOperation {
                    id: worker_id,
                    kind: operation_kind,
                    state: "failed".into(),
                    message: error.to_string(),
                    model_id: emitted_model,
                    progress_percent: None,
                },
            ),
        }
    });
    Ok(id)
}

fn qa_local_operation(app: &AppHandle, kind: &str, model_id: Option<String>) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    emit_local_model_operation(
        app,
        LocalModelOperation {
            id: id.clone(),
            kind: kind.to_string(),
            state: "completed".into(),
            message: "Modo QA offline: operação simulada, sem processo ou rede.".into(),
            model_id,
            progress_percent: Some(100),
        },
    );
    id
}

/// Instala o Ollama pelo winget, transmitindo o progresso.
#[tauri::command]
fn install_ollama(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    if is_qa_app(&app) {
        return Ok(qa_local_operation(&app, "install_runtime", None));
    }
    start_local_operation(
        app,
        state,
        "install_runtime",
        None,
        "winget.exe",
        &[
            "install",
            "--id",
            "Ollama.Ollama",
            "--exact",
            "--source",
            "winget",
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--disable-interactivity",
        ],
    )
}

/// Cancela uma operação local (instalação) em andamento.
#[tauri::command]
fn cancel_local_model_operation(
    app: AppHandle,
    state: State<AppState>,
    operation_id: String,
) -> Result<(), String> {
    if is_qa_app(&app) {
        return Ok(());
    }
    let pid = state
        .local_model_operations
        .lock()
        .map_err(|_| "estado de operações locais indisponível")?
        .remove(&operation_id)
        .ok_or("operação local não encontrada")?;
    let _ = Command::new("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .output();
    emit_local_model_operation(
        &app,
        LocalModelOperation {
            id: operation_id,
            kind: "unknown".into(),
            state: "cancelled".into(),
            message: "Operação cancelada pelo usuário.".into(),
            model_id: None,
            progress_percent: None,
        },
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Ollama (HTTP local)
//
// Todas as chamadas ao Ollama passam pelo backend: no Windows a WebView usa a
// origem http://tauri.localhost, que o Ollama recusa com 403 (CORS).
// ---------------------------------------------------------------------------

const OLLAMA_URL: &str = "http://127.0.0.1:11434";
const OLLAMA_OFFLINE: &str = "O Ollama não está respondendo em 127.0.0.1:11434. Abra Configurações › Modelos locais e clique em Iniciar Ollama.";
const QA_OLLAMA_BLOCKED: &str = "Modo QA offline: o Ollama real não é acessado.";
const PULL_RUNNING: u8 = 0;
const PULL_CANCEL: u8 = 1;
const PULL_PAUSE: u8 = 2;
const SPEED_WINDOW_SECONDS: f64 = 5.0;

fn ollama_agent(read_timeout: Duration) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(read_timeout)
        .build()
}

fn ollama_error_body(body: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()?
        .get("error")?
        .as_str()
        .map(str::to_string)
}

fn ollama_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(code, response) => {
            let body = response.into_string().unwrap_or_default();
            ollama_error_body(&body)
                .unwrap_or_else(|| format!("O Ollama respondeu com erro HTTP {code}."))
        }
        ureq::Error::Transport(transport)
            if matches!(transport.kind(), ureq::ErrorKind::ConnectionFailed) =>
        {
            OLLAMA_OFFLINE.to_string()
        }
        ureq::Error::Transport(transport) => {
            format!("Falha de comunicação com o Ollama: {transport}")
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaModel {
    name: String,
    size_bytes: u64,
    family: Option<String>,
    parameter_size: Option<String>,
}

fn parse_ollama_tags(value: &serde_json::Value) -> Vec<OllamaModel> {
    value["models"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter_map(|model| {
                    Some(OllamaModel {
                        name: model["name"].as_str()?.to_string(),
                        size_bytes: model["size"].as_u64().unwrap_or(0),
                        family: model["details"]["family"].as_str().map(str::to_string),
                        parameter_size: model["details"]["parameter_size"]
                            .as_str()
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn list_ollama_models() -> Result<Vec<OllamaModel>, String> {
    let value: serde_json::Value = ollama_agent(Duration::from_secs(10))
        .get(&format!("{OLLAMA_URL}/api/tags"))
        .call()
        .map_err(ollama_error)?
        .into_json()
        .map_err(|error| format!("Resposta inválida do Ollama: {error}"))?;
    Ok(parse_ollama_tags(&value))
}

/// Equivalente a `ollama list`, lido direto do servidor local.
#[tauri::command]
async fn ollama_list_models(app: AppHandle) -> Result<Vec<OllamaModel>, String> {
    if is_qa_app(&app) {
        return Err(QA_OLLAMA_BLOCKED.into());
    }
    tauri::async_runtime::spawn_blocking(list_ollama_models)
        .await
        .map_err(|error| error.to_string())?
}

fn valid_model_id(model_id: &str) -> bool {
    !model_id.is_empty()
        && model_id.len() <= 200
        && model_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._:-/".contains(c))
}

#[derive(Deserialize, Default)]
struct PullLine {
    #[serde(default)]
    status: String,
    digest: Option<String>,
    total: Option<u64>,
    completed: Option<u64>,
    error: Option<String>,
}

/// Soma o progresso de todas as camadas e estima a velocidade numa janela móvel.
#[derive(Default)]
struct PullTracker {
    layers: HashMap<String, (u64, u64)>,
    samples: VecDeque<(f64, u64)>,
}

impl PullTracker {
    fn apply(&mut self, line: &PullLine) {
        if let (Some(digest), Some(total)) = (&line.digest, line.total) {
            let completed = line.completed.unwrap_or(0).min(total);
            self.layers.insert(digest.clone(), (total, completed));
        }
    }

    fn totals(&self) -> (u64, u64) {
        self.layers
            .values()
            .fold((0, 0), |(total, completed), (layer_total, layer_completed)| {
                (total + layer_total, completed + layer_completed)
            })
    }

    /// Registra uma amostra `(segundos desde o início, bytes concluídos)`.
    /// Amostras sem tamanho conhecido são ignoradas para que uma retomada
    /// (bytes já existentes em disco) não pareça um pico de velocidade.
    fn record(&mut self, at_seconds: f64) {
        let (total, completed) = self.totals();
        if total == 0 {
            return;
        }
        self.samples.push_back((at_seconds, completed));
        while self.samples.len() > 2
            && at_seconds - self.samples.front().map_or(at_seconds, |sample| sample.0)
                > SPEED_WINDOW_SECONDS
        {
            self.samples.pop_front();
        }
    }

    fn bytes_per_second(&self) -> Option<f64> {
        let (first_at, first) = *self.samples.front()?;
        let (last_at, last) = *self.samples.back()?;
        let elapsed = last_at - first_at;
        (elapsed >= 0.5 && last > first).then(|| (last - first) as f64 / elapsed)
    }

    fn eta_seconds(&self) -> Option<u64> {
        let (total, completed) = self.totals();
        let speed = self.bytes_per_second()?;
        (total > completed).then(|| ((total - completed) as f64 / speed).ceil() as u64)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaPullEvent {
    operation_id: String,
    model_id: String,
    state: &'static str,
    status: String,
    total_bytes: Option<u64>,
    completed_bytes: Option<u64>,
    bytes_per_second: Option<f64>,
    eta_seconds: Option<u64>,
    error: Option<String>,
}

fn run_pull(app: AppHandle, operation_id: String, model_id: String, control: Arc<AtomicU8>) {
    let stopped = || control.load(Ordering::SeqCst) != PULL_RUNNING;
    let emit = |state: &'static str, status: String, tracker: &PullTracker, error: Option<String>| {
        let (total, completed) = tracker.totals();
        let running = state == "running";
        let _ = app.emit(
            "ollama-pull-progress",
            OllamaPullEvent {
                operation_id: operation_id.clone(),
                model_id: model_id.clone(),
                state,
                status,
                total_bytes: (total > 0).then_some(total),
                completed_bytes: (total > 0).then_some(completed),
                bytes_per_second: if running { tracker.bytes_per_second() } else { None },
                eta_seconds: if running { tracker.eta_seconds() } else { None },
                error,
            },
        );
    };

    let mut tracker = PullTracker::default();
    emit("running", String::new(), &tracker, None);
    let outcome = (|| -> Result<(), String> {
        let response = ollama_agent(Duration::from_secs(120))
            .post(&format!("{OLLAMA_URL}/api/pull"))
            .send_json(serde_json::json!({ "model": model_id, "stream": true }))
            .map_err(ollama_error)?;
        let started = Instant::now();
        let mut last_emit: Option<Instant> = None;
        let mut last_status = String::new();
        for line in BufReader::new(response.into_reader()).lines() {
            // Parar/cancelar: sair fecha a conexão e o Ollama interrompe o download,
            // preservando as partes já baixadas para uma retomada futura.
            if stopped() {
                return Ok(());
            }
            let line = line.map_err(|error| format!("Conexão com o Ollama interrompida: {error}"))?;
            let Ok(parsed) = serde_json::from_str::<PullLine>(&line) else {
                continue;
            };
            if let Some(error) = parsed.error {
                return Err(error);
            }
            tracker.apply(&parsed);
            tracker.record(started.elapsed().as_secs_f64());
            if parsed.status == "success" {
                emit("completed", parsed.status, &tracker, None);
                return Ok(());
            }
            let due = last_emit.map_or(true, |at| at.elapsed() >= Duration::from_millis(250));
            if due || parsed.status != last_status {
                emit("running", parsed.status.clone(), &tracker, None);
                last_emit = Some(Instant::now());
                last_status = parsed.status;
            }
        }
        if stopped() {
            return Ok(());
        }
        Err("O Ollama encerrou o download sem confirmar a conclusão.".into())
    })();
    if let Err(error) = outcome {
        if !stopped() {
            emit("failed", String::new(), &tracker, Some(error));
        }
    }
    if let Ok(mut pulls) = app.state::<AppState>().ollama_pulls.lock() {
        if pulls
            .get(&model_id)
            .is_some_and(|handle| handle.operation_id == operation_id)
        {
            pulls.remove(&model_id);
        }
    }
}

/// Inicia `POST /api/pull` e emite `ollama-pull-progress` com bytes reais.
#[tauri::command]
fn ollama_pull_model(
    app: AppHandle,
    state: State<AppState>,
    model_id: String,
) -> Result<String, String> {
    if is_qa_app(&app) {
        return Err(QA_OLLAMA_BLOCKED.into());
    }
    let model_id = model_id.trim().to_string();
    if !valid_model_id(&model_id) {
        return Err("Nome de modelo inválido.".into());
    }
    let mut pulls = state
        .ollama_pulls
        .lock()
        .map_err(|_| "estado de downloads indisponível")?;
    if let Some(existing) = pulls.get(&model_id) {
        return Ok(existing.operation_id.clone());
    }
    let operation_id = uuid::Uuid::new_v4().to_string();
    let control = Arc::new(AtomicU8::new(PULL_RUNNING));
    pulls.insert(
        model_id.clone(),
        PullHandle {
            operation_id: operation_id.clone(),
            control: control.clone(),
        },
    );
    drop(pulls);
    let worker_operation = operation_id.clone();
    std::thread::spawn(move || run_pull(app, worker_operation, model_id, control));
    Ok(operation_id)
}

/// Pausar e cancelar encerram a conexão; retomar é um novo pull, que o Ollama
/// continua a partir das partes já baixadas.
#[tauri::command]
fn ollama_stop_pull(
    app: AppHandle,
    state: State<AppState>,
    model_id: String,
    pause: bool,
) -> Result<(), String> {
    let handle = state
        .ollama_pulls
        .lock()
        .map_err(|_| "estado de downloads indisponível")?
        .remove(&model_id)
        .ok_or("Nenhum download em andamento para este modelo.")?;
    handle
        .control
        .store(if pause { PULL_PAUSE } else { PULL_CANCEL }, Ordering::SeqCst);
    let _ = app.emit(
        "ollama-pull-progress",
        OllamaPullEvent {
            operation_id: handle.operation_id,
            model_id,
            state: if pause { "paused" } else { "cancelled" },
            status: String::new(),
            total_bytes: None,
            completed_bytes: None,
            bytes_per_second: None,
            eta_seconds: None,
            error: None,
        },
    );
    Ok(())
}

#[derive(Deserialize, Serialize, Clone)]
struct ChatMessageInput {
    role: String,
    content: String,
    /// Imagens em base64 (sem o prefixo `data:`), no formato de `/api/chat` do Ollama.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
    /// Chamadas de ferramenta feitas pelo assistente (repassadas ao Ollama no histórico).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tool_calls: Option<serde_json::Value>,
    /// Nome da ferramenta, em mensagens `role: "tool"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tool_name: Option<String>,
}

/// Evento de streaming do chat, usado pelo Ollama e pelo BitNet.
const CHAT_DELTA_EVENT: &str = "ollama-chat-delta";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaChatResult {
    model: String,
    content: String,
    thinking: String,
    cancelled: bool,
    eval_count: Option<u64>,
    eval_duration_ns: Option<u64>,
    tokens_per_second: Option<f64>,
    /// Trechos de raciocínio recebidos; o Ollama envia um token por trecho.
    thinking_tokens: u64,
    /// Tokens do prompt (histórico + ferramentas), para o agente controlar o contexto.
    prompt_eval_count: Option<u64>,
    /// Ferramentas que o modelo pediu (`[{ function: { name, arguments } }]`).
    tool_calls: Vec<serde_json::Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaChatDelta {
    request_id: String,
    content: String,
    thinking: String,
    thinking_tokens: u64,
}

#[derive(Deserialize, Default)]
struct ChatChunkMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
    #[serde(default)]
    tool_calls: Vec<serde_json::Value>,
}

#[derive(Deserialize, Default)]
struct ChatChunk {
    #[serde(default)]
    message: ChatChunkMessage,
    #[serde(default)]
    done: bool,
    eval_count: Option<u64>,
    eval_duration: Option<u64>,
    #[serde(default)]
    prompt_eval_count: Option<u64>,
    error: Option<String>,
}

fn tokens_per_second(eval_count: Option<u64>, eval_duration_ns: Option<u64>) -> Option<f64> {
    let (count, duration) = (eval_count?, eval_duration_ns?);
    (count > 0 && duration > 0).then(|| count as f64 / (duration as f64 / 1e9))
}

/// Um trecho do stream pode trazer mais de um token; no fim, `eval_count` menos os tokens
/// da resposta dá o total real gasto pensando.
fn final_thinking_tokens(
    thinking_chunks: u64,
    content_chunks: u64,
    eval_count: Option<u64>,
) -> u64 {
    match eval_count {
        Some(total) if thinking_chunks > 0 => {
            thinking_chunks.max(total.saturating_sub(content_chunks))
        }
        _ => thinking_chunks,
    }
}

/// `think` do Ollama: booleano na maioria dos modelos; gpt-oss aceita só "low"/"medium"/"high".
fn think_value(model: &str, think: Option<bool>, think_level: Option<&str>) -> serde_json::Value {
    let enabled = think.unwrap_or(false);
    match think_level {
        Some(level)
            if enabled
                && model.starts_with("gpt-oss")
                && matches!(level, "low" | "medium" | "high") =>
        {
            serde_json::json!(level)
        }
        _ => serde_json::json!(enabled),
    }
}

fn last_message_has_images(messages: &[ChatMessageInput]) -> bool {
    messages
        .last()
        .and_then(|message| message.images.as_ref())
        .is_some_and(|images| !images.is_empty())
}

/// Imagens de mensagens anteriores não impedem de trocar para um modelo só de texto.
fn without_images(messages: &[ChatMessageInput]) -> Vec<ChatMessageInput> {
    messages
        .iter()
        .map(|message| ChatMessageInput { images: None, ..message.clone() })
        .collect()
}

fn model_capabilities(agent: &ureq::Agent, model: &str) -> Result<Vec<String>, String> {
    let value: serde_json::Value = agent
        .post(&format!("{OLLAMA_URL}/api/show"))
        .send_json(serde_json::json!({ "model": model }))
        .map_err(|error| match error {
            ureq::Error::Status(404, _) => format!(
                "O modelo {model} não está instalado no Ollama. Baixe-o em Configurações › Modelos locais."
            ),
            other => ollama_error(other),
        })?
        .into_json()
        .map_err(|error| format!("Resposta inválida do Ollama: {error}"))?;
    Ok(value["capabilities"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default())
}

/// Opções extras do agente: ferramentas e tamanho de contexto.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ChatOptions {
    tools: Option<serde_json::Value>,
    num_ctx: Option<u32>,
}

#[allow(clippy::too_many_arguments)]
fn run_chat(
    app: &AppHandle,
    request_id: &str,
    model: &str,
    messages: &[ChatMessageInput],
    think: Option<bool>,
    think_level: Option<&str>,
    options: &ChatOptions,
    cancel: &AtomicBool,
) -> Result<OllamaChatResult, String> {
    // O primeiro token pode demorar enquanto o Ollama carrega o modelo na VRAM.
    let agent = ollama_agent(Duration::from_secs(300));
    let capabilities = model_capabilities(&agent, model)?;
    let text_only;
    let messages = if capabilities.iter().any(|capability| capability == "vision") {
        messages
    } else {
        if last_message_has_images(messages) {
            return Err(format!(
                "O modelo {model} não lê imagens. Escolha um modelo com visão, como Qwen3.5, Gemma 3 ou Llama 3.2 Vision."
            ));
        }
        text_only = without_images(messages);
        &text_only
    };
    let mut body = serde_json::json!({ "model": model, "messages": messages, "stream": true });
    if capabilities.iter().any(|capability| capability == "thinking") {
        body["think"] = think_value(model, think, think_level);
    }
    if let Some(tools) = options.tools.as_ref().filter(|tools| tools.as_array().is_some_and(|list| !list.is_empty())) {
        if !capabilities.iter().any(|capability| capability == "tools") {
            return Err(format!(
                "O modelo {model} não suporta ferramentas, então não consegue controlar o PC. Use Qwen3.5, Llama 3.1+ ou outro modelo com \"tools\"."
            ));
        }
        body["tools"] = tools.clone();
    }
    if let Some(num_ctx) = options.num_ctx {
        body["options"] = serde_json::json!({ "num_ctx": num_ctx });
    }
    let response = agent
        .post(&format!("{OLLAMA_URL}/api/chat"))
        .send_json(body)
        .map_err(ollama_error)?;

    let mut result = OllamaChatResult {
        model: model.to_string(),
        content: String::new(),
        thinking: String::new(),
        cancelled: false,
        eval_count: None,
        eval_duration_ns: None,
        tokens_per_second: None,
        thinking_tokens: 0,
        prompt_eval_count: None,
        tool_calls: Vec::new(),
    };
    // Agrupa os tokens em lotes de ~50 ms para não sobrecarregar a interface.
    let mut pending = OllamaChatDelta {
        request_id: request_id.to_string(),
        content: String::new(),
        thinking: String::new(),
        thinking_tokens: 0,
    };
    let flush = |pending: &mut OllamaChatDelta| {
        if !pending.content.is_empty() || !pending.thinking.is_empty() {
            let _ = app.emit(CHAT_DELTA_EVENT, pending.clone());
            pending.content.clear();
            pending.thinking.clear();
            pending.thinking_tokens = 0;
        }
    };
    let mut last_emit = Instant::now();
    let mut content_chunks: u64 = 0;
    for line in BufReader::new(response.into_reader()).lines() {
        if cancel.load(Ordering::SeqCst) {
            flush(&mut pending);
            result.cancelled = true;
            return Ok(result);
        }
        let line = line.map_err(|error| format!("Conexão com o Ollama interrompida: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let chunk: ChatChunk = serde_json::from_str(&line)
            .map_err(|error| format!("Resposta inválida do Ollama: {error}"))?;
        if let Some(error) = chunk.error {
            return Err(error);
        }
        if !chunk.message.thinking.is_empty() {
            result.thinking_tokens += 1;
            pending.thinking_tokens += 1;
        }
        if !chunk.message.content.is_empty() {
            content_chunks += 1;
        }
        result.content.push_str(&chunk.message.content);
        result.thinking.push_str(&chunk.message.thinking);
        result.tool_calls.extend(chunk.message.tool_calls);
        pending.content.push_str(&chunk.message.content);
        pending.thinking.push_str(&chunk.message.thinking);
        if chunk.done {
            flush(&mut pending);
            result.eval_count = chunk.eval_count;
            result.eval_duration_ns = chunk.eval_duration;
            result.prompt_eval_count = chunk.prompt_eval_count;
            result.thinking_tokens =
                final_thinking_tokens(result.thinking_tokens, content_chunks, chunk.eval_count);
            result.tokens_per_second = tokens_per_second(chunk.eval_count, chunk.eval_duration);
            return Ok(result);
        }
        if last_emit.elapsed() >= Duration::from_millis(50) {
            flush(&mut pending);
            last_emit = Instant::now();
        }
    }
    if cancel.load(Ordering::SeqCst) {
        result.cancelled = true;
        return Ok(result);
    }
    Err("A resposta do Ollama terminou antes de ser concluída.".into())
}

/// Conversa com um modelo local via `POST /api/chat`, emitindo `ollama-chat-delta`.
/// Não existe fallback: se o Ollama falhar, o erro volta para o chat.
#[tauri::command]
async fn ollama_chat(
    app: AppHandle,
    request_id: String,
    model: String,
    messages: Vec<ChatMessageInput>,
    think: Option<bool>,
    think_level: Option<String>,
    options: Option<ChatOptions>,
) -> Result<OllamaChatResult, String> {
    if is_qa_app(&app) {
        return Err(QA_OLLAMA_BLOCKED.into());
    }
    let options = options.unwrap_or_default();
    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<AppState>()
        .ollama_chats
        .lock()
        .map_err(|_| "estado do chat indisponível")?
        .insert(request_id.clone(), cancel.clone());
    let worker_app = app.clone();
    let worker_request = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_chat(
            &worker_app,
            &worker_request,
            &model,
            &messages,
            think,
            think_level.as_deref(),
            &options,
            &cancel,
        )
    })
    .await
    .map_err(|error| error.to_string());
    if let Ok(mut chats) = app.state::<AppState>().ollama_chats.lock() {
        chats.remove(&request_id);
    }
    result?
}

/// Conversa com um modelo em nuvem (chave no Gerenciador de Credenciais); cancela por `ollama_cancel_chat`.
#[tauri::command]
async fn cloud_chat(
    app: AppHandle,
    request_id: String,
    provider_id: String,
    model: String,
    base_url: Option<String>,
    messages: Vec<ChatMessageInput>,
) -> Result<OllamaChatResult, String> {
    if is_qa_app(&app) {
        return Err("Modo QA offline: provedores em nuvem não são acessados.".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<AppState>()
        .ollama_chats
        .lock()
        .map_err(|_| "estado do chat indisponível")?
        .insert(request_id.clone(), cancel.clone());
    let worker_app = app.clone();
    let worker_request = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        cloud::run_chat(&worker_app, &worker_request, &provider_id, &model, base_url.as_deref(), &messages, &cancel)
    })
    .await
    .map_err(|error| error.to_string());
    if let Ok(mut chats) = app.state::<AppState>().ollama_chats.lock() {
        chats.remove(&request_id);
    }
    result?
}

/// Conversa com o Microsoft BitNet (bitnet.cpp); cancela pelo mesmo `ollama_cancel_chat`.
#[tauri::command]
async fn bitnet_chat(
    app: AppHandle,
    request_id: String,
    messages: Vec<ChatMessageInput>,
) -> Result<OllamaChatResult, String> {
    if is_qa_app(&app) {
        return Err(QA_OLLAMA_BLOCKED.into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<AppState>()
        .ollama_chats
        .lock()
        .map_err(|_| "estado do chat indisponível")?
        .insert(request_id.clone(), cancel.clone());
    let worker_app = app.clone();
    let worker_request = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        bitnet::run_chat(&worker_app, &worker_request, &messages, &cancel)
    })
    .await
    .map_err(|error| error.to_string());
    if let Ok(mut chats) = app.state::<AppState>().ollama_chats.lock() {
        chats.remove(&request_id);
    }
    result?
}

/// Sinaliza o cancelamento de uma geração (Ollama ou BitNet) pelo id da requisição.
#[tauri::command]
fn ollama_cancel_chat(state: State<AppState>, request_id: String) -> Result<(), String> {
    if let Some(cancel) = state
        .ollama_chats
        .lock()
        .map_err(|_| "estado do chat indisponível")?
        .get(&request_id)
    {
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

fn mib_from_bytes(value: &str) -> Option<u64> {
    value
        .trim()
        .parse::<u64>()
        .ok()
        .map(|bytes| bytes / 1_048_576)
}

fn scan_local_hardware() -> HardwareProfile {
    let mut warnings = Vec::new();
    let gpus: Vec<GpuProfile> = command_output(
        "nvidia-smi.exe",
        &[
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ],
    )
    .map(|output| {
        output
            .lines()
            .filter_map(|line| {
                let values: Vec<_> = line.split(',').map(str::trim).collect();
                Some(GpuProfile {
                    name: values.first()?.to_string(),
                    vram_mb: values.get(1)?.parse().ok()?,
                    driver_version: values.get(2).map(|value| value.to_string()),
                    vendor: "nvidia".to_string(),
                })
            })
            .collect()
    })
    .unwrap_or_default();
    if gpus.is_empty() {
        warnings.push("Nenhuma GPU NVIDIA foi detectada pelo nvidia-smi.".to_string());
    }

    // Uma única sessão do PowerShell para CPU, RAM e disco (cada sessão leva ~0,5 s).
    let system_drive = env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    let drive_name = system_drive.trim_end_matches(':');
    let script = format!(
        "$c=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim(); \
         $r=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; \
         $d=(Get-PSDrive -Name {drive_name}).Free; \
         \"$c`n$r`n$d\""
    );
    let output = command_output("powershell.exe", &["-NoProfile", "-Command", &script]).unwrap_or_default();
    let mut lines = output.lines().map(str::trim);
    let cpu_name = lines
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("CPU não identificada")
        .to_string();
    let ram_mb = lines.next().and_then(mib_from_bytes).unwrap_or_else(|| {
        warnings.push("Não foi possível identificar a memória RAM.".to_string());
        0
    });
    let available_disk_mb = lines.next().and_then(mib_from_bytes).unwrap_or_else(|| {
        warnings.push("Não foi possível identificar o espaço livre em disco.".to_string());
        0
    });

    HardwareProfile {
        gpus,
        cpu_name,
        ram_mb,
        available_disk_mb,
        warnings,
    }
}

fn qa_hardware_profile() -> HardwareProfile {
    HardwareProfile {
        gpus: vec![GpuProfile {
            name: "NVIDIA GeForce RTX 5070 (QA simulada)".to_string(),
            vram_mb: 12_288,
            driver_version: Some("QA simulado".to_string()),
            vendor: "nvidia".to_string(),
        }],
        cpu_name: "CPU QA simulada".to_string(),
        ram_mb: 32_768,
        available_disk_mb: 102_400,
        warnings: vec!["Modo QA offline: inventário de hardware simulado.".to_string()],
    }
}

/// Inventário de GPU/VRAM (nvidia-smi), CPU, RAM e disco livre.
#[tauri::command]
async fn scan_hardware(app: AppHandle) -> Result<HardwareProfile, String> {
    if is_qa_app(&app) {
        return Ok(qa_hardware_profile());
    }
    tauri::async_runtime::spawn_blocking(scan_local_hardware)
        .await
        .map_err(|error| error.to_string())
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

/// Ollama/OpenClaw: instalado? rodando? versão?
#[tauri::command]
async fn check_local_runtime_status(app: AppHandle) -> Result<Vec<RuntimeStatus>, String> {
    if is_qa_app(&app) {
        return Ok(qa_runtime_statuses());
    }
    tauri::async_runtime::spawn_blocking(|| {
        vec![
            check_runtime("ollama", "ollama.exe", 11434),
            check_runtime("openclaw", "openclaw.exe", 18789),
        ]
    })
    .await
    .map_err(|error| error.to_string())
}

/// Inicia o runtime local (`ollama serve` ou OpenClaw) sem janela.
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

/// Mostra e foca a janela principal quando a interface terminou de carregar.
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
        .manage(tools::ToolsState::default())
        .manage(speech::SpeechState::default())
        .manage(bitnet::BitnetState::default())
        .manage(computer::ComputerState::default())
        .manage(mcp::McpState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Apps do menu Iniciar para o reconhecimento rápido ("abre o word") sem esperar o 1º pedido.
            let handle = app.handle().clone();
            std::thread::spawn(move || semantic::warm_up(&handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_terminal_session,
            write_terminal_session,
            terminate_terminal_session,
            save_credential,
            read_credential,
            delete_credential,
            has_credential,
            check_local_runtime_status,
            start_runtime,
            scan_hardware,
            install_ollama,
            cancel_local_model_operation,
            ollama_list_models,
            ollama_pull_model,
            ollama_stop_pull,
            ollama_chat,
            ollama_cancel_chat,
            bitnet_chat,
            cloud_chat,
            tools::tools_status,
            tools::tool_install,
            tools::tool_cancel,
            tools::tool_remove,
            speech::asr_transcribe,
            speech::tts_synthesize,
            agent::agent_prepare,
            agent::agent_route,
            semantic::agent_semantic,
            agent::list_skills,
            agent::agent_tool,
            agent::agent_finish,
            mcp::mcp_overview,
            mcp::mcp_save_config,
            mcp::mcp_start,
            mcp::mcp_stop,
            app_ready
        ])
        .build(tauri::generate_context!())
        .expect("erro ao executar o Open Assistant")
        .run(|app, event| {
            // O servidor do BitNet é um processo à parte; não pode ficar rodando sem o app.
            if let tauri::RunEvent::Exit = event {
                bitnet::stop_server(app);
                mcp::stop_all(app);
            }
        });
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

    #[test]
    fn pull_progress_parser_extracts_a_percent_from_process_output() {
        assert_eq!(parse_pull_progress("pulling manifest  42%"), Some(42));
        assert_eq!(parse_pull_progress("verifying sha256 digest"), None);
    }

    #[test]
    fn ollama_tags_keep_exact_model_names_and_sizes() {
        let value = serde_json::json!({
            "models": [
                { "name": "qwen3.5:9b", "size": 6_594_474_711u64, "details": { "family": "qwen35", "parameter_size": "9.7B" } },
                { "name": "gemma3:4b", "size": 3_338_801_804u64, "details": {} }
            ]
        });

        let models = parse_ollama_tags(&value);

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].name, "qwen3.5:9b");
        assert_eq!(models[0].size_bytes, 6_594_474_711);
        assert_eq!(models[0].parameter_size.as_deref(), Some("9.7B"));
        assert_eq!(models[1].family, None);
    }

    #[test]
    fn ollama_error_body_extracts_the_message() {
        assert_eq!(
            ollama_error_body(r#"{"error":"model 'x' not found"}"#).as_deref(),
            Some("model 'x' not found")
        );
        assert_eq!(ollama_error_body("not json"), None);
    }

    fn layer(digest: &str, total: u64, completed: u64) -> PullLine {
        PullLine {
            status: format!("pulling {digest}"),
            digest: Some(digest.into()),
            total: Some(total),
            completed: Some(completed),
            error: None,
        }
    }

    #[test]
    fn pull_tracker_sums_layers_and_estimates_speed_and_eta() {
        let mut tracker = PullTracker::default();
        tracker.apply(&layer("sha256:a", 1_000_000_000, 0));
        tracker.record(0.0);
        tracker.apply(&layer("sha256:a", 1_000_000_000, 100_000_000));
        tracker.apply(&layer("sha256:b", 1_000, 1_000));
        tracker.record(2.0);

        assert_eq!(tracker.totals(), (1_000_001_000, 100_001_000));
        assert_eq!(tracker.bytes_per_second(), Some(50_000_500.0));
        assert_eq!(tracker.eta_seconds(), Some(18));
    }

    #[test]
    fn pull_tracker_does_not_report_speed_before_sizes_are_known() {
        let mut tracker = PullTracker::default();
        tracker.apply(&PullLine { status: "pulling manifest".into(), ..Default::default() });
        tracker.record(0.1);
        // Retomada: a primeira amostra já traz bytes baixados anteriormente.
        tracker.apply(&layer("sha256:a", 6_000_000_000, 3_000_000_000));
        tracker.record(0.3);

        assert_eq!(tracker.bytes_per_second(), None);
        assert_eq!(tracker.eta_seconds(), None);
    }

    #[test]
    fn pull_tracker_uses_a_moving_window() {
        let mut tracker = PullTracker::default();
        for second in 0..=20u64 {
            let rate = if second <= 10 { 10 } else { 100 };
            let completed = if second <= 10 { second * 10 } else { 100 + (second - 10) * rate };
            tracker.apply(&layer("sha256:a", 10_000, completed));
            tracker.record(second as f64);
        }

        assert_eq!(tracker.bytes_per_second(), Some(100.0));
    }

    #[test]
    fn final_thinking_tokens_uses_eval_count_when_the_model_thought() {
        assert_eq!(final_thinking_tokens(186, 2, Some(253)), 251);
        assert_eq!(final_thinking_tokens(0, 40, Some(40)), 0);
        assert_eq!(final_thinking_tokens(12, 0, None), 12);
        assert_eq!(final_thinking_tokens(50, 80, Some(60)), 50);
    }

    #[test]
    fn think_value_only_sends_levels_to_gpt_oss() {
        assert_eq!(
            think_value("qwen3.5:9b", Some(true), Some("high")),
            serde_json::json!(true)
        );
        assert_eq!(
            think_value("gpt-oss:20b", Some(true), Some("high")),
            serde_json::json!("high")
        );
        assert_eq!(
            think_value("gpt-oss:20b", Some(false), Some("high")),
            serde_json::json!(false)
        );
        assert_eq!(
            think_value("gpt-oss:20b", Some(true), Some("extremo")),
            serde_json::json!(true)
        );
        assert_eq!(
            think_value("gemma3:4b", None, None),
            serde_json::json!(false)
        );
    }

    #[test]
    fn tokens_per_second_uses_ollama_eval_metrics() {
        assert_eq!(tokens_per_second(Some(120), Some(2_000_000_000)), Some(60.0));
        assert_eq!(tokens_per_second(None, Some(1)), None);
        assert_eq!(tokens_per_second(Some(10), Some(0)), None);
    }

    #[test]
    fn model_ids_are_restricted_to_safe_ollama_names() {
        assert!(valid_model_id("qwen3.5:9b"));
        assert!(valid_model_id("hf.co/org/model:Q4_K_M"));
        assert!(!valid_model_id(""));
        assert!(!valid_model_id("qwen 3"));
        assert!(!valid_model_id("x;rm"));
    }

    #[test]
    fn text_only_models_keep_history_but_refuse_a_new_image() {
        let message = |images: Option<Vec<String>>| ChatMessageInput { role: "user".into(), content: "oi".into(), images, tool_calls: None, tool_name: None };
        let old_image = vec![message(Some(vec!["aW1n".into()])), message(None)];
        assert!(!last_message_has_images(&old_image));
        assert!(without_images(&old_image).iter().all(|item| item.images.is_none()));
        assert!(last_message_has_images(&[message(None), message(Some(vec!["aW1n".into()]))]));
    }

    #[test]
    fn chat_chunks_parse_content_thinking_and_metrics() {
        let chunk: ChatChunk = serde_json::from_str(
            r#"{"model":"qwen3.5:9b","message":{"role":"assistant","content":"","thinking":"hm"},"done":false}"#,
        )
        .expect("chunk");
        assert_eq!(chunk.message.thinking, "hm");
        assert!(!chunk.done);

        let last: ChatChunk = serde_json::from_str(
            r#"{"model":"qwen3.5:9b","message":{"role":"assistant","content":"."},"done":true,"eval_count":42,"eval_duration":700000000}"#,
        )
        .expect("final chunk");
        assert!(last.done);
        assert_eq!(last.eval_count, Some(42));
    }

    /// Teste de aceite contra o Ollama real. Rode com `cargo test -- --ignored`
    /// com o Ollama aberto e pelo menos um modelo instalado.
    #[test]
    #[ignore]
    fn live_ollama_lists_models_and_answers() {
        let models = list_ollama_models().expect("Ollama deve estar rodando");
        let model = models.first().expect("instale ao menos um modelo").name.clone();
        let agent = ollama_agent(Duration::from_secs(300));
        let capabilities = model_capabilities(&agent, &model).expect("api/show");
        let mut body = serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": "Responda apenas: ok" }],
            "stream": false
        });
        if capabilities.iter().any(|capability| capability == "thinking") {
            body["think"] = serde_json::json!(false);
        }
        let value: serde_json::Value = agent
            .post(&format!("{OLLAMA_URL}/api/chat"))
            .send_json(body)
            .expect("api/chat")
            .into_json()
            .expect("json");
        let text = value["message"]["content"].as_str().unwrap_or_default();
        let speed = tokens_per_second(value["eval_count"].as_u64(), value["eval_duration"].as_u64());
        println!("modelo={model} resposta={text:?} tok/s={speed:?}");
        assert!(!text.trim().is_empty());
        assert!(speed.is_some());
    }
}
