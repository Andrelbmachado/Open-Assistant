# Novas ferramentas: Artemis, OpenViking, Bonsai 2, GLM-5.3-Flash, Unsloth e Paperclip (ROADMAP §16)

Pesquisado em 2026-09-27. Máquina do André: RTX 5070 12 GB, 15 GB de RAM, Windows 11.
Regra de todos: cada ferramenta começa com um **teste de viabilidade**, que pode aprovar ou reprovar (como o AuK, reprovado em português). Só integra o que passar.

## Resumo

| Ferramenta | O que é | Licença | Roda neste PC? | Papel no Open Assistant | Prioridade |
|---|---|---|---|---|---|
| **GLM-5.3-Flash / FlashX** (Zhipu/Z.ai) | Modelo 320B MoE (18B ativos), multimodal, 1M de contexto, ferramentas | MIT (pesos) | **Não** (precisa de ~90 GB+ mesmo quantizado) | Provedor de nuvem barato (Flash US$ 0,15/0,50 por 1M tokens; FlashX é o mesmo modelo, mais rápido, ~200 tok/s) | 1 (pequeno) |
| **Bonsai 2 27B** (PrismML) | Modelo 27B em pesos ternários (7,8 GB), raciocínio, visão, ferramentas, 262K de contexto | Apache-2.0 | **Sim** (cabe nos 12 GB) | Modelo local "grande" ao lado do qwen3.5:9b | 2 |
| **OpenViking** (ByteDance/Volcengine) | Banco de contexto para agentes: memória, conhecimento e skills num sistema de arquivos `viking://` com resumos L0/L1/L2 | **AGPL-3.0** | Sim (Python + Ollama para embeddings) | Contexto enxuto para modelos pequenos (−34% a −91% de tokens nos testes deles) | 3 |
| **Artemis** (Google) | Agente que controla **celular Android** por linguagem natural (99% no AndroidWorld), com servidor MCP | Apache-2.0 | Sim (ADB + Python); o modelo é Gemini/Claude/GPT-4o/Qwen-VL | "Controlar o celular" pelo chat e pelos nodes; celular aparece na página Rede | 4 |
| **Unsloth** (núcleo) / Unsloth Studio | Fine-tuning rápido (QLoRA) com exportação GGUF → Ollama | Núcleo Apache-2.0; **Studio (interface) AGPL-3.0** | Sim, QLoRA de modelos até ~9B | "Sonhos profundos": ensinar o modelo local com o que deu certo no uso | 5 |
| **Paperclip** | Orquestra um "time/empresa" de agentes: organograma, metas, orçamento, heartbeats; Node + React | MIT | Sim (Node 24) | Time de agentes em cima dos agentes do Open Assistant (inclusive os de outros PCs da rede) | 6 |

**Licenças AGPL (OpenViking, Unsloth Studio):** instalar sob demanda como programa separado, que o app só chama por HTTP/CLI. Não embutir o código no app. Assim o Open Assistant não precisa virar AGPL.

## 1. GLM-5.3-Flash / FlashX: provedor de nuvem
- **Teste (30 min):** chave de API da Z.ai. Uma conversa e uma chamada com ferramenta (`controlar_computador`) pelo endpoint compatível com OpenAI, conferindo o português, a velocidade e o custo.
- **Integração:** mais um provedor em `src/utils/cloudModels.ts` (ids `glm-5.3-flash` e `glm-5.3-flashx`), chave no Gerenciador de Credenciais como os outros. Nada de código novo no Rust: o `cloud_chat` já fala o formato OpenAI.
- **Atenção:** as conversas vão para servidores da Zhipu (China). O seletor mostra isso na descrição do modelo.

## 2. Bonsai 2 27B: modelo local grande
- **Teste (1 h):**
  - baixar o llama.cpp do fork PrismML (há build Windows CUDA 12.4: `llama-prism-…-bin-win-cuda-12.4-x64.zip`) e o GGUF `PQ2_0` (7,8 GB);
  - medir tok/s na RTX 5070, o português e a chamada de ferramentas;
  - comparar com o qwen3.5:9b nos mesmos 10 pedidos do E2E.
  - Aprova se ficar ≥ 25 tok/s e o português for bom.
- **Integração:** igual ao BitNet.
  - receita `bonsai2-27b` em `tools.rs` (binário do fork + GGUF);
  - `llama-server` em `127.0.0.1` sob demanda;
  - comando Rust `local_openai_chat` (reaproveita o formato OpenAI do `cloud_chat`, apontando para localhost e emitindo `ollama-chat-delta`);
  - o seletor de modelos ganha "Bonsai 2 27B · local";
  - o agente passa a aceitar tool_calls no formato OpenAI (hoje só no formato Ollama).
- **VRAM:** descarrega o Ollama antes, como na geração de imagem.

## 3. OpenViking: contexto para modelos pequenos
- **Teste (meio dia):**
  - `pip install openviking` num ambiente isolado (receita `py-openviking`, com uv), configurado com **Ollama** para embeddings (ex.: `qwen3-embedding`) e o qwen3.5:9b como VLM;
  - importar a `memoria-da-ia.md`, as skills e o `docs/` do projeto;
  - medir, em 20 perguntas, tokens de entrada e acerto do qwen3.5:9b **com** e **sem** OpenViking.
  - Aprova se o acerto não cair e os tokens caírem pelo menos 30%.
- **Integração:**
  - servidor local iniciado pelo app;
  - antes de cada resposta, o app pede ao OpenViking só os trechos L0/L1 relevantes (no lugar de mandar toda a memória e todas as skills);
  - os "Sonhos" passam a fazer `commit` da sessão do dia (o OpenViking extrai memórias em Markdown, que o usuário vê e edita);
  - vira mais um fluxo do sistema no Node Editor ("Buscar contexto").

## 4. Artemis: controlar o celular Android
- **Teste (meio dia, precisa do celular do André com "Depuração USB" ligada):**
  - rodar o `start.bat`, conectar por USB e pedir "abra o YouTube e procure receita de bolo";
  - ver qual modelo ele exige: hoje Gemini/Claude/GPT-4o ou Qwen-VL; o modelo leve no próprio aparelho ainda está no roadmap deles;
  - testar se aceita um Qwen-VL local pelo Ollama. Se só funcionar com nuvem, usar a chave Gemini que o app já suporta.
- **Integração:**
  - receita `py-artemis` (uv + ADB);
  - registrar o servidor MCP do Artemis no `mcp.json` do app (o app já fala MCP);
  - no chat: "no celular, …" vai para o Artemis (mesmo padrão do "no PC-Sala, …");
  - o celular aparece na **página Rede** com ícone próprio (novo tipo `phone`), conectado por USB/ADB;
  - nó "Celular" no Node Editor;
  - política de segurança: mesmas confirmações do agente do PC para compras, mensagens e pagamentos.

## 5. Unsloth: "Sonhos profundos" (fine-tuning)
Os Sonhos de hoje criam **skills** (texto). O próximo passo é **ensinar o próprio modelo**.
- **Dados:** só conversas e tarefas do agente que deram certo e que o usuário **aprovou** para treino (opt-in por conversa). Nunca dados de terceiros sem autorização. Formato JSONL de chat.
- **Teste (1 noite):**
  - núcleo Unsloth (Apache) em ambiente isolado com PyTorch CUDA 12.8 (a receita `Pip { torch_cuda: true }` já existe no app);
  - QLoRA do qwen3.5 4B (ou 9B, se couber) com ~200 exemplos;
  - exportar em GGUF e criar `open-assistant-pessoal` no Ollama;
  - comparar num conjunto fixo de 30 tarefas (antes × depois). Aprova se melhorar e não piorar nas outras.
- **Integração:**
  - fluxo do sistema "Sonhos profundos": semanal, de madrugada, só com o PC parado e a GPU livre;
  - o modelo novo entra como opção no seletor, com o original sempre disponível (dá para voltar);
  - o Unsloth Studio (AGPL) fica como botão opcional "Abrir estúdio de treino" para quem quiser mexer à mão.

## 6. Paperclip: time de agentes
- **Teste (meio dia):** instalar pelo pacote fixado no GitHub (tag/commit, não o `curl | bash` do site), criar uma "empresa" local e contratar um agente pelo adaptador **HTTP** (heartbeat) que chama o Open Assistant.
- **Integração:**
  - o app expõe um endpoint local só em 127.0.0.1, com token, que recebe tarefas do Paperclip e as executa com o agente/modelo local;
  - agentes do usuário e do sistema (e os de outros PCs da rede) aparecem como "funcionários";
  - orçamento em tokens/tempo de GPU em vez de dólares;
  - a tela Agentes ganha "Abrir o painel do time (Paperclip)".
- **Alternativa se o teste reprovar:** trazer só os conceitos (organograma, metas, orçamento e heartbeat) para a tela Agentes, sem depender do Paperclip.

## Ordem sugerida
1 GLM (rápido) → 2 Bonsai (maior ganho local) → 3 OpenViking → 4 Artemis (precisa do celular) → 5 Unsloth (precisa de dados acumulados pelos Sonhos) → 6 Paperclip.
