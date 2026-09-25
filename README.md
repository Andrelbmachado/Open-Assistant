# Open Assistant para Windows

Aplicativo desktop nativo para Windows construído com Tauri 2, Rust, React e TypeScript. A interface usa o sistema visual Liquidglass Flat, otimizado para WebView2 e inspirado no Fluent Design do Windows 11.

## Como Executar no seu Windows

Você pode iniciar o Open Assistant de três formas simples:

### 1. Iniciar com 1 Clique (Atalho .bat)
- Dê um duplo clique no arquivo [`iniciar-open-assistant.bat`](file:///c:/Users/andre/iCloudDrive/Documents/Trabalho/Open%20assistant%20windows/iniciar-open-assistant.bat) para abrir em modo interativo.
- Ou dê um duplo clique no arquivo [`abrir-versao-producao.bat`](file:///c:/Users/andre/iCloudDrive/Documents/Trabalho/Open%20assistant%20windows/abrir-versao-producao.bat) para abrir o binário nativo compilado.

### 2. Pelo Terminal (PowerShell ou CMD)
```powershell
npm start
```
*(ou `npm run tauri dev`)*

### 3. Executável e Instaladores Oficiais Gerados
- **Executável portátil:** `npm run build:app` gera `src-tauri/target/release/open-assistant.exe` (versão normal; `npm run build:qa` gera a versão QA simulada)
- **Instalador NSIS:** `src-tauri/target/release/bundle/nsis/Open Assistant_0.1.0_x64-setup.exe`
- **Instalador MSI:** `src-tauri/target/release/bundle/msi/Open Assistant_0.1.0_x64_en-US.msi`

---

## Funcionalidades e Recursos

- **Janela Windows Nativa:** Sem moldura padrão, com sombra, controles nativos minimização/maximização/fechamento e região de arraste suave.
- **Chat com Inteligência Artificial Real:**
  - Modelos locais via **Ollama** (`127.0.0.1:11434`). Todas as chamadas passam pelo backend Rust — a WebView do Windows (`http://tauri.localhost`) é bloqueada pelo CORS do Ollama.
  - Seletor do chat em três grupos: **Instalados** (lidos de `/api/tags`, nome exato), **Disponíveis para este PC** e **Incompatíveis** (escuros, com o motivo no hover).
  - **Configurações › Modelos locais**: card por modelo com tamanho, bytes baixados, MB/s, tempo restante e barra; Pausar/Retomar/Cancelar; **Usar modelo** abre o chat com `Ollama: <id>`.
  - Respostas em streaming com origem `Ollama (<modelo>)` e tok/s reais (`eval_count / eval_duration`); botão Parar; Esforço Alto ativa o raciocínio em modelos compatíveis.
  - Sem fallback: com o Ollama desligado o chat mostra o erro e o botão **Iniciar Ollama**.
  - Chaves de provedores em nuvem ficam no **Gerenciador de Credenciais do Windows**, mas nesta versão o chat usa somente modelos locais.
  - **Anexos no chat**: fotos e prints vão para modelos com visão (Qwen3.5, Gemma 3, Llama 3.2 Vision); arquivos de texto/código (até 200 KB) entram no prompt.
  - **Microsoft BitNet b1.58 2B4T** no seletor de modelos (bitnet.cpp compilado no PC, servidor em `127.0.0.1:18090`, encerrado junto com o app).
- **Modo voz local** (Configurações › Voz):
  - O `webkitSpeechRecognition` do WebView2 sempre falha com `network` (depende de um serviço em nuvem que o WebView2 não tem) — era o "microfone desconectado". O áudio agora é capturado com `getUserMedia` e transcrito no Rust pelo **sherpa-onnx + Microsoft ONNX Runtime**.
  - Reconhecimento: NVIDIA NeMo FastConformer PT (recomendado), NVIDIA Parakeet TDT 0.6B v3, OpenAI Whisper small/turbo/large-v3. Síntese: vozes Piper pt-BR ou a voz do Windows.
  - Escolha de microfone e botão **Testar microfone** (grava, detecta o fim da fala e mostra a transcrição).
  - A DLL do sherpa-onnx é *delay-loaded*: o exe abre sem ela; a runtime é baixada junto com o primeiro modelo de voz.
- **Ferramentas de IA** (Configurações › Ferramentas de IA), agrupadas por empresa (NVIDIA, Microsoft, Meta, Google, OpenAI, Open source) e filtráveis por tipo. Cada item tem receita fixa em `src-tauri/src/tools.rs` (a interface só envia o id): download com progresso, ambientes Python isolados via `uv` (NeMo, NeMo Guardrails, WhisperLive, AutoGen, Florence-2, MMS) e modelos do Ollama (Phi-4, Llama 3.2 Vision, Gemma 3). Seamless, LLaMA-Omni e TensorRT-LLM aparecem como indisponíveis no Windows, com o motivo. Tudo fica em `%LOCALAPPDATA%\com.openassistant.windows\tools`.
- **Workspace Flexível com Painéis Divididos:**
  - Layout dinâmico estilo Blender com divisão horizontal e vertical, arraste e redimensionamento.
  - Suporte a alternância entre Chat, Workflow Nodes, Terminal, Agentes, Arquivos de Código e Painel de Controle (Dashboard).
- **Canvas de Workflows de Agentes:**
  - Nós visuais conectáveis (Entrada, Agente, Ferramenta, Saída), frames agrupadores, zoom e pan fluidos.
- **Terminal Integrado Windows:**
  - Sessões reais em **PowerShell** ou **Command Prompt (CMD)** com leitura de stream contínua em tempo real (UTF-8).
- **Painel de Configurações:**
  - Gerenciamento de credenciais locais.
  - Verificação de status e inicialização de runtimes (Ollama e OpenClaw).
  - Temas Claro, Escuro e do Sistema, com cores de destaque personalizáveis.

---

## Estrutura do Projeto

- `src/`: Código da interface em React, TypeScript e CSS (Liquidglass Flat).
- `src-tauri/`: Backend nativo em Rust (Tauri 2, processos de terminal, chamadas ao SO e credenciais).
- `macos-archive/`: Projeto original em SwiftUI preservado para referência e histórico.
