//! Obscura: browser sem janela (Rust + V8) usado pelo agente para ler páginas que dependem de JavaScript.
//! Instalado pela receita `obscura` (`tools.rs`). Endereços locais ficam bloqueados (padrão do Obscura).

use base64::Engine;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

use super::tools;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// `obscura fetch` em Markdown: o modelo recebe o texto com os links (títulos, listas e `[texto](url)`).
pub fn fetch_args(url: &str, timeout_secs: u32) -> Vec<String> {
    let url = if url.starts_with("http://") || url.starts_with("https://") { url.to_string() } else { format!("https://{url}") };
    vec!["fetch".into(), url, "--dump".into(), "markdown".into(), "--timeout".into(), timeout_secs.to_string(), "--wait-until".into(), "load".into(), "--quiet".into()]
}

/// Tira linhas em branco repetidas e espaços das pontas; corta no tamanho que cabe no contexto do modelo.
pub fn clean_output(raw: &str, max_chars: usize) -> Result<String, String> {
    let mut lines: Vec<&str> = Vec::new();
    for line in raw.lines().map(str::trim) {
        if line.is_empty() && lines.last().map_or(true, |last| last.is_empty()) {
            continue;
        }
        lines.push(line);
    }
    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }
    let text = lines.join("\n");
    if text.is_empty() {
        return Err("O Obscura abriu a página, mas ela veio sem texto.".into());
    }
    if text.chars().count() <= max_chars {
        return Ok(text);
    }
    Ok(text.chars().take(max_chars).collect::<String>() + "…")
}

fn executable(app: &AppHandle) -> Result<PathBuf, String> {
    if !tools::is_installed(app, tools::OBSCURA_TOOL) {
        return Err("Obscura não instalado.".into());
    }
    let dir = tools::tool_dir(app, tools::OBSCURA_TOOL)?;
    tools::find_file(&dir, &|name| name == "obscura.exe").ok_or_else(|| "obscura.exe não encontrado na pasta da ferramenta.".into())
}

/// Lê a página com o Obscura (roda o JavaScript). `Err` = não instalado ou falhou: quem chama usa o plano B.
pub fn read_page(app: &AppHandle, url: &str, max_chars: usize) -> Result<String, String> {
    let exe = executable(app)?;
    let args = fetch_args(url, 15);
    let output = Command::new(&exe)
        .args(&args)
        .current_dir(exe.parent().unwrap_or(std::path::Path::new(".")))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Não foi possível rodar o Obscura: {error}"))?;
    if !output.status.success() {
        return Err(format!("Obscura falhou: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let text = clean_output(&String::from_utf8_lossy(&output.stdout), max_chars.clamp(500, 20_000))?;
    Ok(format!("{}\n\n{text}", args[1]))
}

/// Print da página (PNG) renderizado pelo próprio Obscura, sem Chromium.
pub fn screenshot(app: &AppHandle, url: &str) -> Result<Vec<u8>, String> {
    let exe = executable(app)?;
    let url = fetch_args(url, 15)[1].clone();
    let file = std::env::temp_dir().join(format!("oa-obscura-{}-{}.png", std::process::id(), uuid::Uuid::new_v4()));
    let output = Command::new(&exe)
        .args(["fetch", &url, "--timeout", "15", "--quiet", "-s"])
        .arg(&file)
        .current_dir(exe.parent().unwrap_or(std::path::Path::new(".")))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Não foi possível rodar o Obscura: {error}"))?;
    let bytes = std::fs::read(&file);
    let _ = std::fs::remove_file(&file);
    if !output.status.success() {
        return Err(format!("Obscura falhou: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    bytes.map_err(|error| error.to_string())
}

/// Página para a tela Browser: texto em Markdown (com os links) + print.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPage {
    pub url: String,
    pub text: String,
    /// `data:image/png;base64,…` (a CSP do app permite `data:` em imagens).
    pub screenshot: Option<String>,
    /// Quem abriu: você (barra de endereço) ou o agente (`read_url`).
    pub by_agent: bool,
}

pub const BROWSER_EVENT: &str = "browser-page";

fn page(app: &AppHandle, url: &str, by_agent: bool) -> Result<BrowserPage, String> {
    let shot_app = app.clone();
    let shot_url = url.to_string();
    let shot = std::thread::spawn(move || screenshot(&shot_app, &shot_url).ok());
    let text = read_page(app, url, 20_000)?;
    let screenshot = shot.join().ok().flatten().map(|bytes| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)));
    Ok(BrowserPage { url: fetch_args(url, 15)[1].clone(), text, screenshot, by_agent })
}

/// Barra de endereço da tela Browser.
#[tauri::command]
pub async fn browser_open(app: AppHandle, url: String) -> Result<BrowserPage, String> {
    tauri::async_runtime::spawn_blocking(move || page(&app, &url, false)).await.map_err(|error| error.to_string())?
}

/// O agente leu uma página: a tela Browser mostra o print dela (em segundo plano, não atrasa o agente).
pub fn show_agent_page(app: &AppHandle, url: &str, text: &str) {
    let app = app.clone();
    let url = fetch_args(url, 15)[1].clone();
    let text = text.to_string();
    std::thread::spawn(move || {
        let screenshot = screenshot(&app, &url).ok().map(|bytes| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)));
        let _ = app.emit(BROWSER_EVENT, BrowserPage { url, text, screenshot, by_agent: true });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_fetch_arguments_and_adds_https() {
        assert_eq!(
            fetch_args("g1.globo.com", 15),
            vec!["fetch", "https://g1.globo.com", "--dump", "markdown", "--timeout", "15", "--wait-until", "load", "--quiet"]
        );
        assert_eq!(fetch_args("http://example.com", 5)[1], "http://example.com");
    }

    #[test]
    fn cleans_blank_lines_and_limits_size() {
        let raw = "Título\n\n\n\n  linha 1  \n\nlinha 2\n";
        assert_eq!(clean_output(raw, 10_000).unwrap(), "Título\n\nlinha 1\n\nlinha 2");
        assert_eq!(clean_output(&"a".repeat(900), 500).unwrap().chars().count(), 501);
    }

    #[test]
    fn empty_page_is_an_error() {
        assert!(clean_output("  \n\n ", 1000).is_err());
    }
}
