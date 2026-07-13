# Assistente Pessoal

Aplicativo macOS nativo, em SwiftUI, que reúne chat com IA, agentes, automações visuais, terminal, browser, arquivos, dashboards, editores de mídia e marketplaces em um workspace divisível.

> O nome mostrado em partes da interface é **Open Assistant**. O projeto é macOS-first e usa recursos de AppKit, WebKit, AVFoundation e processos locais.

## Índice

- [O que o app faz](#o-que-o-app-faz)
- [Ferramentas e áreas do workspace](#ferramentas-e-áreas-do-workspace)
- [IA e voz](#ia-e-voz)
- [Integrações, segurança e runtime local](#integrações-segurança-e-runtime-local)
- [Configurações](#configurações)
- [Atalhos](#atalhos)
- [Estado real e limitações](#estado-real-e-limitações)
- [Tecnologia e desenvolvimento](#tecnologia-e-desenvolvimento)

## O que o app faz

O Assistente Pessoal concentra num único ambiente:

- Conversas com modelos em nuvem e locais.
- Projetos, chats, agentes e dashboards organizados na sidebar.
- Workflows de automação por nodes, com execução e agendamento.
- Shell `zsh` real em pseudo-terminal.
- Navegação web integrada.
- Leitura de arquivos, diffs e revisão de código.
- Geração de imagens, edição local de fotos e edição/exportação de vídeos.
- Busca de produtos e encaminhamento para lojas externas.
- Configuração de chaves, MCPs, skills, permissões e runtime local.

## Ferramentas e áreas do workspace

### Workspace multiárea

O centro do app é uma árvore de áreas que pode ser dividida horizontal ou verticalmente. Arraste um dos quatro cantos de uma área para criar outra; arraste os divisores para redimensionar ou recolher uma delas. Cada área pode mudar de tipo e manter seus próprios recursos quando aplicável.

Tipos disponíveis: **Chat**, **Nodes/Workflow**, **Agentes**, **Terminal**, **Browser**, **Marketplace**, **Editor de Fotos**, **Editor de Vídeos** e **Dashboard**. Arquivos também possuem uma área própria e aparecem na navegação, embora não estejam no menu rápido de troca.

A sidebar pode ser recolhida e redimensionada. Ela oferece busca e acesso a chats, projetos, agentes, dashboards e itens recentes. Chats, projetos, agentes e dashboards podem ser fixados, arquivados ou excluídos; projetos também podem ser renomeados e receber ícone e cor.

### Chat

- Cria conversas, troca o modelo da conversa e mantém um histórico recente enviado ao provider.
- Aceita texto multilinha, seleção de projeto como contexto, modo de aprovação e seletor de modelo.
- Mostra estimativa/uso de tokens, janela de contexto, progresso da geração, latência e erros do provider.
- Permite reenviar mensagem do usuário, copiar respostas e falar uma resposta por TTS.
- Renderiza blocos estruturados de plano de ação, código, comando, diff, erro, confirmação e dashboard.
- Abre revisões de comandos, arquivos e código; referências como `arquivo.swift (linha N)` podem abrir o painel de código.
- Exibe alterações pendentes com ações de aceitar ou rejeitar todas, outputs e fontes associados à resposta.
- Quando o pedido é de geração de imagem com uma credencial OpenAI válida, usa a API de imagens e salva o resultado em `~/Library/Application Support/Assistente pessoal/Generated Images`.

Os anexos de documento e foto estão presentes na interface, mas ainda não possuem pipeline de ingestão para o modelo.

### Projetos e dashboards

Projetos agrupam chats, agentes e dashboards e podem ser usados como contexto do composer. Um dashboard pode ser criado dentro de um projeto ou retornado pelo chat em formato estruturado. A visualização inclui métricas, gráfico de barras, gráfico de distribuição, tabela de dados recentes e seletor de período. Dashboards também podem ser fixados, arquivados ou excluídos.

### Agentes

Agentes são apresentados em grade e podem ser iniciados/pausados, selecionados, duplicados, editados ou removidos. Cada agente possui nome, papel, modelo, prompt-base, status, permissões e ferramentas habilitadas.

Ferramentas configuráveis no editor atual:

- `FolderWatcher`
- `FileReader`
- `LLMReasoning`
- `FileWriter`
- `BashRuntime`
- `NPMInstaller`

Um agente pode abrir seu workflow de nodes ou um terminal. Agentes de sistema não aparecem na lista regular.

### Nodes e workflows

O editor de workflow tem canvas virtual com pan, zoom de 40% a 200%, seleção múltipla/marquee, conexões Bézier, arraste de nodes, auto-organização e enquadramento automático.

Nodes disponíveis:

| Grupo | Nodes |
|---|---|
| Gatilhos e estrutura | Disparador, Watcher de diretório, Decisor, Optimizer, Executor, Notificador |
| Arquivos e sistema | Pasta Local, Arquivo Local (leitor), Salvar Arquivo (writer), Abrir App |
| IA | Agente IA, Prompt de IA |
| APIs | Gmail, Google Drive, WhatsApp e Telegram |
| Runtime | Ação de Runtime |

Também há frames de organização para intervalo, pasta, arquivo, projeto, condição, aprovação e execução paralela. Nodes podem ser duplicados/excluídos, editados e conectados por clique ou arrasto entre portas compatíveis. A execução percorre o fluxo a partir de gatilhos ou nodes sem entrada e reporta estados `idle`, `running`, `success`, `warning`, `error`, `skipped` e `cancelled`.

Workflows com frame de agenda são verificados periodicamente pelo app. As integrações externas de Gmail, Drive, WhatsApp, Telegram e outros nodes dependem de configuração/implementação específica; o canvas e o estado de execução já existem.

### Terminal

Cada terminal cria uma sessão interativa real de `/bin/zsh -i` via PTY. O app transmite stdout e stderr, aceita comandos, permite selecionar/copiar o resultado e encerra os processos ao fechar a sessão.

- Terminais podem ser agrupados em mosaico horizontal ou vertical.
- Arrastar o cabeçalho solta um terminal como janela flutuante; aproximá-la de uma borda a reagrupa.
- Há menus para agrupar, soltar, fechar e reordenar sessões.
- O chat, os agentes e os workflows podem abrir um terminal inferior recolhível; existe também um terminal de apoio na sidebar direita.

### Browser

O browser embutido usa um `WKWebView` persistente, com voltar, avançar, recarregar, barra de progresso e histórico real. URLs completas são abertas diretamente; domínios recebem `https://`; texto comum pesquisa no Google.

### Arquivos, diffs e código

A área **Sandbox Files** lista artefatos TXT, MD, JSON, HTML, CSS, LOG e REPORT, exibindo tamanho, agente de origem, data, caminho e conteúdo. É possível copiar, abrir e comparar o conteúdo atual com a versão anterior.

O painel de revisão de código oferece números de linha, destaque de linha referenciada, word-wrap, árvore de arquivos e ações para copiar caminho/conteúdo, revelar no Finder ou abrir no app padrão, Terminal, VS Code, Cursor, Xcode, PyCharm ou outro app disponível.

### Editor de Fotos

Editor local baseado em Core Image. Permite abrir uma imagem, ajustar exposição, contraste e saturação, rotacionar, selecionar/cortar uma região, restaurar ajustes e exportar o resultado em arquivo escolhido pelo usuário.

### Editor de Vídeos

Editor local baseado em AVFoundation/AVKit. Permite abrir um vídeo, reproduzir/pausar, navegar na timeline, gerar miniaturas e waveform, definir início e fim do corte, ajustar controles visuais de edição e exportar o trecho em MP4 ou MOV com preset selecionado. Alguns controles do inspector são preparação de interface e ainda não alteram a mídia exportada.

### Marketplace de produtos

Esta área pesquisa produtos no Mercado Livre e exibe título, foto, preço e link de origem. Há filtro local por categoria e ordenação por relevância, menor preço ou maior preço. A compra não acontece dentro do app: o botão abre o anúncio na loja. Amazon, KaBuM! e Google Shopping podem ser abertos com a busca atual. O filtro de frete grátis está visível, porém desabilitado até a fonte fornecer esse dado.

## IA e voz

### Providers e modelos configurados

| Modelo mostrado | Provider | Rota usada |
|---|---|---|
| GPT-5.5 | OpenAI | Responses API (`/v1/responses`) |
| Claude Sonnet 4.5 | Anthropic | Messages API (`/v1/messages`) |
| Qwen 2.5 Coder | Ollama local | `/api/chat` |
| Llama 3.2 | Ollama local | `/api/chat` |
| Llama 3.3 | Together AI | Chat Completions compatível |
| DeepSeek Chat | DeepSeek | Chat Completions compatível |
| Sonar | Perplexity | Chat Completions compatível |
| Llama 3.3 | Fireworks AI | Chat Completions compatível |

As chaves são verificadas antes de salvar e ficam no Keychain do macOS, sob o serviço `Andre.Assistente-pessoal.api-keys`; apenas valores mascarados são mantidos no estado de interface. A chave OpenAI também habilita a geração de imagens via `gpt-image-2` quando o pedido é reconhecido como geração visual.

### Voz e assistente flutuante

O app oferece ditado em português via Speech framework, leitura de respostas com `AVSpeechSynthesizer`, controle de iniciar/parar e orientação para abrir os Ajustes do Sistema se microfone ou reconhecimento forem negados. Há três perfis de voz: Evee, Sol e Harvey.

Nas configurações de aparência, é possível habilitar o **Dynamic Assistant**: um painel flutuante no topo da tela — ou na barra de menus — que mostra o estado da conversa, a última resposta, uma waveform durante voz e um campo compacto para enviar mensagens.

## Integrações, segurança e runtime local

### Modos de aprovação

| Modo | Comportamento pretendido |
|---|---|
| Ask for approval | Solicita confirmação para editar arquivos externos ou usar a internet. |
| Approve for me | Solicita confirmação apenas para ações potencialmente inseguras. |
| Total Access | Permite acesso irrestrito a arquivos e rede. |

O modo é exposto no composer e nas preferências. Efeitos externos futuros devem respeitá-lo; as respostas de IA atuais não executam tool calls retornadas pelo modelo.

### MCP, skills e marketplace de integrações

As configurações incluem servidores MCP conectados e marketplace de MCPs, além de skills salvas e marketplace de skills.

- MCPs iniciais: Filesystem MCP, PostgreSQL Connector e GitHub API Sync.
- É possível adicionar servidor MCP por nome e comando, testar disponibilidade e remover a configuração.
- A verificação confirma o executável e, em comandos `npx`, a disponibilidade do pacote npm. Ela ainda não implementa OAuth nem handshake JSON-RPC específico do conector.
- Skills podem ser habilitadas/desabilitadas e declaram permissões. As iniciais são File Integrity Inspector, Automatic Node Injector e Terminal Shell Supervisor.
- Catálogos demonstrativos incluem Slack, Google Drive & Calendar, Spotify, Docker e Jira (MCPs), e Python Code Sandbox, Dynamic Browser Scraper, Flux/Imagen e Git Conflict Resolver (skills).
- Itens gratuitos podem ser instalados; itens pagos usam StoreKit 2 e só são liberados após `Transaction` verificada. Os produtos devem existir no App Store Connect com o identificador `Andre.Assistente-pessoal.marketplace.<mcp|skill>.<item-id>`.

### Runtime local

O runtime local combina Ollama, OpenClaw e MCP Bridge. A tela detecta binários, versões, portas, rede, espaço em disco e saúde HTTP; exibe modelos detectados, logs e status por componente.

Operações disponíveis: instalação completa, somente Ollama, somente OpenClaw, reparo, atualização de status, cópia de logs e abertura do workflow visual de instalação. Antes de alterar a máquina, o app monta um plano com comandos, avisos e impacto para aprovação explícita. Não usa `sudo` nos comandos previstos.

Fluxo de instalação: detectar sistema e arquitetura → verificar disco/rede → detectar/instalar/iniciar Ollama → validar API e baixar modelo padrão → validar Node.js → detectar/instalar/configurar/iniciar OpenClaw → validar gateway → criar MCP Bridge (se permitido) → persistir estado → health check.

Portas padrão: Ollama `11434` e OpenClaw `18789`. A compatibilidade esperada para OpenClaw é Node.js 22.19+, 23.11+ ou 24+. O estado do runtime é persistido em JSON em `~/Library/Application Support/Open Assistant/runtime-state.json`, e os logs passam por redação de segredos.

## Configurações

| Aba | Recursos |
|---|---|
| Geral | Foto de perfil, nome, idioma (PT-BR/EN-US/ES), tema e modelo padrão. |
| Modelos LLM | Lista provider, descrição, latência e status de modelos locais/nuvem. |
| Chaves API | Inserir, revelar, colar, detectar provider por prefixo, verificar, mascarar e remover chaves; marketplace de APIs. |
| MCP | Servidores conectados, teste, inclusão/removal e marketplace. |
| Skills | Skills salvas, permissões, ativação e marketplace. |
| Extensões | Área de proposta para extensões de terceiros; ainda não instala extensões. |
| Local Runtime | Preferências, status, instalação aprovada, workflow e logs de Ollama/OpenClaw/MCP Bridge. |
| Aparência | Cores, densidade, tamanhos de fonte e Dynamic Assistant. |
| Permissões | Leitura/escrita de arquivos, comandos, workflows e rede. |
| Sandbox Files | A própria ferramenta de arquivos dentro das preferências. |

## Atalhos

| Atalho | Ação |
|---|---|
| `⌘ N` | Novo chat |
| `⌘ K` | Abrir/fechar paleta de comandos |
| `⌘ 1` a `⌘ 6` | Chat, Agentes, Workflow, Terminais, Arquivos e Marketplace |
| `⌘ ⇧ D` | Criar dashboard no projeto de contexto |
| `⌥ ⌘ P` | Abrir Editor de Fotos |
| `⌥ ⌘ V` | Abrir Editor de Vídeos |
| `⌘ ⌃ S` | Mostrar/ocultar sidebar |
| `⌘ ⇧ R` | Executar workflow diário |
| `Esc` | Fechar paleta ou editor de código expandido |

A paleta de comandos também permite buscar e executar ações de chat, navegação, configurações, modelos e workflows.

## Estado real e limitações

O app executa de fato: chat por APIs configuradas, validação/armazenamento de chaves no Keychain, geração de imagens OpenAI, ditado/TTS, PTY com `zsh`, browser WebKit, leitura/seleção de arquivos, busca Mercado Livre, StoreKit validado, verificação de comando MCP e diagnóstico/instalação aprovada do runtime.

Ainda não estão completos:

- Streaming de tokens e execução de tool calls devolvidas pelos LLMs.
- Ingestão multimodal de anexos no chat.
- Persistência geral de chats, projetos, agentes, workflows e preferências; o runtime possui persistência própria.
- OAuth, descoberta de tools/resources/prompts e handshake MCP por servidor.
- Implementações de produção para as APIs de Gmail, Google Drive, WhatsApp e Telegram no workflow.
- Catálogo/instalação de extensões de terceiros.
- Compra real de itens que ainda não estejam cadastrados no App Store Connect.
- Alterações efetivas em todos os controles visuais do editor de vídeo.

## Tecnologia e desenvolvimento

| Área | Tecnologia |
|---|---|
| Plataforma/UI | macOS, Swift 5, SwiftUI e AppKit |
| Browser | WebKit / `WKWebView` |
| Áudio e vídeo | Speech, AVFoundation e AVKit |
| Imagem | Core Image |
| Gráficos | Swift Charts |
| Terminal | POSIX PTY + `/bin/zsh -i` |
| Compras | StoreKit 2 |
| Segredos | macOS Keychain |
| Testes | Swift Testing e XCTest |

Requisitos: macOS com Xcode instalado. O deployment target configurado é macOS 26.5. Abra `Assistente pessoal/Assistente pessoal.xcodeproj` no Xcode e execute o scheme **Assistente pessoal**, ou use:

```bash
xcodebuild -project "Assistente pessoal/Assistente pessoal.xcodeproj" \
  -scheme "Assistente pessoal" \
  -configuration Debug build

xcodebuild -project "Assistente pessoal/Assistente pessoal.xcodeproj" \
  -scheme "Assistente pessoal" test
```

### Estrutura relevante

```text
Assistente pessoal/
├── Assistente pessoal.xcodeproj
└── Assistente pessoal/
    ├── ContentView.swift                 # Janela, sidebar e workspace divisível
    ├── ChatViews.swift                   # Chat, composer, revisão e fontes
    ├── AgentsViews.swift                 # Agentes
    ├── WorkflowViews.swift                # Canvas de nodes
    ├── TerminalViews.swift / ShellSession.swift
    ├── BrowserSupport.swift
    ├── FilesViews.swift / CodeEditorViews.swift
    ├── CreativeWorkspaceViews.swift      # Marketplace, dashboards e mídia
    ├── SettingsView.swift
    ├── AIProviderService.swift / SpeechService.swift
    ├── OpenAssistantStore.swift           # Estado e ações centrais
    └── Runtime/                           # Diagnóstico, instalador e persistência local
```

O catálogo detalhado de tipos, portas e regras de conexão de nodes está em [nodes.md](nodes.md).
