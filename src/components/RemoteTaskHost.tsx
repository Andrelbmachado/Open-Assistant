import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, LoaderCircle, MonitorSmartphone, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useLocalModels } from "../store/localModelsStore";
import { traceSystem, type SystemTrace } from "../store/systemTrace";
import { runAgent, type AgentStep } from "../utils/agentRunner";
import { OLLAMA_MODEL_PREFIX } from "../utils/localCatalog";
import { isQAOffline } from "../utils/qaMode";
import { SYS_REMOTE_CONTROL } from "../utils/systemWorkflows";

interface RemoteTask { id: string; fromId: string; fromName: string; task: string; needsConfirm: boolean }
interface Card extends RemoteTask { phase: "ask" | "running" | "done"; steps: AgentStep[]; result?: string; ok?: boolean; confirm?: { step: AgentStep; resolve: (answer: "allow" | "always" | "deny") => void } }

/**
 * Tarefas que outros computadores da rede mandam para o agente DESTE PC (ROADMAP §15, fase 2).
 * Sem a permissão "Controlar este PC", aparece um cartão para permitir/recusar; o agente roda aqui com a
 * política de acesso daqui, e cada etapa acende o fluxo do sistema "Controle remoto" (§11).
 */
export function RemoteTaskHost() {
  const { state } = useStore();
  const local = useLocalModels();
  const [cards, setCards] = useState<Card[]>([]);
  const latest = useRef({ state, local });
  latest.current = { state, local };

  useEffect(() => {
    if (isQAOffline()) return;
    const stop = listen<RemoteTask>("net-agent-task", (event) => {
      const task = event.payload;
      const trace = traceSystem(SYS_REMOTE_CONTROL);
      trace.step("pedido", `${task.fromName}: ${task.task}`);
      traces.set(task.id, trace);
      setCards((list) => [...list, { ...task, phase: task.needsConfirm ? "ask" : "running", steps: [] }]);
      if (!task.needsConfirm) { trace.step("confirmar", "Permissão \"Controlar este PC\" ligada"); void execute(task); }
      else trace.wait("confirmar");
    });
    return () => { void stop.then((unlisten) => unlisten()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const traces = useRef(new Map<string, SystemTrace>()).current;
  const update = (id: string, patch: Partial<Card>) => setCards((list) => list.map((card) => card.id === id ? { ...card, ...patch } : card));

  const reply = async (id: string, ok: boolean, text: string) => {
    const trace = traces.get(id);
    await invoke("net_agent_reply", { id, ok, text }).catch(() => undefined);
    trace?.step("responder", text.slice(0, 200));
    if (ok) trace?.end(`Tarefa feita: ${text.slice(0, 80)}`); else trace?.fail("responder", text);
    traces.delete(id);
  };

  const pickModel = (): string | undefined => {
    const { state: current, local: models } = latest.current;
    if (current.preferredModel?.startsWith(OLLAMA_MODEL_PREFIX)) return current.preferredModel;
    const first = models.installed[0]?.name;
    return first ? `${OLLAMA_MODEL_PREFIX}${first}` : undefined;
  };

  const execute = async (task: RemoteTask) => {
    const trace = traces.get(task.id);
    update(task.id, { phase: "running" });
    const model = pickModel();
    if (!model) {
      trace?.fail("agente", "Sem modelo local");
      update(task.id, { phase: "done", ok: false, result: "Este computador não tem um modelo local com ferramentas." });
      await reply(task.id, false, "O outro computador não tem um modelo local com ferramentas (ex.: qwen3.5:9b).");
      return;
    }
    trace?.wait("agente");
    let steps: AgentStep[] = [];
    try {
      const result = await runAgent({
        model,
        history: [],
        userText: task.task,
        access: latest.current.state.access,
        effort: latest.current.state.effort,
        requestId: crypto.randomUUID(),
        onStep: (step) => { steps = [...steps.filter((item) => item.id !== step.id), step]; update(task.id, { steps }); },
        confirm: (step) => new Promise((resolve) => update(task.id, { confirm: { step, resolve: (answer) => { update(task.id, { confirm: undefined }); resolve(answer); } } })),
        isCancelled: () => false,
      });
      trace?.step("agente", result.text.slice(0, 200));
      update(task.id, { phase: "done", ok: true, result: result.text });
      await reply(task.id, true, result.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trace?.fail("agente", message);
      update(task.id, { phase: "done", ok: false, result: message });
      await reply(task.id, false, message);
    }
  };

  const decide = (card: Card, allow: boolean) => {
    const trace = traces.get(card.id);
    if (allow) { trace?.step("confirmar", "Permitido aqui"); void execute(card); }
    else {
      trace?.fail("confirmar", "Recusado neste computador");
      traces.delete(card.id);
      update(card.id, { phase: "done", ok: false, result: "Você recusou." });
      void invoke("net_agent_reply", { id: card.id, ok: false, text: "Recusado no outro computador." }).catch(() => undefined);
    }
  };

  if (!cards.length) return null;
  return <div className="remote-task-stack" aria-live="polite">
    {cards.map((card) => <section key={card.id} className={`remote-task-card page-card ${card.phase}`}>
      <header><MonitorSmartphone size={16} /><div><b>{card.fromName}</b><small>quer usar este computador</small></div>
        {card.phase === "done" && <button className="icon-button" aria-label="Fechar" onClick={() => setCards((list) => list.filter((item) => item.id !== card.id))}><X size={14} /></button>}
      </header>
      <p className="remote-task-text">“{card.task}”</p>
      {card.phase === "ask" && <footer><button className="page-button" onClick={() => decide(card, false)}><X size={13} />Recusar</button><button className="page-button primary" onClick={() => decide(card, true)}><Check size={13} />Permitir</button></footer>}
      {card.steps.length > 0 && <ul className="remote-task-steps">{card.steps.map((step) => <li key={step.id} className={step.status}>{step.status === "running" ? <LoaderCircle size={12} className="spin" /> : step.status === "ok" ? <Check size={12} /> : <X size={12} />}{step.label}</li>)}</ul>}
      {card.confirm && <div className="remote-task-confirm"><ShieldAlert size={14} /><span>{card.confirm.step.reason ?? card.confirm.step.label}</span><button className="page-button" onClick={() => card.confirm?.resolve("deny")}>Não</button><button className="page-button primary" onClick={() => card.confirm?.resolve("allow")}>Sim</button></div>}
      {card.phase === "running" && !card.confirm && <p className="network-hint"><LoaderCircle size={12} className="spin" /> Fazendo…</p>}
      {card.phase === "done" && <p className={`remote-task-result ${card.ok ? "ok" : "error"}`}>{card.result}</p>}
    </section>)}
  </div>;
}
