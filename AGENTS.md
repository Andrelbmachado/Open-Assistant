# AGENTS.md — guia para IAs (Claude, Codex, Cursor…) editarem o Open Assistant

Leia isto antes de mudar código. Arquitetura detalhada: `docs/ARCHITECTURE.md`. O que falta fazer: `docs/ROADMAP.md`.
Padrões visuais (cores, fontes, componentes): `DESIGN.md` — siga-o e atualize-o ao mudar a interface.

## O que é
Assistente pessoal desktop para Windows: **Tauri 2 (Rust) + React 19 + TypeScript + Vite**. Roda IA local
(Ollama, BitNet), voz local (sherpa-onnx), e um **agente que controla o PC** (skill `controle-do-windows`,
UI Automation, mouse/teclado, PowerShell, conectores MCP). Interface e comentários em **português do Brasil**.

## Comandos
| Tarefa | Comando (na raiz) |
|---|---|
| Testes do front (vitest) | `npx vitest run` |
| Tipos | `npx tsc --noEmit` |
| Testes do Rust | `cd src-tauri && cargo test --lib` |
| App normal (exe) | `npm run build:app` → `src-tauri/target/release/open-assistant.exe` |
| Dev com hot reload | `npm start` (`tauri dev`) |
| Build QA offline (sem Ollama real) | `npm run build:qa` |

Antes de entregar: `npx tsc --noEmit && npx vitest run && (cd src-tauri && cargo test --lib)`.

## Mapa do projeto
```
src/                         Front (React)
  main.tsx                   Entrada; "#agent-cursor" renderiza só o cursor do agente
  App.tsx                    Moldura: TitleBar + Sidebar + Workspace + Settings + Palette
  store/
    store.tsx                Estado global (reducer): chats, layout, tema, voz, agente, permissões
    localModelsStore.ts      Ollama: modelos instalados, hardware, downloads (useSyncExternalStore)
    toolsStore.ts            Ferramentas de IA baixáveis: instalado/progresso (evento tool-progress)
    memoryFile.ts            Sincroniza a memória com %LOCALAPPDATA%\com.openassistant.windows\memoria-da-ia.md
  components/
    ChatView.tsx             Chat: mensagens, compositor, voz, anexos, modo agente, confirmações
    SettingsView.tsx         Modal de Configurações (abas)
    ToolsPanel.tsx           Aba "Ferramentas de IA" (por empresa)
    VoiceSettings.tsx        Aba "Voz" (microfone, reconhecimento, voz)
    McpPanel.tsx             Aba "Conectores MCP"
    MemorySettings.tsx       Aba "Memória" (nome, apelido, estilo, fatos aprendidos; abre memoria-da-ia.md)
    CalculatorCard.tsx       Calculadora do app dentro da resposta
    LocalModelsPanel.tsx     Aba "Modelos locais" (Ollama)
    AgentCursor.tsx          Cursor próprio do agente (janela transparente)
    ThinkingIndicator.tsx    Indicador "pensando" (Pac-Man) e resumo do raciocínio
    Sidebar.tsx / TitleBar.tsx / Workspace.tsx   Navegação e painéis divisíveis
    RobotFace, SuperOrbital, OrbitalCanvas, ShaderCanvas, AssistantFace, FacePreview   Rosto do modo voz
    WorkflowCanvas.tsx / TerminalView.tsx / CommandPalette.tsx / EffortControl.tsx / ProviderSelect.tsx
  utils/                     Lógica pura (quase tudo com *.test.ts ao lado)
    agentRunner.ts           Loop do agente (rota rápida/semântica → Ollama com tools → agent_tool); matchAction, runCatalogAction
    aiService.ts             Chat normal com Ollama/BitNet/nuvem (streaming por evento); prompt diz que o app controla o PC
    memory.ts                Memória do usuário: detectMemory ("não use emojis"), memoryPrompt (bloco do prompt)
    pcIntent.ts              looksLikePcAction: pedido claro de ação no PC → o agente assume sozinho
    calc.ts                  Contas básicas sem modelo (CalculatorCard mostra na resposta)
    composerMentions.ts      "/" skills e "@" conectores no compositor
    connectionStatus.ts      Linha/ponto sob o ícone de computador na barra lateral (verde = IA funcionando)
    cloudModels.ts           Provedores em nuvem (OpenAI, Anthropic, Google/Gemini…), modelos por provedor
    localCatalog.ts          Catálogo de modelos + compatibilidade com o hardware + prefixos "Ollama: "/"BitNet: "
    toolCatalog.ts           Ferramentas de IA por empresa (ids = receitas do tools.rs)
    mcpPresets.ts            Conectores MCP sugeridos
    SpeechController.ts      Síntese (Windows ou Piper) e transcrição (sherpa-onnx)
    voiceCapture.ts / endpointer.ts   Microfone + detecção de início/fim de fala
    speechText.ts            Limpa Markdown para leitura em voz alta
    messageMeta.ts           Nome do modelo, rodapé "modelo · tokens · tok/s"
    effort.ts, aiMeter.ts, composerState.ts, inlineMarkdown.ts, orbitalState.ts, robotExpression.ts,
    workspaceLayout.ts, providers.ts, qaMode.ts, localModels.ts, localOperation.ts
  components/AgentCursor.tsx  Robô-mouse do agente (aponta com o dedo, aperta, pega com as mãos); RobotAvatar/RobotHands
  components/ImageGenerationCard.tsx + SnakeGame.tsx  Imagem no chat: prévia com brilho girando e jogo da cobrinha
  components/StoragePanel.tsx  Barra do disco dos modelos e "Mover para outro disco"
  components/PageHeader.tsx + Dropdown.tsx   Cabeçalho padrão das telas e lista suspensa do app (troque todo <select> por Dropdown)
  components/FilesView.tsx   Tela Arquivos: árvore da pasta do projeto igual ao Explorer do VS Code (+ "Dados do app")
  components/DashboardView.tsx  Painel de controle do Windows: CPU/RAM/memória reservada/GPU/disco, quem ocupa memória, atalhos
  components/MarketplaceView.tsx  Skills, conectores MCP, modelos de texto e de imagem com estado real e instalar
  components/AgentsView.tsx  Agentes (cartões)
  components/LogsPanel.tsx   Configurações › Logs (o agente lê o mesmo arquivo com a ferramenta read_logs)
  components/FileChangesCard.tsx  Cartão "Editou N arquivos · Desfazer · +X −Y" no fim da resposta do agente
  utils/useDismiss.ts        Fecha menus/popovers ao clicar fora (pointerdown na captura) ou Esc — use em todo menu novo
  utils/activity.ts          Texto do indicador enquanto a IA trabalha (ferramenta → "Navegando na internet"…)
  utils/appLog.ts            appLog(nível, origem, texto) → logs do app; erros globais da interface já vão sozinhos
  utils/fileChanges.ts / chatShare.ts / fileIcons.ts   Diff do cartão, exportar conversa (.md), ícones por extensão
  utils/imageCatalog.ts      Modelos de imagem (UI) + detecção de "gere uma imagem de…"
src-tauri/src/imagegen.rs    Geração de imagem: stable-diffusion.cpp CUDA (FLUX, SD, Qwen-Image, Z-Image, PixArt) e diffusers
src-tauri/src/storage.rs     Discos, pasta de modelos do Ollama/app e troca de disco (OLLAMA_MODELS, tools-location.txt)
  *.css                      Ordem de carga em main.tsx: neutral → blender → workspace-fixes → refined → refresh → polish
                             (polish.css é a última e vence: padrão das telas, Dropdown, menus, editor de nodes, Arquivos,
                             Logs, barra lateral, halo da imagem, cobrinha; mudanças novas vão nela, em seções comentadas)

src-tauri/                   Backend (Rust)
  src/lib.rs                 Comandos Tauri gerais: terminal, credenciais, Ollama (chat/pull/tags), hardware, runtimes
  src/agent.rs               Agente: skill empacotada, roteador de intents, política allow/confirm/deny, execução, list_skills
  src/semantic.rs            Ação rápida sem modelo: vetores de trigramas (CPU) de intents, apps, apps do menu Iniciar e sites
  src/cloud.rs               Chat com modelos em nuvem (compatível OpenAI, Anthropic, Gemini); a chave nunca sai do Rust
  src/computer.rs            Tela: UI Automation, prints Set-of-Mark, mouse/teclado (enigo), janelas, cursor próprio
  src/mcp.rs                 Cliente MCP (stdio JSON-RPC), mcp.json no formato do Claude Desktop
  src/tools.rs               Downloads de ferramentas (receitas fixas por id), venvs Python via uv, build do BitNet
  src/speech.rs              Voz via sherpa-onnx (DLL baixada e carregada sob demanda)
  src/bitnet.rs              Servidor do bitnet.cpp + chat no formato nativo do BitNet
  src/logs.rs                Logs JSONL em %LOCALAPPDATA%\com.openassistant.windows\logs (logs::error/warn/info; panics entram)
  src/resources.rs           Memória do PC (RAM, reservada/"commit", GPU), quem ocupa, free_for antes de tarefa pesada,
                             explicação de "out of memory" com o culpado, reiniciar OneDrive (só por clique)
  src/files.rs               Árvore da tela Arquivos (fs_list/fs_read), marcas do git, escolher pasta (IFileOpenDialog)
  src/changes.rs             read_file/write_file/edit_file do agente + diff/desfazer por tarefa (pasta alteracoes)
  src/desktop.rs / workflow.rs   Robô que move arquivos/janelas (mouse virtual) / nodes do editor e nuvem (rclone)
  src/choreo.rs              Coreografia de carregar (agachar, esticar, pegar, virar, flutuar, soltar) com tempos
                             fixos; tabela para a IA em skills/mover-arquivos-e-janelas/movimento_robo.md (mantenha iguais)
  skills/controle-do-windows/   Skill do agente (SKILL.md, intents.yaml, dispatch.ps1, catálogo, referências)
  skills/abrir-programas/       Skill "/abrir-programas": exemplos reais de abrir programas, sites e vídeos do YouTube
  build.rs                   /DELAYLOAD das DLLs de voz
  capabilities/default.json  Permissões das janelas "main" e "agent-cursor"
```

## Convenções
- **Nomes autoexplicativos** em inglês no código (`resolveAsrModel`, `ensure_target_focus`); textos da interface e comentários em pt-BR.
- Todo módulo começa com um comentário dizendo o que faz; funções exportadas têm doc comment (`///` no Rust, `/** */` no TS)
  explicando o **porquê** quando não é óbvio.
- Lógica sem React vai para `src/utils/*.ts` com teste ao lado. Componentes só orquestram.
- Estado global: `store.tsx` (ação nova = tipo em `Action` + `case` no reducer + restauração em `StoreProvider`).
- Estado de backend assíncrono (downloads, Ollama): store externa com `useSyncExternalStore` (`localModelsStore`, `toolsStore`).
- Rust: comandos lentos são `async` + `spawn_blocking` (comando síncrono roda na thread principal e trava a janela).
- Segurança: a interface nunca manda URL/comando para instalar — só ids; política do agente é decidida no Rust (`agent::decide`).

## Receitas
- **Novo comando Tauri**: função `#[tauri::command]` no módulo → registrar em `generate_handler!` (lib.rs) → `invoke("nome", { camelCase })` no front.
- **Nova ferramenta do agente**: definição em `agent::tool_definitions` + ramo em `agent::execute` + regra em `agent::decide` + rótulo em `describeToolCall` (agentRunner.ts) + teste.
- **Novo intent (ação pronta)**: `skills/controle-do-windows/intents.yaml` + linha no `catalogo/INDEX.md` + ramo no `scripts/dispatch.ps1`; suba `SKILL_VERSION` em agent.rs (regrava a cópia em AppData).
- **Nova ferramenta baixável**: receita em `tools.rs::RECIPES` + item em `toolCatalog.ts` (o teste `toolCatalog.test.ts` confere os ids).
- **Nova aba de Configurações**: tipo em `SettingsTab` (store.tsx) + botão/painel em `SettingsView.tsx`.

## Armadilhas conhecidas
- "out of memory" / "memory layout cannot be allocated" com a placa de vídeo vazia = memória **reservada** do Windows
  esgotada (outro programa segurando, ex.: OneDrive com 18 GB). Não é bug do app: `resources::explain_out_of_memory`
  diz quem é; o gerador de imagem já solta o Ollama/voz e tenta de novo no modo econômico.
- O app é de janela única (tauri-plugin-single-instance). Para E2E ao lado do app do usuário, rode a cópia com
  `OPEN_ASSISTANT_MULTI_INSTANCE=1`.
- O Ollama recusa a origem `http://tauri.localhost` (403): **toda** chamada ao Ollama passa pelo Rust (`ollama_*`).
- `webkitSpeechRecognition` do WebView2 sempre falha com `network`: voz é local (sherpa-onnx). Não volte para ele.
- sherpa-onnx é *delay-loaded*: chame `speech::ensure_runtime` antes de qualquer função do crate, senão o processo cai.
- xcap: `Window::z()` maior = mais ao topo. A janela alvo do agente ignora o próprio app e overlays (`is_user_window`).
- O crate `regex` não tem retrorreferência (`\1`).
- Teclas do agente: se o foco está no próprio chat, `ensure_target_focus` traz a janela alvo antes de digitar.
- BitNet: commit do bitnet.cpp fixado (`BITNET_COMMIT`); versões novas degradam o texto do GGUF oficial.
- CSS: `.apple-composer-toolbar button` força 30 px de largura; botões com texto precisam de `width: auto`.
- Imagem: o build Vulkan do stable-diffusion.cpp dá "device lost" na RTX 5070; use o CUDA (receita `sd-cpp-cuda`). Antes de gerar, o app descarrega os modelos do Ollama da VRAM.
- CSS: nunca escreva `font-size: Npx`; use `calc(Npx * var(--fs-title|--fs-subtitle|--fs-body))` (escala de fontes em Aparência).

## Testar de ponta a ponta (exe real)
Copie o exe para uma pasta temporária e rode com
`WEBVIEW2_USER_DATA_FOLDER=<pasta>` e `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334`
(opcional: `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` para testar a voz).
Depois use o Chrome DevTools Protocol (`Runtime.evaluate`) para clicar na interface e chamar `window.__TAURI_INTERNALS__.invoke`.
