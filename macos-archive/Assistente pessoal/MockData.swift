import Foundation

extension AssistantStore {
    static func makeModels() -> [ModelConfig] {
        [
            ModelConfig(id: .gpt, name: "GPT-5.5", provider: .openai, apiModel: "gpt-5.5", description: "Modelo OpenAI via Responses API.", latency: "Rede", status: .disconnected),
            ModelConfig(id: .claude, name: "Claude Sonnet 4.5", provider: .anthropic, apiModel: "claude-sonnet-4-5", description: "Modelo Anthropic via Messages API.", latency: "Rede", status: .disconnected),
            ModelConfig(id: .qwen, name: "Qwen 2.5 Coder (Local)", provider: .local, apiModel: "qwen2.5-coder:14b", description: "Modelo executado pelo Ollama local.", latency: "Local", status: .disconnected),
            ModelConfig(id: .llama, name: "Llama 3.2 (Local)", provider: .local, apiModel: "llama3.2:3b", description: "Modelo executado pelo Ollama local.", latency: "Local", status: .disconnected),
            ModelConfig(id: .together, name: "Llama 3.3 via Together", provider: .together, apiModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", description: "Modelo OpenAI-compatible hospedado na Together AI.", latency: "Rede", status: .disconnected),
            ModelConfig(id: .deepseek, name: "DeepSeek Chat", provider: .deepseek, apiModel: "deepseek-chat", description: "Modelo oficial da DeepSeek.", latency: "Rede", status: .disconnected),
            ModelConfig(id: .perplexity, name: "Perplexity Sonar", provider: .perplexity, apiModel: "sonar", description: "Modelo de pesquisa online da Perplexity.", latency: "Rede", status: .disconnected),
            ModelConfig(id: .fireworks, name: "Llama 3.3 via Fireworks", provider: .fireworks, apiModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", description: "Inferência OpenAI-compatible da Fireworks AI.", latency: "Rede", status: .disconnected)
        ]
    }

    static func makeChats() -> [ChatSession] {
        [
            ChatSession(
                id: "chat-1",
                title: "Análise de Tendências Brutalistas",
                modelId: .claude,
                date: "Hoje, 10:42",
                messages: [
                    ChatMessage(
                        id: "msg-1-1",
                        sender: .user,
                        text: "Analise a pasta de design do meu computador e crie um relatório resumido sobre Brutalismo Digital no ano de 2026.",
                        timestamp: "10:41"
                    ),
                    ChatMessage(
                        id: "msg-1-2",
                        sender: .assistant,
                        text: "Entendido. Vou iniciar o **Design Research Agent** para escanear a pasta `/Desktop/design-trends`, ler os arquivos recolhidos e compilar uma análise estruturada das tendências brutalistas atuais.",
                        timestamp: "10:41",
                        modelUsed: "Claude 3.7 Sonnet",
                        blocks: [
                            InteractiveBlock(
                                type: .actionPlan,
                                title: "Plano de Execução do Agente",
                                steps: [
                                    ActionStep(title: "Verificar diretório /Desktop/design-trends", description: "Varredura inicial por novos arquivos JPG/TXT/HTML", done: true),
                                    ActionStep(title: "Leitura de Referências Visuais", description: "Extrair metadados e notas de design salvas", done: true),
                                    ActionStep(title: "Geração de Análise Estilística", description: "Organizar características do Brutalismo Digital 2026", done: true),
                                    ActionStep(title: "Escrita de Relatório Final", description: "Salvar relatório brutalism-ui-2026.txt no Desktop", done: false)
                                ]
                            ),
                            InteractiveBlock(type: .commandRun, title: "Executando Comando no Shell Local", command: "node agent-research.js --dir ~/Desktop/design-trends --output ~/Desktop/brutalism-ui-2026.txt")
                        ],
                        responseTime: "3.2s",
                        visitedSites: ["google.com", "wikipedia.org", "github.com"]
                    ),
                    ChatMessage(
                        id: "msg-1-3",
                        sender: .user,
                        text: "Excelente. Mostre-me os resultados que você escreveu.",
                        timestamp: "10:43"
                    ),
                    ChatMessage(
                        id: "msg-1-4",
                        sender: .assistant,
                        text: "O **Design Research Agent** concluiu com sucesso a varredura e gerou o relatório em sua área de trabalho. O Brutalismo Digital em 2026 se destaca por tipografia maciça neo-grotesca, grades pixeladas de alto contraste expostas e ausência quase total de sombras arredondadas.\n\nAbaixo estão as alterações que fiz na folha de estilos de visualização local para incorporar esse estilo brutalista, juntamente com o código gerado:",
                        timestamp: "10:44",
                        modelUsed: "Claude 3.7 Sonnet",
                        blocks: [
                            InteractiveBlock(
                                type: .fileDiff,
                                title: "Modificações em styles.css",
                                diffInfo: DiffInfo(
                                    filePath: "~/Desktop/design-trends/styles.css",
                                    addedCount: 5,
                                    removedCount: 2,
                                    lines: [
                                        DiffLine(type: .neutral, text: "/* Global Styling */", oldNumber: 1, newNumber: 1),
                                        DiffLine(type: .remove, text: "- border-radius: 12px;", oldNumber: 2, newNumber: nil),
                                        DiffLine(type: .remove, text: "- box-shadow: 0 4px 10px rgba(0,0,0,0.05);", oldNumber: 3, newNumber: nil),
                                        DiffLine(type: .add, text: "+ border: 3px solid #000000;", oldNumber: nil, newNumber: 4),
                                        DiffLine(type: .add, text: "+ border-radius: 0px; /* Brutalist layout requires zero rounding */", oldNumber: nil, newNumber: 5),
                                        DiffLine(type: .add, text: "+ box-shadow: 6px 6px 0px #000000;", oldNumber: nil, newNumber: 6),
                                        DiffLine(type: .add, text: "+ font-family: 'Chakra Petch', sans-serif;", oldNumber: nil, newNumber: 7),
                                        DiffLine(type: .add, text: "+ background: #F3F3F3;", oldNumber: nil, newNumber: 8),
                                        DiffLine(type: .neutral, text: "margin: 20px;", oldNumber: 9, newNumber: 9)
                                    ]
                                )
                            ),
                            InteractiveBlock(
                                type: .code,
                                title: "Script de Automação do Agente",
                                language: "javascript",
                                code: """
                                // Agent Script to parse local visual trends and compile Markdown report
                                const fs = require('fs');
                                const path = require('path');

                                function analyzeFolder(dirPath) {
                                  console.log("Analyzing path: " + dirPath);
                                  const files = fs.readdirSync(dirPath);
                                  const summary = files.map(f => {
                                    return `- File: ${f} (${fs.statSync(path.join(dirPath, f)).size} bytes)`;
                                  }).join('\\n');

                                  return `# Brutalismo Digital 2026\\n\\n## Arquivos Analisados:\\n${summary}`;
                                }
                                """
                            )
                        ],
                        responseTime: "1.4s"
                    )
                ]
            ),
            ChatSession(
                id: "chat-2",
                title: "Otimização de Workflow de Nodes",
                modelId: .gpt,
                date: "Ontem, 16:15",
                messages: [
                    ChatMessage(id: "msg-2-1", sender: .user, text: "Como posso criar um nó customizado para que o próprio agente possa alterar o workflow adicionando novas conexões automaticamente?", timestamp: "16:14"),
                    ChatMessage(id: "msg-2-2", sender: .assistant, text: "Para isso, você deve instanciar um nó especial chamado **Workflow Modifier Node** (Otimizador de Fluxo). Esse nó possui permissões para interagir com o Core API do Open Assistant, permitindo que o modelo decida quando e onde encaixar novas conexões.", timestamp: "16:15", modelUsed: "GPT-5.5 Ultra", responseTime: "4.8s")
                ]
            )
        ]
    }

    static func makeAgents() -> [Agent] {
        [
            Agent(id: "agent-1", name: "Design Research Agent", role: "Analista de Tendências e Estilos", modelId: .claude, status: .running, lastActive: "Ativo agora", permissions: ["Ler Arquivos", "Escrever Relatórios", "Alterar Workflows"], tools: ["FolderWatcher", "FileReader", "LLMReasoning", "FileWriter"], prompt: "Você é um agente especialista em design visual e interface. Seu objetivo é escanear pastas locais contendo imagens, CSS e arquivos de anotação, decifrar os padrões estéticos dominantes e consolidar isso em relatórios analíticos, sugerindo também códigos CSS que otimizem os padrões desejados pelo usuário."),
            Agent(id: "agent-2", name: "File Organizer Agent", role: "Organização Inteligente de Diretórios", modelId: .qwen, status: .idle, lastActive: "Há 10 min", permissions: ["Ler Arquivos", "Mover Arquivos", "Criar Pastas"], tools: ["FileSystemAPI", "RegexMatcher", "LoggerTool"], prompt: "Você organiza arquivos desordenados em pastas estruturadas por tipo, data, projeto ou relevância de conteúdo, deixando a área de trabalho do usuário impecável."),
            Agent(id: "agent-3", name: "Workflow Optimizer Agent", role: "Refatorador de Automações por IA", modelId: .gpt, status: .paused, lastActive: "Há 1 hora", permissions: ["Escrever Arquivos", "Alterar Workflows", "Acessar Rede"], tools: ["WorkflowAPI", "ScriptRunner", "ModelSelectorTool"], prompt: "Você inspeciona o desempenho e estrutura de workflows de automação e insere/conecta novos nós para prevenir gargalos e gerenciar erros em tempo real."),
            Agent(id: "agent-4", name: "Terminal Executor Agent", role: "Operador de Comandos e Scripts", modelId: .llama, status: .error, lastActive: "Há 2 horas", permissions: ["Executar Comandos", "Acessar Rede", "Ler Arquivos"], tools: ["BashRuntime", "NPMInstaller", "PythonRunner"], prompt: "Agente encarregado de rodar compilações locais, scripts Python e executar testes unitários."),
            Agent(id: "agent-5", name: "Documentation Agent", role: "Escritor de Manuais e Wikis", modelId: .claude, status: .completed, lastActive: "Há 1 dia", permissions: ["Escrever Arquivos"], tools: ["MarkdownCompiler", "WebSearch"], prompt: "Agente que cria documentações em Markdown baseando-se no código-fonte e histórico de commits."),
            Agent(id: "example-1", name: "Exemplo 1", role: "Assistente virtual para WhatsApp", modelId: .gpt, status: .idle, lastActive: "Demonstração", permissions: ["Acessar Rede"], tools: ["WhatsApp Cloud API", "Webhook", "LLMReasoning"], prompt: "Receba mensagens pelo webhook oficial do WhatsApp Cloud API, interprete o contexto e responda pelo mesmo contato. Nunca envie uma mensagem sem credenciais Meta válidas."),
            Agent(id: "example-2", name: "Exemplo 2", role: "Briefing diário iniciado por Atalho", modelId: .gpt, status: .idle, lastActive: "Demonstração", permissions: ["Acessar Rede", "Abrir Aplicativos", "Ler Emails"], tools: ["Apple Shortcuts", "Gmail", "Web Search", "NSWorkspace"], prompt: "Quando iniciado pelo Atalhos, pesquise notícias, resuma emails novos e abra os aplicativos definidos pelo usuário."),
            Agent(id: "example-3", name: "Exemplo 3", role: "Imagem diária de cachorro às 06:00", modelId: .gpt, status: .idle, lastActive: "Demonstração", permissions: ["Criar Pastas", "Escrever Arquivos", "Acessar Rede"], tools: ["Scheduler", "OpenAI Images", "FileSystem"], prompt: "Todos os dias às 06:00 crie a pasta Cachorro do Dia no Desktop, gere uma nova imagem de cachorro e salve o PNG nessa pasta.")
        ]
    }

    static func makeDemoWorkflows() -> [Workflow] {
        let whatsappNodes = [
            WorkflowNode(id: "ex1-in", name: "Receber WhatsApp", type: .whatsapp, x: 80, y: 170, status: .idle, description: "Webhook de mensagens recebidas", config: ["title": "WhatsApp Webhook", "apiAction": "receive_webhook", "verifyToken": "", "phoneNumberId": "", "accessToken": "", "configurationRequired": "true"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex1-ai", name: "Assistente Virtual", type: .agent, x: 390, y: 170, status: .idle, description: "Entende a mensagem e prepara a resposta", config: ["title": "Assistente WhatsApp", "agentId": "example-1", "model": ModelId.gpt.rawValue], temperature: 0.35, allowSelfEdit: false),
            WorkflowNode(id: "ex1-safe", name: "Validar Resposta", type: .decision, x: 700, y: 170, status: .idle, description: "Bloqueia respostas sem destinatário ou conteúdo", config: ["expression": "recipient != nil && response.isEmpty == false"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex1-out", name: "Responder WhatsApp", type: .whatsapp, x: 1010, y: 170, status: .idle, description: "Responde usando a Cloud API oficial", config: ["title": "WhatsApp Reply", "apiAction": "send_message", "phoneNumberId": "", "accessToken": "", "configurationRequired": "true"], temperature: nil, allowSelfEdit: false)
        ]

        let briefingNodes = [
            WorkflowNode(id: "ex2-shortcut", name: "Atalho do Desktop", type: .trigger, x: 60, y: 180, status: .idle, description: "Entrada para Apple Shortcuts", config: ["title": "Executar Briefing", "shortcutName": "Abrir Assistente e rodar briefing", "urlScheme": "assistente-pessoal://run/workflow-example-2"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex2-news", name: "Pesquisar Notícias", type: .prompt, x: 340, y: 70, status: .idle, description: "Pesquisa as notícias mais relevantes do dia", config: ["title": "Notícias do Dia", "systemPrompt": "Pesquise fontes atuais e produza um resumo com links.", "requiresNetwork": "true"], temperature: 0.2, allowSelfEdit: false),
            WorkflowNode(id: "ex2-mail", name: "Captar Emails", type: .gmail, x: 340, y: 300, status: .idle, description: "Lê emails recentes após autenticação", config: ["title": "Gmail Inbox", "apiAction": "list_unread", "oauthRequired": "true"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex2-summary", name: "Criar Briefing", type: .agent, x: 650, y: 180, status: .idle, description: "Combina notícias e emails", config: ["title": "Briefing Agent", "agentId": "example-2", "model": ModelId.gpt.rawValue], temperature: 0.3, allowSelfEdit: false),
            WorkflowNode(id: "ex2-open", name: "Abrir Aplicativos", type: .openProgram, x: 960, y: 180, status: .idle, description: "Abre Mail e Safari no Mac", config: ["title": "Abrir ambiente", "programPaths": "/System/Applications/Mail.app;/Applications/Safari.app"], temperature: nil, allowSelfEdit: false)
        ]

        let dogNodes = [
            WorkflowNode(id: "ex3-folder", name: "Criar Pasta", type: .folder, x: 90, y: 180, status: .idle, description: "Cria ~/Desktop/Cachorro do Dia", config: ["title": "Pasta diária", "path": "~/Desktop/Cachorro do Dia", "action": "create"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex3-image", name: "Gerar Cachorro", type: .prompt, x: 410, y: 180, status: .idle, description: "Gera uma imagem nova com OpenAI", config: ["title": "Imagem do cachorro", "agentId": "example-3", "model": "gpt-image-2", "mediaType": "image", "userPrompt": "Gere uma fotografia inédita, simpática e realista de um cachorro em um cenário diferente."], temperature: 0.8, allowSelfEdit: false),
            WorkflowNode(id: "ex3-save", name: "Salvar PNG", type: .writer, x: 730, y: 180, status: .idle, description: "Salva a imagem com data e hora", config: ["title": "Salvar imagem", "outputPath": "~/Desktop/Cachorro do Dia/cachorro-{date}.png"], temperature: nil, allowSelfEdit: false),
            WorkflowNode(id: "ex3-end", name: "Encerrar", type: .notifier, x: 1050, y: 180, status: .idle, description: "Confirma a conclusão e encerra", config: ["title": "Concluído", "messageText": "A imagem diária foi salva."], temperature: nil, allowSelfEdit: false)
        ]

        return [
            Workflow(id: "workflow-example-1", name: "Exemplo 1 · WhatsApp", description: "Webhook → assistente virtual → validação → resposta pelo WhatsApp Cloud API.", isActive: false, nodes: whatsappNodes, connections: [NodeConnection(id: "ex1-c1", fromId: "ex1-in", toId: "ex1-ai"), NodeConnection(id: "ex1-c2", fromId: "ex1-ai", toId: "ex1-safe"), NodeConnection(id: "ex1-c3", fromId: "ex1-safe", toId: "ex1-out")]),
            Workflow(id: "workflow-example-2", name: "Exemplo 2 · Briefing", description: "Atalho → notícias e Gmail → briefing → aplicativos do usuário.", isActive: false, nodes: briefingNodes, connections: [NodeConnection(id: "ex2-c1", fromId: "ex2-shortcut", toId: "ex2-news"), NodeConnection(id: "ex2-c2", fromId: "ex2-shortcut", toId: "ex2-mail"), NodeConnection(id: "ex2-c3", fromId: "ex2-news", toId: "ex2-summary"), NodeConnection(id: "ex2-c4", fromId: "ex2-mail", toId: "ex2-summary"), NodeConnection(id: "ex2-c5", fromId: "ex2-summary", toId: "ex2-open")]),
            Workflow(id: "workflow-example-3", name: "Exemplo 3 · Cachorro diário", description: "Todos os dias às 06:00 cria a pasta, gera a imagem e salva o PNG. Ative o workflow após configurar a chave OpenAI.", isActive: false, nodes: dogNodes, connections: [NodeConnection(id: "ex3-c1", fromId: "ex3-folder", toId: "ex3-image"), NodeConnection(id: "ex3-c2", fromId: "ex3-image", toId: "ex3-save"), NodeConnection(id: "ex3-c3", fromId: "ex3-save", toId: "ex3-end")], frames: [WorkflowFrame(id: "ex3-schedule", name: "Todos os dias às 06:00", kind: .schedule, x: 40, y: 80, width: 1270, height: 390, config: ["scheduleMode": "daily", "time": "06:00"], nodeIds: dogNodes.map(\.id))])
        ]
    }

    static func makeTerminals() -> [AgentTerminal] {
        [
            AgentTerminal(
                id: "term-1",
                agentId: "agent-1",
                agentName: "Design Research Agent",
                status: .running,
                logs: [
                    TerminalLog(timestamp: "10:41:02", type: .info, text: "Initializing Design Research Agent on environment 'macOS-local'..."),
                    TerminalLog(timestamp: "10:41:03", type: .info, text: "Connecting to local model Claude 3.7 Sonnet (Latency: 220ms)..."),
                    TerminalLog(timestamp: "10:41:05", type: .success, text: "Successfully connected. Subscribing to folder path: ~/Desktop/design-trends"),
                    TerminalLog(timestamp: "10:41:08", type: .info, text: "File added event triggered: 'styles.css'"),
                    TerminalLog(timestamp: "10:41:10", type: .info, text: "Reading contents of 'styles.css' (size: 2.1 KB)..."),
                    TerminalLog(timestamp: "10:41:22", type: .warning, text: "Notice: Found overlapping border-radius and shadow values. Normalizing rules."),
                    TerminalLog(timestamp: "10:41:42", type: .input, text: "node agent-research.js --dir ~/Desktop/design-trends"),
                    TerminalLog(timestamp: "10:41:44", type: .success, text: "Report saved successfully: brutalism-ui-2026.txt")
                ],
                lastUpdated: "Ativo agora"
            ),
            AgentTerminal(
                id: "term-2",
                agentId: "agent-3",
                agentName: "Workflow Optimizer Agent",
                status: .paused,
                logs: [
                    TerminalLog(timestamp: "09:30:15", type: .info, text: "Booting Workflow Optimizer Agent on node framework..."),
                    TerminalLog(timestamp: "09:30:18", type: .info, text: "Analyzing canvas connections for workflow ID: 'daily-trend-analyzer'..."),
                    TerminalLog(timestamp: "09:30:25", type: .warning, text: "Warning: Missing error boundary on Node 'Read Design Files'!"),
                    TerminalLog(timestamp: "09:31:00", type: .success, text: "Workflow connections optimized. Average latency minimized by 18%.")
                ],
                lastUpdated: "Há 1 hora"
            ),
            AgentTerminal(
                id: "term-3",
                agentId: "agent-4",
                agentName: "Terminal Executor Agent",
                status: .error,
                logs: [
                    TerminalLog(timestamp: "08:15:00", type: .info, text: "Spinning up Docker sandbox terminal workspace..."),
                    TerminalLog(timestamp: "08:15:02", type: .input, text: "npm run test:all"),
                    TerminalLog(timestamp: "08:15:12", type: .error, text: "Test failure inside file-reader.test.ts: Expected status 200, got 500"),
                    TerminalLog(timestamp: "08:15:15", type: .error, text: "Agent stopped with failure state. Review log errors or trigger auto-fix.")
                ],
                lastUpdated: "Há 2 horas"
            )
        ]
    }

    static func makeWorkflow() -> Workflow {
        Workflow(
            id: "wf-1",
            name: "Daily Design Trend Analyzer",
            description: "Analisa uma pasta na área de trabalho diariamente e gera um relatório textual sobre as tendências brutais do dia.",
            isActive: true,
            nodes: [
                WorkflowNode(id: "node-1", name: "Trigger", type: .trigger, x: 80, y: 180, status: .success, description: "Dispara todos os dias às 09:00", config: ["title": "Disparador Diário", "schedule": "0 9 * * *"], temperature: nil, allowSelfEdit: false),
                WorkflowNode(id: "node-2", name: "Watch Dir", type: .watcher, x: 280, y: 180, status: .success, description: "Varre a pasta /Desktop/design-trends", config: ["title": "Folder Watcher", "path": "~/Desktop/design-trends", "extensions": "*.css, *.png, *.md"], temperature: nil, allowSelfEdit: false),
                WorkflowNode(id: "node-3", name: "Read File", type: .reader, x: 480, y: 180, status: .success, description: "Lê arquivos de texto e estilos", config: ["title": "File Reader", "maxFileSize": "5MB", "encoding": "utf-8"], temperature: nil, allowSelfEdit: false),
                WorkflowNode(id: "node-4", name: "LLM Agent", type: .agent, x: 680, y: 180, status: .running, description: "Processa referências brutalistas", config: ["title": "LLM Agent Node", "agentId": "agent-1", "model": ModelId.claude.rawValue], temperature: 0.2, allowSelfEdit: false),
                WorkflowNode(id: "node-5", name: "Optimizer", type: .optimizer, x: 880, y: 80, status: .idle, description: "Agente otimiza o fluxo de nodes em tempo real", config: ["title": "Workflow Modifier", "safetyThreshold": "high"], temperature: nil, allowSelfEdit: true),
                WorkflowNode(id: "node-6", name: "Write File", type: .writer, x: 880, y: 280, status: .idle, description: "Cria e estrutura o relatório final", config: ["title": "File Writer", "outputPath": "~/Desktop/brutalism-ui-2026.txt"], temperature: nil, allowSelfEdit: false),
                WorkflowNode(id: "node-7", name: "Notifier", type: .notifier, x: 1080, y: 280, status: .idle, description: "Envia toast e notificação macOS", config: ["title": "Notifier App", "sound": "Glass.aiff", "previewText": "Relatório gerado com sucesso!"], temperature: nil, allowSelfEdit: false)
            ],
            connections: [
                NodeConnection(id: "conn-1", fromId: "node-1", toId: "node-2"),
                NodeConnection(id: "conn-2", fromId: "node-2", toId: "node-3"),
                NodeConnection(id: "conn-3", fromId: "node-3", toId: "node-4"),
                NodeConnection(id: "conn-4", fromId: "node-4", toId: "node-5"),
                NodeConnection(id: "conn-5", fromId: "node-4", toId: "node-6"),
                NodeConnection(id: "conn-6", fromId: "node-6", toId: "node-7")
            ]
        )
    }

    static func makeFiles() -> [FileArtifact] {
        [
            FileArtifact(
                id: "file-1",
                name: "brutalism-ui-2026.txt",
                type: .txt,
                size: "2.4 KB",
                createdBy: "Design Research Agent",
                date: "Hoje, 10:44",
                path: "~/Desktop/brutalism-ui-2026.txt",
                content: """
                # RELATÓRIO: BRUTALISMO DIGITAL EM 2026

                Análise compilada em: 2026-07-08T10:44:00-07:00
                Autor: Design Research Agent (Claude 3.7 Sonnet)

                ## VISÃO GERAL
                O Brutalismo Digital no ano de 2026 evoluiu de um visual amador rebelde para uma linguagem de design técnica de altíssimo refinamento.

                ## ELEMENTOS CHAVE DO ESTILO
                1. BORDAS RIGIDAS (OUTLINES)
                Uso massivo de bordas pretas grossas delineando cards, painéis e imagens.

                2. NEOMORFISMO NEGATIVO
                Abandono de gradientes borrados e sombras desfocadas.

                3. TIPOGRAFIA MONOESPACADA E GEOMÉTRICA
                Intercalação de fontes industriais geométricas com fontes monoespaçadas.
                """
            ),
            FileArtifact(
                id: "file-2",
                name: "index.html",
                type: .html,
                size: "1.2 KB",
                createdBy: "Workflow Optimizer Agent",
                date: "Hoje, 09:30",
                path: "~/Desktop/design-trends/index.html",
                content: """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <link rel="stylesheet" href="styles.css">
                  <title>Digital Brutalism Showcase 2026</title>
                </head>
                <body class="bg-raw-grey">
                  <header class="brutalist-header">
                    <h1 class="uppercase tracking-widest font-display">Daily Trends Terminal</h1>
                  </header>
                  <main class="grid-brutalist">
                    <div class="card-harsh">
                      <h3 class="font-display">Trend 2026: Brutalism</h3>
                      <p class="font-mono">Gradientes banidos. Bem-vindo às bordas expostas.</p>
                    </div>
                  </main>
                </body>
                </html>
                """,
                previousContent: """
                <!DOCTYPE html>
                <html>
                <head>
                  <link rel="stylesheet" href="styles.css">
                </head>
                <body>
                  <header>
                    <h1>Daily Trends</h1>
                  </header>
                  <main>
                    <div class="card">
                      <h3>Design Trend #1</h3>
                      <p>Minimal gradients and soft shadows.</p>
                    </div>
                  </main>
                </body>
                </html>
                """
            ),
            FileArtifact(
                id: "file-3",
                name: "styles.css",
                type: .css,
                size: "820 B",
                createdBy: "Design Research Agent",
                date: "Hoje, 10:41",
                path: "~/Desktop/design-trends/styles.css",
                content: """
                body {
                  font-family: 'Inter', sans-serif;
                  background-color: #F3F3F3;
                  color: #000000;
                  margin: 20px;
                }
                .card-harsh {
                  padding: 20px;
                  border: 3px solid #000000;
                  border-radius: 0px;
                  box-shadow: 6px 6px 0px #000000;
                  background: #FFFFFF;
                }
                .badge-active {
                  font-family: 'JetBrains Mono', monospace;
                  font-size: 11px;
                  color: #00FFCC;
                  background: #000000;
                  padding: 3px 6px;
                }
                """,
                previousContent: """
                body {
                  font-family: sans-serif;
                  background-color: #ffffff;
                  color: #333333;
                }
                .card {
                  padding: 15px;
                  border-radius: 12px;
                  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
                }
                """
            ),
            FileArtifact(
                id: "file-4",
                name: "workflow-schema.json",
                type: .json,
                size: "1.8 KB",
                createdBy: "Workflow Optimizer Agent",
                date: "Ontem, 16:15",
                path: "~/Desktop/design-trends/workflow-schema.json",
                content: """
                {
                  "workflow": {
                    "id": "wf-1",
                    "name": "Daily Design Trend Analyzer",
                    "nodesCount": 7,
                    "active": true,
                    "security": "strict"
                  }
                }
                """
            )
        ]
    }

    static func makeSettings() -> AppSettings {
        AppSettings(
            general: .init(username: "André M.", language: "Português (BR)", theme: "Dark Slate", defaultModel: .claude),
            apiKeys: .init(openai: "", anthropic: "", google: "", groq: "", openrouter: "", customProvider: "Local Ollama Node", customUrl: "http://localhost:11434"),
            localRuntime: .init(status: "unknown", port: "11434", modelsInstalled: []),
            skills: [
                SkillSetting(id: "skill-1", name: "File Integrity Inspector", description: "Permite analisar a integridade do código e fazer sugestões de refatoração.", permissions: ["Ler Arquivos", "Comparar Diffs"], enabled: true),
                SkillSetting(id: "skill-2", name: "Automatic Node Injector", description: "Agentes conseguem criar e encadear novos nós e triggers em tempo real no canvas.", permissions: ["Modificar Canvas", "Criar Conexões"], enabled: true),
                SkillSetting(id: "skill-3", name: "Terminal Shell Supervisor", description: "Garante ambiente isolado e de sandbox para execução de comandos Bash de teste.", permissions: ["Executar Comandos Bash"], enabled: false)
            ],
            appearance: .init(accentColor: "#55FCFF", blurIntensity: "high", density: "normal"),
            fontSize: .init(global: 13, chat: 16, terminal: 12, code: 12),
            permissions: .init(readFile: true, writeFile: true, executeCommand: true, alterWorkflow: true, accessNetwork: false)
        )
    }
}
