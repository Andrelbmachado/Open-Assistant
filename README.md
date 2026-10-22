# Open Assistant

**Seu assistente pessoal de IA para o Windows: conversa, ouve, fala e mexe no computador por você — rodando no seu PC ou com a sua chave de API.**

O Open Assistant é um assistente generalista e gratuito. Ele usa modelos locais (Ollama, BitNet) e voz offline por padrão, aceita provedores em nuvem quando você quiser, e tem um **agente que controla o PC de verdade**: abre programas, clica, digita, roda comandos e usa conectores MCP — sempre com permissões que você controla.

Ele também é a base do **[Design-Master](https://github.com/Andrelbmachado/Design-Master)**, um Open Assistant especializado em design (planejado).

> **Estado:** em desenvolvimento ativo, versão `0.1.0`, só para **Windows 10/11 x64**. Itens marcados como **planejado** ainda não existem no código.

---

## O que ele já faz

| | Recurso | Onde está no código |
|---|---|---|
| 💬 | **Chat com IA local** (Ollama, BitNet b1.58) com streaming, tokens/s reais, anexos de imagem e texto | `src/utils/aiService.ts`, `src-tauri/src/lib.rs`, `bitnet.rs` |
| ☁️ | **Chat com IA em nuvem** usando sua chave (OpenAI, Anthropic, Google Gemini, DeepSeek, Perplexity, Together, Fireworks e endpoints compatíveis). A chave fica no Gerenciador de Credenciais do Windows e nunca sai do Rust. ⚠️ Ainda não testado com chaves reais | `src-tauri/src/cloud.rs`, `src/utils/cloudModels.ts` |
| 🖱️ | **Agente que controla o PC**: ações prontas sem gastar tokens (abrir apps/sites, volume, rede, arquivos), UI Automation, prints numerados, mouse e teclado, PowerShell/cmd | `src-tauri/src/agent.rs`, `computer.rs`, `semantic.rs` |
| 🎙️ | **Voz 100% local**: reconhecimento (NeMo FastConformer PT, Parakeet, Whisper) e síntese (Piper pt-BR ou voz do Windows) | `src-tauri/src/speech.rs` |
| 🧠 | **Memória de preferências**: "não use emojis", "me chame de…" valem em todas as conversas; editável em Configurações › Memória | `src/utils/memory.ts`, `memoryFile.ts` |
| 🔌 | **Conectores MCP** no formato do Claude Desktop (Playwright, Windows-MCP, Fetch…), com `/skills` e `@conectores` no chat | `src-tauri/src/mcp.rs` |
| 🖼️ | **Geração de imagem local** (stable-diffusion.cpp CUDA: FLUX, SD, Qwen-Image…) | `src-tauri/src/imagegen.rs` |
| 🌐 | **Remoto**: pareia computadores por código de 6 dígitos para usar a GPU de outro PC no chat e mandar tarefas ao agente dele; atualizações assinadas | `src-tauri/src/network/` |
| 🧩 | **Agentes e workflows visíveis**: editor de nós, fluxos do sistema acendendo ao vivo, "Sonhos" que propõe skills novas | `WorkflowCanvas.tsx`, `AgentsView.tsx`, `workflow.rs` |
| 🧰 | **Mais**: browser próprio (Obscura), terminal PowerShell/CMD, painel do Windows (CPU/RAM/GPU), Arquivos, Marketplace, desfazer edições do agente | `obscura.rs`, `TerminalView.tsx`, `DashboardView.tsx`, `changes.rs` |

### Segurança do agente
- Três níveis de acesso no compositor: **Somente leitura**, **Perguntar** e **Acesso total**.
- A política (permitir / confirmar / negar) é decidida no Rust (`agent::decide`), não na interface.
- Comandos perigosos são bloqueados; destrutivos sempre pedem confirmação.
- **Freio de emergência:** leve o mouse ao canto superior esquerdo da tela para interromper o agente.

---

## Começando

### Pré-requisitos
- Windows 10/11 x64 com WebView2
- [Node.js](https://nodejs.org/) 20+ e [Rust](https://rustup.rs/) (toolchain MSVC)
- [Ollama](https://ollama.com/) para modelos locais (o app tem o botão **Iniciar Ollama**)
- Opcional: placa NVIDIA para geração de imagem e modelos maiores

### Rodar
```powershell
git clone https://github.com/Andrelbmachado/Open-Assistant.git
cd Open-Assistant
npm install
npm start          # tauri dev, com hot reload
```
Atalhos na raiz: `iniciar-open-assistant.bat` (modo dev) e `abrir-versao-producao.bat` (exe já compilado).

Na primeira abertura: **Configurações › Modelos locais** para baixar um modelo (ex.: `qwen3.5:9b`), e **Configurações › Voz** para baixar o reconhecimento de fala.

### Gerar o executável
| Comando | Resultado |
|---|---|
| `npm run build:app` | `src-tauri/target/release/open-assistant.exe` (portátil) |
| `npm run build:installer` | Instalador NSIS em `src-tauri/target/release/bundle/nsis/` |
| `npm run build:qa` | Versão QA offline (sem Ollama real) |

### Testes
```powershell
npx tsc --noEmit
npx vitest run
cd src-tauri; cargo test --lib
```

---

## Status e roadmap

| Área | Status |
|---|---|
| App Windows (Tauri 2 + Rust + React 19) | ✅ existe |
| Chat local (Ollama, BitNet), anexos, voz local | ✅ existe |
| Agente que controla o PC + skills + MCP | ✅ existe |
| Chat em nuvem com chave de API | 🟡 existe, falta testar com chaves reais |
| Memória de preferências | ✅ existe |
| Memória de longo prazo / RAG sobre seus documentos | ⏳ **planejado** |
| Testes contra prompt injection e suíte de evals | ⏳ **planejado** |
| CI no GitHub Actions | ⏳ **planejado** |
| Licença open source (arquivo `LICENSE`) | ⏳ **planejado** — ainda não há licença no repositório |
| macOS / Linux (Tauri) | ⏳ **planejado** — `macos-archive/` é só o protótipo SwiftUI antigo |
| Assistentes especializados (Design-Master) | ⏳ **planejado** |

Plano por fases, com critérios de pronto: **[PLANO.md](PLANO.md)** · Histórico detalhado: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## Estrutura

```
src/            Interface (React + TypeScript); lógica pura em src/utils com testes ao lado
src-tauri/      Backend em Rust: agente, voz, MCP, nuvem, rede, geração de imagem
  skills/       Skills do agente (controle-do-windows, abrir-programas, …)
docs/           Arquitetura, roadmap, specs e planos
macos-archive/  Protótipo SwiftUI original (só referência)
```

## Contribuindo (pessoas e IAs)
- **[AGENTS.md](AGENTS.md)** — mapa do projeto, comandos, convenções e armadilhas conhecidas. Leia antes de mudar código.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — fluxo de dados, eventos e comandos Tauri.
- **[DESIGN.md](DESIGN.md)** — cores, fontes e componentes da interface.
- Interface e comentários em **português do Brasil**; nomes no código em inglês.
