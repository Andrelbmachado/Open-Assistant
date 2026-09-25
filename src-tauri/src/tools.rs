//! Ferramentas de IA baixáveis em Configurações › Ferramentas de IA.
//!
//! Cada ferramenta tem uma receita fixa neste arquivo; a interface envia apenas o id,
//! nunca uma URL ou um comando. Tudo fica em `%LOCALAPPDATA%\com.openassistant.windows\tools\<id>`
//! e uma ferramenta só conta como instalada depois que o marcador `.installed` é gravado.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MARKER: &str = ".installed";
const CANCELLED: &str = "Download cancelado.";
pub const PROGRESS_EVENT: &str = "tool-progress";

/// Commit do bitnet.cpp validado neste PC (Ninja + clang-cl, sem OpenMP). A revisão de
/// julho/2026 (refatoração do caminho I2_S) gera texto degradado com o GGUF oficial.
const BITNET_COMMIT: &str = "01eb415772c342d9f20dc42772f1583ae1e5b102";

pub enum Step {
    /// Baixa um .tar.bz2/.zip e extrai dentro da pasta da ferramenta.
    Archive(&'static str),
    /// Baixa um arquivo único para `pasta/<name>`.
    File {
        url: &'static str,
        name: &'static str,
    },
    /// Cria um ambiente Python isolado com uv e instala os pacotes.
    Pip {
        packages: &'static [&'static str],
        /// Instala antes o PyTorch com CUDA 12.8 (necessário para a RTX série 50).
        torch_cuda: bool,
    },
    /// Compila o llama-server do bitnet.cpp oficial da Microsoft.
    BuildBitnet,
}

pub struct Recipe {
    pub id: &'static str,
    /// Ferramentas instaladas antes desta (ex.: a runtime de voz antes de um modelo de voz).
    pub requires: &'static [&'static str],
    pub steps: &'static [Step],
}

pub const SHERPA_RUNTIME: &str = "sherpa-onnx";

pub const RECIPES: &[Recipe] = &[
    Recipe {
        id: SHERPA_RUNTIME,
        requires: &[],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-win-x64-shared-MT-Release-lib.tar.bz2")],
    },
    // Reconhecimento de voz (NVIDIA NeMo e OpenAI Whisper exportados para ONNX).
    Recipe {
        id: "asr-nemo-pt",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-transducer-stt_pt_fastconformer_hybrid_large_pc-int8.tar.bz2")],
    },
    Recipe {
        id: "asr-parakeet-v3",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2")],
    },
    Recipe {
        id: "asr-whisper-small",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2")],
    },
    Recipe {
        id: "asr-whisper-turbo",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2")],
    },
    Recipe {
        id: "asr-whisper-large-v3",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-large-v3.tar.bz2")],
    },
    // Síntese de voz em português (Piper/VITS rodando no sherpa-onnx).
    Recipe {
        id: "tts-piper-faber",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium-int8.tar.bz2")],
    },
    Recipe {
        id: "tts-piper-cadu",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-cadu-medium-int8.tar.bz2")],
    },
    Recipe {
        id: "tts-piper-jeff",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-jeff-medium-int8.tar.bz2")],
    },
    Recipe {
        id: "tts-piper-dii",
        requires: &[SHERPA_RUNTIME],
        steps: &[Step::Archive("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-dii-high-int8.tar.bz2")],
    },
    // Modelo de 1 bit da Microsoft.
    Recipe {
        id: "bitnet-2b4t",
        requires: &[],
        steps: &[
            Step::BuildBitnet,
            Step::File {
                url: "https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf",
                name: "ggml-model-i2_s.gguf",
            },
        ],
    },
    // Frameworks Python (ambiente isolado por ferramenta).
    Recipe {
        id: "py-nemo",
        requires: &[],
        steps: &[Step::Pip { packages: &["nemo_toolkit[asr]"], torch_cuda: true }],
    },
    Recipe {
        id: "py-nemo-guardrails",
        requires: &[],
        steps: &[Step::Pip { packages: &["nemoguardrails", "langchain-ollama"], torch_cuda: false }],
    },
    Recipe {
        id: "py-whisperlive",
        requires: &[],
        steps: &[Step::Pip { packages: &["whisper-live"], torch_cuda: true }],
    },
    Recipe {
        id: "py-autogen",
        requires: &[],
        steps: &[Step::Pip { packages: &["autogen-agentchat", "autogen-ext[ollama]"], torch_cuda: false }],
    },
    Recipe {
        id: "py-florence2",
        requires: &[],
        steps: &[Step::Pip { packages: &["transformers", "accelerate", "einops", "timm", "pillow"], torch_cuda: true }],
    },
    Recipe {
        id: "py-mms",
        requires: &[],
        steps: &[Step::Pip { packages: &["transformers", "accelerate", "soundfile"], torch_cuda: true }],
    },
];

pub fn recipe(id: &str) -> Option<&'static Recipe> {
    RECIPES.iter().find(|recipe| recipe.id == id)
}

#[derive(Default)]
pub struct ToolsState {
    /// Instalações em andamento, com o sinal de cancelamento de cada uma.
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolProgress {
    tool_id: String,
    /// `running`, `completed`, `failed` ou `cancelled`.
    state: String,
    phase: String,
    message: Option<String>,
    completed_bytes: Option<u64>,
    total_bytes: Option<u64>,
    bytes_per_second: Option<f64>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    id: String,
    installed: bool,
    installing: bool,
}

pub fn tools_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("tools"))
        .map_err(|error| format!("Pasta de dados do app indisponível: {error}"))
}

pub fn tool_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(tools_root(app)?.join(id))
}

pub fn is_installed(app: &AppHandle, id: &str) -> bool {
    tool_dir(app, id)
        .map(|dir| dir.join(MARKER).is_file())
        .unwrap_or(false)
}

/// Procura recursivamente o primeiro arquivo que satisfaz `accept` (nome do arquivo em minúsculas).
pub fn find_file(root: &Path, accept: &dyn Fn(&str) -> bool) -> Option<PathBuf> {
    let mut pending = VecDeque::from([root.to_path_buf()]);
    let mut found: Vec<PathBuf> = Vec::new();
    while let Some(dir) = pending.pop_front() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push_back(path);
            } else if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| accept(&name.to_lowercase()))
            {
                found.push(path);
            }
        }
    }
    found.sort();
    found.into_iter().next()
}

fn emit(app: &AppHandle, progress: ToolProgress) {
    let _ = app.emit(PROGRESS_EVENT, progress);
}

fn running(tool_id: &str, phase: &str) -> ToolProgress {
    ToolProgress {
        tool_id: tool_id.to_string(),
        state: "running".into(),
        phase: phase.to_string(),
        message: None,
        completed_bytes: None,
        total_bytes: None,
        bytes_per_second: None,
        error: None,
    }
}

fn download(
    app: &AppHandle,
    tool_id: &str,
    phase: &str,
    url: &str,
    dest: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(120))
        .redirects(10)
        .build();
    let response = agent
        .get(url)
        .set("User-Agent", "OpenAssistant/0.1 (Windows)")
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(code, _) => format!("O servidor respondeu {code} para {url}"),
            other => format!("Sem conexão para baixar {url}: {other}"),
        })?;
    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok());
    let partial = dest.with_extension("part");
    let mut file = fs::File::create(&partial)
        .map_err(|error| format!("Não foi possível gravar {}: {error}", partial.display()))?;
    let mut reader = response.into_reader();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut completed: u64 = 0;
    let mut speed: Option<f64> = None;
    let mut window_start = Instant::now();
    let mut window_bytes: u64 = 0;
    loop {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            let _ = fs::remove_file(&partial);
            return Err(CANCELLED.into());
        }
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Download interrompido: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("Falha ao gravar o download: {error}"))?;
        completed += read as u64;
        window_bytes += read as u64;
        let elapsed = window_start.elapsed();
        if elapsed >= Duration::from_millis(400) {
            let current = window_bytes as f64 / elapsed.as_secs_f64();
            // Média móvel para o MB/s não oscilar a cada leitura.
            speed = Some(speed.map_or(current, |previous| previous * 0.6 + current * 0.4));
            window_start = Instant::now();
            window_bytes = 0;
            emit(
                app,
                ToolProgress {
                    completed_bytes: Some(completed),
                    total_bytes: total,
                    bytes_per_second: speed,
                    ..running(tool_id, phase)
                },
            );
        }
    }
    file.flush().map_err(|error| error.to_string())?;
    drop(file);
    if total.is_some_and(|total| total != completed) {
        let _ = fs::remove_file(&partial);
        return Err("O download terminou incompleto. Tente de novo.".into());
    }
    fs::rename(&partial, dest).map_err(|error| error.to_string())
}

/// Roda um processo sem janela, repassando a última linha da saída como mensagem de progresso.
fn run_logged(
    app: &AppHandle,
    tool_id: &str,
    phase: &str,
    mut command: Command,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Não foi possível executar {phase}: {error}"))?;
    let lines: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    let mut readers = Vec::new();
    let streams: Vec<Box<dyn Read + Send>> = vec![
        Box::new(child.stdout.take().expect("stdout")),
        Box::new(child.stderr.take().expect("stderr")),
    ];
    for stream in streams {
        let lines = lines.clone();
        let app = app.clone();
        let tool_id = tool_id.to_string();
        let phase = phase.to_string();
        readers.push(std::thread::spawn(move || {
            let mut reader = BufReader::new(stream);
            let mut raw = Vec::new();
            while reader.read_until(b'\n', &mut raw).unwrap_or(0) > 0 {
                let line = String::from_utf8_lossy(&raw).trim().to_string();
                raw.clear();
                if line.is_empty() {
                    continue;
                }
                if let Ok(mut lines) = lines.lock() {
                    lines.push_back(line.clone());
                    if lines.len() > 30 {
                        lines.pop_front();
                    }
                }
                emit(
                    &app,
                    ToolProgress {
                        message: Some(line.chars().take(180).collect()),
                        ..running(&tool_id, &phase)
                    },
                );
            }
        }));
    }
    let status = loop {
        if cancel.load(Ordering::SeqCst) {
            // taskkill /T derruba também os filhos (cmake, ninja, pip…).
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &child.id().to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            let _ = child.wait();
            return Err(CANCELLED.into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(error) => return Err(error.to_string()),
        }
    };
    for reader in readers {
        let _ = reader.join();
    }
    if status.success() {
        return Ok(());
    }
    let tail: Vec<String> = lines
        .lock()
        .map(|lines| lines.iter().rev().take(6).rev().cloned().collect())
        .unwrap_or_default();
    Err(format!("{phase} falhou ({status}).\n{}", tail.join("\n")))
}

fn system_tar() -> PathBuf {
    // O tar do Windows (bsdtar) extrai .zip e .tar.bz2; o do Git Bash não abre .zip.
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    PathBuf::from(root).join("System32").join("tar.exe")
}

fn file_name_from_url(url: &str) -> String {
    url.rsplit('/').next().unwrap_or("download").to_string()
}

fn which(executable: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe")
        .arg(executable)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(PathBuf::from)
}

fn find_uv() -> Option<PathBuf> {
    which("uv.exe").or_else(|| {
        let home = std::env::var("USERPROFILE").ok()?;
        let candidate = PathBuf::from(home).join(".local").join("bin").join("uv.exe");
        candidate.is_file().then_some(candidate)
    })
}

fn run_pip(
    app: &AppHandle,
    tool_id: &str,
    dir: &Path,
    packages: &[&str],
    torch_cuda: bool,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let uv = find_uv().ok_or(
        "O instalador Python \"uv\" não foi encontrado. Instale com: winget install astral-sh.uv",
    )?;
    let venv = dir.join("venv");
    let python = venv.join("Scripts").join("python.exe");
    if !python.is_file() {
        let mut command = Command::new(&uv);
        // O uv baixa um Python 3.12 próprio se o sistema não tiver um.
        command.args(["venv", "--python", "3.12"]).arg(&venv);
        run_logged(app, tool_id, "Criando ambiente Python", command, cancel)?;
    }
    if torch_cuda {
        let mut command = Command::new(&uv);
        command
            .args(["pip", "install", "--python"])
            .arg(&python)
            .args(["torch", "torchvision", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu128"]);
        run_logged(app, tool_id, "Instalando PyTorch com CUDA", command, cancel)?;
    }
    let mut command = Command::new(&uv);
    command.args(["pip", "install", "--python"]).arg(&python).args(packages);
    run_logged(app, tool_id, "Instalando pacotes Python", command, cancel)
}

/// Visual Studio com clang-cl + vcvars64 (a compilação do bitnet.cpp exige clang).
fn find_vs_with_clang() -> Option<PathBuf> {
    let program_files = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
    let vswhere = PathBuf::from(program_files)
        .join("Microsoft Visual Studio")
        .join("Installer")
        .join("vswhere.exe");
    let output = Command::new(vswhere)
        .args(["-all", "-products", "*", "-property", "installationPath"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| PathBuf::from(line.trim()))
        .find(|path| {
            path.join("VC\\Tools\\Llvm\\x64\\bin\\clang-cl.exe").is_file()
                && path.join("VC\\Auxiliary\\Build\\vcvars64.bat").is_file()
        })
}

fn build_bitnet(app: &AppHandle, tool_id: &str, dir: &Path, cancel: &AtomicBool) -> Result<(), String> {
    let server = dir.join("bin").join("llama-server.exe");
    if server.is_file() {
        return Ok(());
    }
    let git = which("git.exe");
    let python = which("python.exe").or_else(|| which("py.exe"));
    let vs = find_vs_with_clang();
    let cmake = which("cmake.exe").or_else(|| {
        vs.as_ref()
            .map(|vs| vs.join("Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe"))
            .filter(|path| path.is_file())
    });
    let mut missing = Vec::new();
    if git.is_none() {
        missing.push("Git");
    }
    if python.is_none() {
        missing.push("Python 3");
    }
    if cmake.is_none() {
        missing.push("CMake");
    }
    if vs.is_none() {
        missing.push("Visual Studio 2022 com \"Desenvolvimento para desktop com C++\" e \"Compilador C++ Clang para Windows\"");
    }
    if !missing.is_empty() {
        return Err(format!(
            "O bitnet.cpp da Microsoft é compilado neste PC e faltam: {}.",
            missing.join(", ")
        ));
    }
    let (git, python, vs, cmake) = (git.unwrap(), python.unwrap(), vs.unwrap(), cmake.unwrap());
    let source = dir.join("BitNet");
    if source.exists() {
        fs::remove_dir_all(&source).map_err(|error| format!("Não foi possível limpar a pasta anterior: {error}"))?;
    }
    fs::create_dir_all(&source).map_err(|error| error.to_string())?;

    let git_step = |args: &[&str], phase: &str| -> Result<(), String> {
        let mut command = Command::new(&git);
        command.args(["-c", "core.longpaths=true"]).args(args).current_dir(&source);
        run_logged(app, tool_id, phase, command, cancel)
    };
    git_step(&["init", "-q"], "Preparando o código do bitnet.cpp")?;
    git_step(&["remote", "add", "origin", "https://github.com/microsoft/BitNet.git"], "Preparando o código do bitnet.cpp")?;
    git_step(&["fetch", "--depth", "1", "origin", BITNET_COMMIT], "Baixando o código do bitnet.cpp")?;
    git_step(&["checkout", "-q", "FETCH_HEAD"], "Baixando o código do bitnet.cpp")?;
    git_step(&["submodule", "update", "--init", "--recursive", "--depth", "1"], "Baixando o llama.cpp do BitNet")?;

    // O clang recusa um ponteiro não-const nesta revisão; a correção é a mesma do upstream.
    let mad = source.join("src").join("ggml-bitnet-mad.cpp");
    if let Ok(code) = fs::read_to_string(&mad) {
        let fixed = code.replace("        int8_t * y_col = y + col * by;", "        const int8_t * y_col = y + col * by;");
        fs::write(&mad, fixed).map_err(|error| error.to_string())?;
    }

    // Kernels do BitNet b1.58 2B4T (mesmos parâmetros do setup_env.py oficial).
    let mut codegen = Command::new(&python);
    codegen
        .args(["utils/codegen_tl2.py", "--model", "bitnet_b1_58-3B", "--BM", "160,320,320", "--BK", "96,96,96", "--bm", "32,32,32"])
        .current_dir(&source);
    run_logged(app, tool_id, "Gerando kernels de 1 bit", codegen, cancel)?;

    // Ninja + clang-cl: dispensa o toolset ClangCL do MSBuild. Sem OpenMP (o libomp do VS
    // não linka) e sem a interface web do servidor (o download dela falha em clones rasos).
    let script = dir.join("build-bitnet.bat");
    let cmake_dir = cmake.parent().map(Path::to_path_buf).unwrap_or_default();
    let bat = format!(
        "@echo off\r\ncall \"{vcvars}\" >nul\r\nset \"PATH={llvm};{ninja};{cmake};%PATH%\"\r\ncd /d \"{source}\"\r\n\
         cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl \
         -DBITNET_X86_TL2=OFF -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_EXAMPLES=ON -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_COMMON=ON \
         -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF -DGGML_OPENMP=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF \
         -DLLAMA_BUILD_TESTS=OFF \"-DCMAKE_C_FLAGS=/arch:AVX2 -mavx2 -mfma -mf16c\" \"-DCMAKE_CXX_FLAGS=/arch:AVX2 -mavx2 -mfma -mf16c /EHsc\" || exit /b 1\r\n\
         cmake --build build --config Release --target llama-server -j 8 || exit /b 2\r\n",
        vcvars = vs.join("VC\\Auxiliary\\Build\\vcvars64.bat").display(),
        llvm = vs.join("VC\\Tools\\Llvm\\x64\\bin").display(),
        ninja = vs.join("Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja").display(),
        cmake = cmake_dir.display(),
        source = source.display(),
    );
    fs::write(&script, bat).map_err(|error| error.to_string())?;
    let mut build = Command::new("cmd.exe");
    build.arg("/c").arg(&script);
    run_logged(app, tool_id, "Compilando o bitnet.cpp", build, cancel)?;

    let built = source.join("build").join("bin").join("llama-server.exe");
    fs::create_dir_all(dir.join("bin")).map_err(|error| error.to_string())?;
    fs::copy(&built, &server).map_err(|error| format!("Compilação não gerou o llama-server: {error}"))?;
    // O executável é estático; o código-fonte e os objetos (~1 GB) não são mais necessários.
    let _ = fs::remove_dir_all(&source);
    let _ = fs::remove_file(&script);
    Ok(())
}

fn run_recipe(app: &AppHandle, progress_id: &str, recipe: &Recipe, cancel: &AtomicBool) -> Result<(), String> {
    let dir = tool_dir(app, recipe.id)?;
    fs::create_dir_all(&dir).map_err(|error| format!("Não foi possível criar {}: {error}", dir.display()))?;
    for step in recipe.steps {
        match step {
            Step::Archive(url) => {
                let archive = dir.join(file_name_from_url(url));
                download(app, progress_id, "Baixando", url, &archive, cancel)?;
                emit(app, running(progress_id, "Extraindo"));
                let mut command = Command::new(system_tar());
                command.arg("-xf").arg(&archive).arg("-C").arg(&dir);
                let result = run_logged(app, progress_id, "Extraindo", command, cancel);
                let _ = fs::remove_file(&archive);
                result?;
            }
            Step::File { url, name } => {
                let target = dir.join(name);
                if !target.is_file() {
                    download(app, progress_id, "Baixando o modelo", url, &target, cancel)?;
                }
            }
            Step::Pip { packages, torch_cuda } => run_pip(app, progress_id, &dir, packages, *torch_cuda, cancel)?,
            Step::BuildBitnet => build_bitnet(app, progress_id, &dir, cancel)?,
        }
    }
    fs::write(dir.join(MARKER), format!("{}\n", recipe.id)).map_err(|error| error.to_string())
}

fn install(app: &AppHandle, recipe: &'static Recipe, cancel: &AtomicBool) -> Result<(), String> {
    for dependency in recipe.requires {
        if is_installed(app, dependency) {
            continue;
        }
        let dependency = self::recipe(dependency).ok_or("Dependência desconhecida")?;
        emit(app, running(recipe.id, "Baixando a runtime de voz"));
        run_recipe(app, recipe.id, dependency, cancel)?;
        emit(
            app,
            ToolProgress {
                state: "completed".into(),
                ..running(dependency.id, "Instalado")
            },
        );
    }
    run_recipe(app, recipe.id, recipe, cancel)
}

#[tauri::command]
pub fn tools_status(app: AppHandle, state: State<ToolsState>) -> Result<Vec<ToolStatus>, String> {
    let jobs = state.jobs.lock().map_err(|_| "estado das ferramentas indisponível")?;
    Ok(RECIPES
        .iter()
        .map(|recipe| ToolStatus {
            id: recipe.id.to_string(),
            installed: is_installed(&app, recipe.id),
            installing: jobs.contains_key(recipe.id),
        })
        .collect())
}

#[tauri::command]
pub fn tool_install(app: AppHandle, state: State<ToolsState>, tool_id: String) -> Result<(), String> {
    let recipe = recipe(&tool_id).ok_or_else(|| format!("Ferramenta desconhecida: {tool_id}"))?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = state.jobs.lock().map_err(|_| "estado das ferramentas indisponível")?;
        if jobs.contains_key(recipe.id) {
            return Ok(());
        }
        jobs.insert(recipe.id.to_string(), cancel.clone());
    }
    emit(&app, running(recipe.id, "Preparando"));
    std::thread::spawn(move || {
        let result = install(&app, recipe, &cancel);
        if let Ok(mut jobs) = app.state::<ToolsState>().jobs.lock() {
            jobs.remove(recipe.id);
        }
        let progress = match result {
            Ok(()) => ToolProgress { state: "completed".into(), ..running(recipe.id, "Instalado") },
            Err(error) if error == CANCELLED => ToolProgress { state: "cancelled".into(), ..running(recipe.id, "Cancelado") },
            Err(error) => ToolProgress { state: "failed".into(), error: Some(error), ..running(recipe.id, "Falhou") },
        };
        emit(&app, progress);
    });
    Ok(())
}

#[tauri::command]
pub fn tool_cancel(state: State<ToolsState>, tool_id: String) -> Result<(), String> {
    if let Some(cancel) = state
        .jobs
        .lock()
        .map_err(|_| "estado das ferramentas indisponível")?
        .get(&tool_id)
    {
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn tool_remove(app: AppHandle, state: State<ToolsState>, tool_id: String) -> Result<(), String> {
    let recipe = recipe(&tool_id).ok_or_else(|| format!("Ferramenta desconhecida: {tool_id}"))?;
    if state
        .jobs
        .lock()
        .map_err(|_| "estado das ferramentas indisponível")?
        .contains_key(recipe.id)
    {
        return Err("Cancele o download antes de remover.".into());
    }
    if recipe.id == "bitnet-2b4t" {
        super::bitnet::stop_server(&app);
    }
    super::speech::release(&app, recipe.id);
    let dir = tool_dir(&app, recipe.id)?;
    if dir.exists() {
        // Remove o marcador primeiro: se algum arquivo estiver em uso, a ferramenta
        // deixa de aparecer como instalada em vez de ficar pela metade.
        let _ = fs::remove_file(dir.join(MARKER));
        fs::remove_dir_all(&dir).map_err(|error| {
            format!("Alguns arquivos estão em uso; feche o Open Assistant e remova de novo. ({error})")
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_dependency_is_a_known_recipe() {
        for recipe in RECIPES {
            for dependency in recipe.requires {
                assert!(super::recipe(dependency).is_some(), "{} requer {}", recipe.id, dependency);
            }
        }
    }

    #[test]
    fn recipe_ids_are_unique_and_safe_folder_names() {
        let mut seen = std::collections::HashSet::new();
        for recipe in RECIPES {
            assert!(seen.insert(recipe.id), "id repetido: {}", recipe.id);
            assert!(recipe
                .id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'));
        }
    }

    #[test]
    fn downloads_use_https_from_known_hosts() {
        for recipe in RECIPES {
            for step in recipe.steps {
                let url = match step {
                    Step::Archive(url) | Step::File { url, .. } => *url,
                    _ => continue,
                };
                assert!(
                    url.starts_with("https://github.com/k2-fsa/sherpa-onnx/releases/download/")
                        || url.starts_with("https://huggingface.co/microsoft/"),
                    "{url}"
                );
            }
        }
    }

    #[test]
    fn find_file_prefers_a_stable_order() {
        let root = std::env::temp_dir().join(format!("oa-find-{}", std::process::id()));
        let nested = root.join("model");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("b-encoder.onnx"), b"").unwrap();
        fs::write(nested.join("a-encoder.onnx"), b"").unwrap();
        let found = find_file(&root, &|name| name.ends_with("encoder.onnx")).unwrap();
        assert!(found.ends_with("a-encoder.onnx"));
        fs::remove_dir_all(&root).unwrap();
    }
}
