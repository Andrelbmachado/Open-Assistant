# Rede de computadores, fase 1: rede local + chat remoto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois computadores com o Open Assistant na mesma rede se encontram, se conectam por um código de 6 dígitos e aparecem numa página **Rede** em forma de malha. Um deles usa o Ollama (a GPU) do outro no chat e no agente, com a resposta chegando em streaming.

**Architecture:** Cada app abre um endpoint **iroh** (QUIC com criptografia; identidade = chave Ed25519) com o protocolo `open-assistant/1` e se anuncia na rede local por mDNS. As mensagens são JSON, uma por linha, num stream bidirecional (`protocol.rs`). O pareamento confere o código dentro do túnel e grava o outro computador em `rede\confiaveis.json`. O chat remoto é o `run_chat` atual com um callback em vez do `app.emit`: o PC que responde manda cada pedaço pelo stream, e o PC que pediu reemite como `ollama-chat-delta`. Assim o chat e o `agentRunner` não mudam, só escolhem o comando pelo prefixo do modelo (`remote:`).

**Tech Stack:** Rust (Tauri 2, `iroh = "1.2"`, `iroh-mdns-address-lookup = "0.5"`, `mac_address = "1.1"`, `rand`), React 19 + TypeScript, Vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md`.

## Global Constraints

- Repositório: worktree `C:\Users\andre\.codex\worktrees\open-assistant-qa\Open Assistant`, branch `feat/agente-local`.
- ALPN: `b"open-assistant/1"`. Pasta de dados: `app_local_data_dir()\rede\` (`chave.key`, `confiaveis.json`, `config.json`).
- Código de pareamento: 6 dígitos, válido por 5 min, uso único, no máximo 5 tentativas erradas (depois disso o código morre).
- Permissões padrão de um computador pareado: `usarIA: true`, `controlar: false`, `atualizar: false`. Nesta fase só `usarIA` tem efeito.
- Pedidos de chat de um computador **não pareado** ou sem `usarIA`: recusar com a mensagem "Este computador não tem permissão para usar a IA daqui."
- MAC é só informação na tela; nunca usado para decidir confiança.
- "Visível na rede" ligado por padrão só na rede local. Existe o botão para desligar.
- A API do iroh 1.x é usada como descrito abaixo. **Antes de cada task de rede, conferir os nomes em docs.rs/iroh/1.2.0 e docs.rs/iroh-mdns-address-lookup/0.5.0.** Se algum nome mudou, ajustar só o nome e manter o comportamento.
- Textos em português do Brasil; visual do `DESIGN.md` (sem cores novas fora dos tokens existentes).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/utils/network.ts` (+ `.test.ts`) | tipos, layout da malha, formato do código, ids de modelo remoto |
| `src-tauri/src/network/mod.rs` | estado da rede + comandos Tauri |
| `src-tauri/src/network/identity.rs` | chave, nome, tipo do computador, MAC |
| `src-tauri/src/network/pairing.rs` | código de pareamento + lista de confiáveis |
| `src-tauri/src/network/protocol.rs` | mensagens e leitura/escrita em linhas JSON |
| `src-tauri/src/network/node.rs` | endpoint iroh, descoberta, aceitar conexões, chat remoto |
| `src-tauri/src/lib.rs` | `run_chat_with` (callback), registrar comandos e o estado |
| `src/utils/aiService.ts`, `src/utils/agentRunner.ts` | escolher `remote_chat` para modelos `remote:` |
| `src/components/NetworkView.tsx` (+ `DeviceIcon.tsx`) | página Rede |
| `src/components/Sidebar.tsx`, `Workspace.tsx`, `workspaceLayout.ts`, `store.tsx` | abrir a página pelo ícone |

---

### Task 1: Lógica pura do front (`network.ts`)

**Files:**
- Create: `src/utils/network.ts`
- Test: `src/utils/network.test.ts`

**Interfaces:**
- Produces:
  - `type DeviceKind = "desktop" | "laptop" | "macbook" | "mac"`
  - `interface NetDevice { id: string; name: string; kind: DeviceKind; os: string; mac?: string; gpu?: string; models: string[]; online: boolean; paired: boolean; self: boolean; link?: "local" | "internet"; permissions?: { usarIA: boolean; controlar: boolean; atualizar: boolean } }`
  - `formatPairCode(code: string): string` (`"482913"` → `"482 913"`)
  - `normalizePairCode(input: string): string | null` (tira espaços e traços; `null` se não forem 6 dígitos)
  - `remoteModelId(deviceId: string, model: string): string` → `remote:<deviceId>:<model>`
  - `parseRemoteModel(id: string): { deviceId: string; model: string } | null`
  - `meshLayout(devices: NetDevice[], width: number, height: number): { nodes: { id: string; x: number; y: number }[]; edges: { from: string; to: string; link: "local" | "internet" }[] }`: o computador atual no centro, os outros num círculo; uma aresta entre cada par de computadores **online e pareados** (malha completa), além do atual.

- [ ] **Step 1: Teste que falha**

`src/utils/network.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatPairCode, meshLayout, normalizePairCode, parseRemoteModel, remoteModelId, type NetDevice } from "./network";

const dev = (id: string, extra: Partial<NetDevice> = {}): NetDevice => ({ id, name: id, kind: "desktop", os: "Windows 11", models: [], online: true, paired: true, self: false, link: "local", ...extra });

describe("pair code", () => {
  it("formats and normalizes 6 digits", () => {
    expect(formatPairCode("482913")).toBe("482 913");
    expect(normalizePairCode(" 482-913 ")).toBe("482913");
    expect(normalizePairCode("48291")).toBeNull();
    expect(normalizePairCode("48a913")).toBeNull();
  });
});

describe("remote model ids", () => {
  it("round-trips device and model (model names keep their colons)", () => {
    const id = remoteModelId("abc123", "qwen3.5:9b");
    expect(id).toBe("remote:abc123:qwen3.5:9b");
    expect(parseRemoteModel(id)).toEqual({ deviceId: "abc123", model: "qwen3.5:9b" });
    expect(parseRemoteModel("ollama:qwen3.5:9b")).toBeNull();
  });
});

describe("meshLayout", () => {
  it("puts self in the center and links every online paired pair", () => {
    const layout = meshLayout([dev("eu", { self: true }), dev("pc"), dev("note", { kind: "laptop" }), dev("off", { online: false })], 600, 400);
    const self = layout.nodes.find((node) => node.id === "eu")!;
    expect(self).toEqual({ id: "eu", x: 300, y: 200 });
    expect(layout.nodes).toHaveLength(4);
    const pairs = layout.edges.map((edge) => [edge.from, edge.to].sort().join("-")).sort();
    expect(pairs).toEqual(["eu-note", "eu-pc", "note-pc"]);
  });

  it("does not link unpaired devices (they are only discovered)", () => {
    const layout = meshLayout([dev("eu", { self: true }), dev("vizinho", { paired: false })], 600, 400);
    expect(layout.edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/network.test.ts`
Expected: FAIL — `Failed to resolve import "./network"`.

- [ ] **Step 3: Implementar `src/utils/network.ts`**

```ts
/**
 * Rede de computadores do Open Assistant (ROADMAP §15): tipos, malha da página Rede, código de
 * pareamento e ids de modelos que rodam em outro computador (`remote:<id>:<modelo>`).
 */

export type DeviceKind = "desktop" | "laptop" | "macbook" | "mac";

export interface NetDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  os: string;
  mac?: string;
  gpu?: string;
  models: string[];
  online: boolean;
  paired: boolean;
  self: boolean;
  link?: "local" | "internet";
  permissions?: { usarIA: boolean; controlar: boolean; atualizar: boolean };
}

export const REMOTE_PREFIX = "remote:";

export function formatPairCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function normalizePairCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function remoteModelId(deviceId: string, model: string): string {
  return `${REMOTE_PREFIX}${deviceId}:${model}`;
}

export function parseRemoteModel(id: string): { deviceId: string; model: string } | null {
  if (!id.startsWith(REMOTE_PREFIX)) return null;
  const rest = id.slice(REMOTE_PREFIX.length);
  const cut = rest.indexOf(":");
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { deviceId: rest.slice(0, cut), model: rest.slice(cut + 1) };
}

export function meshLayout(devices: NetDevice[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const self = devices.find((device) => device.self);
  const others = devices.filter((device) => !device.self);
  const radius = Math.max(60, Math.min(width, height) / 2 - 70);
  const nodes = [
    ...(self ? [{ id: self.id, x: cx, y: cy }] : []),
    ...others.map((device, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(others.length, 1);
      return { id: device.id, x: Math.round(cx + radius * Math.cos(angle)), y: Math.round(cy + radius * Math.sin(angle)) };
    }),
  ];
  const linked = devices.filter((device) => device.self || (device.online && device.paired));
  const edges: { from: string; to: string; link: "local" | "internet" }[] = [];
  for (let i = 0; i < linked.length; i++) for (let j = i + 1; j < linked.length; j++) {
    const a = linked[i];
    const b = linked[j];
    edges.push({ from: a.id, to: b.id, link: a.link === "internet" || b.link === "internet" ? "internet" : "local" });
  }
  return { nodes, edges };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/utils/network.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/network.ts src/utils/network.test.ts
git commit -m "feat(rede): tipos, malha e código de pareamento"
```

---

### Task 2: Identidade do computador (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml` (`[dependencies]`)
- Create: `src-tauri/src/network/mod.rs`, `src-tauri/src/network/identity.rs`
- Modify: `src-tauri/src/lib.rs` (`mod network;`)

**Interfaces:**
- Produces:
  - `#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "lowercase")] pub enum DeviceKind { Desktop, Laptop, Macbook, Mac }`
  - `pub fn kind_from(os: &str, chassis: &[u16], model: &str) -> DeviceKind`
  - `#[derive(Serialize, Deserialize, Clone, Debug)] #[serde(rename_all = "camelCase")] pub struct DeviceInfo { pub id: String, pub name: String, pub kind: DeviceKind, pub os: String, pub mac: Option<String>, pub gpu: Option<String>, pub models: Vec<String> }`
  - `pub fn load_or_create_key(dir: &Path) -> Result<iroh::SecretKey, String>`
  - `pub fn local_info(key: &iroh::SecretKey) -> DeviceInfo` (`id` = `key.public().to_string()`; `models` vazio: quem chama preenche com os modelos do Ollama)

- [ ] **Step 1: Dependências**

Em `Cargo.toml`, `[dependencies]`:
```toml
iroh = "1.2"
iroh-mdns-address-lookup = "0.5"
mac_address = "1.1"
rand = "0.9"
tokio = { version = "1", features = ["io-util", "sync", "time", "macros"] }
```
Run: `cd src-tauri && cargo check`. Expected: compila (baixa as crates). Se `rand` ou `tokio` já existirem como dependência de outra crate com outra versão, usar a mesma versão principal.

- [ ] **Step 2: Teste que falha**

`src-tauri/src/network/identity.rs`:
```rust
//! Quem é este computador na rede: chave (identidade de verdade), nome, tipo (ícone), MAC (só informação).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind { Desktop, Laptop, Macbook, Mac }

/// Tipos de gabinete (SMBIOS/Win32_SystemEnclosure.ChassisTypes) que são portáteis.
const PORTABLE_CHASSIS: &[u16] = &[8, 9, 10, 11, 14, 30, 31, 32];

pub fn kind_from(os: &str, chassis: &[u16], model: &str) -> DeviceKind { todo!() }

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
```
`src-tauri/src/network/mod.rs`:
```rust
//! Rede de computadores do Open Assistant (ROADMAP §15). Design: docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md
pub mod identity;
```
Em `lib.rs`: `mod network;`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd src-tauri && cargo test network::identity`
Expected: FAIL (`not yet implemented` / `load_or_create_key` inexistente).

- [ ] **Step 4: Implementar**

Em `identity.rs`, trocar o `todo!()` e acrescentar o resto:
```rust
pub fn kind_from(os: &str, chassis: &[u16], model: &str) -> DeviceKind {
    if os == "macos" {
        return if model.starts_with("MacBook") { DeviceKind::Macbook } else { DeviceKind::Mac };
    }
    if chassis.iter().any(|kind| PORTABLE_CHASSIS.contains(kind)) { DeviceKind::Laptop } else { DeviceKind::Desktop }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
        let bytes: [u8; 32] = bytes.try_into().map_err(|_| "chave.key corrompida".to_string())?;
        return Ok(iroh::SecretKey::from_bytes(&bytes));
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let key = iroh::SecretKey::generate(&mut rand::rng());
    fs::write(&file, key.to_bytes()).map_err(|error| error.to_string())?;
    Ok(key)
}

/// Lê os tipos de gabinete pelo PowerShell (CIM); vazio se falhar (vira "desktop").
fn windows_chassis() -> Vec<u16> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "(Get-CimInstance Win32_SystemEnclosure).ChassisTypes -join ','"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().split(',').filter_map(|part| part.trim().parse().ok()).collect())
        .unwrap_or_default()
}

fn windows_gpu() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1).Name"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!name.is_empty()).then_some(name)
}

pub fn local_info(key: &iroh::SecretKey) -> DeviceInfo {
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Computador".into());
    DeviceInfo {
        id: key.public().to_string(),
        name,
        kind: kind_from("windows", &windows_chassis(), ""),
        os: "Windows".into(),
        mac: mac_address::get_mac_address().ok().flatten().map(|mac| mac.to_string()),
        gpu: windows_gpu(),
        models: Vec::new(),
    }
}
```
Confira os nomes `SecretKey::generate`, `from_bytes`, `to_bytes`, `public()` em docs.rs/iroh/1.2.0 (se `generate` pedir outro tipo de RNG, use o que a doc indicar).

- [ ] **Step 5: Rodar os testes**

Run: `cd src-tauri && cargo test network::identity`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/network src-tauri/src/lib.rs
git commit -m "feat(rede): identidade do computador (chave, tipo, MAC, GPU)"
```

---

### Task 3: Pareamento por código e lista de confiáveis

**Files:**
- Create: `src-tauri/src/network/pairing.rs`
- Modify: `src-tauri/src/network/mod.rs` (`pub mod pairing;`)

**Interfaces:**
- Consumes: `DeviceInfo` (Task 2).
- Produces:
  - `pub struct PairCode { code: String, expires_at: Instant, attempts_left: u8 }` com `PairCode::new(now: Instant) -> PairCode`, `pub fn code(&self) -> &str`, `pub fn check(&mut self, input: &str, now: Instant) -> PairCheck`
  - `#[derive(Debug, PartialEq)] pub enum PairCheck { Ok, Wrong, Expired, Locked }`
  - `#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase")] pub struct Permissions { pub usar_ia: bool, pub controlar: bool, pub atualizar: bool }` com `Default` = `{ usar_ia: true, controlar: false, atualizar: false }` (no JSON: `usarIA`: usar `#[serde(rename = "usarIA")]` nesse campo)
  - `#[derive(Serialize, Deserialize, Clone, Debug)] #[serde(rename_all = "camelCase")] pub struct TrustedDevice { pub info: DeviceInfo, pub permissions: Permissions, pub paired_at: u64 }`
  - `pub struct TrustStore { path: PathBuf, pub devices: Vec<TrustedDevice> }` com `load(path) -> TrustStore`, `save(&self) -> Result<(), String>`, `upsert(&mut self, device: TrustedDevice)`, `remove(&mut self, id: &str)`, `get(&self, id: &str) -> Option<&TrustedDevice>`

- [ ] **Step 1: Teste que falha**

`src-tauri/src/network/pairing.rs` com as assinaturas (corpos `todo!()`) e os testes:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::identity::{DeviceInfo, DeviceKind};
    use std::time::{Duration, Instant};

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
        for _ in 0..5 { assert_eq!(code.check(wrong, now), PairCheck::Wrong); }
        let right = code.code().to_string();
        assert_eq!(code.check(&right, now), PairCheck::Locked);
    }

    #[test]
    fn code_expires_after_five_minutes() {
        let now = Instant::now();
        let mut code = PairCode::new(now);
        let right = code.code().to_string();
        assert_eq!(code.check(&right, now + Duration::from_secs(301)), PairCheck::Expired);
    }

    #[test]
    fn trust_store_round_trip_with_default_permissions() {
        let path = std::env::temp_dir().join(format!("oa-confiaveis-{}.json", std::process::id()));
        let mut store = TrustStore::load(&path);
        let info = DeviceInfo { id: "abc".into(), name: "PC-Sala".into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: Some("RTX 5070".into()), models: vec![] };
        store.upsert(TrustedDevice { info, permissions: Permissions::default(), paired_at: 1 });
        store.save().unwrap();
        let loaded = TrustStore::load(&path);
        assert_eq!(loaded.get("abc").unwrap().permissions, Permissions { usar_ia: true, controlar: false, atualizar: false });
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"usarIA\": true"));
        let _ = std::fs::remove_file(&path);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src-tauri && cargo test network::pairing`
Expected: FAIL (`not yet implemented`).

- [ ] **Step 3: Implementar**

```rust
//! Pareamento tipo AnyDesk: código de 6 dígitos (5 min, uso único, 5 tentativas) conferido dentro do
//! túnel criptografado; quem pareia vira "confiável" com permissões (rede\confiaveis.json).

use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::identity::DeviceInfo;

const CODE_TTL: Duration = Duration::from_secs(300);
const MAX_ATTEMPTS: u8 = 5;

pub struct PairCode { code: String, expires_at: Instant, attempts_left: u8 }

#[derive(Debug, PartialEq)]
pub enum PairCheck { Ok, Wrong, Expired, Locked }

impl PairCode {
    pub fn new(now: Instant) -> PairCode {
        let code = format!("{:06}", rand::rng().random_range(0..1_000_000u32));
        PairCode { code, expires_at: now + CODE_TTL, attempts_left: MAX_ATTEMPTS }
    }
    pub fn code(&self) -> &str { &self.code }
    pub fn check(&mut self, input: &str, now: Instant) -> PairCheck {
        if self.attempts_left == 0 { return PairCheck::Locked; }
        if now > self.expires_at { self.attempts_left = 0; return PairCheck::Expired; }
        // Comparação em tempo constante (não vaza quantos dígitos acertou).
        let same = input.len() == self.code.len() && input.bytes().zip(self.code.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0;
        if same { self.attempts_left = 0; return PairCheck::Ok; }
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
    fn default() -> Self { Permissions { usar_ia: true, controlar: false, atualizar: false } }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDevice { pub info: DeviceInfo, pub permissions: Permissions, pub paired_at: u64 }

pub struct TrustStore { path: PathBuf, pub devices: Vec<TrustedDevice> }

impl TrustStore {
    pub fn load(path: &Path) -> TrustStore {
        let devices = fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        TrustStore { path: path.to_path_buf(), devices }
    }
    pub fn save(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() { fs::create_dir_all(dir).map_err(|error| error.to_string())?; }
        fs::write(&self.path, serde_json::to_string_pretty(&self.devices).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
    }
    pub fn upsert(&mut self, device: TrustedDevice) {
        self.devices.retain(|item| item.info.id != device.info.id);
        self.devices.push(device);
    }
    pub fn remove(&mut self, id: &str) { self.devices.retain(|item| item.info.id != id); }
    pub fn get(&self, id: &str) -> Option<&TrustedDevice> { self.devices.iter().find(|item| item.info.id == id) }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd src-tauri && cargo test network::pairing`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/network
git commit -m "feat(rede): código de pareamento e lista de computadores confiáveis"
```

---

### Task 4: Protocolo (mensagens em linhas JSON)

**Files:**
- Create: `src-tauri/src/network/protocol.rs`
- Modify: `src-tauri/src/network/mod.rs` (`pub mod protocol;`)

**Interfaces:**
- Consumes: `DeviceInfo` (Task 2).
- Produces:
```rust
pub const ALPN: &[u8] = b"open-assistant/1";

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Message {
    Hello { info: DeviceInfo },
    PairRequest { code: String, info: DeviceInfo },
    PairResult { ok: bool, reason: Option<String> },
    ChatRequest { request_id: String, model: String, messages: serde_json::Value, think: Option<bool>, think_level: Option<String>, options: Option<serde_json::Value> },
    ChatDelta { delta: serde_json::Value },
    ChatDone { result: serde_json::Value },
    Error { message: String },
}
pub async fn write_message<W: tokio::io::AsyncWrite + Unpin>(writer: &mut W, message: &Message) -> Result<(), String>
pub async fn read_message<R: tokio::io::AsyncBufRead + Unpin>(reader: &mut R) -> Result<Option<Message>, String>  // None = fim do stream
```
(`DeviceInfo` precisa de `PartialEq`: acrescentar ao `derive` em `identity.rs`.)

- [ ] **Step 1: Teste que falha**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::identity::{DeviceInfo, DeviceKind};
    use tokio::io::BufReader;

    fn info() -> DeviceInfo { DeviceInfo { id: "abc".into(), name: "PC".into(), kind: DeviceKind::Desktop, os: "Windows".into(), mac: None, gpu: None, models: vec!["qwen3.5:9b".into()] } }

    #[tokio::test]
    async fn messages_round_trip_one_per_line() {
        let mut buffer = Vec::new();
        let sent = vec![
            Message::Hello { info: info() },
            Message::PairRequest { code: "482913".into(), info: info() },
            Message::ChatDelta { delta: serde_json::json!({ "requestId": "r1", "content": "Olá\nmundo", "thinking": "", "thinkingTokens": 0 }) },
        ];
        for message in &sent { write_message(&mut buffer, message).await.unwrap(); }
        assert_eq!(buffer.iter().filter(|b| **b == b'\n').count(), 3);
        let mut reader = BufReader::new(buffer.as_slice());
        for message in &sent { assert_eq!(read_message(&mut reader).await.unwrap().as_ref(), Some(message)); }
        assert_eq!(read_message(&mut reader).await.unwrap(), None);
    }

    #[tokio::test]
    async fn rejects_huge_lines() {
        let line = format!("{}\n", "x".repeat(MAX_LINE + 1));
        let mut reader = BufReader::new(line.as_bytes());
        assert!(read_message(&mut reader).await.is_err());
    }
}
```
(`#[tokio::test]` pede a feature `rt` + `macros` em dev: acrescentar `[dev-dependencies] tokio = { version = "1", features = ["rt", "macros"] }`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src-tauri && cargo test network::protocol`
Expected: FAIL (módulo sem `write_message`/`read_message`).

- [ ] **Step 3: Implementar**

```rust
//! Protocolo `open-assistant/1`: uma mensagem JSON por linha num stream bidirecional do iroh.

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use super::identity::DeviceInfo;

pub const ALPN: &[u8] = b"open-assistant/1";
/// Limite por mensagem (imagens do chat vão em base64: 32 MB cobre várias).
pub const MAX_LINE: usize = 32 * 1024 * 1024;

// … enum Message exatamente como em "Interfaces" …

pub async fn write_message<W: AsyncWrite + Unpin>(writer: &mut W, message: &Message) -> Result<(), String> {
    let mut line = serde_json::to_vec(message).map_err(|error| error.to_string())?;
    line.push(b'\n');
    writer.write_all(&line).await.map_err(|error| error.to_string())?;
    writer.flush().await.map_err(|error| error.to_string())
}

pub async fn read_message<R: AsyncBufRead + Unpin>(reader: &mut R) -> Result<Option<Message>, String> {
    let mut line = Vec::new();
    let read = (&mut *reader).take(MAX_LINE as u64 + 1).read_until(b'\n', &mut line).await.map_err(|error| error.to_string())?;
    if read == 0 { return Ok(None); }
    if line.len() > MAX_LINE { return Err("Mensagem grande demais.".into()); }
    serde_json::from_slice(&line).map(Some).map_err(|error| format!("Mensagem inválida: {error}"))
}
```
(`take` vem de `tokio::io::AsyncReadExt`; importar também.) O JSON de uma mensagem nunca tem `\n` cru dentro (o serde escapa os `\n` das strings), por isso uma linha é sempre uma mensagem.

- [ ] **Step 4: Rodar os testes**

Run: `cd src-tauri && cargo test network::protocol`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/network
git commit -m "feat(rede): protocolo open-assistant/1 em linhas JSON"
```

---

### Task 5: `run_chat` com callback (base do chat remoto)

**Files:**
- Modify: `src-tauri/src/lib.rs` (`run_chat` ~linha 1095; `emit` ~linha 1180; derives de `OllamaChatDelta` ~981 e `OllamaChatResult` ~963; `ChatOptions` ~1087)

**Interfaces:**
- Produces: `fn run_chat_with(model: &str, messages: &[ChatMessageInput], think: Option<bool>, think_level: Option<&str>, options: &ChatOptions, cancel: &AtomicBool, on_delta: &mut dyn FnMut(&OllamaChatDelta)) -> Result<OllamaChatResult, String>` (o `request_id` segue dentro do delta como hoje). `run_chat(app, request_id, …)` passa a chamar `run_chat_with` com `|delta| { let _ = app.emit(CHAT_DELTA_EVENT, delta.clone()); }`. Também: `OllamaChatDelta` e `OllamaChatResult` ganham `Deserialize`; `ChatOptions` ganha `Serialize` e `Clone`; os três e `ChatMessageInput` ficam `pub(crate)`.

- [ ] **Step 1: Refatorar sem mudar o comportamento**

Leia `run_chat` inteiro (linhas ~1095–1235). Renomeie para `run_chat_with`, tire o parâmetro `app: &AppHandle` e acrescente `on_delta: &mut dyn FnMut(&OllamaChatDelta)` no fim. Troque a linha `let _ = app.emit(CHAT_DELTA_EVENT, pending.clone());` por `on_delta(&pending);`. Se `run_chat` usar `app` para outra coisa além do `emit` (ex.: `is_qa_app`, caminho de pasta), receba esse valor já calculado como parâmetro em vez do `AppHandle`. Em seguida, recrie:
```rust
fn run_chat(app: &AppHandle, request_id: &str, model: &str, messages: &[ChatMessageInput], think: Option<bool>, think_level: Option<&str>, options: &ChatOptions, cancel: &AtomicBool) -> Result<OllamaChatResult, String> {
    let _ = request_id; // o request_id já vai dentro de cada delta montado por run_chat_with
    run_chat_with(model, messages, think, think_level, options, cancel, &mut |delta| { let _ = app.emit(CHAT_DELTA_EVENT, delta.clone()); })
}
```
Se o `request_id` for usado **dentro** de `run_chat` para montar o delta, mantenha-o como parâmetro de `run_chat_with` também (antes de `model`) e ajuste a assinatura das Interfaces.

- [ ] **Step 2: Conferir que nada mudou**

Run: `cd src-tauri && cargo test` e `npm run build:app`; abrir o app e mandar "oi" para o `qwen3.5:9b`.
Expected: testes passam; a resposta chega em streaming como antes.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor: run_chat_with recebe callback para os pedaços da resposta"
```

---

### Task 6: Nó da rede (iroh): descoberta, pareamento e chat remoto

**Files:**
- Create: `src-tauri/src/network/node.rs`
- Modify: `src-tauri/src/network/mod.rs` (estado + comandos), `src-tauri/src/lib.rs` (registrar estado, comandos e iniciar a rede no `setup`)
- Test: teste de integração em `node.rs` (dois endpoints no mesmo processo)

**Interfaces:**
- Consumes: tudo das Tasks 2–5; `ollama_list_models` (para preencher `DeviceInfo.models`).
- Produces (comandos Tauri, nomes exatos usados pelo front na Task 7):
  - `net_status() -> NetStatus { self_info: DeviceInfo, visible: bool }`
  - `net_devices() -> Vec<NetDeviceView>`, onde `NetDeviceView` tem os campos de `NetDevice` do front (camelCase: `id, name, kind, os, mac, gpu, models, online, paired, self, link, permissions`)
  - `net_show_code() -> String` (gera e guarda o código; 6 dígitos)
  - `net_pair(device_id: String, code: String) -> Result<(), String>`
  - `net_forget(device_id: String)`, `net_set_permissions(device_id: String, permissions: Permissions)`, `net_set_visible(visible: bool)`
  - `net_lan_neighbors() -> Vec<{ ip: String, mac: String }>` (aparelhos sem o app, pela tabela ARP)
  - `remote_chat(request_id, device_id, model, messages, think, think_level, options) -> OllamaChatResult` (emite `ollama-chat-delta`)
  - evento `net-devices-changed` quando a lista muda.

- [ ] **Step 1: Teste de integração que falha**

Em `node.rs`, um teste que sobe dois nós em pastas temporárias, pareia pelo código e faz um pedido de chat com um "Ollama falso":
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn two_nodes_pair_by_code_and_chat() {
        let a = Node::start_for_test("a", |_request| Ok(fake_result("oi do A"))).await.unwrap();
        let b = Node::start_for_test("b", |_request| Ok(fake_result("não usado"))).await.unwrap();
        let code = a.show_code();
        b.pair_with(a.addr(), &code).await.unwrap();
        assert!(a.trusts(&b.id()));
        assert!(b.trusts(&a.id()));
        let mut deltas = Vec::new();
        let result = b.remote_chat(a.addr(), "r1", "qwen3.5:9b", serde_json::json!([{ "role": "user", "content": "oi" }]), &mut |delta| deltas.push(delta.clone())).await.unwrap();
        assert_eq!(result["content"], "oi do A");
        assert!(!deltas.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn wrong_code_and_unpaired_chat_are_refused() {
        let a = Node::start_for_test("a2", |_request| Ok(fake_result("x"))).await.unwrap();
        let b = Node::start_for_test("b2", |_request| Ok(fake_result("x"))).await.unwrap();
        let code = a.show_code();
        let wrong = if code == "000000" { "111111" } else { "000000" };
        assert!(b.pair_with(a.addr(), wrong).await.is_err());
        assert!(!b.trusts(&a.id()));
        let refused = b.remote_chat(a.addr(), "r2", "qwen3.5:9b", serde_json::json!([]), &mut |_| {}).await;
        assert!(refused.unwrap_err().contains("não tem permissão"));
    }
}
```
`start_for_test` usa uma pasta temporária, desliga o mDNS e recebe a função que faz o papel do Ollama (no app real, essa função chama `run_chat_with`). `fake_result(text)` devolve o JSON de um `OllamaChatResult` com `content = text`. Antes de devolver, o executor falso emite um delta com o mesmo texto.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src-tauri && cargo test network::node`
Expected: FAIL (`Node` não existe).

- [ ] **Step 3: Implementar `node.rs`**

Estrutura (confirmar os nomes da API em docs.rs/iroh/1.2.0: `Endpoint::builder`, `.secret_key`, `.alpns`, `.bind`, `Router::builder(endpoint).accept(ALPN, handler).spawn()`, `trait ProtocolHandler { async fn accept(&self, connection: Connection) -> Result<(), AcceptError> }`, `endpoint.connect(addr, ALPN)`, `connection.open_bi()` / `accept_bi()`, `connection.remote_id()`; mDNS: `iroh_mdns_address_lookup::MdnsAddressLookup` adicionado ao builder):
```rust
//! Nó da rede: endpoint iroh (criptografado), descoberta na rede local, pareamento e chat remoto.
//! Cada conexão abre um stream bidirecional; a primeira mensagem diz o que se quer (Hello/PairRequest/ChatRequest).

pub type ChatExecutor = Arc<dyn Fn(ChatRequestData, &mut dyn FnMut(&serde_json::Value)) -> Result<serde_json::Value, String> + Send + Sync>;

pub struct ChatRequestData { pub request_id: String, pub model: String, pub messages: serde_json::Value, pub think: Option<bool>, pub think_level: Option<String>, pub options: Option<serde_json::Value> }

pub struct Node {
    endpoint: iroh::Endpoint,
    router: iroh::protocol::Router,
    info: DeviceInfo,
    trust: Arc<Mutex<TrustStore>>,
    code: Arc<Mutex<Option<PairCode>>>,
    seen: Arc<Mutex<HashMap<String, (DeviceInfo, Instant)>>>, // descobertos (Hello recebido), com hora
}
```
Comportamento do lado que **recebe** (`ProtocolHandler::accept`):
1. `let (mut send, recv) = connection.accept_bi().await?; let mut recv = BufReader::new(recv);` e ler a primeira mensagem.
2. `Hello { info }`: guardar em `seen` com `info.id` = `connection.remote_id().to_string()` (sempre sobrescrever o `id` com a identidade real do túnel; nunca confiar no que veio no JSON) e responder `Hello { info: self.info }`.
3. `PairRequest { code, info }`: `check` no código atual → `Ok` grava `TrustedDevice { info (com id real), permissions: default, paired_at: agora }` e responde `PairResult { ok: true }`; senão, `PairResult { ok: false, reason: "Código errado" | "Código expirado" | "Código bloqueado: gere outro" }`.
4. `ChatRequest`: se `trust.get(remote_id)` não existe ou `!permissions.usar_ia` → `Error { message: "Este computador não tem permissão para usar a IA daqui." }`. Senão, rodar o `ChatExecutor` em `spawn_blocking`, mandando cada delta como `ChatDelta` por um `tokio::sync::mpsc` e escrevendo no stream; no fim `ChatDone { result }`.
5. `send.finish()` ao terminar.

Lado que **pede**: `pair_with(addr, code)`, `hello(addr)`, `remote_chat(addr, request_id, model, messages, on_delta)`. Cada um conecta, `open_bi`, escreve a mensagem e lê as respostas até `PairResult`/`ChatDone`/`Error`. Em `pair_with` com sucesso, o lado que pede também grava o outro como confiável (`TrustedDevice` com a `info` do `Hello` trocado antes).

No app real (`mod.rs`): `NetState { node: tokio::sync::OnceCell<Node> }` registrado no Tauri. No `setup` do `lib.rs`, iniciar em segundo plano: carregar a chave de `app_local_data_dir()\rede`, montar a `info` com os modelos do Ollama, iniciar o `Node` com mDNS ligado e o executor real:
```rust
let executor: ChatExecutor = Arc::new(move |request, on_delta| {
    let messages: Vec<ChatMessageInput> = serde_json::from_value(request.messages).map_err(|error| error.to_string())?;
    let options: ChatOptions = request.options.map(serde_json::from_value).transpose().map_err(|error| error.to_string())?.unwrap_or_default();
    let cancel = AtomicBool::new(false);
    let result = run_chat_with(&request.model, &messages, request.think, request.think_level.as_deref(), &options, &cancel, &mut |delta| on_delta(&serde_json::to_value(delta).unwrap_or_default()))?;
    serde_json::to_value(result).map_err(|error| error.to_string())
});
```
A cada 10 s, mandar `Hello` para os endereços descobertos pelo mDNS e para os confiáveis. Marcar `online` quem respondeu nos últimos 30 s e emitir `net-devices-changed` se mudou.

`remote_chat` (comando Tauri): acha o endereço do `device_id` e chama `node.remote_chat` reemitindo cada delta com `app.emit("ollama-chat-delta", delta)`. O `requestId` do delta tem de ser o do pedido local: sobrescrever o campo `requestId` antes de emitir. No fim, desserializa o `ChatDone` em `OllamaChatResult`. O cancelamento (`ollama_cancel_chat`) fecha a conexão desse pedido: registre o `request_id` → `CancellationToken`/`AtomicBool` no mesmo mapa `ollama_chats` usado hoje.

`net_lan_neighbors`: `powershell -NoProfile -Command "Get-NetNeighbor -AddressFamily IPv4 -State Reachable,Stale | Where-Object LinkLayerAddress -ne '00-00-00-00-00-00' | Select-Object IPAddress,LinkLayerAddress | ConvertTo-Json"` com `CREATE_NO_WINDOW`, convertendo para `{ ip, mac }` e tirando os IPs de quem já tem o app.

- [ ] **Step 4: Rodar os testes**

Run: `cd src-tauri && cargo test network`
Expected: PASS (inclusive os 2 testes de integração).

- [ ] **Step 5: Registrar e compilar o app**

Em `lib.rs`: `.manage(network::NetState::default())`, os comandos no `invoke_handler!`, iniciar a rede no `setup`. Run: `npm run build:app`. Expected: compila; ao abrir o app, o Windows pode pedir permissão no Firewall (aceitar "Redes privadas").

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat(rede): nó iroh com descoberta local, pareamento e chat remoto"
```

---

### Task 7: Chat e agente usam modelos de outros computadores

**Files:**
- Modify: `src/utils/aiService.ts` (~linha 150-175), `src/utils/agentRunner.ts` (~linha 341)
- Modify: seletor de modelos (o componente que monta o grupo "Instalados" do Ollama no chat: localize com `grep -n "Instalados" src/components/ChatView.tsx src/components/ProviderSelect.tsx`)
- Create: `src/store/network.ts` (lista de computadores ao vivo)
- Test: `src/utils/aiService.test.ts`

**Interfaces:**
- Consumes: `parseRemoteModel`, `remoteModelId`, `NetDevice` (Task 1); comandos `net_devices`, `remote_chat`, evento `net-devices-changed` (Task 6).
- Produces: `useNetDevices(): NetDevice[]` em `src/store/network.ts`; `chatInvokeArgs(model: string, base: Record<string, unknown>): { command: "ollama_chat" | "remote_chat"; args: Record<string, unknown> }` em `aiService.ts`.

- [ ] **Step 1: Teste que falha**

Em `aiService.test.ts`:
```ts
import { chatInvokeArgs } from "./aiService";

describe("chatInvokeArgs", () => {
  it("routes remote models to remote_chat with the device id", () => {
    expect(chatInvokeArgs("remote:abc:qwen3.5:9b", { requestId: "r", messages: [] })).toEqual({ command: "remote_chat", args: { requestId: "r", messages: [], deviceId: "abc", model: "qwen3.5:9b" } });
  });
  it("keeps local models on ollama_chat", () => {
    expect(chatInvokeArgs("qwen3.5:9b", { requestId: "r", messages: [] })).toEqual({ command: "ollama_chat", args: { requestId: "r", messages: [], model: "qwen3.5:9b" } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aiService.test.ts`
Expected: FAIL — `chatInvokeArgs` não existe.

- [ ] **Step 3: Implementar e ligar**

Em `aiService.ts`:
```ts
/** Modelo `remote:<id>:<modelo>` roda no Ollama de outro computador da rede (mesmos eventos de streaming). */
export function chatInvokeArgs(model: string, base: Record<string, unknown>): { command: "ollama_chat" | "remote_chat"; args: Record<string, unknown> } {
  const remote = parseRemoteModel(model);
  return remote ? { command: "remote_chat", args: { ...base, deviceId: remote.deviceId, model: remote.model } } : { command: "ollama_chat", args: { ...base, model } };
}
```
No envio do chat (~linha 152), antes do `ollamaModelId(model)`: se `parseRemoteModel(model)` não for `null`, pular a checagem de modelo local e usar `const { command, args } = chatInvokeArgs(model, { requestId, messages: [...], think, thinkLevel, options })` e `invoke<OllamaChatResult>(command, args)`. A `source` fica `Rede (${remote.model} em ${nome do computador})`. Em `agentRunner.ts:341`, trocar `invoke<ChatResult>("ollama_chat", { … model … })` pelo mesmo `chatInvokeArgs`. Com isso, o agente controla **este** computador (as ferramentas continuam em `agent_tool` local) usando o modelo do outro.

`src/store/network.ts`: `useSyncExternalStore` sobre uma lista carregada por `invoke("net_devices")` e atualizada no evento `net-devices-changed` (mesmo padrão de `workflowRuns.ts`).

No seletor de modelos: grupo **"Computadores da rede"** com um item por modelo de cada computador `online && paired && permissions.usarIA` e `!self`: `value: remoteModelId(device.id, model)`, `label: model`, `description: device.name`.

- [ ] **Step 4: Testes**

Run: `npx vitest run` e `npm run build`
Expected: tudo passa; sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/utils/aiService.ts src/utils/aiService.test.ts src/utils/agentRunner.ts src/store/network.ts src/components
git commit -m "feat(rede): chat e agente usam o modelo de outro computador"
```

---

### Task 8: Página Rede (malha, ícones, conectar por código)

**Files:**
- Create: `src/components/DeviceIcon.tsx`, `src/components/NetworkView.tsx`
- Modify: `src/utils/workspaceLayout.ts` (`ViewKind` + `VIEW_KINDS`: `"network"`), `src/components/Workspace.tsx` (`labels`, `ViewRenderer`, ícone), `src/components/Sidebar.tsx:103`, `src/refresh.css`

**Interfaces:**
- Consumes: `useNetDevices` (Task 7), `meshLayout`, `formatPairCode`, `normalizePairCode` (Task 1); comandos `net_show_code`, `net_pair`, `net_forget`, `net_set_permissions`, `net_set_visible`, `net_lan_neighbors`, `net_status` (Task 6).

- [ ] **Step 1: Ícones por tipo (`DeviceIcon.tsx`)**

Quatro desenhos SVG em 48×48, traço 1.6 com `currentColor` (mesmo estilo dos ícones lucide):
```tsx
import type { DeviceKind } from "../utils/network";

/** Ícones da página Rede: PC de mesa, notebook Windows, MacBook e Mac de mesa têm desenhos próprios. */
export function DeviceIcon({ kind, size = 48 }: { kind: DeviceKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "desktop") return <svg {...common}><rect x="4" y="9" width="26" height="18" rx="2" /><path d="M13 33h8M17 27v6" /><rect x="34" y="8" width="10" height="28" rx="2" /><path d="M37 13h4M37 17h4" /><circle cx="39" cy="30" r="1.4" /></svg>;
  if (kind === "laptop") return <svg {...common}><rect x="9" y="10" width="30" height="20" rx="1.5" /><path d="M4 36h40l-3-5H7z" /><path d="M20 33.5h8" /><path d="M21 17h2v2h-2zM25 17h2v2h-2zM21 21h2v2h-2zM25 21h2v2h-2z" /></svg>;
  if (kind === "macbook") return <svg {...common}><rect x="9" y="10" width="30" height="20" rx="2.5" /><path d="M21.5 10h5v1.6a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" /><path d="M3 34h42a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M21 34.2h6" /></svg>;
  return <svg {...common}><rect x="5" y="7" width="38" height="25" rx="3" /><path d="M5 27h38" /><path d="M20 32l-1.5 7h11L28 32" /><path d="M16 39h16" /></svg>;
}
```
(Notebook Windows: dobradiça reta e o logotipo de 4 quadrados na tampa. MacBook: cantos mais redondos, entalhe no topo da tela e base fina com o recorte para abrir. Mac de mesa: tela única com queixo e pé. PC: monitor + gabinete.)

- [ ] **Step 2: `NetworkView.tsx`**

Página com `PageHeader` (eyebrow "Sua rede", título "Computadores", ícone `Network` do lucide) e, nas ações do cabeçalho: botão **Mostrar meu código**, botão primário **Conectar por código** e a chave **Visível na rede**. Corpo:
1. **Malha**: `<svg>` do tamanho do contêiner (medir com `ResizeObserver`), `meshLayout(devices, w, h)`. Cada aresta é uma `<line>` (classe `mesh-edge local|internet`; tracejada quando for internet). Cada node é um `<foreignObject>`/`<g>` com `<DeviceIcon kind>`, o nome embaixo, um pontinho de status (online/offline) e o selo "este computador" no `self`. Clicar num node abre o painel lateral.
2. **Painel do computador**: nome, tipo, sistema, GPU, MAC, modelos (chips), permissões (três interruptores `usarIA`, `controlar`, `atualizar`; nesta fase `controlar` e `atualizar` aparecem desativados com a dica "chega na fase 2/3") e o botão **Esquecer este computador**.
3. **Encontrados na rede**: lista dos `paired === false && online` com botão **Conectar** (abre o diálogo de código já com esse computador escolhido).
4. **Aparelhos sem o Open Assistant**: `net_lan_neighbors()` → linhas "IP · MAC", com o botão **Enviar instalador**. Nesta fase o botão abre a pasta do exe atual (`Desktop\Assistente pessoal`) no Explorador; o instalador de verdade vem na fase 3.
5. **Diálogo "Conectar por código"**: campo que aceita `482 913`/`482-913` (usar `normalizePairCode`); se nenhum computador foi escolhido, tenta cada encontrado na rede local até um aceitar. Mostra o erro do `net_pair` ("Código errado", "Código expirado"…).
6. **Diálogo "Meu código"**: `formatPairCode(await invoke("net_show_code"))` em fonte grande, a contagem de 5:00 e a frase "Digite este código no outro computador".

Visual: usar as classes existentes de página (`page-view`, `page-scroll`, `page-card`, `page-button`, `market-status`) e acrescentar em `refresh.css` só o que for da malha:
```css
/* Página Rede: malha de computadores. */
.network-mesh { position: relative; min-height: 360px; border-radius: 14px; background: color-mix(in srgb, currentColor 3%, transparent); }
.network-mesh svg { width: 100%; height: 100%; display: block; }
.mesh-edge { stroke: color-mix(in srgb, currentColor 28%, transparent); stroke-width: 1.4; }
.mesh-edge.internet { stroke-dasharray: 5 5; }
.mesh-node { cursor: pointer; color: var(--text, inherit); }
.mesh-node.offline { opacity: .45; }
.mesh-node.self .mesh-label { font-weight: 600; }
.mesh-label { font-size: 12px; text-anchor: middle; fill: currentColor; }
.pair-code-big { font-size: 40px; letter-spacing: .12em; font-variant-numeric: tabular-nums; text-align: center; }
```

- [ ] **Step 3: Abrir pelo ícone de computador**

- `workspaceLayout.ts`: acrescentar `"network"` em `ViewKind` e em `VIEW_KINDS`.
- `Workspace.tsx`: `labels.network = "Rede"`, `ViewRenderer`: `if (kind === "network") return <NetworkView />;`, ícone `Network` no botão de troca de área e `"network"` em `areaViews`.
- `Sidebar.tsx:103`: o indicador `runtime-location` hoje fica **dentro** do botão da linha do usuário. Tire o `<span className="runtime-location …">` de dentro do `<button className="user-row">` e coloque-o **ao lado**, como um `<button className="runtime-location …" title="Computadores da rede" onClick={() => dispatch({ type: "view", view: "network" })}>` com o mesmo conteúdo. Ajuste o CSS da `.user-row` para os dois ficarem na mesma linha (o `.runtime-location` já tem estilo; conferir que continua alinhado). Assim o clique no ícone abre a Rede e o clique no nome continua abrindo o menu do usuário.

- [ ] **Step 4: Tipos e testes**

Run: `npm run build` e `npx vitest run`
Expected: sem erros; tudo passa (o teste de layout que valida `VIEW_KINDS`, se existir, aceita `"network"`).

- [ ] **Step 5: Commit**

```bash
git add src/components/DeviceIcon.tsx src/components/NetworkView.tsx src/components/Workspace.tsx src/components/Sidebar.tsx src/utils/workspaceLayout.ts src/refresh.css
git commit -m "feat(rede): página Rede com malha de computadores e conexão por código"
```

---

### Task 9: Ponta a ponta com dois computadores + ROADMAP

- [ ] **Step 1:** `npm run build:app` e publicar o exe (ver plano §11, Task 7, Steps 1–2). Copiar o mesmo exe para o segundo computador Windows (notebook) pela rede ou por pendrive.
- [ ] **Step 2:** Nos dois, abrir o app e aceitar o Firewall ("Redes privadas"). Clicar no ícone de computador na barra lateral. Esperado: cada um vê o outro em "Encontrados na rede", com o ícone certo (PC de mesa × notebook).
- [ ] **Step 3:** No PC com a RTX, **Mostrar meu código**. No notebook, **Conectar por código** e digitar o código. Esperado: os dois ficam ligados por uma linha na malha; o painel do PC mostra "RTX 5070" e os modelos do Ollama.
- [ ] **Step 4:** No notebook, escolher `qwen3.5:9b · PC-…` no seletor de modelos e perguntar "qual é a capital da França?". Esperado: a resposta chega em streaming; no PC da RTX, o `ollama ps` mostra o modelo carregado; a origem da mensagem diz "Rede (…)".
- [ ] **Step 5:** No notebook, com o modelo remoto, pedir algo **inofensivo** ao agente ("abra a calculadora"). Esperado: a calculadora abre **no notebook**: o PC só pensou, as mãos são do notebook.
- [ ] **Step 6:** Testar recusa: no PC, desligar `usarIA` do notebook e perguntar de novo pelo notebook → mensagem "Este computador não tem permissão para usar a IA daqui."
- [ ] **Step 7:** Tirar print da malha e mandar ao André. Marcar em `docs/ROADMAP.md` §15 os itens da fase 1.
- [ ] **Step 8:** Commit `docs: ROADMAP §15 fase 1 (rede local + chat remoto) concluída`.
