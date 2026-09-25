---
name: abrir-programas
description: Exemplos reais de como abrir qualquer programa, site, vídeo, pasta ou tela de configuração no Windows — Chrome, YouTube (inclusive um vídeo específico), Office, VS Code, apps da Microsoft Store e qualquer item do menu Iniciar. Use sempre que o pedido for "abre…", "entra no…", "inicia…", "coloca o vídeo…".
---

# Abrir programas, sites e vídeos no Windows

Sempre do mais barato para o mais caro:

1. **`run_intent`** do catálogo (`open_app`, `open_url`, `open_browser`, `open_explorer`, `open_vscode`) — sem raciocínio.
2. **`run_command`** com `Start-Process` quando não houver intent.
3. **Menu Iniciar** (`Get-StartApps`) para qualquer app instalado cujo nome você não sabe o executável.
4. **`look` + `click`** só para o que precisa de interface (escolher um vídeo, apertar um botão).

Depois de abrir, **confira** (`look` elements mostra o título da janela da frente) antes de dizer que deu certo.

## Programas — exemplos reais

| Pedido | `run_intent` | `run_command` equivalente (PowerShell) |
|---|---|---|
| Chrome | `open_app {"app":"chrome"}` | `Start-Process chrome` |
| Chrome anônimo | — | `Start-Process chrome -ArgumentList '--incognito'` |
| Chrome em outro perfil | — | `Start-Process chrome -ArgumentList '--profile-directory="Profile 1"'` |
| Edge / Firefox | `open_app {"app":"msedge"}` / `{"app":"firefox"}` | `Start-Process msedge` / `Start-Process firefox` |
| Bloco de notas | `open_app {"app":"notepad"}` | `Start-Process notepad` |
| Calculadora | `open_app {"app":"calc"}` | `Start-Process calc` |
| Terminal / PowerShell | `open_app {"app":"terminal"}` | `Start-Process wt` ou `Start-Process powershell` |
| Explorador (Downloads) | `open_explorer {"path":"C:\\Users\\<você>\\Downloads"}` | `Start-Process explorer "$env:USERPROFILE\Downloads"` |
| VS Code numa pasta | `open_vscode {"path":"C:\\Projetos\\app"}` | `code "C:\Projetos\app"` |
| Word / Excel / PowerPoint / Outlook | `open_app {"app":"winword"}` … | `Start-Process winword` · `excel` · `powerpnt` · `outlook` |
| Paint | `open_app {"app":"mspaint"}` | `Start-Process mspaint` |
| Gerenciador de Tarefas | `open_app {"app":"taskmgr"}` | `Start-Process taskmgr` |
| Painel de Controle | `open_app {"app":"control"}` | `Start-Process control` |
| Configurações do Windows | `open_app {"app":"ms-settings:"}` | `Start-Process ms-settings:` |
| Wi-Fi / Som / Bluetooth / Tela | `open_app {"app":"ms-settings:network-wifi"}` | `ms-settings:sound` · `ms-settings:bluetooth` · `ms-settings:display` |
| Microsoft Store | `open_app {"app":"ms-windows-store:"}` | `Start-Process ms-windows-store:` |
| Spotify | `open_app {"app":"spotify"}` | `Start-Process spotify:` (protocolo do app) |
| WhatsApp (app) | `open_app {"app":"whatsapp"}` | `Start-Process whatsapp:` |
| Steam | `open_app {"app":"steam"}` | `Start-Process steam://open/main` |
| Discord | `open_app {"app":"discord"}` | `Start-Process discord:` |

`open_app` já tenta o nome cru e, se o Windows não achar, procura no menu Iniciar. Então `open_app {"app":"photoshop"}`
abre "Adobe Photoshop 2025", `{"app":"blender"}` abre "Blender 5.1", etc.

### Qualquer app do menu Iniciar (na mão)

```powershell
Get-StartApps | Where-Object Name -like '*photoshop*' | Select-Object Name, AppID
Start-Process "shell:AppsFolder\<AppID>"      # ex.: shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App
```

### Pastas especiais

`Start-Process explorer shell:Downloads` · `shell:Desktop` · `shell:Personal` (Documentos) · `shell:My Pictures` · `shell:RecycleBinFolder`.

## Sites

| Pedido | Chamada |
|---|---|
| Site no navegador padrão | `run_intent open_url {"url":"https://www.youtube.com"}` |
| Site no Chrome | `run_intent open_url {"url":"https://www.youtube.com","browser":"chrome"}` |
| Pesquisa no Google | `run_intent browser_search {"query":"previsão do tempo São Paulo"}` |
| Google Maps | `open_url {"url":"https://www.google.com/maps/search/padaria+perto+de+mim"}` |
| Gmail / Drive | `https://mail.google.com` · `https://drive.google.com` |
| Wikipédia | `https://pt.wikipedia.org/wiki/Fotossíntese` |

`run_command` equivalente: `Start-Process chrome 'https://www.youtube.com'`.

## YouTube

| Objetivo | URL |
|---|---|
| Início | `https://www.youtube.com` |
| Busca | `https://www.youtube.com/results?search_query=never+gonna+give+you+up` (espaço vira `+`) |
| Vídeo, sabendo o id | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| Canal | `https://www.youtube.com/@NomeDoCanal` |

**Abrir um vídeo específico sem saber o id** (ex.: "abre o chrome e coloca o clipe Never Gonna Give You Up") —
3 passos, sem clicar na página do YouTube (a lista de resultados é enorme e cheia de anúncios; clicar nela erra muito):

1. `web_search {"query":"Never Gonna Give You Up Rick Astley youtube"}` → pegue o 1º link `https://www.youtube.com/watch?v=…`
   cujo título bate com o pedido (prefira "Official Video"/canal oficial).
2. `run_intent open_url {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","browser":"chrome"}`
3. `look` (elements) → confira que a janela se chama "<título> - YouTube" e responda:
   "Pronto, o vídeo <título> está tocando no Chrome."

Só se a pesquisa não trouxer nenhum `watch?v=`: abra `https://www.youtube.com/results?search_query=<título+com+mais>`,
`look` e `click` no link cujo nome é o **título do vídeo** (não o canal, não "Patrocinado"). Não clique por coordenada
na página do YouTube e não use Voltar/Avançar/Recarregar para "tentar de novo".

Comandos do player (com a janela do YouTube na frente): `press_keys k` (pausa/continua) · `f` (tela cheia) · `m` (mudo) ·
`shift+n` (próximo) · `l` (+10 s) · `j` (−10 s).

## Conferir e erros comuns

- Abriu? `run_command "Get-Process chrome | Where-Object MainWindowTitle | Select-Object -First 3 MainWindowTitle"` ou `look`.
- "não é reconhecido como nome de cmdlet/programa": o nome não é um executável → `open_app` (menu Iniciar) ou `Get-StartApps`.
- App da Microsoft Store não abre pelo `.exe`: use o protocolo (`spotify:`, `whatsapp:`) ou `shell:AppsFolder\<AppID>`.
- Nunca feche outras janelas nem mate processos para "arrumar" a tela.
