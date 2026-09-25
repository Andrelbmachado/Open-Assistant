# Arquitetura do Open Assistant

Front React (WebView2) ⇄ `invoke`/eventos do Tauri ⇄ backend Rust ⇄ processos locais (Ollama, bitnet.cpp,
PowerShell, servidores MCP) e APIs do Windows (UI Automation, SendInput, captura de tela).

## Fluxos principais

### Antes de qualquer modelo: ação rápida e memória
`ChatView.send` primeiro:
1. **Memória** — `memory.detectMemory` lê pedidos como "não use emojis" / "me chame de Dé" / "lembre que…" (regex, sem
   modelo) e grava em `state.memory`; `memory.memoryPrompt` vira um bloco somado ao prompt de sistema do chat comum,
   da nuvem e do agente. Configurações › Memória edita tudo (nome, apelido, estilos, fatos).
2. **Calculadora** — `calc.parseCalculation` resolve contas básicas ("quanto é 12 x 8", "15% de 200", "raiz de 81")
   com avaliador próprio e mostra o `CalculatorCard` na resposta (rodapé "Calculadora do app · sem tokens").
3. **Ação rápida** — `agentRunner.matchAction`: `agent_route` (alias exato do
   `intents.yaml`) e depois `agent_semantic` (`semantic.rs`: vetores de trigramas na CPU sobre intents sem parâmetro,
   `memoria/apps.yaml`, apps do menu Iniciar em cache e sites comuns). ≥ 0,82 executa direto (`runCatalogAction`, mesma
   política do agente, rodapé "Ação rápida · sem tokens"); 0,65–0,82 vira sugestão. Se não reconheceu mas
   `pcIntent.looksLikePcAction` diz que é ação no PC (ou houve sugestão), o **agente assume sozinho**.
4. **Conversa** — `askAI` com `allowComputerControl`: no Ollama o modelo recebe a ferramenta única `controlar_computador`
   (nuvem/BitNet: marcador `[[CONTROLAR_PC]]`); se ele pedir, a mesma mensagem vira uma tarefa do agente. Não há botão:
   a IA decide quando precisa controlar o PC. O agente usa o modelo do Ollama do chat (ou o local preferido).
5. **"/skill" e "@conector"** escolhidos no compositor (`composerMentions.findMention`, `list_skills`, `mcp_overview`)
   mandam a mensagem para o agente; com "@", só as ferramentas daquele conector vão para o modelo.

### Chat normal
`ChatView.send` → `aiService.askAI` → `invoke("ollama_chat")` → `lib.rs::run_chat` faz `POST /api/chat` (stream) →
cada lote de tokens vira o evento **`ollama-chat-delta`** `{requestId, content, thinking}` → a mensagem é atualizada.
Parar: `ollama_cancel_chat(requestId)`. BitNet: mesmo caminho com `bitnet_chat` (servidor bitnet.cpp em 127.0.0.1:18090).
Imagens anexadas vão em `messages[].images` (base64); modelo sem visão recebe erro claro (só se a *última* mensagem tiver imagem).

### Agente que controla o PC
```
ChatView (agentMode) → agentRunner.runAgent
   ├─ agent_route(texto) ── alias do intents.yaml? ── sim → agent_tool("run_intent") → dispatch.ps1 → fim (sem modelo)
   └─ não → agent_prepare()  (SKILL.md + resumo de intents + preferências + ferramentas nativas + MCP)
            loop (≤ 24 turnos):
              ollama_chat(messages, options.tools, numCtx 16384) → toolCalls?
                não → resposta final
                sim → para cada chamada: agent_tool(nome, args, acesso, confirmed=false)
                        ├─ política no Rust (agent::decide): allow | confirm | deny
                        ├─ needs_confirm → cartão "Permitir / Permitir nesta tarefa / Negar" → agent_tool(..., true)
                        └─ resultado vira mensagem role "tool"; print (look) vira mensagem "user" com images
              só o print mais recente fica no histórico (keepLatestImage)
   └─ agent_finish() esconde o cursor próprio
```
Ferramentas nativas (`agent::tool_definitions`): `run_intent`, `run_command`, `look`, `click`, `type_text`, `press_keys`,
`scroll`, `focus_window`, `web_search`, `read_url`, `read_skill_file`, `ask_user`. MCP: até 12 ferramentas no total vão
direto como `mcp__<servidor>__<ferramenta>`; acima disso só `mcp_tools {server}` (lista compacta) e `mcp_call {server, tool,
arguments}` — com 9 conectores eram centenas de ferramentas no prompt e o 9B se perdia.

**Política** (`agent::decide`): leitura (`look`, `web_search`, `read_url`, `read_skill_file`) sempre liberada;
intents seguem o risco do catálogo; `run_command` bloqueia padrões perigosos (formatar, `iex`, `.ssh`, HKLM…) em qualquer modo
e pede confirmação para destrutivos (apagar, instalar, matar processo, git push…) mesmo no Automático; mouse/teclado/MCP
pedem confirmação em "Perguntar" e são negados em "Somente leitura". Fail-safe: mouse no canto superior esquerdo interrompe.

**Tela** (`computer.rs`): janela alvo = primeiro plano (ou a mais alta, se o primeiro plano for o próprio app), filtrando
overlays. `look elements` = lista numerada via UI Automation (cache em uma chamada); `look both` = print reduzido a 1280 px
com os números desenhados (Set-of-Mark). `click` aceita número do elemento ou pixel do último print. O cursor próprio é a
janela `agent-cursor` (transparente, ignora o mouse, fora dos prints) que recebe o evento **`agent-cursor`**.

### Voz
`VoiceCapture` (getUserMedia, 16 kHz, `Endpointer` detecta fim da fala) → `asr_transcribe` (corpo binário Float32,
cabeçalhos `x-model`, `x-sample-rate`, `x-language`) → `speech.rs` (sherpa-onnx, modelo mantido em memória) → texto →
`send({ speakAfter: true })` → resposta falada por `SpeechController.speak` (Windows ou `tts_synthesize` Piper, frase a frase).

### Ferramentas baixáveis
`toolsStore.installTool(id)` → `tool_install(id)` → receita fixa em `tools.rs` (download com progresso, `tar`, `uv pip`,
build do bitnet.cpp) → evento **`tool-progress`** `{toolId, state, phase, completedBytes, totalBytes, bytesPerSecond}`.
Tudo em `%LOCALAPPDATA%\com.openassistant.windows\tools\<id>` com marcador `.installed`.

### Conectores MCP
`mcp.json` (formato Claude Desktop) → `mcp::ensure_started` (no `agent_prepare`, 4 s depois de abrir o chat via
`warmAgent`, ou "Iniciar ligados") inicia **em paralelo** cada servidor com `cmd /c <command> <args>`, faz `initialize` +
`tools/list` e espera no máximo 15 s; os lentos continuam em segundo plano (`pendingConnectors` faz o front preparar de novo
na próxima tarefa) → ferramentas entram no agente → `tools/call` no `agent_tool`.

## Comandos Tauri
| Módulo | Comandos |
|---|---|
| lib.rs | `spawn_terminal_session`, `write_terminal_session`, `terminate_terminal_session`, `save_credential`, `read_credential`, `delete_credential`, `has_credential`, `check_local_runtime_status`, `start_runtime`, `scan_hardware`, `install_ollama`, `cancel_local_model_operation`, `ollama_list_models`, `ollama_pull_model`, `ollama_stop_pull`, `ollama_chat`, `ollama_cancel_chat`, `bitnet_chat`, `cloud_chat`, `app_ready` |
| tools.rs | `tools_status`, `tool_install`, `tool_cancel`, `tool_remove` |
| speech.rs | `asr_transcribe`, `tts_synthesize` |
| agent.rs | `agent_prepare`, `agent_route`, `agent_tool`, `agent_finish`, `list_skills` |
| semantic.rs | `agent_semantic` (executar / sugerir / nada) |
| mcp.rs | `mcp_overview`, `mcp_save_config`, `mcp_start`, `mcp_stop` |

## Eventos
| Evento | Origem | Carga |
|---|---|---|
| `ollama-chat-delta` | `run_chat`, `bitnet::run_chat` | `{requestId, content, thinking, thinkingTokens}` |
| `ollama-pull-progress` | download de modelo | `PullProgress` |
| `tool-progress` | `tools.rs` | `ToolProgress` |
| `agent-cursor` | `computer.rs` → janela `agent-cursor` | `{x, y, action, label, visible}` |
| `terminal-output` / `terminal-exit` | terminal integrado | `{sessionId, data, stream}` |

## Dados em disco
`%LOCALAPPDATA%\com.openassistant.windows\`: `EBWebView` (localStorage do app), `tools\` (ferramentas baixadas),
`skills\controle-do-windows\` (skill editável; `memoria\` nunca é sobrescrita; `logs\acoes.jsonl` registra cada ação;
`cache\startapps.json` = apps do menu Iniciar, renovado a cada 24 h), `mcp.json`. A memória do usuário fica em
`memoria-da-ia.md` (Markdown editável; lido ao abrir e ao voltar para a janela, gravado a cada mudança — `store/memoryFile.ts`).
Skills extras (ex.: `skills\abrir-programas\SKILL.md`) ficam ao lado de `controle-do-windows` e entram no prompt com "/nome". Chaves de nuvem: Gerenciador de Credenciais do Windows (Google/Gemini usa o
endpoint compatível com OpenAI em `generativelanguage.googleapis.com/v1beta/openai`).
