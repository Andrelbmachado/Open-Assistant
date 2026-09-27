//! Rede fase 3 (ROADMAP §17): mandar o instalador do Open Assistant para outro computador pareado e instalar lá.
//! Quem envia assina "versão + SHA-256" com a chave dele (a mesma que identifica o computador na rede); quem recebe
//! só aceita de computador pareado com "Instalar atualizações aqui" ligado, confere a assinatura, o tamanho, o
//! SHA-256 e o cabeçalho de programa do Windows, e sempre pergunta na tela antes de instalar.

use base64::Engine;
use iroh::{PublicKey, SecretKey, Signature};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Pedaço do arquivo por mensagem (1 MB vira ~1,4 MB em base64, bem abaixo do limite de 32 MB por linha).
pub const CHUNK: usize = 1024 * 1024;
/// O instalador NSIS tem ~10 MB; qualquer coisa muito maior não é o nosso instalador.
pub const MAX_SIZE: u64 = 400 * 1024 * 1024;

/// Instalador escolhido para enviar.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstallerFile {
    pub path: PathBuf,
    pub file_name: String,
    pub version: String,
    pub size: u64,
    /// Quando o arquivo foi gerado (segundos desde 1970), para diferenciar builds da mesma versão.
    pub built_at: u64,
}

/// `Open Assistant_0.1.0_x64-setup.exe` → `0.1.0`.
pub fn version_from_name(name: &str) -> Option<String> {
    let rest = name.strip_prefix("Open Assistant_")?;
    let version = rest.split('_').next()?;
    (!version.is_empty() && version.chars().all(|c| c.is_ascii_digit() || c == '.')).then(|| version.to_string())
}

/// O instalador mais novo (`Open Assistant_*-setup.exe`) nas pastas dadas, na ordem de preferência.
pub fn find_installer(dirs: &[PathBuf]) -> Option<InstallerFile> {
    let mut best: Option<InstallerFile> = None;
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with("-setup.exe") {
                continue;
            }
            let Some(version) = version_from_name(&name) else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            let built_at = meta.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            let file = InstallerFile { path: entry.path(), file_name: name, version, size: meta.len(), built_at };
            if best.as_ref().map_or(true, |current| file.built_at > current.built_at) {
                best = Some(file);
            }
        }
    }
    best
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// O que é assinado: versão, tamanho e SHA-256 do instalador.
fn signed_bytes(version: &str, size: u64, sha256: &str) -> Vec<u8> {
    format!("open-assistant-update\n{version}\n{size}\n{sha256}").into_bytes()
}

pub fn sign(key: &SecretKey, version: &str, size: u64, sha256: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(key.sign(&signed_bytes(version, size, sha256)).to_bytes())
}

pub fn verify(key: &PublicKey, version: &str, size: u64, sha256: &str, signature: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(signature).map_err(|_| "Assinatura inválida.".to_string())?;
    let bytes: [u8; 64] = bytes.try_into().map_err(|_| "Assinatura inválida.".to_string())?;
    key.verify(&signed_bytes(version, size, sha256), &Signature::from_bytes(&bytes)).map_err(|_| "A assinatura do instalador não confere.".to_string())
}

/// Confere a oferta antes de aceitar receber qualquer byte.
pub fn check_offer(file_name: &str, size: u64, sha256: &str) -> Result<(), String> {
    if size == 0 || size > MAX_SIZE {
        return Err("Tamanho de instalador inválido.".into());
    }
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("SHA-256 inválido.".into());
    }
    if !file_name.ends_with("-setup.exe") || version_from_name(file_name).is_none() || file_name.contains(['/', '\\', ':']) {
        return Err("Isto não é um instalador do Open Assistant.".into());
    }
    Ok(())
}

/// Confere o arquivo recebido: tamanho, SHA-256 e cabeçalho `MZ` de programa do Windows.
pub fn check_received(path: &Path, size: u64, sha256: &str) -> Result<(), String> {
    let meta = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if meta.len() != size {
        return Err("O instalador chegou incompleto.".into());
    }
    let mut head = [0u8; 2];
    std::fs::File::open(path).and_then(|mut file| file.read_exact(&mut head)).map_err(|error| error.to_string())?;
    if &head != b"MZ" {
        return Err("O arquivo recebido não é um programa do Windows.".into());
    }
    if !sha256_file(path)?.eq_ignore_ascii_case(sha256) {
        return Err("O SHA-256 do instalador recebido não confere.".into());
    }
    Ok(())
}

/// Resposta da tela de quem recebe.
#[derive(serde::Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateDecision {
    /// Instalar agora.
    Now,
    /// Deixar para depois (recusa esta oferta).
    Later,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_version_from_the_installer_name() {
        assert_eq!(version_from_name("Open Assistant_0.1.0_x64-setup.exe").as_deref(), Some("0.1.0"));
        assert_eq!(version_from_name("Outro_0.1.0_x64-setup.exe"), None);
        assert_eq!(version_from_name("Open Assistant_abc_x64-setup.exe"), None);
    }

    #[test]
    fn signature_binds_version_size_and_hash() {
        let key = SecretKey::generate();
        let sha = sha256_hex(b"instalador");
        let signature = sign(&key, "0.1.0", 10, &sha);
        assert!(verify(&key.public(), "0.1.0", 10, &sha, &signature).is_ok());
        assert!(verify(&key.public(), "0.2.0", 10, &sha, &signature).is_err());
        assert!(verify(&key.public(), "0.1.0", 11, &sha, &signature).is_err());
        assert!(verify(&key.public(), "0.1.0", 10, &sha256_hex(b"outro"), &signature).is_err());
        assert!(verify(&SecretKey::generate().public(), "0.1.0", 10, &sha, &signature).is_err());
        assert!(verify(&key.public(), "0.1.0", 10, &sha, "lixo").is_err());
    }

    #[test]
    fn offer_rules() {
        let sha = sha256_hex(b"x");
        assert!(check_offer("Open Assistant_0.1.0_x64-setup.exe", 10, &sha).is_ok());
        assert!(check_offer("Open Assistant_0.1.0_x64-setup.exe", 0, &sha).is_err());
        assert!(check_offer("Open Assistant_0.1.0_x64-setup.exe", MAX_SIZE + 1, &sha).is_err());
        assert!(check_offer("Open Assistant_0.1.0_x64-setup.exe", 10, "abc").is_err());
        assert!(check_offer("virus.exe", 10, &sha).is_err());
        assert!(check_offer("..\\Open Assistant_0.1.0_x64-setup.exe", 10, &sha).is_err());
    }

    #[test]
    fn checks_the_received_file_and_finds_the_newest_installer() {
        let dir = std::env::temp_dir().join(format!("oa-update-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let bytes = b"MZ programa de teste".to_vec();
        let path = dir.join("Open Assistant_0.1.0_x64-setup.exe");
        std::fs::write(&path, &bytes).unwrap();
        let sha = sha256_hex(&bytes);
        assert!(check_received(&path, bytes.len() as u64, &sha).is_ok());
        assert!(check_received(&path, bytes.len() as u64 + 1, &sha).is_err());
        assert!(check_received(&path, bytes.len() as u64, &sha256_hex(b"outro")).is_err());
        let not_exe = dir.join("texto.bin");
        std::fs::write(&not_exe, b"oi, nao sou exe").unwrap();
        assert!(check_received(&not_exe, 15, &sha256_hex(b"oi, nao sou exe")).unwrap_err().contains("não é um programa"));
        std::fs::write(dir.join("leia-me.txt"), b"x").unwrap();
        let found = find_installer(&[dir.join("nao-existe"), dir.clone()]).unwrap();
        assert_eq!(found.file_name, "Open Assistant_0.1.0_x64-setup.exe");
        assert_eq!(found.version, "0.1.0");
        assert_eq!(found.size, bytes.len() as u64);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
