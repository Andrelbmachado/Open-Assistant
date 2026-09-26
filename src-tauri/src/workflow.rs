//! Motor dos nodes do editor de workflows (a lógica do fluxo fica em `src/utils/workflowEngine.ts`;
//! aqui ficam as ações que precisam do sistema): arquivos locais, leitura de documentos (txt, md, csv,
//! json, html, docx, xlsx, pptx, pdf), HTTP, abrir sites e nuvens via **rclone** (Google Drive,
//! OneDrive, Dropbox…). O login na nuvem é feito pelo próprio usuário no navegador (OAuth do rclone);
//! o app nunca vê a senha. As credenciais do rclone ficam em `%LOCALAPPDATA%\…\rclone.conf`.

use crate::tools;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Tamanho máximo lido de um arquivo de texto (os nodes de IA não precisam de mais).
const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;

fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> impl std::future::Future<Output = Result<T, String>> {
    async move { tauri::async_runtime::spawn_blocking(job).await.map_err(|error| error.to_string())? }
}

// ---------------------------------------------------------------- pastas

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolders {
    desktop: String,
    documents: String,
    downloads: String,
    pictures: String,
    home: String,
    temp: String,
}

/// Pastas do usuário (a Área de Trabalho pode estar no OneDrive: vem do Windows, não de um caminho fixo).
#[tauri::command]
pub fn wf_known_folders(app: AppHandle) -> KnownFolders {
    let path = app.path();
    let text = |value: Result<PathBuf, tauri::Error>| value.map(|path| path.to_string_lossy().into_owned()).unwrap_or_default();
    KnownFolders {
        desktop: text(path.desktop_dir()),
        documents: text(path.document_dir()),
        downloads: text(path.download_dir()),
        pictures: text(path.picture_dir()),
        home: text(path.home_dir()),
        temp: std::env::temp_dir().to_string_lossy().into_owned(),
    }
}

/// `%USERPROFILE%` e `~` viram caminhos de verdade; barras normalizadas.
pub fn expand_path(raw: &str) -> PathBuf {
    let mut text = raw.trim().trim_matches('"').replace('/', "\\");
    if let Some(rest) = text.strip_prefix('~') {
        text = format!("{}{rest}", std::env::var("USERPROFILE").unwrap_or_default());
    }
    let re = regex::Regex::new(r"%([A-Za-z_][A-Za-z0-9_]*)%").expect("regex");
    let expanded = re.replace_all(&text, |captures: &regex::Captures| std::env::var(&captures[1]).unwrap_or_default()).into_owned();
    PathBuf::from(expanded)
}

// ---------------------------------------------------------------- arquivos

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    path: String,
    name: String,
    size: u64,
    /// Última modificação em ms desde 1970.
    modified: u64,
    is_dir: bool,
}

/// `*.pdf;*.docx` → casa pelo nome (sem diferenciar maiúsculas). Vazio = tudo.
pub fn matches_pattern(name: &str, pattern: &str) -> bool {
    let patterns: Vec<&str> = pattern.split([';', ',']).map(str::trim).filter(|item| !item.is_empty()).collect();
    if patterns.is_empty() {
        return true;
    }
    let name = name.to_lowercase();
    patterns.iter().any(|pattern| {
        let regex = format!("^{}$", regex::escape(&pattern.to_lowercase()).replace(r"\*", ".*").replace(r"\?", "."));
        regex::Regex::new(&regex).map(|re| re.is_match(&name)).unwrap_or(false)
    })
}

fn list_files(folder: &Path, pattern: &str, recursive: bool, out: &mut Vec<FileEntry>) -> Result<(), String> {
    let entries = fs::read_dir(folder).map_err(|error| format!("Não consegui abrir a pasta {}: {error}", folder.display()))?;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if meta.is_dir() {
            if recursive && out.len() < 5000 {
                let _ = list_files(&path, pattern, true, out);
            }
            continue;
        }
        if !matches_pattern(&name, pattern) {
            continue;
        }
        let modified = meta.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|value| value.as_millis() as u64).unwrap_or(0);
        out.push(FileEntry { path: path.to_string_lossy().into_owned(), name, size: meta.len(), modified, is_dir: false });
    }
    Ok(())
}

#[tauri::command]
pub async fn wf_list_files(folder: String, pattern: Option<String>, recursive: Option<bool>) -> Result<Vec<FileEntry>, String> {
    blocking(move || {
        let mut out = Vec::new();
        list_files(&expand_path(&folder), pattern.as_deref().unwrap_or(""), recursive.unwrap_or(false), &mut out)?;
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    })
    .await
}

/// Texto puro de um XML do Office: parágrafos (`</w:p>`, `</a:p>`) e células viram quebras de linha.
pub fn office_xml_text(xml: &str) -> String {
    let breaks = regex::Regex::new(r"</w:p>|</a:p>|<w:br/>|<w:tab/>|</row>|</si>").expect("regex");
    let tags = regex::Regex::new(r"<[^>]+>").expect("regex");
    let with_breaks = breaks.replace_all(xml, "\n");
    let text = tags.replace_all(&with_breaks, "");
    let decoded = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&");
    decoded.lines().map(str::trim).filter(|line| !line.is_empty()).collect::<Vec<_>>().join("\n")
}

fn zip_entries(path: &Path, accept: impl Fn(&str) -> bool) -> Result<Vec<(String, String)>, String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| format!("Arquivo Office inválido: {error}"))?;
    let mut parts = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();
        if !accept(&name) {
            continue;
        }
        let mut xml = String::new();
        entry.read_to_string(&mut xml).map_err(|error| error.to_string())?;
        parts.push((name, xml));
    }
    parts.sort_by(|a, b| natural_key(&a.0).cmp(&natural_key(&b.0)));
    Ok(parts)
}

/// "slide10.xml" depois de "slide9.xml".
fn natural_key(name: &str) -> (String, u64) {
    let digits: String = name.chars().filter(char::is_ascii_digit).collect();
    (name.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.' || c.is_ascii_alphabetic()).to_string(), digits.parse().unwrap_or(0))
}

/// Lê o texto de um documento. Formatos binários sem leitor viram erro claro.
pub fn read_document(path: &Path) -> Result<String, String> {
    let extension = path.extension().map(|value| value.to_string_lossy().to_lowercase()).unwrap_or_default();
    match extension.as_str() {
        "docx" => Ok(zip_entries(path, |name| name == "word/document.xml")?.into_iter().map(|(_, xml)| office_xml_text(&xml)).collect::<Vec<_>>().join("\n")),
        "pptx" => Ok(zip_entries(path, |name| name.starts_with("ppt/slides/slide") && name.ends_with(".xml"))?
            .into_iter()
            .enumerate()
            .map(|(index, (_, xml))| format!("[Slide {}]\n{}", index + 1, office_xml_text(&xml)))
            .collect::<Vec<_>>()
            .join("\n\n")),
        "xlsx" => {
            // Planilha: textos compartilhados + números das células, por aba.
            let shared = zip_entries(path, |name| name == "xl/sharedStrings.xml")?.into_iter().map(|(_, xml)| office_xml_text(&xml)).collect::<Vec<_>>().join("\n");
            let values = regex::Regex::new(r"<v>([^<]*)</v>").expect("regex");
            let sheets = zip_entries(path, |name| name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml"))?;
            let numbers: Vec<String> = sheets.iter().flat_map(|(_, xml)| values.captures_iter(xml).map(|captures| captures[1].to_string()).collect::<Vec<_>>()).take(2000).collect();
            Ok(format!("{shared}\n{}", numbers.join(" ")))
        }
        "pdf" => {
            let bytes = fs::read(path).map_err(|error| error.to_string())?;
            // O leitor de PDF pode entrar em pânico com arquivos estranhos: isola.
            std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(&bytes))
                .map_err(|_| "Não consegui ler este PDF (formato não suportado).".to_string())?
                .map_err(|error| format!("Não consegui ler este PDF: {error}"))
        }
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "zip" | "exe" | "dll" | "mp3" | "mp4" | "wav" | "mkv" | "7z" | "rar" => {
            Err(format!("{} é um arquivo binário ({extension}); use o caminho dele em outro node (ex.: Editar foto com IA).", path.display()))
        }
        _ => {
            let meta = fs::metadata(path).map_err(|error| format!("Não consegui ler {}: {error}", path.display()))?;
            let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
            let mut bytes = Vec::with_capacity(meta.len().min(MAX_TEXT_BYTES) as usize);
            file.by_ref().take(MAX_TEXT_BYTES).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
            let text = String::from_utf8(bytes.clone()).unwrap_or_else(|_| bytes.iter().map(|&byte| byte as char).collect());
            Ok(if matches!(extension.as_str(), "html" | "htm") { crate::agent::html_to_text(&text) } else { text })
        }
    }
}

#[tauri::command]
pub async fn wf_read_file(path: String, max_chars: Option<usize>) -> Result<String, String> {
    blocking(move || {
        let text = read_document(&expand_path(&path))?;
        let limit = max_chars.unwrap_or(60_000);
        Ok(if text.chars().count() > limit { format!("{}\n…(cortado)", text.chars().take(limit).collect::<String>()) } else { text })
    })
    .await
}

/// Nome de arquivo seguro para o Windows (tira `\ / : * ? " < > |`).
pub fn safe_file_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '-' } else { c }).collect();
    let trimmed = cleaned.trim().trim_end_matches('.').to_string();
    if trimmed.is_empty() { "arquivo.txt".into() } else { trimmed.chars().take(150).collect() }
}

/// `relatorio.md` já existe → `relatorio (2).md`.
fn unique_path(folder: &Path, name: &str) -> PathBuf {
    let candidate = folder.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) => (stem.to_string(), format!(".{extension}")),
        None => (name.to_string(), String::new()),
    };
    (2..10_000).map(|index| folder.join(format!("{stem} ({index}){extension}"))).find(|path| !path.exists()).unwrap_or(candidate)
}

/// Grava texto. `mode`: `overwrite` (padrão), `append` ou `unique` (não sobrescreve: numera).
#[tauri::command]
pub async fn wf_write_file(folder: String, name: String, content: String, mode: Option<String>) -> Result<String, String> {
    blocking(move || {
        let folder = expand_path(&folder);
        fs::create_dir_all(&folder).map_err(|error| format!("Não consegui criar a pasta {}: {error}", folder.display()))?;
        let name = safe_file_name(&name);
        let path = match mode.as_deref() {
            Some("unique") => unique_path(&folder, &name),
            _ => folder.join(&name),
        };
        if mode.as_deref() == Some("append") {
            use std::io::Write;
            let mut file = fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|error| error.to_string())?;
            file.write_all(content.as_bytes()).map_err(|error| error.to_string())?;
        } else {
            fs::write(&path, content).map_err(|error| format!("Não consegui salvar {}: {error}", path.display()))?;
        }
        Ok(path.to_string_lossy().into_owned())
    })
    .await
}

/// Copia (ou move) um arquivo para uma pasta; não sobrescreve (numera).
#[tauri::command]
pub async fn wf_copy_file(from: String, to_folder: String, move_file: Option<bool>) -> Result<String, String> {
    blocking(move || {
        let source = expand_path(&from);
        let folder = expand_path(&to_folder);
        fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
        let name = source.file_name().ok_or("Arquivo de origem inválido.")?.to_string_lossy().into_owned();
        let target = unique_path(&folder, &name);
        if move_file.unwrap_or(false) {
            if fs::rename(&source, &target).is_err() {
                fs::copy(&source, &target).map_err(|error| error.to_string())?;
                fs::remove_file(&source).map_err(|error| error.to_string())?;
            }
        } else {
            fs::copy(&source, &target).map_err(|error| format!("Não consegui copiar {}: {error}", source.display()))?;
        }
        Ok(target.to_string_lossy().into_owned())
    })
    .await
}

// ---------------------------------------------------------------- web

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpReply {
    status: u16,
    text: String,
}

#[tauri::command]
pub async fn wf_http(method: String, url: String, body: Option<String>, headers: Option<serde_json::Map<String, serde_json::Value>>) -> Result<HttpReply, String> {
    blocking(move || {
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err("A URL precisa começar com http:// ou https://.".into());
        }
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(60)).build();
        let mut request = agent.request(&method.to_uppercase(), &url).set("User-Agent", "OpenAssistant/1.0");
        for (key, value) in headers.unwrap_or_default() {
            request = request.set(&key, value.as_str().unwrap_or_default());
        }
        let response = match body.filter(|text| !text.is_empty()) {
            Some(body) => request.send_string(&body),
            None => request.call(),
        };
        let response = match response {
            Ok(response) => response,
            Err(ureq::Error::Status(_, response)) => response,
            Err(error) => return Err(format!("Falha na requisição: {error}")),
        };
        let status = response.status();
        let mut text = String::new();
        response.into_reader().take(4 * 1024 * 1024).read_to_string(&mut text).map_err(|error| error.to_string())?;
        Ok(HttpReply { status, text })
    })
    .await
}

#[tauri::command]
pub fn wf_open_url(url: String, browser: Option<String>) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Só abro endereços http:// ou https://.".into());
    }
    match browser.as_deref().map(str::to_lowercase).as_deref() {
        Some("chrome") | Some("edge") | Some("firefox") => {
            let exe = match browser.as_deref().map(str::to_lowercase).as_deref() {
                Some("chrome") => "chrome",
                Some("edge") => "msedge",
                _ => "firefox",
            };
            Command::new("cmd").args(["/C", "start", "", exe, &url]).creation_flags(CREATE_NO_WINDOW).spawn().map(|_| ()).map_err(|error| error.to_string())
        }
        _ => tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string()),
    }
}

/// Aviso no canto da tela (notificação do Windows). Título e texto vão por variável de ambiente
/// e são escapados no script: nada do conteúdo vira comando.
#[tauri::command]
pub async fn wf_notify(title: String, message: String) -> Result<(), String> {
    blocking(move || {
        const SCRIPT: &str = r#"
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$t = [System.Security.SecurityElement]::Escape($env:OA_TITLE)
$m = [System.Security.SecurityElement]::Escape($env:OA_MESSAGE)
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$m</text></binding></visual></toast>")
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
"#;
        let status = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
            .env("OA_TITLE", title.chars().take(120).collect::<String>())
            .env("OA_MESSAGE", message.chars().take(400).collect::<String>())
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() { Ok(()) } else { Err("O Windows não mostrou a notificação.".into()) }
    })
    .await
}

// ---------------------------------------------------------------- nuvens (rclone)

fn rclone(app: &AppHandle) -> Result<Command, String> {
    let dir = tools::tool_dir(app, tools::RCLONE)?;
    let exe = tools::find_file(&dir, &|name| name.eq_ignore_ascii_case("rclone.exe")).ok_or("O conector de nuvens (rclone) ainda não foi baixado.")?;
    let config = app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("rclone.conf");
    let mut command = Command::new(exe);
    command.arg("--config").arg(config).creation_flags(CREATE_NO_WINDOW).stdin(Stdio::null());
    Ok(command)
}

fn run_rclone(app: &AppHandle, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = rclone(app)?;
    command.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    let child = command.spawn().map_err(|error| format!("Não consegui iniciar o rclone: {error}"))?;
    let started = std::time::Instant::now();
    let output = {
        let (sender, receiver) = std::sync::mpsc::channel();
        let pid = child.id();
        std::thread::spawn(move || {
            let _ = sender.send(child.wait_with_output());
        });
        match receiver.recv_timeout(timeout) {
            Ok(output) => output.map_err(|error| error.to_string())?,
            Err(_) => {
                let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).creation_flags(CREATE_NO_WINDOW).status();
                return Err(format!("A nuvem não respondeu em {} s.", started.elapsed().as_secs()));
            }
        }
    };
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        let line = error.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("erro desconhecido");
        return Err(format!("A nuvem recusou: {}", line.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    installed: bool,
    /// Contas conectadas: `gdrive` (drive), `onedrive` (onedrive)…
    remotes: Vec<CloudRemote>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRemote {
    name: String,
    kind: String,
}

#[tauri::command]
pub async fn cloud_status(app: AppHandle) -> Result<CloudStatus, String> {
    blocking(move || {
        if !tools::is_installed(&app, tools::RCLONE) {
            return Ok(CloudStatus { installed: false, remotes: Vec::new() });
        }
        let text = run_rclone(&app, &["listremotes", "--long"], Duration::from_secs(20))?;
        let remotes = text
            .lines()
            .filter_map(|line| {
                let (name, kind) = line.split_once(':')?;
                Some(CloudRemote { name: name.trim().to_string(), kind: kind.trim().to_string() })
            })
            .collect();
        Ok(CloudStatus { installed: true, remotes })
    })
    .await
}

/// Provedores aceitos (tipo do rclone).
const PROVIDERS: &[&str] = &["drive", "onedrive", "dropbox", "box", "pcloud", "mega", "alias"];

/// Conecta uma conta: abre o navegador para o **usuário** entrar e autorizar (OAuth do rclone).
/// Google Drive entra só com leitura (`drive.readonly`) a menos que `write` seja pedido.
#[tauri::command]
pub async fn cloud_connect(app: AppHandle, provider: String, name: String, write: Option<bool>, local_path: Option<String>) -> Result<String, String> {
    blocking(move || {
        if !PROVIDERS.contains(&provider.as_str()) {
            return Err(format!("Nuvem não suportada: {provider}."));
        }
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err("Nome da conta inválido (use letras, números, - ou _).".into());
        }
        let mut args = vec!["config".to_string(), "create".into(), name.clone(), provider.clone()];
        match provider.as_str() {
            "drive" => args.push(format!("scope={}", if write.unwrap_or(false) { "drive" } else { "drive.readonly" })),
            // Pasta local fingindo ser nuvem (testes e pastas sincronizadas).
            "alias" => args.push(format!("remote={}", expand_path(local_path.as_deref().unwrap_or_default()).display())),
            _ => {}
        }
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_rclone(&app, &refs, Duration::from_secs(300))?;
        Ok(name)
    })
    .await
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloudEntry {
    name: String,
    /// Caminho dentro da conta, ex.: `Relatórios/março.docx`.
    path: String,
    size: i64,
    modified: String,
    mime_type: String,
    is_dir: bool,
}

/// `gdrive` + `Pasta/Sub` → `gdrive:Pasta/Sub`.
pub fn remote_path(remote: &str, path: &str) -> String {
    format!("{}:{}", remote.trim().trim_end_matches(':'), path.trim().trim_matches('/'))
}

/// Documentos do Google viram arquivos do Office ao baixar (e aparecem com essa extensão na lista).
const EXPORT_FORMATS: &str = "docx,xlsx,pptx,svg";

#[tauri::command]
pub async fn cloud_list(app: AppHandle, remote: String, folder: String, recursive: Option<bool>) -> Result<Vec<CloudEntry>, String> {
    blocking(move || {
        let target = remote_path(&remote, &folder);
        let mut args = vec!["lsjson", target.as_str(), "--drive-export-formats", EXPORT_FORMATS];
        if recursive.unwrap_or(false) {
            args.push("--recursive");
        }
        let text = run_rclone(&app, &args, Duration::from_secs(120))?;
        let values: Vec<serde_json::Value> = serde_json::from_str(&text).map_err(|error| format!("Resposta inesperada da nuvem: {error}"))?;
        let base = folder.trim().trim_matches('/');
        Ok(values
            .into_iter()
            .map(|value| {
                let text = |key: &str| value.get(key).and_then(serde_json::Value::as_str).unwrap_or_default().to_string();
                let relative = text("Path");
                CloudEntry {
                    name: text("Name"),
                    path: if base.is_empty() { relative } else { format!("{base}/{relative}") },
                    size: value.get("Size").and_then(serde_json::Value::as_i64).unwrap_or(-1),
                    modified: text("ModTime"),
                    mime_type: text("MimeType"),
                    is_dir: value.get("IsDir").and_then(serde_json::Value::as_bool).unwrap_or(false),
                }
            })
            .collect())
    })
    .await
}

/// Baixa um arquivo da nuvem para uma pasta local; devolve o caminho local.
#[tauri::command]
pub async fn cloud_download(app: AppHandle, remote: String, path: String, local_folder: String) -> Result<String, String> {
    blocking(move || {
        let folder = expand_path(&local_folder);
        fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
        let source = remote_path(&remote, &path);
        let folder_text = folder.to_string_lossy().into_owned();
        run_rclone(&app, &["copy", source.as_str(), folder_text.as_str(), "--drive-export-formats", EXPORT_FORMATS], Duration::from_secs(600))?;
        let name = path.rsplit('/').next().unwrap_or(&path);
        let local = folder.join(name);
        Ok(local.to_string_lossy().into_owned())
    })
    .await
}

/// Envia um arquivo local para uma pasta da nuvem.
#[tauri::command]
pub async fn cloud_upload(app: AppHandle, local_path: String, remote: String, folder: String) -> Result<String, String> {
    blocking(move || {
        let source = expand_path(&local_path);
        let target = remote_path(&remote, &folder);
        let source_text = source.to_string_lossy().into_owned();
        run_rclone(&app, &["copy", source_text.as_str(), target.as_str()], Duration::from_secs(600))?;
        Ok(format!("{target}/{}", source.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patterns_match_like_the_explorer() {
        assert!(matches_pattern("Relatório.PDF", "*.pdf;*.docx"));
        assert!(matches_pattern("notas.docx", "*.pdf, *.docx"));
        assert!(!matches_pattern("foto.png", "*.pdf;*.docx"));
        assert!(matches_pattern("qualquer.bin", ""));
        assert!(matches_pattern("ata-01.txt", "ata-??.txt"));
    }

    #[test]
    fn office_xml_keeps_paragraphs_and_entities() {
        let xml = r#"<w:body><w:p><w:r><w:t>Olá &amp; bem-vindo</w:t></w:r></w:p><w:p><w:r><w:t>Linha 2</w:t></w:r></w:p></w:body>"#;
        assert_eq!(office_xml_text(xml), "Olá & bem-vindo\nLinha 2");
    }

    #[test]
    fn file_names_are_safe_on_windows() {
        assert_eq!(safe_file_name("Resumo: março/abril?.md"), "Resumo- março-abril-.md");
        assert_eq!(safe_file_name("   "), "arquivo.txt");
    }

    #[test]
    fn paths_expand_user_variables() {
        let home = std::env::var("USERPROFILE").unwrap();
        assert_eq!(expand_path("~/Desktop"), PathBuf::from(format!("{home}\\Desktop")));
        assert_eq!(expand_path("%USERPROFILE%\\x"), PathBuf::from(format!("{home}\\x")));
    }

    #[test]
    fn remote_paths_join_cleanly() {
        assert_eq!(remote_path("gdrive", "/Relatórios/2026/"), "gdrive:Relatórios/2026");
        assert_eq!(remote_path("gdrive:", ""), "gdrive:");
    }

    #[test]
    fn documents_are_read_as_text() {
        let dir = std::env::temp_dir().join(format!("oa-wf-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let txt = dir.join("a.md");
        fs::write(&txt, "# Título\nconteúdo").unwrap();
        assert_eq!(read_document(&txt).unwrap(), "# Título\nconteúdo");
        // docx mínimo
        let docx = dir.join("b.docx");
        {
            let file = fs::File::create(&docx).unwrap();
            let mut writer = zip::ZipWriter::new(file);
            writer.start_file("word/document.xml", zip::write::SimpleFileOptions::default()).unwrap();
            use std::io::Write;
            writer.write_all(br#"<w:document><w:body><w:p><w:r><w:t>Contrato</w:t></w:r></w:p></w:body></w:document>"#).unwrap();
            writer.finish().unwrap();
        }
        assert_eq!(read_document(&docx).unwrap(), "Contrato");
        assert!(read_document(&dir.join("foto.png")).is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
