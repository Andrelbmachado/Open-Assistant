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
- **Executável portátil:** `src-tauri/target/release/open-assistant.exe`
- **Instalador NSIS:** `src-tauri/target/release/bundle/nsis/Open Assistant_0.1.0_x64-setup.exe`
- **Instalador MSI:** `src-tauri/target/release/bundle/msi/Open Assistant_0.1.0_x64_en-US.msi`

---

## Funcionalidades e Recursos

- **Janela Windows Nativa:** Sem moldura padrão, com sombra, controles nativos minimização/maximização/fechamento e região de arraste suave.
- **Chat com Inteligência Artificial Real:**
  - Suporte a modelos locais via **Ollama** (com auto-detecção em `%LOCALAPPDATA%\Programs\Ollama` e botão de **Iniciar** com 1 clique nas Configurações).
  - Suporte a provedores em nuvem (OpenAI, Claude, DeepSeek, Together, Groq) com chaves criptografadas no **Gerenciador de Credenciais do Windows**.
  - Fallback local inteligente para orientações, formatação de código e comandos de terminal.
  - Reconhecimento e síntese de voz nativos via APIs do WebView2 (ditado e áudio).
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
