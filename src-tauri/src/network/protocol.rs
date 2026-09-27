//! Protocolo `open-assistant/1`: uma mensagem JSON por linha num stream bidirecional do iroh.
//! O JSON nunca tem `\n` cru (o serde escapa os das strings), então uma linha é sempre uma mensagem.

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::identity::DeviceInfo;

pub const ALPN: &[u8] = b"open-assistant/1";
/// Limite por mensagem (imagens do chat vão em base64: 32 MB cobre várias).
pub const MAX_LINE: usize = 32 * 1024 * 1024;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Message {
    Hello { info: DeviceInfo },
    PairRequest { code: String, info: DeviceInfo },
    PairResult { ok: bool, reason: Option<String> },
    #[serde(rename_all = "camelCase")]
    ChatRequest {
        request_id: String,
        model: String,
        messages: serde_json::Value,
        think: Option<bool>,
        think_level: Option<String>,
        options: Option<serde_json::Value>,
    },
    ChatDelta { delta: serde_json::Value },
    ChatDone { result: serde_json::Value },
    /// Tarefa para o agente do outro computador (fase 2): ele age lá, com a política de segurança de lá.
    #[serde(rename_all = "camelCase")]
    AgentTask { request_id: String, task: String },
    AgentResult { ok: bool, text: String },
    /// Fase 3: "posso instalar esta versão aí?" (assinatura Ed25519 da chave de quem envia sobre versão+tamanho+SHA-256).
    #[serde(rename_all = "camelCase")]
    UpdateOffer { version: String, file_name: String, size: u64, sha256: String, signature: String },
    UpdateReply { accept: bool, reason: Option<String> },
    /// Um pedaço do instalador em base64 (depois do `UpdateReply { accept: true }`).
    UpdateChunk { data: String },
    UpdateResult { ok: bool, text: String },
    Error { message: String },
}

pub async fn write_message<W: AsyncWrite + Unpin>(writer: &mut W, message: &Message) -> Result<(), String> {
    let mut line = serde_json::to_vec(message).map_err(|error| error.to_string())?;
    line.push(b'\n');
    writer.write_all(&line).await.map_err(|error| error.to_string())?;
    writer.flush().await.map_err(|error| error.to_string())
}

/// Lê a próxima mensagem; `None` = o outro lado fechou o stream.
pub async fn read_message<R: AsyncBufRead + Unpin>(reader: &mut R) -> Result<Option<Message>, String> {
    let mut line = Vec::new();
    let read = (&mut *reader).take(MAX_LINE as u64 + 1).read_until(b'\n', &mut line).await.map_err(|error| error.to_string())?;
    if read == 0 {
        return Ok(None);
    }
    if line.len() > MAX_LINE {
        return Err("Mensagem grande demais.".into());
    }
    serde_json::from_slice(&line).map(Some).map_err(|error| format!("Mensagem inválida: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::identity::DeviceKind;
    use tokio::io::BufReader;

    fn info() -> DeviceInfo {
        DeviceInfo { id: "abc".into(), name: "PC".into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: None, models: vec!["qwen3.5:9b".into()] }
    }

    #[tokio::test]
    async fn messages_round_trip_one_per_line() {
        let mut buffer = Vec::new();
        let sent = vec![
            Message::Hello { info: info() },
            Message::PairRequest { code: "482913".into(), info: info() },
            Message::ChatDelta { delta: serde_json::json!({ "requestId": "r1", "content": "Olá\nmundo", "thinking": "", "thinkingTokens": 0 }) },
        ];
        for message in &sent {
            write_message(&mut buffer, message).await.unwrap();
        }
        assert_eq!(buffer.iter().filter(|b| **b == b'\n').count(), 3);
        let mut reader = BufReader::new(buffer.as_slice());
        for message in &sent {
            assert_eq!(read_message(&mut reader).await.unwrap().as_ref(), Some(message));
        }
        assert_eq!(read_message(&mut reader).await.unwrap(), None);
    }

    #[tokio::test]
    async fn rejects_huge_lines() {
        let line = format!("{}\n", "x".repeat(MAX_LINE + 1));
        let mut reader = BufReader::new(line.as_bytes());
        assert!(read_message(&mut reader).await.is_err());
    }
}
