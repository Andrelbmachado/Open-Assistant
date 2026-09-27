/**
 * Fluxos do próprio Open Assistant, mostrados no editor de nodes para você ver o sistema funcionando.
 * Não são executados pelo motor: o código real do app acende cada node pelo rastro (`store/systemTrace.ts`).
 * Ficam fora do `state.workflows`, então não podem ser apagados nem editados.
 */
import { buildWorkflow, type WorkflowDoc } from "./workflow";

export const SYS_MEMORY_SAVE = "sys-memoria-salvar";
export const SYS_REMOTE_CONTROL = "sys-rede-controle";

export interface SystemAgent { id: string; name: string; role: string; workflowId: string }

function systemDoc(id: string, input: Parameters<typeof buildWorkflow>[0]): WorkflowDoc {
  return { ...buildWorkflow(input, 0), id };
}

export const SYSTEM_WORKFLOWS: WorkflowDoc[] = [
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
  { id: "sys-agente-memoria", name: "Memória", role: "Guarda o que você pede para lembrar em memoria-da-ia.md.", workflowId: SYS_MEMORY_SAVE },
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
