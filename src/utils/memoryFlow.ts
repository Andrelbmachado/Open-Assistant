/**
 * Aprender com a mensagem do chat relatando cada etapa ao fluxo do sistema "Salvar memória"
 * (`systemWorkflows.ts`). A gravação do arquivo acontece depois, em `store/memoryFile.ts`, que fecha o rastro.
 */
import { applyDetected, detectMemory, type DetectedMemory, type UserMemory } from "./memory";
import { holdTrace, releaseTrace, type SystemTrace } from "../store/systemTrace";
import { SYS_MEMORY_SAVE } from "./systemWorkflows";

export const MEMORY_TRACE_KEY = SYS_MEMORY_SAVE;

function describeDetected(detected: DetectedMemory): string {
  return [detected.callMe && `Chamar de ${detected.callMe}`, detected.name && `Nome: ${detected.name}`, ...detected.facts].filter(Boolean).join(" · ");
}

export function learnWithTrace(memory: UserMemory, text: string, open: () => SystemTrace): { memory: UserMemory; changes: string[] } {
  const detected = detectMemory(text);
  if (!detected.facts.length && !detected.callMe && !detected.name) return { memory, changes: [] };
  releaseTrace(MEMORY_TRACE_KEY)?.end("Substituído por um pedido mais novo.");
  const trace = open();
  trace.step("mensagem", text);
  trace.step("detectar", describeDetected(detected));
  const learned = applyDetected(memory, detected);
  if (!learned.changes.length) {
    trace.step("juntar", "Já estava salvo.");
    trace.skip("gravar");
    trace.end("Nada novo: já estava na memória.");
    return learned;
  }
  trace.step("juntar", learned.changes.join(" · "));
  trace.wait("gravar");
  holdTrace(MEMORY_TRACE_KEY, trace, "gravar");
  return learned;
}
