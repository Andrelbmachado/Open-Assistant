use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    env,
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
    local_model_operations: Mutex<HashMap<String, u32>>,
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
struct ModelRecommendation {
    eligible: bool,
    model_id: Option<String>,
    model_name: Option<String>,
    download_size_mb: Option<u64>,
    minimum_vram_mb: Option<u64>,
    minimum_ram_mb: Option<u64>,
    minimum_disk_mb: Option<u64>,
    reason: String,
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

struct ModelProfile {
    model_id: &'static str,
    model_name: &'static str,
    download_size_mb: u64,
    minimum_vram_mb: u64,
    minimum_ram_mb: u64,
    minimum_disk_mb: u64,
}

const QWEN35_PROFILES: [ModelProfile; 4] = [
    ModelProfile {
        model_id: "qwen3.5:9b",
        model_name: "Qwen3.5 9B",
        download_size_mb: 6_600,
        minimum_vram_mb: 10_240,
        minimum_ram_mb: 16_384,
        minimum_disk_mb: 10_240,
    },
    ModelProfile {
        model_id: "qwen3.5:4b",
        model_name: "Qwen3.5 4B",
        download_size_mb: 3_400,
        minimum_vram_mb: 6_144,
        minimum_ram_mb: 12_288,
        minimum_disk_mb: 6_144,
    },
    ModelProfile {
        model_id: "qwen3.5:2b",
        model_name: "Qwen3.5 2B",
        download_size_mb: 2_700,
        minimum_vram_mb: 4_096,
        minimum_ram_mb: 8_192,
        minimum_disk_mb: 5_120,
    },
    ModelProfile {
        model_id: "qwen3.5:0.8b",
        model_name: "Qwen3.5 0.8B",
        download_size_mb: 1_000,
        minimum_vram_mb: 3_072,
        minimum_ram_mb: 8_192,
        minimum_disk_mb: 3_072,
    },
];

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

fn parse_pull_progress(line: &str) -> Option<u8> {
    line.split_whitespace()
        .find_map(|word| word.strip_suffix('%')?.parse::<u8>().ok())
}

fn emit_local_model_operation(app: &AppHandle, operation: LocalModelOperation) {
    let _ = app.emit("local-model-operation", operation);
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
    let child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar {program}: {error}"))?;
    let pid = child.id();
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
        let output = child.wait_with_output();
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
            Ok(output) if output.status.success() => {
                let message = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let progress_percent = parse_pull_progress(&message).or(Some(100));
                emit_local_model_operation(
                    &app,
                    LocalModelOperation {
                        id: worker_id,
                        kind: operation_kind,
                        state: "completed".into(),
                        message,
                        model_id: emitted_model,
                        progress_percent,
                    },
                );
            }
            Ok(output) => emit_local_model_operation(
                &app,
                LocalModelOperation {
                    id: worker_id,
                    kind: operation_kind,
                    state: "failed".into(),
                    message: String::from_utf8_lossy(&output.stderr).trim().to_string(),
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

#[tauri::command]
fn download_recommended_model(
    app: AppHandle,
    state: State<AppState>,
    model_id: String,
) -> Result<String, String> {
    if is_qa_app(&app) {
        return Ok(qa_local_operation(&app, "download_model", Some(model_id)));
    }
    let recommendation = recommend_local_model(&scan_local_hardware());
    if !recommendation.eligible || recommendation.model_id.as_deref() != Some(model_id.as_str()) {
        return Err(
            "O modelo solicitado não corresponde à recomendação atual deste computador."
                .to_string(),
        );
    }
    let ollama = find_binary("ollama.exe")
        .ok_or("Ollama não encontrado. Instale-o antes de baixar o modelo.")?;
    start_local_operation(
        app,
        state,
        "download_model",
        Some(model_id.clone()),
        &ollama,
        &["pull", &model_id],
    )
}

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

#[tauri::command]
fn get_local_models(app: AppHandle) -> Vec<String> {
    if is_qa_app(&app) {
        return vec!["qwen3.5:9b".to_string()];
    }
    command_output("ollama.exe", &["list"])
        .map(|output| {
            output
                .lines()
                .skip(1)
                .filter_map(|line| line.split_whitespace().next().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
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

    let cpu_name = command_output("powershell.exe", &["-NoProfile", "-Command", "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()"]).unwrap_or_else(|| "CPU não identificada".to_string());
    let ram_mb = command_output(
        "powershell.exe",
        &[
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
        ],
    )
    .and_then(|value| mib_from_bytes(&value))
    .unwrap_or_else(|| {
        warnings.push("Não foi possível identificar a memória RAM.".to_string());
        0
    });
    let system_drive = env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    let drive_name = system_drive.trim_end_matches(':');
    let disk_command = format!("(Get-PSDrive -Name {drive_name}).Free");
    let available_disk_mb =
        command_output("powershell.exe", &["-NoProfile", "-Command", &disk_command])
            .and_then(|value| mib_from_bytes(&value))
            .unwrap_or_else(|| {
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

fn recommendation_unavailable(reason: String) -> ModelRecommendation {
    ModelRecommendation {
        eligible: false,
        model_id: None,
        model_name: None,
        download_size_mb: None,
        minimum_vram_mb: None,
        minimum_ram_mb: None,
        minimum_disk_mb: None,
        reason,
    }
}

fn recommend_local_model(hardware: &HardwareProfile) -> ModelRecommendation {
    let nvidia_gpu = hardware
        .gpus
        .iter()
        .filter(|gpu| gpu.vendor == "nvidia")
        .max_by_key(|gpu| gpu.vram_mb);
    let Some(gpu) = nvidia_gpu else {
        return recommendation_unavailable(
            "Nenhuma GPU NVIDIA compatível foi detectada.".to_string(),
        );
    };
    let profile = QWEN35_PROFILES.iter().find(|profile| {
        gpu.vram_mb >= profile.minimum_vram_mb
            && hardware.ram_mb >= profile.minimum_ram_mb
            && hardware.available_disk_mb >= profile.minimum_disk_mb
    });
    let Some(profile) = profile else {
        if gpu.vram_mb
            < QWEN35_PROFILES
                .last()
                .expect("profiles configured")
                .minimum_vram_mb
        {
            return recommendation_unavailable(
                "A GPU detectada não possui VRAM suficiente para um modelo local equilibrado."
                    .to_string(),
            );
        }
        if hardware.ram_mb
            < QWEN35_PROFILES
                .last()
                .expect("profiles configured")
                .minimum_ram_mb
        {
            return recommendation_unavailable(
                "A memória RAM disponível não atende ao mínimo para o modelo local.".to_string(),
            );
        }
        return recommendation_unavailable(
            "O disco não possui espaço livre suficiente para baixar e preparar o modelo."
                .to_string(),
        );
    };
    ModelRecommendation {
        eligible: true,
        model_id: Some(profile.model_id.to_string()),
        model_name: Some(profile.model_name.to_string()),
        download_size_mb: Some(profile.download_size_mb),
        minimum_vram_mb: Some(profile.minimum_vram_mb),
        minimum_ram_mb: Some(profile.minimum_ram_mb),
        minimum_disk_mb: Some(profile.minimum_disk_mb),
        reason: format!(
            "{} equilibra qualidade, VRAM disponível e memória do sistema.",
            profile.model_name
        ),
    }
}

#[tauri::command]
fn scan_hardware(app: AppHandle) -> HardwareProfile {
    if is_qa_app(&app) {
        qa_hardware_profile()
    } else {
        scan_local_hardware()
    }
}

#[tauri::command]
fn get_local_model_recommendation(app: AppHandle) -> ModelRecommendation {
    let hardware = if is_qa_app(&app) {
        qa_hardware_profile()
    } else {
        scan_local_hardware()
    };
    recommend_local_model(&hardware)
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
            scan_hardware,
            get_local_model_recommendation,
            install_ollama,
            download_recommended_model,
            cancel_local_model_operation,
            get_local_models,
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

    #[test]
    fn recommendation_selects_qwen_35_9b_for_12gb_nvidia_gpu() {
        let hardware = HardwareProfile {
            gpus: vec![GpuProfile {
                name: "NVIDIA GeForce RTX 5070".into(),
                vram_mb: 12_288,
                driver_version: Some("576.02".into()),
                vendor: "nvidia".into(),
            }],
            cpu_name: "AMD Ryzen 7".into(),
            ram_mb: 32_768,
            available_disk_mb: 102_400,
            warnings: vec![],
        };

        let recommendation = recommend_local_model(&hardware);

        assert!(recommendation.eligible);
        assert_eq!(recommendation.model_id.as_deref(), Some("qwen3.5:9b"));
        assert_eq!(recommendation.download_size_mb, Some(6_600));
    }

    #[test]
    fn recommendation_blocks_non_nvidia_hardware() {
        let hardware = HardwareProfile {
            gpus: vec![GpuProfile {
                name: "Adaptador básico".into(),
                vram_mb: 4_096,
                driver_version: None,
                vendor: "other".into(),
            }],
            cpu_name: "Intel".into(),
            ram_mb: 16_384,
            available_disk_mb: 100_000,
            warnings: vec![],
        };

        let recommendation = recommend_local_model(&hardware);

        assert!(!recommendation.eligible);
        assert!(recommendation.reason.contains("NVIDIA"));
    }

    #[test]
    fn pull_progress_parser_extracts_a_percent_from_ollama_output() {
        assert_eq!(parse_pull_progress("pulling manifest  42%"), Some(42));
        assert_eq!(parse_pull_progress("verifying sha256 digest"), None);
    }
}
