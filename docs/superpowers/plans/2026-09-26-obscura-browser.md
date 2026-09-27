# Obscura como browser do agente (ROADMAP §12, fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente e o node "Ler página" passam a ler páginas com o Obscura (que roda o JavaScript da página, ao contrário do download simples de hoje). Se o Obscura não estiver instalado ou falhar, o download simples continua como alternativa.

**Architecture:** O Obscura é instalado como qualquer ferramenta do app: uma receita em `tools.rs` baixa o `.zip` oficial para `%LOCALAPPDATA%\com.openassistant.windows\tools\obscura`. Um módulo Rust novo, `obscura.rs`, roda `obscura.exe fetch <url> --dump text` sem abrir janela. A ferramenta `read_url` do agente chama esse módulo primeiro e usa o `agent::read_url` atual (ureq) como plano B. O node `web.read` já passa por `agent_tool("read_url")`, então ganha o Obscura sem mudança.

**Tech Stack:** Rust (Tauri 2, `std::process::Command`), TypeScript (catálogo de ferramentas), Vitest, `cargo test`.

**Spec:** `docs/ROADMAP.md` §12. O que já se sabe do Obscura (pesquisado em 2026-09-26): browser sem janela escrito em Rust, licença Apache-2.0 (gratuito), fala o protocolo do Chrome (CDP) e funciona com Puppeteer e Playwright; release `v0.2.3` tem `obscura-x86_64-windows.zip` (com renderização); comandos `obscura fetch URL --dump text|html|links`, `--timeout N`, `--wait-until networkidle0`, `-s arquivo.png` (print), `obscura serve --port 9222` (servidor CDP). Reprodução de vídeo pode não funcionar, então abrir YouTube para o usuário continua com o Chrome.

## Global Constraints

- Repositório: worktree `C:\Users\andre\.codex\worktrees\open-assistant-qa\Open Assistant`, branch `feat/agente-local`.
- Versão fixada: `v0.2.3`, arquivo `obscura-x86_64-windows.zip` (fixar como o app já faz com sd.cpp e bitnet.cpp).
- Processos filhos sem janela: `creation_flags(CREATE_NO_WINDOW)` (`0x0800_0000`), como em `agent.rs`.
- O Obscura bloqueia endereços locais por padrão (proteção contra SSRF). **Não** ligar `--allow-private-network`.
- `open_url` (abrir site para o usuário ver) continua no Chrome/navegador padrão.
- Textos da interface em português do Brasil.

---

### Task 1: Receita de instalação e item no catálogo

**Files:**
- Modify: `src-tauri/src/tools.rs` (constantes perto de `SD_CPP_URL` ~linha 63; `RECIPES` ~linha 70)
- Modify: `src/utils/toolCatalog.ts` (lista `TOOL_CATALOG`, grupo "Open source" ~linha 88)
- Test: `src/utils/toolCatalog.test.ts` (o teste existente "has a backend recipe for every tool installed by recipe" já cobre)

**Interfaces:**
- Produces: id de ferramenta `"obscura"`; `pub const OBSCURA_TOOL: &str = "obscura";` em `tools.rs`.

- [ ] **Step 1: Item no catálogo (o teste passa a falhar)**

Em `toolCatalog.ts`, no grupo `// Open source`, acrescentar:
```ts
  { id: "obscura", name: "Obscura (browser do agente)", company: "Open source", category: "agents", usage: "runtime", install: { kind: "recipe" }, sizeBytes: 70 * MB, repo: "https://github.com/h4ckf0r0day/obscura", recommended: true, description: "Browser sem janela, feito em Rust: o agente lê páginas que dependem de JavaScript, sem abrir o Chrome." },
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/toolCatalog.test.ts`
Expected: FAIL em "has a backend recipe for every tool installed by recipe" com `obscura`.

- [ ] **Step 3: Receita**

Em `tools.rs`, perto de `SD_CPP_URL`:
```rust
/// Obscura fixado (2026-09-26): browser sem janela em Rust (V8 + CDP) que o agente usa para ler páginas.
pub const OBSCURA_TOOL: &str = "obscura";
const OBSCURA_URL: &str = "https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.3/obscura-x86_64-windows.zip";
```
Em `RECIPES`, depois da receita do sherpa:
```rust
    Recipe { id: "obscura", requires: &[], steps: &[Step::Archive(OBSCURA_URL)] },
```
(o id tem de ser o texto literal `"obscura"`: o teste lê `tools.rs` procurando `id: "..."`.)

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/utils/toolCatalog.test.ts` e `cd src-tauri && cargo check`
Expected: PASS; `cargo check` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tools.rs src/utils/toolCatalog.ts
git commit -m "feat: receita de instalação do Obscura"
```

---

### Task 2: Módulo `obscura.rs` (ler página)

**Files:**
- Create: `src-tauri/src/obscura.rs`
- Modify: `src-tauri/src/lib.rs` (`mod obscura;` junto dos outros `mod`)

**Interfaces:**
- Consumes: `tools::tool_dir(app, id)`, `tools::is_installed(app, id)`, `tools::find_file(root, accept)`, `tools::OBSCURA_TOOL`.
- Produces:
  - `pub fn fetch_args(url: &str, timeout_secs: u32) -> Vec<String>`
  - `pub fn clean_output(raw: &str, max_chars: usize) -> Result<String, String>`
  - `pub fn read_page(app: &AppHandle, url: &str, max_chars: usize) -> Result<String, String>`: devolve `Err` quando não está instalado ou falhou; quem chama decide o plano B.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src-tauri/src/obscura.rs` só com os testes e as assinaturas vazias:
```rust
//! Obscura: browser sem janela (Rust + V8) usado pelo agente para ler páginas com JavaScript.
//! Instalado pela receita `obscura` (`tools.rs`). Endereços locais ficam bloqueados (padrão do Obscura).

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

use super::tools;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn fetch_args(url: &str, timeout_secs: u32) -> Vec<String> { todo!() }
pub fn clean_output(raw: &str, max_chars: usize) -> Result<String, String> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_fetch_arguments_and_adds_https() {
        assert_eq!(fetch_args("g1.globo.com", 15), vec!["fetch", "https://g1.globo.com", "--dump", "text", "--timeout", "15", "--wait-until", "load"]);
        assert_eq!(fetch_args("http://example.com", 5)[1], "http://example.com");
    }

    #[test]
    fn cleans_blank_lines_and_limits_size() {
        let raw = "Título\n\n\n\n  linha 1  \n\nlinha 2\n";
        assert_eq!(clean_output(raw, 10_000).unwrap(), "Título\n\nlinha 1\n\nlinha 2");
        assert_eq!(clean_output(&"a".repeat(900), 500).unwrap().chars().count(), 501); // 500 + "…"
    }

    #[test]
    fn empty_page_is_an_error() {
        assert!(clean_output("  \n\n ", 1000).is_err());
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src-tauri && cargo test obscura`
Expected: FAIL (panic `not yet implemented`). Antes, acrescentar `mod obscura;` em `lib.rs` para o módulo compilar.

- [ ] **Step 3: Implementar**

Substituir os `todo!()` e acrescentar `read_page`:
```rust
pub fn fetch_args(url: &str, timeout_secs: u32) -> Vec<String> {
    let url = if url.starts_with("http://") || url.starts_with("https://") { url.to_string() } else { format!("https://{url}") };
    vec!["fetch".into(), url, "--dump".into(), "text".into(), "--timeout".into(), timeout_secs.to_string(), "--wait-until".into(), "load".into()]
}

/// Tira linhas em branco repetidas e espaços das pontas; corta no tamanho que cabe no contexto do modelo.
pub fn clean_output(raw: &str, max_chars: usize) -> Result<String, String> {
    let mut lines: Vec<&str> = Vec::new();
    for line in raw.lines().map(str::trim) {
        if line.is_empty() && lines.last().map_or(true, |last| last.is_empty()) { continue; }
        lines.push(line);
    }
    while lines.last().is_some_and(|line| line.is_empty()) { lines.pop(); }
    let text = lines.join("\n");
    if text.is_empty() { return Err("O Obscura abriu a página, mas ela veio sem texto.".into()); }
    if text.chars().count() <= max_chars { return Ok(text); }
    Ok(text.chars().take(max_chars).collect::<String>() + "…")
}

fn executable(app: &AppHandle) -> Result<PathBuf, String> {
    if !tools::is_installed(app, tools::OBSCURA_TOOL) { return Err("Obscura não instalado.".into()); }
    let dir = tools::tool_dir(app, tools::OBSCURA_TOOL)?;
    tools::find_file(&dir, &|name| name == "obscura.exe").ok_or_else(|| "obscura.exe não encontrado na pasta da ferramenta.".into())
}

/// Lê a página com o Obscura (roda o JavaScript). `Err` = não instalado ou falhou: quem chama usa o plano B.
pub fn read_page(app: &AppHandle, url: &str, max_chars: usize) -> Result<String, String> {
    let exe = executable(app)?;
    let args = fetch_args(url, 15);
    let output = Command::new(&exe).args(&args).creation_flags(CREATE_NO_WINDOW).output().map_err(|error| format!("Não foi possível rodar o Obscura: {error}"))?;
    if !output.status.success() {
        return Err(format!("Obscura falhou: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let text = clean_output(&String::from_utf8_lossy(&output.stdout), max_chars.clamp(500, 20_000))?;
    Ok(format!("{}\n\n{text}", args[1]))
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd src-tauri && cargo test obscura`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/obscura.rs src-tauri/src/lib.rs
git commit -m "feat: módulo obscura.rs para ler páginas com JavaScript"
```

---

### Task 3: `read_url` do agente usa o Obscura primeiro

**Files:**
- Modify: `src-tauri/src/agent.rs:1076` (dispatch de `"read_url"`) e a descrição da ferramenta (~linha 868)

**Interfaces:**
- Consumes: `obscura::read_page` (Task 2), `agent::read_url` (existente).

- [ ] **Step 1: Trocar o dispatch**

Linha 1076, trocar:
```rust
        "read_url" => outcome(read_url(&string("url"), args.get("max_chars").and_then(Value::as_u64).unwrap_or(6000) as usize)),
```
por:
```rust
        "read_url" => {
            let max = args.get("max_chars").and_then(Value::as_u64).unwrap_or(6000) as usize;
            // Obscura roda o JavaScript da página; sem ele (ou se falhar), o download simples de sempre.
            outcome(super::obscura::read_page(app, &string("url"), max).or_else(|_| read_url(&string("url"), max)))
        }
```
(confira como `app` está disponível nesse `match`: as linhas vizinhas, como `changes::write_file(app, …)`, já usam `app`.)

- [ ] **Step 2: Descrição para o modelo**

Na definição `function("read_url", "Lê o texto principal de uma página (sem abrir o navegador).", …)`, trocar a descrição por:
```rust
"Lê o texto principal de uma página, inclusive sites que montam o conteúdo com JavaScript (sem abrir o navegador)."
```

- [ ] **Step 3: Compilar e testar**

Run: `cd src-tauri && cargo test` e `npx vitest run`
Expected: tudo passa.

- [ ] **Step 4: Verificação manual no app real**

1. `npm run build:app` → publicar o exe (ver `docs/superpowers/plans/2026-09-26-agentes-do-sistema-visiveis.md`, Task 7, Steps 1–2).
2. Configurações → Ferramentas de IA → Open source → instalar **Obscura (browser do agente)**.
3. No editor de nodes, montar: `Iniciar manualmente` → `Ler página` (url `https://react.dev`) → Executar. Esperado: o painel de execução mostra texto do site (que depende de JavaScript). Com o download simples de hoje, sites assim vêm quase vazios.
4. Desinstalar o Obscura (ou renomear a pasta `tools\obscura`) e rodar de novo → continua funcionando pelo plano B.

- [ ] **Step 5: Commit + ROADMAP**

Em `docs/ROADMAP.md` §12, marcar `[x]` em "Avaliar o repositório" (com a nota: "Apache-2.0, binário Windows v0.2.3, sem janela, CDP; vídeo pode não tocar") e em "Ligar o agente…" com a nota "(fase 1: read_url e node Ler página; pesquisa e tela Browser na fase 2)".
```bash
git add src-tauri/src/agent.rs docs/ROADMAP.md
git commit -m "feat: agente lê páginas com o Obscura (plano B: download simples)"
```

---

## Fase 2 (plano próprio, escrever depois da fase 1)

- **Tela Browser**: a área "Browser" já existe no app (`ViewKind "browser"`), mas está vazia. Ideia: rodar `obscura serve --port <livre>` ao abrir a área, conectar por CDP (`Page.startScreencast`) e mostrar os quadros ao vivo. Com isso o usuário vê o agente navegando dentro do app, e a navegação vira um nó no Node Editor (ROADMAP §11).
- **Pesquisa**: `web_search` pelo Obscura quando o DuckDuckGo HTML bloquear a consulta.
- **Playwright MCP apontando para o Obscura** (`connectOverCDP`) no lugar do Chromium.
