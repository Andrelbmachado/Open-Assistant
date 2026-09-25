# Roadmap — onde paramos e o que falta

> Lista viva para qualquer IA (Claude, Codex) ou pessoa retomar o trabalho.
> Marque `[x]` ao concluir e registre decisões importantes em "Notas".
> Branch de trabalho: `feat/agente-local` (remoto `origin`).

## 1. Voz, ferramentas e modelos (sessão 2026-09-24) — concluído
- [x] Corrigir "microfone desconectado" (webkitSpeechRecognition do WebView2 falha com `network`) → voz local sherpa-onnx
- [x] Configurações › Voz (microfone, teste, modelo de reconhecimento, voz)
- [x] Configurações › Ferramentas de IA agrupadas por empresa, com download/remoção
- [x] BitNet b1.58 no seletor de modelos (bitnet.cpp compilado localmente, commit fixado)
- [x] Phi-4, Llama 3.2 Vision, Gemma 3 no catálogo; imagens anexadas vão para modelos com visão
- [x] Corrigido: anexos nunca eram anexados (bug do `onChange` do input de arquivo)

## 2. Ajustes visuais (sessão 2026-09-25)
- [x] Indicador "pensando": Pac-Man de lado comendo 3 bolinhas que vêm em sua direção
- [x] Quina arredondada entre sidebar e topbar (canto interno do painel de conteúdo)
- [x] Ícone correto no botão "Novo Chat"
- [x] Área do usuário: nome ao lado da foto (alinhado à esquerda)
- [x] Trocar a bolinha verde por ícone de computador (local) ou nuvem (nuvem)
- [x] Nome do modelo no fim da resposta, ao lado dos tokens
- [x] Configurações: cards internos com o cinza do fundo (sem azul)
- [x] Ferramentas de IA: filtros como texto cinza sem fundo

## 3. Agente que controla o PC (skill "controle-do-windows")
- [x] Backend Rust `computer.rs`: print da tela (reduzido), elementos de UI (UI Automation) numerados, mouse, teclado, janelas, comandos cmd/PowerShell, busca web e leitura de páginas em texto compacto
- [x] Mouse próprio: janela transparente sempre no topo, fora dos prints, que anima até o alvo antes do clique
- [x] Ollama com tool calling (tools, tool_calls, mensagens `tool`, `num_ctx` maior)
- [x] Loop do agente no front (passos visíveis no chat, parar, limite de passos)
- [x] Permissões: Somente leitura / Perguntar / Automático + comandos perigosos sempre pedem confirmação + fail-safe (mouse no canto superior esquerdo aborta)
- [x] Skill `controle-do-windows` (SKILL.md + referências: comandos, Chrome, scripts, MCP) embutida no app e carregada no prompt do agente
- [x] Teste real: abrir Chrome → clicar na URL → digitar site → Enter → print → confirmar

## 4. Conectores MCP
- [x] Cliente MCP (stdio JSON-RPC) no Rust; `mcp.json` no formato do Claude Desktop
- [x] Configurações › Conectores MCP com presets de um clique
- [x] Ferramentas MCP expostas ao agente como `mcp__servidor__ferramenta`

## 5. Código "AI-ready"
- [x] `AGENTS.md` (+ `CLAUDE.md` apontando para ele): mapa do projeto, comandos, convenções
- [x] `docs/ARCHITECTURE.md`: fluxo de dados, eventos, comandos Tauri
- [x] Comentários de documentação nas funções exportadas e módulos principais

## 6. Entrega
- [x] Testes (vitest + cargo test) verdes, build `npm run build:app`
- [x] Exe copiado para `Desktop\Assistente pessoal\Open Assistant.exe` (antigo em `_versoes-anteriores`)
- [x] Commit + push de `feat/agente-local`

## 7. Ajustes visuais (rodada 2) — concluído
- [x] Pac-Man branco; robô sem quadrado (brilho some antes da borda do canvas) e prévia sem caixa
- [x] Esforço: só "Mais rápido / Mais inteligente", sem ícone de info, nível à direita
- [x] Acesso ao computador = um slider (mínimo Somente leitura, meio Perguntar, máximo Automático)
- [x] Modelos em nuvem no seletor (ChatGPT, Claude, DeepSeek, Perplexity, Together, Fireworks + customizados); sem chave → inativo e leva a Provedores com aviso; com chave → `cloud_chat` no Rust
- [x] Barra lateral: sem barra branca, "Novo Chat" não fica marcado, item ativo em azul-marinho
- [x] Botão de trocar tipo de área sem a caixa larga atrás
- [x] Conversas nomeadas pela 1ª pergunta (refinado pelo modelo local); conversa vazia abandonada é apagada

## 8. Pedidos do usuário (2026-09-25) — concluído na sessão 3
Resumo do que foi feito está em "Resultados verificados (sessão 3)" abaixo; o texto original de cada pedido ficou aqui.

- [x] **8.1 App diz que "não consegue abrir o PowerShell"** (bug relatado com print da resposta).
  Causa provável (não verificada): o botão **Controlar o PC** estava desligado; aí a mensagem vai para o chat
  comum (`askAI`), cujo prompt (`aiService.ts::SYSTEM_PROMPT`) não fala de ferramentas, e o modelo responde que é só texto.
  Fazer: (a) confirmar reproduzindo com o botão desligado/ligado; (b) rodar o roteador de intents (`agent_route`)
  também no chat comum — se a frase bate com um intent ("abre o powershell"), executar direto (respeitando o slider de
  acesso) ou sugerir ligar o modo; (c) quando o pedido parecer ação no PC e o modo estiver desligado, responder com um
  botão "Ligar Controlar o PC e executar"; (d) ajustar o SYSTEM_PROMPT do chat comum para não afirmar que não tem
  ferramentas e explicar o botão; (e) garantir alias "abre o powershell"/"abre o terminal" → `open_app` wt/powershell.
- [x] **8.2 Botão Copiar com confirmação**: ao copiar (resposta da IA e mensagem do usuário) o ícone vira ✓ por 3 s
  e volta a ser Copiar. Hoje só há Copiar nas respostas (`ChatView.tsx`, `.msg-tools`) e no bloco de código; adicionar
  também nas mensagens do usuário. Estado por mensagem (id copiado + timeout 3000 ms).
- [x] **8.3 Memória da IA** (ex.: "não use emojis" deve valer nas próximas conversas).
  Detectar pedidos de preferência ("não use…", "sempre…", "me chame de…", "lembre que…") e salvar como fatos curtos;
  injetar no prompt de sistema de TODAS as conversas (chat comum, agente e nuvem). Guardar no store (localStorage) ou
  em `skills/controle-do-windows/memoria/usuario.md` (já existe; hoje só o agente lê). Mostrar "Memória atualizada"
  discreto na resposta. Permitir apagar itens.
- [x] **8.4 Configurações › Memória** (memórias básicas): nome/como quer ser chamado, estilo de conversa (formal,
  direto, sem emojis…), idioma, fatos livres; lista das memórias aprendidas (8.3) com editar/apagar. Tudo entra no
  prompt de sistema automaticamente (`systemPromptFor` em aiService.ts + `agent_prepare` em agent.rs + cloud).
- [x] **8.5 Embeddings para pedidos comuns** (abrir programas e sites sem gastar tokens do modelo).
  Hoje o roteador (`agent.rs::route`) só casa alias exato. Adicionar camada semântica na CPU (desenho do pacote
  local-pc-agent: embed ≥ 0,82 executa; 0,65–0,82 o modelo escolhe entre 3; < 0,65 conversa). Opções: modelo de
  embedding do Ollama (`nomic-embed-text`/`bge-m3`, via Rust) ou ONNX no sherpa/ort. Vetorizar só id + descrição +
  aliases + exemplos do `intents.yaml` (cache em disco); incluir apps instalados (`Get-StartApps`) e sites comuns.
- [x] **8.6 "/" invoca skills e "@" invoca conectores MCP** no compositor: popover com autocomplete ao digitar `/`
  (skills: controle-do-windows e futuras) e `@` (conectores MCP ligados + apps). Item escolhido vira "chip" na mensagem
  e força o uso: `/skill` → carrega a skill no prompt e liga o modo agente para aquela mensagem; `@mcp` → expõe só as
  ferramentas daquele conector. Navegação por teclado (↑↓ Enter Esc).
- [x] **8.7 Indicador de conexão no ícone de computador** (rodapé da barra lateral, ao lado do perfil): linha fina
  com ponto verde abaixo do ícone quando a IA local está OK (Ollama online e modelo escolhido instalado — usar
  `useLocalModels().ollama === "online"`); cinza/vermelho quando offline, com tooltip explicando. Para modelo em nuvem:
  verde se há chave (`has_credential`).

- [x] **8.8 Seletor de modelos** mostra modelos com chave de API (vários por provedor); sem chave = uma linha inativa por provedor que leva a Provedores.
- [x] **8.9 Google Gemini** em Provedores (chave `AIza…`, botão "Criar chave no site"), modelos `gemini-2.5-flash` e `gemini-2.5-pro`.

## Resultados verificados (sessão 3, 2026-09-25)
- Causa do "não consigo abrir o PowerShell": com "Controlar o PC" desligado a mensagem ia para o chat comum. Agora
  "abre a calculadora" com o modo desligado abriu a calculadora pela ação rápida (0 tokens, rodapé "Ação rápida · sem tokens").
- Camada semântica (`semantic.rs`) com os apps reais do PC: "abre o word/excel/figma/paint/gerenciador de tarefas",
  "abre powershell" (sem "o"), "entra no youtube" → executa (score 0,95–1,00); "abre o spotifi" → sugestão (0,71);
  "como abrir o powershell?", "abre o chrome e pesquisa…", "spotify" sozinho → conversa normal.
- "clica no botão iniciar do windows" com o modo desligado → oferta "Ligar Controlar o PC e executar"; clicar liga o modo e o
  agente roda na mesma mensagem ("executa o comando Get-Date…" → "A data atual é: sexta-feira, 25 de setembro de 2026.").
- Memória: "não use emojis nas conversas e me chame de Dé…" → resposta "Oi, Dé.", selo "Memória atualizada", fatos em Configurações › Memória.
- Copiar: ✓ verde ao clicar (resposta, mensagem do usuário e bloco de código) e volta ao ícone depois de 3 s.
- "/" lista a skill `controle-do-windows`; "@" lista os 9 conectores do `mcp.json`; "@fetch resuma https://example.com" → `mcp__fetch__fetch` em 4 s.
- Indicador verde sob o ícone de computador (Ollama online + qwen3.5:9b instalado); amarelo verificando; vermelho com o motivo no tooltip.
- MCP: com 9 conectores a 1ª tarefa levava 132 s (início em série + um conector lento até o limite de 120 s) e o prompt
  tinha centenas de ferramentas (resposta sem sentido). Agora: início em paralelo, espera máx. 15 s (1ª tarefa em 18 s) e
  só `mcp_tools`/`mcp_call` quando passam de 12 ferramentas.
- Testes: 127 (vitest) + 51 (cargo).

## Próximos passos sugeridos (sessão 4)
- Testar Gemini/OpenAI/Anthropic com chave real (o código segue o formato oficial, mas não há chave salva para testar).
- Camada semântica com modelo de embedding de verdade (ex.: `embeddinggemma`/`nomic-embed-text` no Ollama, na CPU) como
  segunda opinião quando o trigrama der só "sugestão"; hoje os trigramas cobrem nomes e erros de digitação, não sinônimos.
- Memória: deixar o próprio modelo propor memórias ("quer que eu lembre disso?") além das frases fixas.
- "/" com mais skills (ex.: uma skill "construtor de apps") e "@" também para apps do menu Iniciar.
- (Feito) O intent `run_command` do catálogo não existia no `dispatch.ps1`: agora "executa o comando X" roda X pelo
  `run_command` (mesma política de bloqueio/confirmação) com o comando tirado do texto original.

## Resultados verificados (2026-09-25)
- Agente com qwen3.5:9b: "abre o chrome, clica na URL, digita g1.globo.com, enter e diz a manchete" → 4 passos, 11 s, manchete correta.
- Calculadora: abriu, clicou nos botões pelos elementos de UI Automation, visor confirmado "12 × 8 = 96".
- MCP: Fetch (uvx) iniciado pela interface em 13 s; `mcp__fetch__fetch` respondeu; modo Perguntar pede confirmação.
- Testes: 102 (vitest) + 43 (cargo) passando.

## Próximas etapas (depois desta sessão)
- Integrar NeMo Guardrails como filtro das ações do agente (hoje: lista de bloqueio própria)
- Orquestração multiagente com AutoGen (planejador → executor → verificador)
- Agente "construtor de apps": cria projeto, roda, tira print do app, compara com o pedido, corrige
- Florence-2 para OCR/detecção quando o modelo de chat não tiver visão boa
- Agente + voz: já ligado no código (a transcrição passa pelo mesmo `send()`), falta testar de ponta a ponta
- Agente: histórico de ações em Configurações (hoje só `logs/acoes.jsonl` na pasta da skill), desfazer
- Agente: permitir escolher um modelo só para o agente (ex.: qwen2.5vl para visão) diferente do chat
- MCP: transporte HTTP/SSE (hoje só stdio); não travar a lista enquanto uma chamada longa roda
- Playwright MCP e Windows-MCP ainda não foram testados de ponta a ponta (só o Fetch)
- Nuvem: chamadas reais a OpenAI/Anthropic não foram testadas (não há chave salva); modelo padrão de cada provedor fixo em `cloudModels.ts`

## Notas
- Voz: ver `src-tauri/src/speech.rs`; runtime baixada em `%LOCALAPPDATA%\com.openassistant.windows\tools`.
- BitNet: commit do bitnet.cpp fixado em `tools.rs` (`BITNET_COMMIT`); o main de jul/2026 degrada o texto.
