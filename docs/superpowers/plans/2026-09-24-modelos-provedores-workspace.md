# Modelos, provedores e workspace limpo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar operações locais de IA de forma compreensível e tornar controles do chat/workspace mais limpos e administráveis.

**Architecture:** O backend Tauri emitirá eventos incrementais de operação; helpers puros normalizarão progresso e explicações. O React consumirá esses eventos, persistirá configurações não secretas e manterá credenciais no backend atual. Controles visuais serão componentes acessíveis com hover como atalho, nunca como único caminho.

**Tech Stack:** React, TypeScript, Vitest, Tauri 2, Rust, Windows Credential Manager, Ollama CLI.

**Spec:** `docs/superpowers/specs/2026-09-24-modelos-provedores-e-workspace-design.md`

## Global Constraints

- QA offline não executa processo, rede, microfone nem lê/grava credencial real.
- Instalar runtime e baixar modelo exigem confirmação explícita fora do QA.
- Pausar equivale a interromper com segurança e retomar um novo `ollama pull`; não alegar pausa nativa.
- Segredos ficam fora do armazenamento do frontend.

## Review Focus

- Saída de `ollama pull` sem percentual deve permanecer legível sem ETA inventado — Task 1.
- Cancelamento de uma operação concluída não pode matar outro processo — Task 1.
- Um provedor personalizado malformado não pode ser selecionado pelo chat — Task 2.
- Hover não pode tornar a troca de área inacessível por teclado/touch — Task 3.
- QA deve emitir progresso simulado sem invocar comandos ou rede — Tasks 1 e 4.

---

### Task 1: Progresso de operação local

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src/utils/localOperation.ts`
- Create: `src/utils/localOperation.test.ts`
- Modify: `src/components/SettingsView.tsx`

**Interfaces:**
- Produces `formatLocalOperation(operation, recommendation)` para o cartão de download.
- Produces eventos `local-model-operation` com `progressPercent`, `phase`, `bytesPerSecond` e `etaSeconds` opcionais.

- [ ] Escrever testes de operação para percentual conhecido, percentual ausente e estado pausado.
- [ ] Rodar `npm test -- localOperation.test.ts` e observar falha de importação.
- [ ] Implementar helper e streaming Rust de linhas do `ollama pull`; implementar pausa segura, cancelar e retomar.
- [ ] Rodar os testes do helper e `cargo test`.
- [ ] Exibir scan, cartões de capacidade explicada e barra de progresso/controles em Configurações.

### Task 2: CRUD de provedores

**Files:**
- Create: `src/utils/providers.ts`
- Create: `src/utils/providers.test.ts`
- Modify: `src/store/store.tsx`
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/utils/aiService.ts`

**Interfaces:**
- Produces `ProviderConfig` e `validateProviderConfig`.
- Consumes o armazenamento persistente da store e comandos existentes de credenciais por id.

- [ ] Escrever testes para id estável, URL válida e bloqueio de provedor personalizado incompleto.
- [ ] Rodar `npm test -- providers.test.ts` e observar falha de importação.
- [ ] Implementar persistência, formulário Adicionar/Editar/Excluir e seleção de modelo no Chat.
- [ ] Rodar testes do helper e assegurar que QA permanece em memória.

### Task 3: Controles compactos do chat e áreas

**Files:**
- Modify: `src/components/ChatView.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/blender.css`
- Modify: `src/refined.css`

**Interfaces:**
- Consumes `orbitalSkin` existente na store.
- Produces botão de projeto sem seta e seletor de área com menu acessível.

- [ ] Escrever testes puros para a decisão de revelar somente um canto e alternar menu por hover/foco.
- [ ] Rodar teste e observar falha.
- [ ] Implementar menu de área, cantos individualizados e seletor de orbital nas configurações.
- [ ] Rodar testes e validar por QA local em 1280×720 e 1040×680.

### Task 4: Verificação e distribuição QA

**Files:**
- Modify: `evidencias/RELATORIO-DESIGN-CHAT-QA.md`

- [ ] Rodar `npm test`, `cargo test` e `npm run build`.
- [ ] Executar `npm run build:qa`, atualizar código/evidências e EXE em `Desktop\Assistente pessoal`.
- [ ] Testar a operação QA simulada, o CRUD sem credencial real e os controles de hover.
