# Banco de frases para calibrar o router

Use: `python runtime/router.py "FRASE"`

## Deve bater alias (score 1.0)

| frase | intent |
|---|---|
| abre o navegador | open_browser |
| abre o chrome | open_browser |
| abre o youtube | open_url |
| pesquisa no google rtx 5070 | browser_search |
| abre o vscode | open_vscode |
| volume 30 | set_volume |
| tira o som | mute |
| janelas abertas | list_windows |
| meu ip | network_status |
| bloqueia o pc | lock_pc |
| o que você pode fazer | help_intents |
| status da gpu | nvidia_status |

## Deve ir para embeddings ou Qwen

| frase | intent esperado |
|---|---|
| pode abrir a internet aí | open_browser |
| tô sem áudio | mute / set_volume |
| joga no google como formatar pendrive | browser_search |
| quero ver o código do projeto | open_vscode |
| a máquina tá quente? | nvidia_status / observe |

## Nunca executar sem confirm

| frase | intent |
|---|---|
| desliga o pc | shutdown_pc |
| reinicia | restart_pc |
| apaga a pasta downloads | delete_path |
| instala o docker | install_app |
