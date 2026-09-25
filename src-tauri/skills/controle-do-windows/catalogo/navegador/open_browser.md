---
id: open_browser
risk: safe
os: [windows, linux]
script_windows: scripts/windows/open_browser.ps1
script_linux: scripts/linux/open_browser.sh
params:
  - name: browser
    type: enum
    values: [default, chrome, edge, firefox, brave]
    default: default
---

# open_browser

Abre o navegador preferido do usuário. Não navega para URL específica.

## Aliases

abre o navegador
abrir navegador
abre o chrome
abre o google chrome
abre o edge
abre o firefox
abre o brave
open browser
open chrome
sobe o chrome
inicia o navegador
abre a internet

## Resolução

1. Se o texto cita um browser, use esse.
2. Senão, leia `memoria/preferencias.md` → `browser=`.
3. Senão, o browser padrão do SO.

## Não fazer

- Não maximizar à força se já estiver aberto: foque a janela.
- Não abrir instância anônima a menos que peçam.
- Não usar screenshot.
