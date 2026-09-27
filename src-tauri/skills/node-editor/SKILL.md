---
name: node-editor
description: Cria, edita e executa workflows no editor de nodes do Open Assistant — automações que abrem sites, leem e escrevem arquivos, baixam do Google Drive/OneDrive/Dropbox, resumem documentos com IA, geram ou editam fotos com IA e rodam sozinhas a cada X minutos. Use quando o usuário pedir uma automação, um workflow, "todo dia/a cada 30 min faça…", "monitore a pasta…", "gere um relatório de…".
---

# Editor de nodes — como criar workflows

Um **workflow** é uma fila de **nodes** ligados da esquerda para a direita. O primeiro é um **gatilho**
(`trigger.manual` = botão Executar; `trigger.schedule` = a cada X minutos, com o app aberto). Cada node recebe
**itens** do anterior (objetos com `text`, `path`, `name`, `url`, `remotePath`, `image`…), faz uma coisa e
entrega itens para o próximo. Nodes "por item" rodam uma vez para cada item (ex.: resumir cada documento);
`flow.merge` junta todos em um só (ex.: o relatório).

## Ferramentas
1. `workflow_kinds` — catálogo atualizado de nodes (kind, parâmetros e padrões). **Consulte antes de montar.**
2. `workflow_save` — `{ name, description?, nodes: [{id, kind, title?, params}], connections: [{from, to}], run? }`.
   Salva, valida e abre no editor. Se voltar erro, corrija o que a lista disser e chame de novo.
3. `workflow_list` — workflows salvos. 4. `workflow_run` — `{ name }` executa e devolve o resultado de cada node.

## Textos dinâmicos
- `{{campo}}` = campo do item que chega: `{{text}}`, `{{name}}`, `{{path}}`, `{{url}}`, `{{json.preco}}`.
- `{{date}}` (2026-09-25), `{{time}}` (14-30), `{{dataBR}}` (25/09/2026), `{{count}}` (itens que chegaram), `{{index}}`, `{{workflow}}`.
- Pastas do usuário: `{desktop}`, `{documents}`, `{downloads}`, `{pictures}`, `{home}`, `{temp}` (a Área de Trabalho
  pode estar no OneDrive; use sempre `{desktop}`, nunca um caminho fixo).

## Nodes (resumo — detalhes com `workflow_kinds`)
| kind | faz | parâmetros principais |
|---|---|---|
| `trigger.manual` | começa ao clicar em Executar | — |
| `trigger.schedule` | roda sozinho a cada X min | `minutes` |
| `web.open` | abre um site no navegador | `url`, `browser` (padrao/chrome/edge/firefox) |
| `web.read` | texto de uma página | `url` |
| `web.search` | pesquisa na web | `query` |
| `http.request` | chama uma API | `method`, `url`, `body` |
| `file.list` | lista arquivos de uma pasta | `folder`, `pattern` (`*.pdf;*.docx`), `onlyNew`, `recursive` |
| `file.read` | lê txt/md/csv/json/html/docx/xlsx/pptx/pdf | `path` (padrão `{{path}}`) |
| `file.write` | salva texto em arquivo | `folder`, `fileName`, `content`, `mode` (unique/overwrite/append) |
| `file.copy` | copia/move arquivo | `path`, `folder`, `move` |
| `cloud.list` | lista pasta do Google Drive/OneDrive… | `remote` (ex.: `gdrive`), `folder`, `onlyNew`, `recursive` |
| `cloud.download` | baixa o arquivo do item para o PC | `folder` |
| `cloud.upload` | envia arquivo do item para a nuvem | `remote`, `folder` |
| `ai.prompt` | instrução para a IA com dados do item | `instruction`, `model` |
| `ai.summarize` | resume o `text` do item | `style` (topicos/curto/relatorio), `model` |
| `image.generate` | gera imagem no PC | `prompt`, `model` |
| `image.edit` | edita foto com IA (img2img) | `path`, `prompt`, `strength` (0,1–0,9), `model` |
| `flow.merge` | junta itens em um texto | `header`, `itemTemplate`, `separator` |
| `flow.filter` | deixa passar itens cujo campo contém um texto | `field`, `contains`, `invert` |
| `flow.stopIfEmpty` | encerra em silêncio se nada chegou | — |
| `output.chat` | mostra na conversa "Automação: <nome>" | `message` |
| `output.notify` | notificação do Windows | `title`, `message` |
| `system.powershell` | roda um comando (política de segurança vale) | `command` |
| `agent.task` | entrega uma tarefa ao agente do PC | `instruction` |

Não use `trace.start` nem `trace.step`: são nodes só de visualização dos fluxos do próprio sistema.

## Exemplos reais (copie a estrutura)

### 1. Abrir um site
```json
{"name":"Abrir o g1","nodes":[{"id":"inicio","kind":"trigger.manual"},{"id":"site","kind":"web.open","params":{"url":"https://g1.globo.com"}}],
 "connections":[{"from":"inicio","to":"site"}]}
```

### 2. Editar fotos com IA
Fotos novas de `Área de Trabalho\Fotos para editar` → refeitas em outro estilo → copiadas para `Fotos editadas`.
```json
{"name":"Fotos em aquarela","nodes":[
 {"id":"inicio","kind":"trigger.manual"},
 {"id":"fotos","kind":"file.list","params":{"folder":"{desktop}\\Fotos para editar","pattern":"*.png;*.jpg;*.jpeg","onlyNew":true}},
 {"id":"editar","kind":"image.edit","params":{"path":"{{path}}","prompt":"a mesma foto em estilo aquarela, cores suaves","strength":0.5}},
 {"id":"copiar","kind":"file.copy","params":{"path":"{{image}}","folder":"{desktop}\\Fotos editadas"}}],
 "connections":[{"from":"inicio","to":"fotos"},{"from":"fotos","to":"editar"},{"from":"editar","to":"copiar"}]}
```

### 3. Relatório dos documentos que entram numa pasta do Google Drive, a cada 30 min, salvo em Área de Trabalho\resumos
```json
{"name":"Resumos do Google Drive","nodes":[
 {"id":"agenda","kind":"trigger.schedule","params":{"minutes":30}},
 {"id":"drive","kind":"cloud.list","params":{"remote":"gdrive","folder":"Entrada","onlyNew":true}},
 {"id":"vazio","kind":"flow.stopIfEmpty"},
 {"id":"baixar","kind":"cloud.download","params":{"folder":"{documents}\\Open Assistant\\Nuvem"}},
 {"id":"ler","kind":"file.read"},
 {"id":"resumir","kind":"ai.summarize","params":{"style":"topicos"}},
 {"id":"juntar","kind":"flow.merge","params":{"header":"# Resumos de {{dataBR}}\n\n{{count}} documentos novos.","itemTemplate":"## {{name}}\n\n{{text}}"}},
 {"id":"salvar","kind":"file.write","params":{"folder":"{desktop}\\resumos","fileName":"resumos {{date}} {{time}}.md","content":"{{text}}","mode":"unique"}},
 {"id":"avisar","kind":"output.notify","params":{"title":"Resumos prontos","message":"Relatório salvo em resumos"}}],
 "connections":[{"from":"agenda","to":"drive"},{"from":"drive","to":"vazio"},{"from":"vazio","to":"baixar"},{"from":"baixar","to":"ler"},
  {"from":"ler","to":"resumir"},{"from":"resumir","to":"juntar"},{"from":"juntar","to":"salvar"},{"from":"salvar","to":"avisar"}]}
```
`onlyNew` lembra o que já foi visto: na próxima meia hora só entram documentos novos; sem novidade,
`flow.stopIfEmpty` encerra sem criar relatório vazio. Google Docs são baixados como .docx.

### 4. Notícias do dia em um arquivo
```json
{"name":"Notícias de IA","nodes":[
 {"id":"agenda","kind":"trigger.schedule","params":{"minutes":1440}},
 {"id":"busca","kind":"web.search","params":{"query":"notícias inteligência artificial hoje"}},
 {"id":"resumo","kind":"ai.prompt","params":{"instruction":"Liste as 5 notícias mais importantes, uma linha cada, com o link:\n\n{{text}}"}},
 {"id":"salvar","kind":"file.write","params":{"folder":"{desktop}\\resumos","fileName":"noticias {{date}}.md","mode":"overwrite"}}],
 "connections":[{"from":"agenda","to":"busca"},{"from":"busca","to":"resumo"},{"from":"resumo","to":"salvar"}]}
```

## Regras
- Sempre comece com um gatilho e ligue todos os nodes (cada node com entrada precisa de uma ligação chegando).
- Não invente nome de conta de nuvem: use `gdrive` para Google Drive. Se o usuário ainda não conectou, diga que o
  node mostra o botão **Conectar Google Drive** (o login é feito por ele no navegador; o app nunca vê a senha).
- Pergunte (`ask_user`) só o que não dá para supor: o nome da pasta na nuvem, por exemplo. Pastas locais: use `{desktop}\nome`.
- `run: true` só para gatilho manual e ações inofensivas (abrir site, ler, resumir). Agendados começam sozinhos.
- Agendamentos rodam enquanto o Open Assistant estiver aberto. Comandos PowerShell perigosos são bloqueados ou pedem
  confirmação; em automação, o que pede confirmação é recusado.
- Depois de salvar, responda em uma ou duas frases: o que o workflow faz, quando roda e onde fica o resultado.
