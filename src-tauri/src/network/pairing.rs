//! Pareamento tipo AnyDesk: código de 6 dígitos (5 min, uso único, 5 tentativas) conferido dentro do
//! túnel criptografado; quem pareia vira "confiável" com permissões (`rede\confiaveis.json`).

use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::identity::DeviceInfo;

const CODE_TTL: Duration = Duration::from_secs(300);
const MAX_ATTEMPTS: u8 = 5;

pub struct PairCode {
    code: String,
    expires_at: Instant,
    attempts_left: u8,
}

#[derive(Debug, PartialEq)]
pub enum PairCheck {
    Ok,
    Wrong,
    Expired,
    Locked,
}

impl PairCheck {
    pub fn reason(&self) -> &'static str {
        match self {
            PairCheck::Ok => "",
            PairCheck::Wrong => "Código errado.",
            PairCheck::Expired => "Código expirado: gere outro no computador de destino.",
            PairCheck::Locked => "Código bloqueado: gere outro no computador de destino.",
        }
    }
}

impl PairCode {
    pub fn new(now: Instant) -> PairCode {
        let code = format!("{:06}", rand::rng().random_range(0..1_000_000u32));
        PairCode { code, expires_at: now + CODE_TTL, attempts_left: MAX_ATTEMPTS }
    }

    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn expires_in(&self, now: Instant) -> Duration {
        self.expires_at.saturating_duration_since(now)
    }

    /// Ainda aceita tentativas (não expirou, não foi usado, não travou): a tela Remoto mostra este mesmo código.
    pub fn usable(&self, now: Instant) -> bool {
        self.attempts_left > 0 && now <= self.expires_at
    }

    pub fn check(&mut self, input: &str, now: Instant) -> PairCheck {
        if self.attempts_left == 0 {
            return PairCheck::Locked;
        }
        if now > self.expires_at {
            self.attempts_left = 0;
            return PairCheck::Expired;
        }
        // Comparação em tempo constante (não vaza quantos dígitos acertou).
        let same = input.len() == self.code.len() && input.bytes().zip(self.code.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0;
        if same {
            self.attempts_left = 0;
            return PairCheck::Ok;
        }
        self.attempts_left -= 1;
        PairCheck::Wrong
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    #[serde(rename = "usarIA")]
    pub usar_ia: bool,
    pub controlar: bool,
    pub atualizar: bool,
}

impl Default for Permissions {
    fn default() -> Self {
        // Tela Remoto: quem você pareou pode tudo (a instalação de atualizações ainda pede confirmação aqui).
        Permissions { usar_ia: true, controlar: true, atualizar: true }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDevice {
    pub info: DeviceInfo,
    pub permissions: Permissions,
    pub paired_at: u64,
    /// Histórico: últimos endereços por onde conectou (rede local e servidor de retransmissão), para reconectar
    /// só clicando no computador, mesmo sem a descoberta da rede local.
    #[serde(default)]
    pub addrs: Vec<iroh::TransportAddr>,
    /// Última vez que respondeu (segundos desde 1970); 0 = nunca depois do pareamento.
    #[serde(default)]
    pub last_seen: u64,
}

pub struct TrustStore {
    path: PathBuf,
    pub devices: Vec<TrustedDevice>,
}

impl TrustStore {
    pub fn load(path: &Path) -> TrustStore {
        let mut devices: Vec<TrustedDevice> = fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        // A tela Remoto não tem mais as caixas de permissão: todo computador pareado fica com tudo ligado.
        for device in &mut devices {
            device.permissions = Permissions::default();
        }
        TrustStore { path: path.to_path_buf(), devices }
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|error| error.to_string())?;
        }
        let text = serde_json::to_string_pretty(&self.devices).map_err(|error| error.to_string())?;
        fs::write(&self.path, text).map_err(|error| error.to_string())
    }

    pub fn upsert(&mut self, device: TrustedDevice) {
        self.devices.retain(|item| item.info.id != device.info.id);
        self.devices.push(device);
    }

    pub fn remove(&mut self, id: &str) {
        self.devices.retain(|item| item.info.id != id);
    }

    pub fn get(&self, id: &str) -> Option<&TrustedDevice> {
        self.devices.iter().find(|item| item.info.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::identity::DeviceKind;

    #[test]
    fn code_has_six_digits_and_works_once() {
        let now = Instant::now();
        let mut code = PairCode::new(now);
        assert_eq!(code.code().len(), 6);
        assert!(code.code().chars().all(|c| c.is_ascii_digit()));
        let right = code.code().to_string();
        assert_eq!(code.check(&right, now), PairCheck::Ok);
        assert_eq!(code.check(&right, now), PairCheck::Locked);
    }

    #[test]
    fn five_wrong_attempts_lock_the_code() {
        let now = Instant::now();
        let mut code = PairCode::new(now);
        let wrong = if code.code() == "000000" { "111111" } else { "000000" };
        for _ in 0..5 {
            assert_eq!(code.check(wrong, now), PairCheck::Wrong);
        }
        let right = code.code().to_string();
        assert_eq!(code.check(&right, now), PairCheck::Locked);
    }

    #[test]
    fn code_expires_after_five_minutes() {
        let now = Instant::now();
        let mut code = PairCode::new(now);
        assert!(code.usable(now));
        assert!(!code.usable(now + Duration::from_secs(301)));
        let right = code.code().to_string();
        assert_eq!(code.check(&right, now + Duration::from_secs(301)), PairCheck::Expired);
    }

    #[test]
    fn trust_store_round_trip_with_default_permissions() {
        let path = std::env::temp_dir().join(format!("oa-confiaveis-{}.json", std::process::id()));
        let mut store = TrustStore::load(&path);
        let info = DeviceInfo { id: "abc".into(), name: "PC-Sala".into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: Some("RTX 5070".into()), models: vec![] };
        let addr = iroh::TransportAddr::Ip("192.168.0.20:50698".parse().unwrap());
        store.upsert(TrustedDevice { info, permissions: Permissions { usar_ia: false, controlar: false, atualizar: false }, paired_at: 1, addrs: vec![addr.clone()], last_seen: 42 });
        store.save().unwrap();
        let loaded = TrustStore::load(&path);
        let device = loaded.get("abc").unwrap();
        // Tudo ligado ao carregar; o histórico de endereços volta igual.
        assert_eq!(device.permissions, Permissions { usar_ia: true, controlar: true, atualizar: true });
        assert_eq!(device.addrs, vec![addr]);
        assert_eq!(device.last_seen, 42);
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"usarIA\": false"));
        // Arquivo antigo (sem histórico) continua abrindo.
        fs::write(&path, r#"[{"info":{"id":"x","name":"Mac","kind":"macbook","os":"macOS","mac":null,"gpu":null,"models":[]},"permissions":{"usarIA":true,"controlar":false,"atualizar":false},"pairedAt":5}]"#).unwrap();
        let old = TrustStore::load(&path);
        assert_eq!(old.get("x").unwrap().addrs, vec![]);
        assert_eq!(old.get("x").unwrap().last_seen, 0);
        let _ = fs::remove_file(&path);
    }
}
