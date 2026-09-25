# Roadmap — onde paramos e o que falta

> Lista viva para qualquer IA (Claude, Codex) ou pessoa retomar o trabalho.
> Marque `[x]` ao concluir e registre decisões importantes em "Notas".
> Branch de trabalho: `feat/agente-local` (remoto `origin`).

## 1. Voz, ferramentas e modelos (sessão 2026-09-24) — concluído
- [x] Corrigir "microfone desconectado" (webkitSpeechRecognition do WebView2 falha com `network`) → voz local sherpa-onnx
- [x] Configurações › Voz (microfone, teste, modelo de reconhecimento, voz)
- [x] Configurações › Ferramentas de IA agrupadas por empresa, com download/remoção
- [x] BitNet b1.58 no seletor de modelos (bitnet.cpp compilado localmente, commit fixado)
- [x] Phi-4, Llama 3.2 Vision, Gemma 3 no catálogo; imagens anexadas vão para modelos com visão
- [x] Corrigido: anexos nunca eram anexados (bug do `onChange` do input de arquivo)

## 2. Ajustes visuais (sessão 2026-09-25)
- [ ] Indicador "pensando": Pac-Man de lado comendo 3 bolinhas que vêm em sua direção
- [ ] Quina arredondada entre sidebar e topbar (canto interno do painel de conteúdo)
- [ ] Ícone correto no botão "Novo Chat"
- [ ] Área do usuário: nome ao lado da foto (alinhado à esquerda)
- [ ] Trocar a bolinha verde por ícone de computador (local) ou nuvem (nuvem)
- [ ] Nome do modelo no fim da resposta, ao lado dos tokens
- [ ] Configurações: cards internos com o cinza do fundo (sem azul)
- [ ] Ferramentas de IA: filtros como texto cinza sem fundo

## 3. Agente que controla o PC (skill "controle-do-windows")
- [ ] Backend Rust `computer.rs`: print da tela (reduzido), elementos de UI (UI Automation) numerados, mouse, teclado, janelas, comandos cmd/PowerShell, busca web e leitura de páginas em texto compacto
- [ ] Mouse próprio: janela transparente sempre no topo, fora dos prints, que anima até o alvo antes do clique
- [ ] Ollama com tool calling (tools, tool_calls, mensagens `tool`, `num_ctx` maior)
- [ ] Loop do agente no front (passos visíveis no chat, parar, limite de passos)
- [ ] Permissões: Somente leitura / Perguntar / Automático + comandos perigosos sempre pedem confirmação + fail-safe (mouse no canto superior esquerdo aborta)
- [ ] Skill `controle-do-windows` (SKILL.md + referências: comandos, Chrome, scripts, MCP) embutida no app e carregada no prompt do agente
- [ ] Teste real: abrir Chrome → clicar na URL → digitar site → Enter → print → confirmar

## 4. Conectores MCP
- [ ] Cliente MCP (stdio JSON-RPC) no Rust; `mcp.json` no formato do Claude Desktop
- [ ] Configurações › Conectores MCP com presets de um clique
- [ ] Ferramentas MCP expostas ao agente como `mcp__servidor__ferramenta`

## 5. Código "AI-ready"
- [ ] `AGENTS.md` (+ `CLAUDE.md` apontando para ele): mapa do projeto, comandos, convenções
- [ ] `docs/ARCHITECTURE.md`: fluxo de dados, eventos, comandos Tauri
- [ ] Comentários de documentação nas funções exportadas e módulos principais

## 6. Entrega
- [ ] Testes (vitest + cargo test) verdes, build `npm run build:app`
- [ ] Exe copiado para `Desktop\Assistente pessoal\Open Assistant.exe` (antigo em `_versoes-anteriores`)
- [ ] Commit + push de `feat/agente-local`

## Próximas etapas (depois desta sessão)
- Integrar NeMo Guardrails como filtro das ações do agente (hoje: lista de bloqueio própria)
- Orquestração multiagente com AutoGen (planejador → executor → verificador)
- Agente "construtor de apps": cria projeto, roda, tira print do app, compara com o pedido, corrige
- Florence-2 para OCR/detecção quando o modelo de chat não tiver visão boa

## Notas
- Voz: ver `src-tauri/src/speech.rs`; runtime baixada em `%LOCALAPPDATA%\com.openassistant.windows\tools`.
- BitNet: commit do bitnet.cpp fixado em `tools.rs` (`BITNET_COMMIT`); o main de jul/2026 degrada o texto.
