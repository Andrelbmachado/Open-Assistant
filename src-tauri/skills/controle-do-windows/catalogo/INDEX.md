# INDEX de intents

O router e o Qwen só precisam deste arquivo no boot.
Detalhes ficam nos MDs por área.

Schema de cada linha:

`id` · risco · aliases principais

## Apps e janelas

| id | risco | aliases |
|---|---|---|
| open_browser | safe | abre o navegador, abrir navegador, open browser, abre o chrome, abre o edge, abre o firefox |
| open_url | safe | abre o site, abrir url, abre https, vai no site |
| browser_search | safe | pesquisa no google, busca na internet, pesquisa por |
| open_explorer | safe | abre o explorador, abrir pasta, abre o file explorer, win+e |
| open_app | safe | abre o, abrir o, open, inicia o, sobe o |
| focus_app | safe | foca no, traz pra frente, maximiza o |
| close_app | confirm | fecha o, fechar, encerra o |
| list_windows | safe | o que está aberto, janelas abertas, apps abertos |
| list_apps_installed | safe | programas instalados, o que tem instalado |
| kill_process | confirm | mata o processo, kill, força fechar |

## Sistema

| id | risco | aliases |
|---|---|---|
| set_volume | safe | volume, abaixa o som, aumenta o som, deixa o volume em |
| mute | safe | muda, silencia, tira o som, unmude, ativa o som |
| set_brightness | safe | brilho, escurece a tela, aumenta o brilho |
| open_settings | safe | abre as configurações, abre settings, configurações do windows |
| network_status | safe | status da rede, meu ip, estou online, wifi |
| flush_dns | confirm | flush dns, limpa dns |
| empty_recycle_bin | confirm | esvazia a lixeira |
| lock_pc | safe | bloqueia o pc, lock, win+l |
| sleep_pc | confirm | hiberna, sleep, suspende |
| shutdown_pc | confirm | desliga o pc, shutdown |
| restart_pc | confirm | reinicia, restart, reboot |
| screenshot | safe | print, captura a tela, screenshot |
| nvidia_status | safe | vram, uso da gpu, nvidia-smi |

## Arquivos

| id | risco | aliases |
|---|---|---|
| list_dir | safe | lista a pasta, o que tem em, ls, dir |
| open_path | safe | abre o arquivo, abre a pasta |
| search_files | safe | procura arquivo, achar arquivo, find file |
| copy_path | confirm | copia arquivo, copy |
| move_path | confirm | move arquivo, mover |
| delete_path | confirm | apaga, deletar, excluir arquivo |
| new_folder | safe | cria pasta, nova pasta |
| unzip | safe | extrai zip, descompacta |

## Clipboard e input

| id | risco | aliases |
|---|---|---|
| clipboard_get | safe | o que está copiado, lê clipboard |
| clipboard_set | safe | copia esse texto, copia pro clipboard |
| type_text | confirm | digita isso, escreve na janela |
| send_hotkey | confirm | aperta, atalho, win+ , ctrl+ |

## Dev

| id | risco | aliases |
|---|---|---|
| open_vscode | safe | abre o vscode, abre o vs code, abre o código |
| git_status | safe | git status, estado do repo |
| git_diff | safe | git diff |
| git_commit | confirm | commita, git commit |
| run_command | confirm | roda o comando, executa |
| install_app | confirm | instala, winget install |
| python_run | confirm | roda o python, executa o script |

## Automação

| id | risco | aliases |
|---|---|---|
| create_task | confirm | agenda tarefa, cria lembrete no windows |
| organize_downloads | confirm | organiza downloads |
| remember_pref | safe | meu browser padrão é, prefere usar |

## Fallback

| id | risco | aliases |
|---|---|---|
| observe | safe | o que está acontecendo no pc, status do sistema |
| help_intents | safe | o que você pode fazer, lista comandos, ajuda |
| clarify | safe | (interno) pedido incompleto |
