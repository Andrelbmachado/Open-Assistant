# PLANO — Open Assistant

Objetivo: assistente pessoal open source, gratuito, local ou com chave de API, que faz tudo e serve de base para o Design-Master.

## Fase 0 — Higiene do agente (rápido)
- [x] Adicionar ao `CLAUDE.md`/`AGENTS.md` os 4 princípios do Karpathy (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven). — seção "Princípios (Karpathy)" no `AGENTS.md` (o `CLAUDE.md` já importa o `AGENTS.md`).
- [x] CI no GitHub Actions: `npm ci`, `npm test` (vitest), `tsc`, `cargo check` em `windows-latest`. — `.github/workflows/ci.yml`.
- [x] Corrigir no README os links `file:///c:/...` (só funcionam no PC do André). — viraram nomes de arquivo simples.

## Fase 1 — Local + nuvem
- [x] Chat com provedores em nuvem usando as chaves já salvas no Gerenciador de Credenciais (OpenAI, Anthropic, Google, OpenRouter). — já existia para os demais; **OpenRouter** adicionado (`cloud.rs` + `cloudModels.ts`).
- [x] Seletor único "Local / Nuvem" com custo estimado por mensagem. — o seletor já reúne Instalados/Rede/Nuvem/BitNet; **custo estimado por mensagem** adicionado nas linhas da nuvem (`cloudPricing.ts`).
- [x] Presets MCP extras: Playwright (modo leitura), Composio. — `mcpPresets.ts` (`playwright-read` e `composio`).

## Fase 2 — Memória e conhecimento
- [ ] Memória de longo prazo (Mem0 ou OpenMemory, rodando local).
- [ ] RAG sobre arquivos do usuário com rerank e **abstenção abaixo de um limiar** ("não está nos documentos").
- [ ] Avaliar CAG para documentos pequenos e estáveis.

## Fase 3 — Voz e ações
- [ ] Disparar ações a partir do reconhecimento parcial (agir antes da frase terminar).
- [ ] Skill de ligação telefônica (Bland AI) — opcional, custo por minuto.
- [ ] WhatsApp via WA-AKG — opcional; **risco de banimento do número** (não usa a API oficial).

## Fase 4 — Segurança e avaliação
- [ ] Suite de evals com tarefas fixas do agente.
- [ ] Teste com página maliciosa (prompt injection) no loop de navegação/controle do PC.
- [ ] Guardrails para comandos destrutivos (já existe confirmação; cobrir com testes).

## Fase 5 — Multiplataforma
- [ ] Build macOS (Tauri) com equivalentes das skills do Windows.
- [ ] Build Linux.

## Fase 6 — Assistentes especializados
- [ ] Sistema de "perfis/especialistas" (prompt, ferramentas, memória próprios).
- [ ] Primeiro especialista: Design-Master.

## Merge pendente (aguardando confirmação do André)
- [ ] Trazer o commit próprio do fork `openclaw-assistant` (app desktop Windows do OpenClaw + painel de agentes) para uma branch nova `openclaw-import` — ver inventário no PR.
