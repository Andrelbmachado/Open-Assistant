//! Chat com modelos em nuvem (OpenAI e compatíveis, Anthropic) usando a chave salva no
//! Gerenciador de Credenciais do Windows. A chave nunca sai do Rust.
//!
//! Streaming igual ao do Ollama: cada lote vira `ollama-chat-delta` com o `requestId`,
//! e o cancelamento reaproveita `ollama_cancel_chat`.

use super::{ChatMessageInput, OllamaChatDelta, OllamaChatResult, CHAT_DELTA_EVENT, CREDENTIAL_SERVICE};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

/// URL base dos provedores compatíveis com a API da OpenAI (ids = `createProviderId` do front).
fn openai_compatible_base(provider_id: &str) -> Option<&'static str> {
    Some(match provider_id {
        "openai" => "https://api.openai.com/v1",
        "deepseek" => "https://api.deepseek.com/v1",
        "perplexity" => "https://api.perplexity.ai",
        "together-ai" => "https://api.together.xyz/v1",
        "fireworks" => "https://api.fireworks.ai/inference/v1",
        _ => return None,
    })
}

fn api_key(provider_id: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, provider_id).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(key) if !key.trim().is_empty() => Ok(key),
        Ok(_) | Err(keyring::Error::NoEntry) => Err("Adicione uma chave de API em Configurações › Provedores para usar este modelo.".into()),
        Err(error) => Err(format!("Não foi possível ler a chave de API: {error}")),
    }
}

/// Tipo MIME pela assinatura do base64 (PNG `iVBOR`, JPEG `/9j/`, WebP `UklGR`, GIF `R0lG`).
fn image_mime(base64: &str) -> &'static str {
    if base64.starts_with("iVBOR") {
        "image/png"
    } else if base64.starts_with("UklGR") {
        "image/webp"
    } else if base64.starts_with("R0lG") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}

fn openai_messages(messages: &[ChatMessageInput]) -> Vec<Value> {
    messages
        .iter()
        .filter(|message| matches!(message.role.as_str(), "system" | "user" | "assistant"))
        .map(|message| match message.images.as_ref().filter(|images| !images.is_empty()) {
            Some(images) => {
                let mut parts = vec![json!({ "type": "text", "text": message.content })];
                parts.extend(images.iter().map(|image| json!({ "type": "image_url", "image_url": { "url": format!("data:{};base64,{image}", image_mime(image)) } })));
                json!({ "role": message.role, "content": parts })
            }
            None => json!({ "role": message.role, "content": message.content }),
        })
        .collect()
}

fn anthropic_body(model: &str, messages: &[ChatMessageInput]) -> Value {
    let system: Vec<&str> = messages.iter().filter(|message| message.role == "system").map(|message| message.content.as_str()).collect();
    let turns: Vec<Value> = messages
        .iter()
        .filter(|message| message.role == "user" || message.role == "assistant")
        .map(|message| {
            let mut parts: Vec<Value> = message
                .images
                .iter()
                .flatten()
                .map(|image| json!({ "type": "image", "source": { "type": "base64", "media_type": image_mime(image), "data": image } }))
                .collect();
            parts.push(json!({ "type": "text", "text": message.content }));
            json!({ "role": message.role, "content": parts })
        })
        .collect();
    json!({ "model": model, "max_tokens": 4096, "system": system.join("\n\n"), "messages": turns, "stream": true })
}

fn http_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(code, response) => {
            let body = response.into_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|value| value["error"]["message"].as_str().or(value["message"].as_str()).map(str::to_string))
                .unwrap_or(body);
            match code {
                401 | 403 => format!("A chave de API foi recusada ({code}). Confira em Configurações › Provedores. {detail}"),
                404 => format!("Modelo não encontrado ({code}): {detail}"),
                429 => format!("Limite ou saldo do provedor atingido (429): {detail}"),
                _ => format!("O provedor respondeu {code}: {detail}"),
            }
        }
        other => format!("Sem conexão com o provedor: {other}"),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn run_chat(
    app: &AppHandle,
    request_id: &str,
    provider_id: &str,
    model: &str,
    base_url: Option<&str>,
    messages: &[ChatMessageInput],
    cancel: &AtomicBool,
) -> Result<OllamaChatResult, String> {
    let key = api_key(provider_id)?;
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(15)).timeout_read(Duration::from_secs(180)).build();
    let anthropic = provider_id == "anthropic";
    let response = if anthropic {
        agent
            .post("https://api.anthropic.com/v1/messages")
            .set("x-api-key", &key)
            .set("anthropic-version", "2023-06-01")
            .send_json(anthropic_body(model, messages))
    } else {
        let base = match (openai_compatible_base(provider_id), base_url) {
            (Some(base), _) => base.to_string(),
            (None, Some(custom)) if custom.starts_with("https://") || custom.starts_with("http://127.0.0.1") || custom.starts_with("http://localhost") => {
                custom.trim_end_matches('/').to_string()
            }
            _ => return Err("Provedor sem URL válida (use https://).".into()),
        };
        agent
            .post(&format!("{base}/chat/completions"))
            .set("Authorization", &format!("Bearer {key}"))
            .send_json(json!({ "model": model, "messages": openai_messages(messages), "stream": true, "stream_options": { "include_usage": true } }))
    }
    .map_err(http_error)?;

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
    let mut pending = String::new();
    let mut last_emit = Instant::now();
    let mut first_token: Option<Instant> = None;
    let flush = |pending: &mut String| {
        if !pending.is_empty() {
            let _ = app.emit(CHAT_DELTA_EVENT, OllamaChatDelta { request_id: request_id.to_string(), content: std::mem::take(pending), thinking: String::new(), thinking_tokens: 0 });
        }
    };
    for line in BufReader::new(response.into_reader()).lines() {
        if cancel.load(Ordering::SeqCst) {
            flush(&mut pending);
            result.cancelled = true;
            return Ok(result);
        }
        let line = line.map_err(|error| format!("Conexão com o provedor interrompida: {error}"))?;
        let Some(data) = line.strip_prefix("data:").map(str::trim) else { continue };
        if data == "[DONE]" {
            break;
        }
        let Ok(chunk) = serde_json::from_str::<Value>(data) else { continue };
        let text = if anthropic {
            if let Some(tokens) = chunk["usage"]["output_tokens"].as_u64() {
                result.eval_count = Some(tokens);
            }
            if chunk["type"] == "error" {
                return Err(chunk["error"]["message"].as_str().unwrap_or("erro do provedor").to_string());
            }
            chunk["delta"]["text"].as_str().unwrap_or_default().to_string()
        } else {
            if let Some(tokens) = chunk["usage"]["completion_tokens"].as_u64() {
                result.eval_count = Some(tokens);
            }
            chunk["choices"][0]["delta"]["content"].as_str().unwrap_or_default().to_string()
        };
        if !text.is_empty() {
            first_token.get_or_insert_with(Instant::now);
            result.content.push_str(&text);
            pending.push_str(&text);
        }
        if last_emit.elapsed() >= Duration::from_millis(50) {
            flush(&mut pending);
            last_emit = Instant::now();
        }
    }
    flush(&mut pending);
    if let (Some(start), Some(tokens)) = (first_token, result.eval_count) {
        let seconds = start.elapsed().as_secs_f64();
        if seconds > 0.05 {
            result.tokens_per_second = Some(tokens as f64 / seconds);
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str, images: Option<Vec<String>>) -> ChatMessageInput {
        ChatMessageInput { role: role.into(), content: content.into(), images, tool_calls: None, tool_name: None }
    }

    #[test]
    fn known_providers_have_https_endpoints() {
        for id in ["openai", "deepseek", "perplexity", "together-ai", "fireworks"] {
            assert!(openai_compatible_base(id).unwrap().starts_with("https://"));
        }
        assert!(openai_compatible_base("anthropic").is_none());
    }

    #[test]
    fn images_become_provider_specific_parts() {
        let messages = vec![message("system", "Seja breve.", None), message("user", "O que é?", Some(vec!["iVBORw0KGgo".into()]))];
        let openai = openai_messages(&messages);
        assert_eq!(openai[1]["content"][1]["image_url"]["url"], "data:image/png;base64,iVBORw0KGgo");
        let anthropic = anthropic_body("claude-sonnet-5", &messages);
        assert_eq!(anthropic["system"], "Seja breve.");
        assert_eq!(anthropic["messages"][0]["content"][0]["source"]["media_type"], "image/png");
        assert_eq!(anthropic["messages"][0]["content"][1]["text"], "O que é?");
    }
}
