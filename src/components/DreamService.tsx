import { useEffect, useRef } from "react";
import { addProposals, getDreamState, setDreaming } from "../store/dreams";
import { useLocalModels } from "../store/localModelsStore";
import { useStore } from "../store/store";
import { traceSystem } from "../store/systemTrace";
import { askAI } from "../utils/aiService";
import { buildDreamPrompt, dayKey, isDreamTime, parseDreamProposals } from "../utils/dreams";
import { OLLAMA_MODEL_PREFIX } from "../utils/localCatalog";
import { isQAOffline } from "../utils/qaMode";
import { SYS_DREAMS } from "../utils/systemWorkflows";

/** Pedido para sonhar agora (botão na tela Agentes). */
export const DREAM_NOW_EVENT = "open-assistant-dream-now";

/**
 * "Sonhos": uma vez por noite (2h–6h, com o app aberto) ou no botão "Sonhar agora", o modelo local lê os
 * pedidos do dia e a memória e propõe skills e conectores. Só propõe: aprovar é com o usuário (tela Agentes).
 */
export function DreamService() {
  const { state } = useStore();
  const local = useLocalModels();
  const latest = useRef({ state, local });
  latest.current = { state, local };

  useEffect(() => {
    if (isQAOffline()) return;
    const dream = async (reason: "noite" | "manual") => {
      if (getDreamState().dreaming) return;
      const { state: current, local: models } = latest.current;
      const model = current.preferredModel?.startsWith(OLLAMA_MODEL_PREFIX) ? current.preferredModel : models.installed[0] ? `${OLLAMA_MODEL_PREFIX}${models.installed[0].name}` : undefined;
      const trace = traceSystem(SYS_DREAMS);
      trace.step("agendar", reason === "noite" ? "Madrugada, app aberto" : "Você pediu agora");
      if (!model) { trace.fail("propor", "Sem modelo local instalado"); setDreaming(false, "Instale um modelo local (ex.: qwen3.5:9b) para sonhar."); return; }
      setDreaming(true);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const since = reason === "noite" ? startOfDay.getTime() - 24 * 3600 * 1000 : startOfDay.getTime();
      const todays = current.chats.filter((chat) => chat.messages.some((message) => (message.startedAt ?? 0) >= since));
      const source = todays.length ? todays : current.chats.slice(0, 5);
      const requests = source.flatMap((chat) => chat.messages.filter((message) => message.sender === "user").map((message) => message.text)).filter(Boolean);
      const facts = current.memory.facts.map((fact) => fact.text);
      trace.step("ler", `${requests.length} pedidos, ${facts.length} memórias`);
      trace.wait("propor");
      try {
        const reply = await askAI(model, [{ role: "user", content: buildDreamPrompt(requests, facts) }], { effort: "fast", think: false });
        const proposals = parseDreamProposals(reply.text);
        trace.step("propor", proposals.length ? proposals.map((item) => `${item.kind}: ${item.name}`).join(" · ") : "Nada novo para propor");
        addProposals(proposals, dayKey(new Date()));
        trace.step("revisar", `${proposals.length} aguardando você na tela Agentes`);
        trace.skip("ativar", "só depois da sua aprovação");
        trace.end(`${proposals.length} propostas`);
        setDreaming(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        trace.fail("propor", message);
        setDreaming(false, message);
      }
    };
    const onDemand = () => void dream("manual");
    window.addEventListener(DREAM_NOW_EVENT, onDemand);
    const timer = setInterval(() => { if (isDreamTime(new Date(), getDreamState().lastDreamDay)) void dream("noite"); }, 10 * 60 * 1000);
    return () => { window.removeEventListener(DREAM_NOW_EVENT, onDemand); clearInterval(timer); };
  }, []);

  return null;
}
