# Controlar o Chrome e sites

## Qual caminho usar
| Objetivo | Caminho | Custo |
|---|---|---|
| Só saber uma informação | `web_search` e depois `read_url` no melhor resultado | ~300–1500 tokens, sem abrir janela |
| Abrir um site para o usuário ver | `run_intent open_url` (`url`) | quase zero |
| Pesquisar no Google para o usuário ver | `run_intent browser_search` (`query`) | quase zero |
| Interagir (login já feito, formulário, botão) | Chrome + `look` + `click` / `type_text` | médio |
| Automação pesada de páginas (muitas etapas, formulários) | conector MCP Playwright ou Chrome DevTools (`references/mcp.md`) | médio, mais preciso |

## Atalhos que evitam cliques
| Atalho | Efeito |
|---|---|
| `ctrl+l` | foca a barra de endereço (depois `type_text` com `enter: true`) |
| `ctrl+t` / `ctrl+w` | nova aba / fecha aba |
| `ctrl+tab` / `ctrl+shift+tab` | próxima / anterior aba |
| `ctrl+1`…`ctrl+8` | ir para a aba N |
| `ctrl+f` | procurar na página |
| `ctrl+r` / `f5` | recarregar |
| `alt+left` / `alt+right` | voltar / avançar |
| `ctrl+shift+n` | janela anônima |
| `space` / `shift+space` | rolar página |
| `tab` / `shift+tab` | próximo / anterior campo |
| `ctrl+shift+j` | console do DevTools |

## Fluxo padrão ("entra no site X e faz Y")
1. `run_intent open_browser` (ou `focus_window` com "Chrome" se já estiver aberto).
2. `press_keys ctrl+l` → `type_text "site.com" enter:true`.
3. `look elements`: links e botões da página aparecem na lista quando o Chrome expõe acessibilidade.
4. `click element: N` no alvo; campos: clique e `type_text`.
5. Confira com `look` (elements; se a lista vier vazia, `both`).

## Dicas
- A lista de elementos inclui a barra de endereço como "campo de texto" com nome "Barra de endereço e de pesquisa".
- Se a página não aparece na lista, o Chrome ainda está carregando: espere com um novo `look`.
- Para ler uma página longa, prefira `read_url` com a URL atual a vários prints.
- Não digite senhas nem dados de cartão: peça ao usuário para fazer essa parte.
- Para abrir o Chrome controlável por automação: `Start-Process chrome -ArgumentList '--remote-debugging-port=9222','--user-data-dir=%LOCALAPPDATA%\OpenAssistant\chrome-agent'` (perfil separado; o usuário faz login nele uma vez).
