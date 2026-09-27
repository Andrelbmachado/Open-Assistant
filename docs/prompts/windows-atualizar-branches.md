# Prompt para o PC Windows — novas branches e atualização do app

Cole no Claude/Codex do PC Windows, na pasta do repositório Open-Assistant.

```text
O repositório github.com/Andrelbmachado/Open-Assistant mudou de organização. Atualize este PC e o app.

## O que mudou
- `main` agora É a versão Windows. Ela recebeu todo o conteúdo da antiga `feat/agente-local` (rede iroh, agente local, tela Remoto etc.).
- `Mac` é a branch do app macOS (o conteúdo antigo da `main`: projeto Xcode e parte web).
- Foram APAGADAS: `feat/agente-local` (virou a `main`) e `windows-native` (já estava inteira dentro da `feat/agente-local`, nada se perdeu).
- A `main` teve o histórico reescrito (foi trocada pela da `feat/agente-local`), então um `git pull` simples na `main` antiga vai dar conflito. Siga os passos abaixo.

## Passos
1. Salve qualquer trabalho local que não esteja no GitHub:
   - `git status`; se houver mudanças: `git stash push -u -m "antes-da-troca-de-branches"`.
   - Se houver commits locais não enviados em `feat/agente-local` ou `windows-native`, crie uma branch de backup: `git branch backup/<nome-antigo> <nome-antigo>`.
2. Atualize as referências e limpe as branches apagadas:
   - `git fetch origin --prune`
3. Coloque a `main` local exatamente igual à do GitHub:
   - `git switch main` (se não existir: `git switch -c main origin/main`)
   - `git reset --hard origin/main`
   - `git branch --set-upstream-to=origin/main main`
4. Apague as branches locais antigas (só depois do backup do passo 1):
   - `git branch -D feat/agente-local windows-native` (ignore se alguma não existir)
5. Se fez stash no passo 1: `git stash pop` e resolva conflitos, se houver.
6. Confira: `git log -1 --oneline` deve bater com o último commit da `main` no GitHub, e `docs/prompts/` deve ter `windows-rede-reconexao.md` e este arquivo.

## Atualizar o software
7. Dependências: `npm install` (ou o gerenciador usado no repo) e `cargo fetch` em `src-tauri`.
8. Rode os testes: `cargo test` em `src-tauri` e os testes do front, se existirem. Relate falhas, não ignore.
9. Gere o instalador: `npm run tauri build` (NSIS). Feche o Open Assistant antes.
10. Instale por cima da versão atual (dados em `%LOCALAPPDATA%\com.openassistant.windows` e `rede\confiaveis.json` são mantidos — NÃO apague a pasta `rede`, senão perde o pareamento com o Mac).
11. Abra o app, vá em Remoto e confira: este PC aparece, o Mac "Andres-MacBook-Pro" continua no histórico.

## Depois
12. Siga `docs/prompts/windows-rede-reconexao.md` (porta fixa, Internet sem reabrir, reconexão, logs e MCP da rede). Trabalhe direto na `main` ou numa branch curta que volte para a `main`.
13. Daqui para frente: trabalho do Windows vai para a `main`; nunca empurre código Windows na branch `Mac`.
```
