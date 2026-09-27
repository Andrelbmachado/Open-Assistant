/**
 * Fluxos do próprio Open Assistant, mostrados no editor de nodes para você ver o sistema funcionando.
 * Não são executados pelo motor: o código real do app acende cada node pelo rastro (`store/systemTrace.ts`).
 * Ficam fora do `state.workflows`, então não podem ser apagados nem editados.
 */
import { buildWorkflow, type WorkflowDoc } from "./workflow";

export const SYS_MEMORY_SAVE = "sys-memoria-salvar";
export const SYS_REMOTE_CONTROL = "sys-rede-controle";
export const SYS_CHAT_REPLY = "sys-chat-resposta";
export const SYS_REMOTE_SERVE = "sys-rede-atender";
export const SYS_DREAMS = "sys-sonhos";

export interface SystemAgent { id: string; name: string; role: string; workflowId: string }

function systemDoc(id: string, input: Parameters<typeof buildWorkflow>[0]): WorkflowDoc {
  return { ...buildWorkflow(input, 0), id };
}

const chatBranch = (id: string, title: string, about: string, code: string) => ({ id, kind: "trace.step", title, params: { about, code } });

export const SYSTEM_WORKFLOWS: WorkflowDoc[] = [
  systemDoc(SYS_CHAT_REPLY, {
    name: "Responder no chat",
    description: "Cada mensagem do chat escolhe um caminho: imagem, calculadora, outro computador, ação rápida, agente do PC ou modelo de IA.",
    nodes: [
      { id: "mensagem", kind: "trace.start", title: "Mensagem do chat", params: { about: "O que você escreveu ou falou.", code: "src/components/ChatView.tsx (send)" } },
      { id: "rotear", kind: "trace.step", title: "Escolher caminho", params: { about: "Regras do app decidem, sem gastar tokens, quem responde.", code: "src/components/ChatView.tsx (send)" } },
      chatBranch("imagem", "Gerar imagem", "Pedido de imagem vai para o gerador local (sd.cpp).", "src/components/ChatView.tsx (imageTurn)"),
      chatBranch("calculadora", "Calculadora do app", "Conta simples: resolvida na hora, zero tokens.", "src/utils/calc.ts"),
      chatBranch("rede", "Outro computador da rede", "\"No PC-Sala, …\": a tarefa vai para o agente daquele computador.", "src/utils/network.ts (parseRemoteTarget)"),
      chatBranch("acao", "Ação rápida (sem modelo)", "Pedido conhecido (\"abre o powershell\") roda direto do catálogo.", "src/utils/agentRunner.ts (matchAction)"),
      chatBranch("agente", "Agente do PC", "O agente usa ferramentas no computador (clicar, digitar, abrir apps).", "src/utils/agentRunner.ts (runAgent)"),
      chatBranch("modelo", "Modelo de IA", "Conversa normal com o modelo escolhido (local, nuvem ou de outro computador).", "src/utils/aiService.ts (askAI)"),
      { id: "resposta", kind: "trace.step", title: "Resposta no chat", params: { about: "O texto que aparece para você (e é falado, no modo voz).", code: "src/components/ChatView.tsx" } },
    ],
    connections: [
      { from: "mensagem", to: "rotear" },
      ...["imagem", "calculadora", "rede", "acao", "agente", "modelo"].flatMap((branch) => [{ from: "rotear", to: branch }, { from: branch, to: "resposta" }]),
    ],
  }),
  systemDoc(SYS_MEMORY_SAVE, {
    name: "Salvar memória",
    description: "Quando você pede no chat para lembrar de algo, o app detecta o pedido, junta à memória e grava em memoria-da-ia.md.",
    nodes: [
      { id: "mensagem", kind: "trace.start", title: "Mensagem do chat", params: { about: "Sua mensagem, do jeito que foi enviada.", code: "src/components/ChatView.tsx (send)" } },
      { id: "detectar", kind: "trace.step", title: "Detectar pedido de memória", params: { about: "Procura frases como \"lembre que…\", \"me chame de…\", \"não use emojis\".", code: "src/utils/memory.ts (detectMemory)" } },
      { id: "juntar", kind: "trace.step", title: "Juntar à memória", params: { about: "Acrescenta só o que ainda não estava salvo.", code: "src/utils/memory.ts (applyDetected)" } },
      { id: "gravar", kind: "trace.step", title: "Gravar memoria-da-ia.md", params: { about: "Grava o arquivo em %LOCALAPPDATA%\\com.openassistant.windows.", code: "src/store/memoryFile.ts → memory_file_write (Rust)" } },
    ],
    connections: [{ from: "mensagem", to: "detectar" }, { from: "detectar", to: "juntar" }, { from: "juntar", to: "gravar" }],
  }),
  systemDoc(SYS_REMOTE_SERVE, {
    name: "Atender outro computador",
    description: "Outro computador da sua rede usa a IA (Ollama/placa de vídeo) deste PC no chat dele.",
    nodes: [
      { id: "pedido", kind: "trace.start", title: "Pergunta de outro computador", params: { about: "Chega pelo túnel criptografado, só de computadores conectados com \"Usar a IA\" ligado.", code: "src-tauri/src/network/node.rs (ChatRequest)" } },
      { id: "modelo", kind: "trace.step", title: "Ollama deste PC", params: { about: "O modelo roda aqui, na placa de vídeo deste computador.", code: "src-tauri/src/lib.rs (run_chat_with)" } },
      { id: "resposta", kind: "trace.step", title: "Resposta enviada", params: { about: "Os pedaços da resposta voltam em streaming para o chat de quem perguntou.", code: "src-tauri/src/network/node.rs (ChatDelta/ChatDone)" } },
    ],
    connections: [{ from: "pedido", to: "modelo" }, { from: "modelo", to: "resposta" }],
  }),
  systemDoc(SYS_DREAMS, {
    name: "Sonhos",
    description: "À noite o modelo local revê o dia e propõe skills e conectores novos. Nada é ativado sem a sua aprovação.",
    nodes: [
      { id: "agendar", kind: "trace.start", title: "À noite (ou agora)", params: { about: "Uma vez por madrugada (2h–6h) com o app aberto, ou no botão Sonhar agora.", code: "src/components/DreamService.tsx" } },
      { id: "ler", kind: "trace.step", title: "Ler o dia", params: { about: "Pedidos das conversas do dia e a memória (memoria-da-ia.md).", code: "src/components/DreamService.tsx" } },
      { id: "propor", kind: "trace.step", title: "Modelo local propõe", params: { about: "Até 3 skills (SKILL.md) e 2 conectores (MCP), em JSON.", code: "src/utils/dreams.ts (buildDreamPrompt/parseDreamProposals)" } },
      { id: "revisar", kind: "trace.step", title: "Fila de revisão", params: { about: "Aparece na tela Agentes › Agentes do sistema para você aprovar ou recusar.", code: "src/components/AgentsView.tsx" } },
      { id: "ativar", kind: "trace.step", title: "Ativar o aprovado", params: { about: "Skill aprovada vira uma pasta nova de skills; conector aprovado leva você às Configurações de conectores.", code: "skill_create (Rust)" } },
    ],
    connections: [{ from: "agendar", to: "ler" }, { from: "ler", to: "propor" }, { from: "propor", to: "revisar" }, { from: "revisar", to: "ativar" }],
  }),
  systemDoc(SYS_REMOTE_CONTROL, {
    name: "Controle remoto",
    description: "Outro computador da sua rede pede para o agente deste PC fazer algo. Sem a permissão \"Controlar este PC\", quem está aqui aprova antes.",
    nodes: [
      { id: "pedido", kind: "trace.start", title: "Pedido de outro computador", params: { about: "Chega pelo túnel criptografado da rede (iroh), só de computadores conectados por código.", code: "src-tauri/src/network/node.rs (AgentTask)" } },
      { id: "confirmar", kind: "trace.step", title: "Confirmação neste PC", params: { about: "Se \"Controlar este PC\" estiver desligado, aparece um cartão para você permitir ou recusar.", code: "src/components/RemoteTaskHost.tsx" } },
      { id: "agente", kind: "trace.step", title: "Agente deste PC", params: { about: "O agente local faz a tarefa com a política de segurança daqui (Perguntar / Automático / Somente leitura).", code: "src/utils/agentRunner.ts (runAgent)" } },
      { id: "responder", kind: "trace.step", title: "Resposta ao outro computador", params: { about: "O resultado volta para o chat de quem pediu.", code: "net_agent_reply (Rust)" } },
    ],
    connections: [{ from: "pedido", to: "confirmar" }, { from: "confirmar", to: "agente" }, { from: "agente", to: "responder" }],
  }),
];

export const SYSTEM_AGENTS: SystemAgent[] = [
  { id: "sys-agente-chat", name: "Chat", role: "Decide quem responde cada mensagem: calculadora, ação rápida, agente, imagem, outro computador ou modelo.", workflowId: SYS_CHAT_REPLY },
  { id: "sys-agente-memoria", name: "Memória", role: "Guarda o que você pede para lembrar em memoria-da-ia.md.", workflowId: SYS_MEMORY_SAVE },
  { id: "sys-agente-atender", name: "Atender a rede", role: "Responde perguntas de outros computadores usando a placa de vídeo deste.", workflowId: SYS_REMOTE_SERVE },
  { id: "sys-agente-sonhos", name: "Sonhos", role: "À noite revê o dia e propõe skills e conectores novos para você aprovar.", workflowId: SYS_DREAMS },
  { id: "sys-agente-controle", name: "Controle remoto", role: "Recebe tarefas de outros computadores da sua rede e pede sua aprovação.", workflowId: SYS_REMOTE_CONTROL },
];

export function systemWorkflow(id?: string): WorkflowDoc | undefined {
  return id ? SYSTEM_WORKFLOWS.find((doc) => doc.id === id) : undefined;
}

export function isSystemWorkflow(id?: string): boolean {
  return Boolean(systemWorkflow(id));
}

/** Num fluxo do sistema o canvas só deixa navegar: trocar de workflow, criar um novo, ativar a área. */
export function allowedWhenReadOnly(type: string): boolean {
  return !type.startsWith("wf") || type === "wfOpen" || type === "wfCreate";
}
