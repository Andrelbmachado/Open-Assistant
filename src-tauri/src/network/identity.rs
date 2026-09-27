//! Quem é este computador na rede: chave (a identidade de verdade), nome, tipo (ícone), MAC (só informação).

use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Desktop,
    Laptop,
    Macbook,
    Mac,
}

/// Tipos de gabinete (SMBIOS / Win32_SystemEnclosure.ChassisTypes) que são portáteis.
const PORTABLE_CHASSIS: &[u16] = &[8, 9, 10, 11, 14, 30, 31, 32];

pub fn kind_from(os: &str, chassis: &[u16], model: &str) -> DeviceKind {
    if os == "macos" {
        return if model.starts_with("MacBook") { DeviceKind::Macbook } else { DeviceKind::Mac };
    }
    if chassis.iter().any(|kind| PORTABLE_CHASSIS.contains(kind)) {
        DeviceKind::Laptop
    } else {
        DeviceKind::Desktop
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub os: String,
    pub mac: Option<String>,
    pub gpu: Option<String>,
    pub models: Vec<String>,
}

pub fn load_or_create_key(dir: &Path) -> Result<iroh::SecretKey, String> {
    let file = dir.join("chave.key");
    if let Ok(bytes) = fs::read(&file) {
        let bytes: [u8; 32] = bytes.try_into().map_err(|_| "rede\\chave.key corrompida".to_string())?;
        return Ok(iroh::SecretKey::from_bytes(&bytes));
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let key = iroh::SecretKey::generate();
    fs::write(&file, key.to_bytes()).map_err(|error| error.to_string())?;
    Ok(key)
}

fn powershell(command: &str) -> Option<String> {
    let out = Command::new("powershell").args(["-NoProfile", "-Command", command]).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Tipos de gabinete pelo CIM; vazio se falhar (vira "desktop").
fn windows_chassis() -> Vec<u16> {
    powershell("(Get-CimInstance Win32_SystemEnclosure).ChassisTypes -join ','")
        .map(|text| text.split(',').filter_map(|part| part.trim().parse().ok()).collect())
        .unwrap_or_default()
}

fn windows_gpu() -> Option<String> {
    powershell("(Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1).Name")
}

pub fn local_info(key: &iroh::SecretKey) -> DeviceInfo {
    DeviceInfo {
        id: key.public().to_string(),
        name: std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Computador".into()),
        kind: kind_from("windows", &windows_chassis(), ""),
        os: "Windows".into(),
        mac: mac_address::get_mac_address().ok().flatten().map(|mac| mac.to_string()),
        gpu: windows_gpu(),
        models: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_laptops_and_desktops() {
        assert_eq!(kind_from("windows", &[10], ""), DeviceKind::Laptop);
        assert_eq!(kind_from("windows", &[3], ""), DeviceKind::Desktop);
        assert_eq!(kind_from("windows", &[], ""), DeviceKind::Desktop);
    }

    #[test]
    fn macs_by_model() {
        assert_eq!(kind_from("macos", &[], "MacBookPro18,3"), DeviceKind::Macbook);
        assert_eq!(kind_from("macos", &[], "Mac14,3"), DeviceKind::Mac);
        assert_eq!(kind_from("macos", &[], "iMac21,1"), DeviceKind::Mac);
    }

    #[test]
    fn key_is_created_once_and_reused() {
        let dir = std::env::temp_dir().join(format!("oa-rede-{}", std::process::id()));
        let first = load_or_create_key(&dir).unwrap();
        let second = load_or_create_key(&dir).unwrap();
        assert_eq!(first.public(), second.public());
        let _ = fs::remove_dir_all(&dir);
    }
}
