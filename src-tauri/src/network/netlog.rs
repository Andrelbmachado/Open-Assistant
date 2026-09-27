//! Log da rede legível por IA (mesmo esquema do app do Mac): `rede\log.jsonl`, uma linha JSON por evento
//! `{"ts": <ms>, "level": "info"|"warn"|"error", "event": "<nome>", ...campos}`. Gira em 2 MB para `log.1.jsonl`.
//! Nunca recebe conteúdo de chat, chaves, senhas ou tokens: só nomes, ids, estados e erros.

use serde_json::{Map, Value};
use std::collections::VecDeque;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const LOG_FILE: &str = "log.jsonl";
pub const OLD_LOG_FILE: &str = "log.1.jsonl";
const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Problemas recentes guardados na memória para o `estado.json`.
const RECENT_PROBLEMS: usize = 15;

pub struct NetLog {
    dir: PathBuf,
    problems: Mutex<VecDeque<Value>>,
    write_lock: Mutex<()>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl NetLog {
    pub fn new(dir: &Path) -> NetLog {
        NetLog { dir: dir.to_path_buf(), problems: Mutex::new(VecDeque::new()), write_lock: Mutex::new(()) }
    }

    pub fn path(&self) -> PathBuf {
        self.dir.join(LOG_FILE)
    }

    pub fn info(&self, event: &str, fields: Value) {
        self.write("info", event, fields);
    }

    pub fn warn(&self, event: &str, fields: Value) {
        self.write("warn", event, fields);
    }

    pub fn write(&self, level: &str, event: &str, fields: Value) {
        let mut line = Map::new();
        line.insert("ts".into(), Value::from(now_ms()));
        line.insert("level".into(), Value::from(level));
        line.insert("event".into(), Value::from(event));
        if let Value::Object(extra) = fields {
            for (key, value) in extra {
                line.insert(key, value);
            }
        }
        let line = Value::Object(line);
        if level != "info" {
            if let Ok(mut problems) = self.problems.lock() {
                problems.push_back(line.clone());
                while problems.len() > RECENT_PROBLEMS {
                    problems.pop_front();
                }
            }
            // Também no log geral do app (Configurações › Logs).
            let text = format!("{event}: {}", line.get("erro").and_then(Value::as_str).unwrap_or_default());
            if level == "error" {
                crate::logs::error("rede", &text);
            } else {
                crate::logs::warn("rede", &text);
            }
        }
        let _guard = self.write_lock.lock();
        let _ = std::fs::create_dir_all(&self.dir);
        let path = self.path();
        if std::fs::metadata(&path).map(|meta| meta.len() >= MAX_BYTES).unwrap_or(false) {
            let _ = std::fs::rename(&path, self.dir.join(OLD_LOG_FILE));
        }
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{line}");
        }
    }

    pub fn recent_problems(&self) -> Vec<Value> {
        self.problems.lock().map(|problems| problems.iter().cloned().collect()).unwrap_or_default()
    }
}

/// Últimas `limit` linhas do log (do arquivo girado também, se precisar); `problems_only` = só warn/error.
pub fn read_tail(dir: &Path, limit: usize, problems_only: bool) -> Vec<Value> {
    let mut lines: Vec<Value> = Vec::new();
    for name in [OLD_LOG_FILE, LOG_FILE] {
        if let Ok(text) = std::fs::read_to_string(dir.join(name)) {
            lines.extend(text.lines().filter_map(|line| serde_json::from_str::<Value>(line).ok()));
        }
    }
    if problems_only {
        lines.retain(|line| line.get("level").and_then(Value::as_str).is_some_and(|level| level != "info"));
    }
    let skip = lines.len().saturating_sub(limit);
    lines.split_off(skip)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn writes_one_json_line_per_event_and_keeps_recent_problems() {
        let dir = std::env::temp_dir().join(format!("oa-netlog-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let log = NetLog::new(&dir);
        log.info("rede_iniciada", json!({ "porta": 57405 }));
        log.warn("pareado_sem_resposta", json!({ "id": "x", "erro": "sem endereço" }));
        let lines = read_tail(&dir, 10, false);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["event"], "rede_iniciada");
        assert_eq!(lines[0]["porta"], 57405);
        assert!(lines[0]["ts"].as_u64().unwrap() > 0);
        assert_eq!(read_tail(&dir, 10, true).len(), 1);
        assert_eq!(read_tail(&dir, 1, false)[0]["event"], "pareado_sem_resposta");
        assert_eq!(log.recent_problems().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
