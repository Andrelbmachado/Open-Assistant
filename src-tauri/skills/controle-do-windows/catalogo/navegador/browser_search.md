---
id: browser_search
risk: safe
script_windows: scripts/windows/browser_search.ps1
params:
  - name: query
    type: string
    required: true
  - name: engine
    type: enum
    values: [google, duckduckgo, bing]
    default: google
---

# browser_search

Abre a busca no navegador. Não “pesquisa internamente” no modelo.

## Aliases

pesquisa no google
pesquisa por
busca na internet
google
search
procura na web
---

## Extração

Tudo depois de “pesquisa”, “busca”, “google” vira `query`.
