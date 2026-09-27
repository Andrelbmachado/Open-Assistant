/**
 * Propostas dos "Sonhos" (ROADMAP §11, fase 3), guardadas neste PC. O serviço (`DreamService`) sonha à noite
 * ou no botão "Sonhar agora"; a tela Agentes mostra a fila para o usuário aprovar ou recusar.
 */
import { useSyncExternalStore } from "react";
import type { DreamProposal, ProposalStatus } from "../utils/dreams";

interface DreamState { proposals: DreamProposal[]; lastDreamDay?: string; dreaming: boolean; lastError?: string }

const KEY = "open-assistant-dreams";
const listeners = new Set<() => void>();

let state: DreamState = (() => {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}");
    return { proposals: Array.isArray(saved.proposals) ? saved.proposals : [], lastDreamDay: saved.lastDreamDay, dreaming: false };
  } catch { return { proposals: [], dreaming: false }; }
})();

function save() {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ proposals: state.proposals.slice(0, 60), lastDreamDay: state.lastDreamDay })); } catch { /* sem armazenamento */ }
}

function set(patch: Partial<DreamState>) {
  state = { ...state, ...patch };
  save();
  for (const listener of listeners) listener();
}

export function getDreamState(): DreamState { return state; }

export function useDreams(): DreamState {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => state, () => state);
}

export function setDreaming(dreaming: boolean, lastError?: string) { set({ dreaming, lastError }); }

export function addProposals(proposals: DreamProposal[], day: string) {
  set({ proposals: [...proposals, ...state.proposals], lastDreamDay: day });
}

export function setProposalStatus(id: string, status: ProposalStatus) {
  set({ proposals: state.proposals.map((item) => item.id === id ? { ...item, status } : item) });
}
