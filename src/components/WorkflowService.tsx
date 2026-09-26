import { useEffect, useRef } from "react";
import { useStore } from "../store/store";
import { runAgent } from "../utils/agentRunner";
import { memoryPrompt } from "../utils/memory";
import { configureWorkflowService, runDueWorkflows } from "../utils/workflowService";
import { isQAOffline } from "../utils/qaMode";

/**
 * Serviço dos workflows (sem interface): entrega ao motor o estado atual e, a cada 30 s, roda os
 * workflows agendados que estão na hora. Os agendamentos só rodam com o Open Assistant aberto.
 */
export function WorkflowService() {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    configureWorkflowService({
      getState: () => stateRef.current,
      dispatch,
      runAgent: async (instruction) => {
        const current = stateRef.current;
        const model = current.preferredModel || current.chats.find((chat) => chat.id === current.activeChatId)?.model || "";
        const result = await runAgent({
          model,
          history: [],
          userText: instruction,
          access: current.access,
          effort: current.effort,
          requestId: crypto.randomUUID(),
          onStep: () => undefined,
          // Sem janela de confirmação durante a automação: o que pede permissão é recusado.
          confirm: async () => "deny",
          isCancelled: () => false,
          memory: memoryPrompt(current.memory),
        });
        return result.text;
      },
    });
  }, [dispatch]);

  useEffect(() => {
    if (isQAOffline()) return;
    const first = setTimeout(() => runDueWorkflows(), 8000);
    const timer = setInterval(() => runDueWorkflows(), 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  return null;
}
