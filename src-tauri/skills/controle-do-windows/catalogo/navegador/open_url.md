---
id: open_url
risk: safe
os: [windows, linux]
script_windows: scripts/windows/open_url.ps1
params:
  - name: url
    type: url
    required: true
---

# open_url

Abre uma URL no browser padrão.

## Aliases

abre o site
abrir url
abre https
vai no site
abre o link
open url
open site

## Extração

- Se o usuário colar `https://...` ou `www....`, isso é o param `url`.
- Se disser “abre o youtube”, normalize para `https://www.youtube.com`.
- Sites curtos comuns: youtube, gmail, github, whatsapp web, instagram, twitter/x.

## Guardas

- Recusar `javascript:`, `file:`, `data:`.
- Só `http` e `https`.
