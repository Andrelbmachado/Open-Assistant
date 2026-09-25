---
id: open_app
risk: safe
script_windows: scripts/windows/open_app.ps1
params:
  - name: app
    type: string
    required: true
  - name: args
    type: string
    required: false
---

# open_app

Abre um aplicativo instalado pelo nome amigável.

## Aliases

abre o
abrir o
open
inicia o
sobe o
abre a

## Resolução de nome

Use `memoria/apps.yaml`. Exemplos:

| falou | app_id |
|---|---|
| vs code, vscode, código | vscode |
| explorer, arquivos | explorer |
| terminal, powershell | terminal |
| discord | discord |
| spotify | spotify |
| steam | steam |
| bloco de notas, notepad | notepad |
| calculadora | calc |
| whatsapp | whatsapp |
| obs | obs |

Se não achar, `Get-StartApps` e match fuzzy. Se 2+ candidatos, `clarify`.
