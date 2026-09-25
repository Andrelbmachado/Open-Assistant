//! Microsoft BitNet b1.58 2B4T (pesos ternários) rodando no bitnet.cpp.
//!
//! O servidor do bitnet.cpp sobe sob demanda em 127.0.0.1:18090 e fica aberto entre as
//! mensagens. O chat usa o formato nativo do modelo
//! (`User: …<|eot_id|>Assistant: `) porque o template embutido no GGUF gera lixo.

use super::{tools, ChatMessageInput, OllamaChatDelta, OllamaChatResult};
use std::os::windows::process::CommandExt;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

pub const TOOL_ID: &str = "bitnet-2b4t";
pub const MODEL_ID: &str = "bitnet-b1.58-2b-4t";
const PORT: u16 = 18090;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Default)]
pub struct BitnetState {
    server: Mutex<Option<Child>>,
}

fn base_url() -> String {
    format!("http://127.0.0.1:{PORT}")
}

fn server_ready() -> bool {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(800))
        .build()
        .get(&format!("{}/health", base_url()))
        .call()
        .ok()
        .and_then(|response| response.into_json::<serde_json::Value>().ok())
        .is_some_and(|body| body["status"] == "ok")
}

fn ensure_server(app: &AppHandle, cancel: &AtomicBool) -> Result<(), String> {
    if server_ready() {
        return Ok(());
    }
    if !tools::is_installed(app, TOOL_ID) {
        return Err("O BitNet não está instalado. Baixe em Configurações › Ferramentas de IA › Microsoft.".into());
    }
    let dir = tools::tool_dir(app, TOOL_ID)?;
    {
        let state = app.state::<BitnetState>();
        let mut server = state.server.lock().map_err(|_| "estado do BitNet indisponível")?;
        let alive = server.as_mut().is_some_and(|child| matches!(child.try_wait(), Ok(None)));
        if !alive {
            // Quatro threads: acima disso o pool sem OpenMP disputa núcleos e fica mais lento.
            let child = Command::new(dir.join("bin").join("llama-server.exe"))
                .arg("-m")
                .arg(dir.join("ggml-model-i2_s.gguf"))
                .args(["-t", "4", "-c", "4096", "-np", "1", "--host", "127.0.0.1", "--port", &PORT.to_string()])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|error| format!("Não foi possível iniciar o bitnet.cpp: {error}"))?;
            *server = Some(child);
        }
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(180) {
        if cancel.load(Ordering::SeqCst) {
            return Err("Cancelado enquanto o BitNet carregava.".into());
        }
        if server_ready() {
            return Ok(());
        }
        let exited = app
            .state::<BitnetState>()
            .server
            .lock()
            .ok()
            .and_then(|mut server| server.as_mut().map(|child| matches!(child.try_wait(), Ok(Some(_)))))
            .unwrap_or(false);
        if exited {
            return Err("O servidor do bitnet.cpp fechou ao carregar o modelo. Remova e instale o BitNet de novo.".into());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("O BitNet demorou demais para carregar.".into())
}

pub fn stop_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<BitnetState>() {
        if let Ok(mut server) = state.server.lock() {
            if let Some(mut child) = server.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Formato de conversa do BitNet b1.58 2B4T (card do modelo no Hugging Face).
pub fn build_prompt(messages: &[ChatMessageInput]) -> String {
    let mut prompt = String::new();
    for message in messages {
        let role = match message.role.as_str() {
            "system" => "System",
            "assistant" => "Assistant",
            _ => "User",
        };
        prompt.push_str(&format!("{role}: {}<|eot_id|>", message.content.trim()));
    }
    prompt.push_str("Assistant: ");
    prompt
}

pub fn run_chat(
    app: &AppHandle,
    request_id: &str,
    messages: &[ChatMessageInput],
    cancel: &AtomicBool,
) -> Result<OllamaChatResult, String> {
    if super::last_message_has_images(messages) {
        return Err("O BitNet só lê texto. Para imagens, escolha um modelo com visão (Qwen3.5, Gemma 3 ou Llama 3.2 Vision).".into());
    }
    ensure_server(app, cancel)?;
    let body = serde_json::json!({
        "prompt": build_prompt(messages),
        "n_predict": 1024,
        "stream": true,
        "cache_prompt": true,
        "temperature": 0.6,
        "stop": ["<|eot_id|>", "\nUser:", "\nSystem:"],
    });
    let response = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(Duration::from_secs(300))
        .build()
        .post(&format!("{}/completion", base_url()))
        .send_json(body)
        .map_err(|error| format!("O bitnet.cpp não respondeu: {error}"))?;

    let mut result = OllamaChatResult {
        model: MODEL_ID.to_string(),
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
    let mut pending = String::new();
    let mut last_emit = Instant::now();
    let flush = |pending: &mut String| {
        if !pending.is_empty() {
            let _ = app.emit(
                super::CHAT_DELTA_EVENT,
                OllamaChatDelta {
                    request_id: request_id.to_string(),
                    content: std::mem::take(pending),
                    thinking: String::new(),
                    thinking_tokens: 0,
                },
            );
        }
    };
    for line in BufReader::new(response.into_reader()).lines() {
        if cancel.load(Ordering::SeqCst) {
            flush(&mut pending);
            result.cancelled = true;
            return Ok(result);
        }
        let line = line.map_err(|error| format!("Conexão com o bitnet.cpp interrompida: {error}"))?;
        let Some(data) = line.strip_prefix("data: ") else { continue };
        let chunk: serde_json::Value =
            serde_json::from_str(data).map_err(|error| format!("Resposta inválida do bitnet.cpp: {error}"))?;
        let content = chunk["content"].as_str().unwrap_or_default();
        result.content.push_str(content);
        pending.push_str(content);
        if chunk["stop"].as_bool() == Some(true) {
            flush(&mut pending);
            result.eval_count = chunk["timings"]["predicted_n"].as_u64();
            result.tokens_per_second = chunk["timings"]["predicted_per_second"].as_f64();
            return Ok(result);
        }
        if last_emit.elapsed() >= Duration::from_millis(50) {
            flush(&mut pending);
            last_emit = Instant::now();
        }
    }
    flush(&mut pending);
    if cancel.load(Ordering::SeqCst) {
        result.cancelled = true;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str) -> ChatMessageInput {
        ChatMessageInput { role: role.into(), content: content.into(), images: None, tool_calls: None, tool_name: None }
    }

    #[test]
    fn prompt_uses_the_native_bitnet_chat_format() {
        let prompt = build_prompt(&[
            message("system", "Seja breve."),
            message("user", " Oi "),
            message("assistant", "Olá!"),
            message("user", "Tudo bem?"),
        ]);
        assert_eq!(
            prompt,
            "System: Seja breve.<|eot_id|>User: Oi<|eot_id|>Assistant: Olá!<|eot_id|>User: Tudo bem?<|eot_id|>Assistant: "
        );
    }
}
