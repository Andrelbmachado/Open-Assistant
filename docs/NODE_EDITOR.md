# Editor de nodes — documentação

Guia completo do editor de workflows do Open Assistant: o que ele faz, como funciona por dentro, o catálogo de
nodes, exemplos reais e como estender. Serve para pessoas e para IAs (a IA do app recebe a versão curta,
`src-tauri/skills/node-editor/SKILL.md`, junto com as ferramentas `workflow_*`).

## 1. Conceitos

| Termo | O que é |
|---|---|
| **Workflow** | Documento com nodes, ligações e frames. Salvo no estado do app (`localStorage`), um por projeto. |
| **Área** | Cada área do tipo "Editor de nodes" mostra **o seu** workflow (`WorkspaceArea.workflowId`). Trocar o workflow numa área não muda as outras; dividir uma área de nodes cria um workflow novo. |
| **Node** | Um passo: `kind` (tipo), `params` (parâmetros), posição. |
| **Ligação** | Saída de um node → entrada de outro. O fluxo vai da esquerda para a direita (sem ciclos). |
| **Item** | Dado que passa entre nodes: `{ text, name, path, url, remotePath, remote, image, modified, size, json, … }`. |
| **Gatilho** | Primeiro node: `trigger.manual` (botão Executar / IA) ou `trigger.schedule` (a cada X minutos). |
| **Modo** | `each` roda uma vez por item; `all` recebe a lista inteira (juntar, filtrar); `once` roda uma vez (listar pasta). |

Um node com entrada que não recebeu nenhum item é **pulado** (os seguintes também). `flow.stopIfEmpty` encerra o
fluxo em silêncio quando nada chegou — é assim que um agendamento sem novidade não cria relatório vazio.

## 2. Como funciona por dentro

```
WorkflowCanvas.tsx (interface de cada área)
   │  dispatch wf*  ──►  store.tsx (workflows[], área.workflowId, memória, lastRunAt)
   │  Executar      ──►  workflowService.ts ─ runWorkflowById ─► workflowEngine.ts (runWorkflow)
   │                                                     │ cada node chama o WorkflowHost
   │                                                     ▼
   │                         host real (workflowService.createWorkflowHost)
   │                          ├─ Rust workflow.rs: wf_list_files, wf_read_file, wf_write_file, wf_copy_file,
   │                          │   wf_http, wf_open_url, wf_notify, cloud_status/connect/list/download/upload
   │                          ├─ Rust agent.rs: agent_tool (read_url, web_search, run_command com a política)
   │                          ├─ Rust imagegen.rs: image_generate (com initImage/strength = editar foto)
   │                          ├─ aiService.askAI (Ollama, BitNet ou nuvem)
   │                          └─ agentRunner.runAgent (node "Agente do PC")
   ▼
workflowRuns.ts (estado de cada execução: node a node, para o canvas e o painel)
WorkflowService.tsx (sem interface): configura o serviço e roda o agendador a cada 30 s
```

- **Catálogo**: `src/utils/workflow.ts › NODE_KINDS` é a fonte da verdade. A interface, a validação, a ajuda da IA
  (`workflow_kinds`) e os testes saem dele.
- **Validação** (`validateWorkflow`): kind existe, parâmetros existem, todo node com entrada recebe uma ligação,
  há um gatilho, não há ciclo. A IA recebe a lista de problemas para corrigir.
- **Memória "só novos"**: `file.list` e `cloud.list` com `onlyNew` guardam em `workflow.memory[nodeId]` a lista
  `caminho|modificação` vista. A memória só é gravada quando a execução termina bem (se falhar no meio, os
  arquivos continuam "novos" na próxima vez).
- **Agendador**: `runDueWorkflows` roda os workflows com `trigger.schedule` ligados (`scheduleEnabled !== false`)
  cujo `lastRunAt` passou do intervalo. **Só com o app aberto.**
- **Segurança**: nenhum node executa comando direto; `system.powershell` passa por `agent_tool run_command`, com a
  mesma política do agente (bloqueia o perigoso; o que pede confirmação é recusado em automação). URLs só http(s).
  Notificação recebe título/texto por variável de ambiente (nada vira comando).

## 3. Catálogo de nodes

| kind | Categoria | Faz | Parâmetros (padrão) | Sai |
|---|---|---|---|---|
| `trigger.manual` | Gatilho | Começa ao clicar em Executar ou quando a IA roda | — | 1 item vazio |
| `trigger.schedule` | Gatilho | Roda sozinho a cada X minutos | `minutes` (30) | 1 item com data/hora |
| `web.open` | Web | Abre um site no navegador | `url`, `browser` (padrao/chrome/edge/firefox) | item + `url` |
| `web.read` | Web | Texto principal de uma página | `url` (`{{url}}`) | `text`, `url` |
| `web.search` | Web | Pesquisa na web | `query` | `text` com resultados |
| `http.request` | Web | Chama uma API | `method` (GET), `url`, `body` | `text`, `json`, `status` |
| `file.list` | Arquivos | Lista arquivos de uma pasta | `folder` (`{desktop}`), `pattern` (`*.*`), `onlyNew`, `recursive` | 1 item por arquivo |
| `file.read` | Arquivos | Lê txt, md, csv, json, html, docx, xlsx, pptx, pdf | `path` (`{{path}}`) | item + `text` |
| `file.write` | Arquivos | Salva texto (cria a pasta) | `folder`, `fileName` (`resultado {{date}}.md`), `content` (`{{text}}`), `mode` (unique) | item + `path` |
| `file.copy` | Arquivos | Copia ou move o arquivo do item | `path`, `folder`, `move` | item com novo `path` |
| `cloud.list` | Nuvem | Lista uma pasta da conta conectada | `remote` (gdrive), `folder`, `onlyNew` (sim), `recursive` | 1 item por arquivo (`remotePath`) |
| `cloud.download` | Nuvem | Baixa o arquivo do item para o PC | `folder` (`{documents}\Open Assistant\Nuvem`) | item + `path` |
| `cloud.upload` | Nuvem | Envia o arquivo do item para a nuvem | `remote`, `folder` | item + `remotePath` |
| `ai.prompt` | IA | Instrução para a IA com dados do item | `instruction`, `model` (vazio = do chat) | item + `text` |
| `ai.summarize` | IA | Resume o `text` do item | `style` (topicos/curto/relatorio), `model` | item + `text`, `original` |
| `image.generate` | IA | Gera imagem aqui no PC | `prompt` (`{{text}}`), `model` (vazio = melhor instalado) | item + `image`, `path` |
| `image.edit` | IA | Edita foto com IA (img2img) | `path`, `prompt`, `strength` (0,5), `model` | item + `image`, `path` |
| `flow.merge` | Fluxo | Junta todos os itens em um texto | `header`, `itemTemplate`, `separator` | 1 item: `text`, `count` |
| `flow.filter` | Fluxo | Passa só itens cujo campo contém o texto | `field` (name), `contains`, `invert` | itens filtrados |
| `flow.stopIfEmpty` | Fluxo | Encerra em silêncio se nada chegou | — | os mesmos itens |
| `output.chat` | Saída | Mostra na conversa "Automação: <nome>" | `message` (`{{text}}`) | — |
| `output.notify` | Saída | Notificação do Windows | `title`, `message` | os mesmos itens |
| `system.powershell` | Sistema | Roda um comando (política do agente) | `command` | item + `text` |
| `agent.task` | Sistema | Tarefa para o agente que controla o PC | `instruction` | item + `text` |
| `trace.start` | Sistema (só visualização) | Início de um fluxo do próprio app (ex.: mensagem do chat) | `about`, `code` | — |
| `trace.step` | Sistema (só visualização) | Etapa que o próprio app executa; acende ao vivo | `about`, `code` | — |

Os nodes `trace.*` aparecem só nos fluxos do sistema (tela Agentes → Agentes do sistema), não estão na paleta e não rodam no motor.

### Textos dinâmicos
- `{{campo}}` do item (`{{text}}`, `{{name}}`, `{{path}}`, `{{json.preco}}`); campo inexistente vira vazio.
- `{{date}}` = 2026-09-25, `{{time}}` = 14-30, `{{datetime}}`, `{{dataBR}}` = 25/09/2026, `{{count}}`, `{{index}}`, `{{workflow}}`.
- Pastas: `{desktop}`, `{documents}`, `{downloads}`, `{pictures}`, `{home}`, `{temp}` (vêm do Windows; a Área de
  Trabalho pode estar no OneDrive). Também valem `%USERPROFILE%` e `~`.

## 4. Nuvens (Google Drive, OneDrive, Dropbox…)

- Motor: **rclone** (open source, um exe só), baixado sob demanda em Configurações/pelo botão do node
  ("Baixar conector de nuvens", receita `rclone` em `tools.rs`, v1.75.1).
- **Conectar** (botão "Conectar Google Drive" no node): roda `rclone config create gdrive drive scope=drive.readonly`;
  o navegador abre e **o próprio usuário** entra e autoriza. O app nunca vê a senha. A conta fica em
  `%LOCALAPPDATA%\com.openassistant.windows\rclone.conf`. Google Drive entra **só com leitura** (upload pede outra
  conexão com escrita: `cloud_connect` com `write: true`).
- Google Docs/Planilhas/Apresentações são baixados como `.docx`/`.xlsx`/`.pptx` (e lidos pelo `file.read`).
- Outras nuvens aceitas por `cloud_connect`: `onedrive`, `dropbox`, `box`, `pcloud`, `mega` e `alias` (uma pasta local
  fingindo ser nuvem — útil para testar).

## 5. Exemplos reais

Todos existem como **Modelos prontos** no menu do nome do workflow (e em `WORKFLOW_TEMPLATES`).

1. **Abrir um site** — `trigger.manual → web.open(url)`.
2. **Editar foto com IA** — `trigger.manual → file.list({desktop}\Fotos para editar, *.png;*.jpg, só novos) →
   image.edit(prompt, força 0,5) → file.copy({{image}} → {desktop}\Fotos editadas)`. Usa o melhor modelo de imagem
   do motor stable-diffusion.cpp instalado (Z-Image, FLUX, SD); a foto nova mantém a composição.
3. **Relatório do Google Drive a cada 30 min em Área de Trabalho\resumos** —
   `trigger.schedule(30) → cloud.list(gdrive, Entrada, só novos) → flow.stopIfEmpty → cloud.download → file.read →
   ai.summarize(tópicos) → flow.merge(# Resumos de {{dataBR}}) → file.write({desktop}\resumos, "resumos {{date}} {{time}}.md")
   → output.notify`. Sem documentos novos, para sem criar arquivo.
4. **Resumir documentos de uma pasta do PC** — igual ao 3 com `file.list` no lugar de `cloud.list`/`cloud.download`.

JSON pronto para a ferramenta `workflow_save`: veja `src-tauri/skills/node-editor/SKILL.md`.

## 6. Como a IA cria workflows

1. O chat reconhece pedidos de automação (`looksLikeWorkflowRequest`: "workflow", "automatize", "a cada 30 min",
   "todo dia"…) e chama o agente com a skill `node-editor` e as ferramentas `workflow_kinds`, `workflow_save`,
   `workflow_list`, `workflow_run` (tratadas no front por `runWorkflowTool`).
2. `workflow_save` monta com `buildWorkflow` (completa padrões e organiza as posições com `autoLayout`), valida e
   abre na área de nodes. Com o mesmo nome, substitui o existente (mantendo a memória).
3. `workflow_run` devolve o estado de cada node (itens, amostra, erro) para a IA conferir.

## 7. Limitações conhecidas
- Agendamentos rodam só com o Open Assistant aberto.
- Editar foto com IA não funciona com os modelos do motor Python (Sana, Kolors, HunyuanDiT, GLM-Image).
- PDF escaneado (só imagem) não tem texto para ler.
- Nuvem: é preciso conectar a conta uma vez (login do usuário no navegador).

## 8. Para desenvolvedores: novo tipo de node
1. Entrada em `NODE_KINDS` (`src/utils/workflow.ts`): `kind`, rótulo, categoria, descrição, `input/output`, `mode`,
   `params` (tipo de controle: text, longtext, number, boolean, select, folder, model, imageModel, remote), `produces`.
2. Ramo no `switch` de `runNode` (`src/utils/workflowEngine.ts`) usando só o `WorkflowHost`.
3. Se precisar do sistema: método novo no `WorkflowHost` + comando em `src-tauri/src/workflow.rs` (registrar em `lib.rs`)
   + implementação em `createWorkflowHost` (`src/utils/workflowService.ts`).
4. Ícone em `KIND_ICON` (`WorkflowCanvas.tsx`), linha na tabela da seção 3 e em `skills/node-editor/SKILL.md`.
5. Teste com host falso em `workflowEngine.test.ts` (o teste `workflowDocs` confere que o kind está nas duas docs).
