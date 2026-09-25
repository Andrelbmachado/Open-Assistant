# Dev — núcleo estilo Claude Code / Codex

Aqui o Qwen **pode** planejar. Os scripts ainda executam.

## open_vscode

Aliases: abre o vscode, abre o vs code, abre o cursor, abre o projeto
Script: `scripts/windows/open_vscode.ps1`
Param: `path` opcional

## git_status / git_diff

Safe. cwd = pasta do projeto atual (memória ou cwd da sessão).

## git_commit

Confirm. Mensagem extraída do pedido ou gerada pelo Qwen e mostrada antes.

## run_command

Confirm. Allowlist. Nunca `Invoke-Expression` da string crua do modelo.
Prefira intents específicos (`npm_install`, `pytest`) quando existirem.

## install_app

Confirm. Windows: `winget install --exact --accept-package-agreements`.
Nunca baixe installer de site aleatório se o winget tiver o pacote.
