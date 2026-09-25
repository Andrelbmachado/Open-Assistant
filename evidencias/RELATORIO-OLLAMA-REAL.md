# Evidências — Open Assistant com Ollama real

Data: 24/09/2026 · Executável: `Desktop\Assistente pessoal\Open Assistant.exe` (versão normal, sem QA)

Hardware: NVIDIA GeForce RTX 5070 (12 GB VRAM) · 15 GB RAM · Ollama 0.20.6

## Causa raiz do chat que não funcionava

- A versão aberta era a **QA Offline**, que simula download e resposta de propósito.
- Mesmo na versão normal, o chat chamava `http://127.0.0.1:11434` direto da WebView. No Windows a
  origem do Tauri é `http://tauri.localhost`, que o Ollama recusa com **403** (CORS). Verificado com
  `Invoke-WebRequest -Headers @{Origin="http://tauri.localhost"}` → 403.
- Correção: todas as chamadas ao Ollama passam pelo backend Rust (`ollama_list_models`,
  `ollama_pull_model`, `ollama_stop_pull`, `ollama_chat`, `ollama_cancel_chat`).

## Teste de aceite (executável real, sem simulação)

| Critério | Resultado |
|---|---|
| Download pelo app com tamanho, bytes, MB/s, ETA e barra | `150 MB de 6,1 GB · 30,1 MB/s · cerca de 3 min 25 s` |
| Pausar interrompe de fato | 0 MB gravados pelo processo `ollama` em 4 s após pausar |
| Retomar continua de onde parou | retomou em 1.001 MB (15%), não do zero |
| `ollama list` mostra o modelo | `qwen3.5:9b  6488c96fa5fa  6.6 GB` |
| Usar modelo seleciona no chat | menu `+ › Modelo de IA` mostra `qwen3.5:9b` em Instalados |
| Chat responde com metadado `Ollama (<modelo>)` | `Ollama (qwen3.5:9b) · 79 tok/s` |
| tok/s reais | vindos de `eval_count / eval_duration` do Ollama (79–85 tok/s na RTX 5070) |
| Ollama desligado → erro claro, sem fallback | “O Ollama não está respondendo em 127.0.0.1:11434…” com botão Iniciar Ollama |
| Recuperação | Iniciar Ollama no balão de erro → próxima resposta normal |
| Parar geração | resposta marcada `Ollama (qwen3.5:9b) · interrompida`, texto parcial mantido |
| Esforço Alto (raciocínio) | bloco “Raciocínio do modelo” + resposta correta |

## Testes automatizados

- `npm test`: 59 testes (catálogo por hardware, progresso de download, serviço de chat sem fallback, Markdown).
- `cargo test -- --include-ignored`: 15 testes, incluindo `live_ollama_lists_models_and_answers`
  (`modelo=qwen3.5:9b resposta="ok" tok/s≈126`).

## Observação

- O Escape não fechou menus nem o modal durante a automação de tela (nem o handler antigo de
  Configurações). Fechar clicando fora e pelo X funciona. Vale confirmar com o teclado físico.
