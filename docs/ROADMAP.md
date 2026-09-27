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

## 9. Controle automático, calculadora e memória em arquivo (sessão 4, 2026-09-25) — concluído
- [x] Botão "Controlar o PC" removido: pedido claro de ação → agente direto; conversa → o modelo recebe a ferramenta
  `controlar_computador` e, se chamar, o agente assume na mesma mensagem (nuvem/BitNet: marcador `[[CONTROLAR_PC]]`).
- [x] Teste real: "abre o chrome, entra no youtube e coloca o vídeo Never Gonna Give You Up do Rick Astley" → vídeo oficial
  aberto (1ª versão da receita: 20 passos/118 s). Com a receita nova (`web_search` → link `watch?v=` → `open_url` no Chrome):
  "abre o chrome e coloca o vídeo Despacito do Luis Fonsi no youtube" → 3 passos, 27 s, janela
  "Luis Fonsi feat. Daddy Yankee - Despacito (Official Music Video) - YouTube - Google Chrome".
- [x] Skill `abrir-programas` (também `references/abrir-programas.md`): Chrome, Edge, Office, VS Code, ms-settings:,
  apps da Store por protocolo, qualquer app do menu Iniciar, sites, YouTube (busca, vídeo, canal, atalhos do player).
  `dispatch.ps1`: `open_url` aceita `browser` (abre no Chrome) e `open_app` cai no menu Iniciar quando o nome não é um executável.
- [x] Calculadora do app: contas básicas sem modelo ("quanto é 12 x 8?" → card 12 × 8 = 96 em 1 s).
- [x] Memória em arquivo: `%LOCALAPPDATA%\com.openassistant.windows\memoria-da-ia.md` (criado com "me chame de André").
  Resposta de teste: "Olá, André!".
- [x] "Pensando" antes do Pac-Man, sem reticências; texto +10 %, Pac-Man −10 %.

## 10. Robô andando com pastas e janelas + ajustes (sessão 6, 2026-09-26) — concluído
- [x] Coreografia nova (`choreo.rs`): anda até o objeto (de lado / de costas subindo a tela / de frente descendo), gira
  de frente para o usuário, pega, gira de lado para o destino, anda carregando, gira de frente e solta. Visor de
  perfil (`u_side`) e de costas (`u_back`, respiros no lugar do rosto) no shader do rosto.
- [x] Velocidade escolhida pelo usuário (+ › Velocidade do robô, padrão "Devagar" 150 px/s; `robot_set_speed`) e por
  chamada (`speed`: devagar/normal/rapido). Caminho `natural` (arco leve ≤ 34 px + balanço mínimo) ou `reto`.
  Andar com rampa suave sem tranco (`walk_profile`) e sobe-e-desce a cada passo de 46 px (`AgentCursor`).
- [x] Ícone da área de trabalho: o Explorer deste build **não repinta** ícones reposicionados em sequência (testado:
  16 ms e até 130 ms entre passos). Agora o robô carrega uma imagem do ícone (a do Explorer, via
  `IShellItemImageFactory`) presa nas mãos a 60 fps, o original fica no lugar como num arrasto do Windows e o ícone
  real vai para o destino ao soltar (mãos acompanham o "Alinhar à grade").
- [x] Bug achado: `UIAutomation::new()` falhava em thread STA (desktop.rs) e os retângulos dos ícones eram chutados
  (76×93 em vez de 75×65, deslocados 16 px). `computer::automation()` usa o COM já iniciado.
- [x] Janela: segura num trecho livre da barra de título (`WM_NCHITTEST` = HTCAPTION; barras próprias como Explorador
  com abas e apps WebView → vãos entre botões/abas pelo UI Automation). Perto do topo da tela o robô segura de lado.
- [x] Mapa da tela para modelos pequenos (`places.rs` + `skills/mover-arquivos-e-janelas/posicoes_na_tela.md`): 9 zonas,
  "zona 1–9", "70% 30%", "um pouco para cima", "200 px para a direita", "ao lado de X"; `list_windows` mostra a zona
  e a % de cada janela/ícone. O caminho rápido sem modelo (`moveIntent.ts`) entende as mesmas frases + "devagar"/"em linha reta".
- [x] Logs: `move_window` numa pasta → vira `move_file`; "Abertas: ." → mensagem clara; `new_folder` sem `path`
  (nome em `name`) e caminho relativo → Área de Trabalho; lote de chamadas do modelo para no primeiro erro (eram 23 `drag`).
- [x] Compositor: cadeado fechado/aberto nas pontas do slider de acesso; "Total (age sozinho)" → "Acesso total".
- [x] Modo voz: sem ondas no campo; a fala aparece no chat enquanto a pessoa fala (bolha provisória) e vira o prompt.
- [x] Prévia de imagem: brilho colado na borda arredondada (magenta/violeta/azul/ciano) girando, respirando e se
  misturando em dois anéis; halo curto para fora e brilho curto para dentro.
- [x] Slider de esforço "Quadrados" anda para a esquerda (medido: −3 px a cada 60 ms).
- Verificado no exe (CDP): mover "teste mover" para meio direita / cima centro / volta (linha do tempo dos 13 estados e
  prints), Calculadora para cima direita e baixo esquerda, menu +, brilho, quadrados e voz com microfone falso.

> **Planos de implementação das seções 11–14:** `docs/superpowers/plans/2026-09-26-00-indice-roadmap-11-14.md` (ordem, descobertas e links).

## 11. Sistema visível: Node Editor dos agentes do sistema (pedido 2026-09-26, próxima sessão)
Ideia: todo fluxo automatizado do Open Assistant deve ser visível em tempo real para nós e para o usuário final.
Os editores de notes/nós (Node Editor / Node Workflow) passam a ser usados pelo próprio sistema.
- [x] Tela **Agentes** com duas abas: **Agentes do sistema** (criados pela equipe do Open Assistant) e **Agentes do usuário** (criados pelo usuário)
- [x] "Agentes do sistema" lista todos os workflows/Node Editors internos do app (só leitura no início, mas abríveis)
- [x] Execução ao vivo: quando um fluxo roda, o Node Editor dele acende os nós na ordem (entrada → processamento → saída), com os dados passando
- [x] Workflow **Salvar memória**: pedido no chat ("lembre disso…") → nó pega o texto da conversa → nó resume/extrai → nó grava em `memoria-da-ia.md`; visível no Node Editor daquela conversa
- [x] Permitir abrir duas telas lado a lado (Chat + Node Editor) para ver a memória sendo salva enquanto conversa
- [x] Cada conversa tem sua "trilha" de fluxos executados (parcial: "Execuções recentes" mostra a conversa; filtro por conversa e histórico em disco na fase 2)
- [ ] Workflow **Sonhos**: à noite a IA lê as memórias do dia e propõe/cria novas skills e novos conectores para facilitar o dia seguinte (com revisão do usuário antes de ativar)
- [ ] Converter as demais automações existentes em workflows visuais: roteamento chat→agente (`matchAction`/`controlar_computador`), calculadora, agente do PC, MCP, voz, geração de imagem
- [ ] Formato único de workflow (JSON de nós + arestas) usado tanto pelos agentes do sistema quanto pelos do usuário; eventos de execução emitidos pelo Rust para a UI

## 12. Browser próprio: Obscura (pedido 2026-09-26)
- [x] Adotar o Obscura (https://github.com/h4ckf0r0day/obscura.git) como o browser do Open Assistant (receita `obscura`, v0.2.3)
- [x] Avaliar o repositório: Apache-2.0, binário Windows v0.2.3 (obscura.exe + obscura-worker.exe), sem janela, CDP; vídeo pode não tocar
- [x] Ligar o agente ao Obscura (fase 1: `read_url` e node Ler página em Markdown, plano B = download simples; `open_url` continua no Chrome). Fase 2: pesquisa e tela Browser ao vivo
- [ ] Mostrar a navegação do agente no Node Editor (seção 11)

## 13. Voz padrão: AuK da Tencent Hunyuan (pedido 2026-09-26)
- [ ] Adotar o AuK (https://github.com/Tencent-Hunyuan/AuK.git) como sistema de voz padrão do app (suspenso até existir versão com português ou build com Soxr para clonar a voz Piper)
- [x] Avaliar o repositório: MIT, roda local pelo audio.cpp CUDA (6,5 GB). **REPROVADO em 2026-09-27**: não fala português (lê a descrição da voz em voz alta e embola as palavras; clonagem não roda na build Windows). Piper continua a voz padrão. Detalhes: `docs/superpowers/specs/2026-09-26-auk-teste.md`
- [ ] Integrar via Rust (como o sherpa-onnx em `src-tauri/src/speech.rs`), baixando a runtime/modelo para `%LOCALAPPDATA%\com.openassistant.windows\tools`
- [ ] Manter o sherpa-onnx como alternativa/fallback e opção em Configurações
- [ ] Testar de ponta a ponta com o microfone falso (E2E já existente) e com o agente
- [ ] Mostrar o fluxo de voz no Node Editor (seção 11)

## 14. Referências de design (pedido 2026-09-26)
- [x] Verificar se obsidianui.dev, designspells.com e bencho.dev são gratuitos (2026-09-26: os três são; obsidianui e bencho = MIT, designspells = galeria grátis só para inspiração)
- [x] Os gratuitos: analisados em `docs/superpowers/specs/2026-09-27-referencias-design.md` (obsidianui não combina; bencho e designspells como inspiração, reimplementando no estilo do app). Primeiro detalhe feito: linha da malha da Rede flui durante um pedido remoto
- [x] Os pagos: descartar (nenhum dos três é pago)

## 15. Rede de computadores: usar a GPU de outro PC (pedido 2026-09-27)
Objetivo final: estar no MacBook, abrir o chat e usar o PC com RTX da rede no lugar de uma API paga; se pedir, ele controla o computador; instalador para os outros PCs e atualizações remotas.
Design: `docs/superpowers/specs/2026-09-27-rede-de-computadores-design.md` · Plano da fase 1: `docs/superpowers/plans/2026-09-27-rede-fase1-local.md`
- [x] Fase 1: identidade por chave (MAC só como informação), descoberta na rede local, conexão por código de 6 dígitos (tipo AnyDesk)
- [x] Fase 1: página **Rede** aberta pelo ícone de computador da barra lateral: malha com ícones próprios (PC de mesa, notebook Windows, MacBook, Mac de mesa), nome e linha entre cada par
- [x] Fase 1: aparelhos da rede sem o app (IP + MAC) com "Enviar instalador"
- [x] Fase 1: chat e agente usando o modelo de outro computador (resposta em streaming; o agente controla o computador onde está o chat)
- [ ] Fase 2: mandar tarefas para o agente de outro computador (permissão "Controlar este PC", confirmação no PC controlado)
- [ ] Fase 3: instalador (`.exe` NSIS) e atualizações assinadas empurradas pelo computador dono para os PCs abaixo dele
- [ ] Fase 4: conexão fora de casa (código fixo, conta, servidor de diretório/retransmissão da empresa): decisão de infraestrutura pendente
- [ ] Fase 5: app para macOS (necessário para o cenário "estou no MacBook")
- [ ] Todos os fluxos da rede visíveis no Node Editor (seção 11)
- Verificado 2026-09-27 com dois apps no mesmo PC (`OPEN_ASSISTANT_NET_DIR`/`OPEN_ASSISTANT_NET_NAME`): descoberta mDNS em ~10 ms, código errado recusado, pareamento, chat remoto qwen3.5:9b a ~100 tok/s em streaming, recusa sem permissão. Falta testar com um segundo computador de verdade.

## Próximos passos sugeridos (sessão 7)
- "Alinhar à grade": escolher o destino já na célula livre mais perto (hoje o ícone pode encaixar uma célula ao lado).
- Robô de costas: hoje só o visor some; dá para desenhar as mãos atrás do corpo quando ele sobe a tela.
- Testar `move_window` com Chrome/Explorador reais pelo agente com qwen3.5:9b (o caminho rápido e a ferramenta já testados).

## Próximos passos sugeridos (sessão 5)
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
