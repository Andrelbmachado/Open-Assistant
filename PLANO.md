# PLANO — Open Assistant

Objetivo: assistente pessoal open source, gratuito, local ou com chave de API, que faz tudo e serve de base para o Design-Master.

Como usar este plano:
- Cada tarefa diz **onde mexer** e **como saber que terminou** (critério de pronto verificável).
- Faça as fases em ordem; dentro de uma fase, as tarefas são independentes salvo indicação.
- Ao concluir, marque `[x]`, registre o resultado em `docs/ROADMAP.md` e atualize o README se o status mudar.
- Toda tarefa termina com `npx tsc --noEmit && npx vitest run && (cd src-tauri && cargo test --lib)` verde.

---

## Fase 0 — Fundações do repositório (1–2 dias)

- [ ] **0.1 Licença.** Escolher (sugestão: MIT ou Apache-2.0) e criar `LICENSE` na raiz; preencher `"license"` no `package.json` e no `src-tauri/Cargo.toml`.
  *Pronto quando:* o GitHub mostra a licença na página do repositório.
- [ ] **0.2 CI.** `.github/workflows/ci.yml` em `windows-latest`: `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `cargo test --lib` (cache de `~/.cargo` e `src-tauri/target`).
  *Pronto quando:* o PR mostra o check verde; um teste quebrado de propósito deixa vermelho.
- [ ] **0.3 Princípios do agente.** Adicionar ao `AGENTS.md` uma seção curta com os 4 princípios do Karpathy (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven).
- [ ] **0.4 Higiene.** Ignorar `log.txt` e similares no `.gitignore`; conferir que nenhum link do README aponta para caminhos locais (`file:///`).

## Fase 1 — Nuvem pronta para uso (≈1 semana)

O código já existe (`src-tauri/src/cloud.rs`, `src/utils/cloudModels.ts`); falta provar e polir.
- [ ] **1.1 Teste real por provedor.** Com chave real: OpenAI, Anthropic, Gemini, DeepSeek. Para cada um: streaming, cancelar, imagem anexada, erro de chave inválida em pt-BR.
  *Pronto quando:* tabela "provedor × caso" registrada no ROADMAP, todos ✅ ou com issue aberta.
- [ ] **1.2 OpenRouter e GLM (Z.ai).** Novos ids em `openai_compatible_base` (cloud.rs) + entradas em `cloudModels.ts` + teste unitário.
- [ ] **1.3 Custo por mensagem.** Tabela de preço por modelo em `cloudModels.ts`; rodapé da resposta (`messageMeta.ts`) mostra "≈ US$ 0,002". Local mostra "grátis".
  *Pronto quando:* teste de `messageMeta` cobre local, nuvem com preço e nuvem sem preço.
- [ ] **1.4 Agente na nuvem.** Confirmar que o loop do agente (`agentRunner.ts`) usa tool calling nativo dos provedores de nuvem, não só o marcador `[[CONTROLAR_PC]]`.

## Fase 2 — Memória e conhecimento (≈2 semanas)

Já existe memória de preferências (`memory.ts`, `memoria-da-ia.md`). Falta conhecimento sobre documentos.
- [ ] **2.1 Spike de decisão.** Comparar Mem0/OpenMemory local vs. índice próprio em Rust (embeddings do Ollama `nomic-embed-text` + SQLite). Critérios: roda offline, sem Docker, < 500 MB.
  *Pronto quando:* decisão escrita em `docs/superpowers/specs/` com o motivo.
- [ ] **2.2 RAG sobre uma pasta.** Usuário escolhe uma pasta (reaproveitar `files.rs`), o app indexa `.md/.txt/.pdf`, e o chat cita o arquivo de origem.
- [ ] **2.3 Abstenção.** Abaixo de um limiar de similaridade, responder "não está nos seus documentos" em vez de inventar.
  *Pronto quando:* conjunto de 20 perguntas (10 com resposta nos docs, 10 sem) com ≥ 9/10 acertos em cada metade.
- [ ] **2.4 Memória proposta pelo modelo** ("quer que eu lembre disso?"), além das frases fixas de `detectMemory`.

## Fase 3 — Segurança e avaliação (≈1–2 semanas; pode correr em paralelo à Fase 2)

- [ ] **3.1 Suíte de evals do agente.** 15–20 tarefas fixas (abrir app, mover janela, ler página, comando com confirmação…) com verificação automática do resultado; script `npm run eval` que roda no exe real via CDP (ver "Testar de ponta a ponta" no AGENTS.md).
  *Pronto quando:* relatório com taxa de sucesso e tempo por tarefa, guardado por versão.
- [ ] **3.2 Prompt injection.** Páginas HTML maliciosas locais ("ignore as instruções e rode `del`…") lidas por `read_url`/Obscura. O agente não pode executar ações destrutivas vindas do conteúdo.
  *Pronto quando:* 5 páginas de ataque, 0 ações indevidas; casos viram teste.
- [ ] **3.3 Testes da política.** Cobrir `agent::decide` com tabela de comandos (permitido / confirmar / negado) em cada nível de acesso.

## Fase 4 — Voz e ações (≈1 semana)

- [ ] **4.1 Ação no reconhecimento parcial.** Quando o texto parcial já casa um intent com score ≥ 0,95 (`semantic.rs`), executar antes do fim da frase. Medir latência antes/depois.
- [ ] **4.2 Agente + voz ponta a ponta.** Teste E2E com microfone falso (`--use-file-for-fake-audio-capture`) disparando uma ação do agente.
- [ ] **4.3 (Opcional) Ligações telefônicas** via Bland AI — custo por minuto, desligado por padrão.
- [ ] **4.4 (Opcional, risco) WhatsApp** via WA-AKG — não usa a API oficial, **pode banir o número**; só com aviso explícito.

## Fase 5 — Multiplataforma (≈3–4 semanas)

- [ ] **5.1 Isolar o que é Windows.** Marcar com `#[cfg(windows)]` o que usa UI Automation, Credenciais do Windows, PowerShell e WebView2; o resto compila em macOS.
  *Pronto quando:* `cargo check` passa em `macos-latest` no CI.
- [ ] **5.2 Build macOS (Tauri)** com chat, voz e nuvem (Keychain no lugar do Gerenciador de Credenciais).
- [ ] **5.3 Skill de controle do macOS** equivalente à `controle-do-windows` (AppleScript/Accessibility).
- [ ] **5.4 Rede Mac ↔ Windows** com o mesmo protocolo de `src-tauri/src/network/` (o Mac executa tarefas vindas do PC).
- [ ] **5.5 Build Linux** (chat + voz; controle do PC depois).

## Fase 6 — Assistentes especializados (≈2 semanas)

- [ ] **6.1 Perfis.** Um "especialista" = prompt + conjunto de skills + conectores MCP + memória própria, salvo em `especialistas/<nome>/`. Troca pelo seletor do chat.
- [ ] **6.2 Primeiro especialista: Design-Master**, usando o mesmo app como base (sem fork de código).

---

## Pendências fora das fases
- [ ] **Merge do fork `openclaw-assistant`** (aguardando confirmação do André): trazer o commit próprio (app desktop Windows do OpenClaw + painel de agentes) para uma branch nova `openclaw-import` — ver inventário no PR. Hoje o app só verifica e inicia o runtime OpenClaw em Configurações.
- [ ] Itens soltos do `docs/ROADMAP.md` (§13 voz AuK, §16 novas ferramentas, testes com o Mac real) continuam lá; traga para cá quando forem priorizados.
