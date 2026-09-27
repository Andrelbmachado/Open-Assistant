/**
 * Computadores da rede (ROADMAP §15) ao vivo: lista vinda do Rust (`net_devices`), atualizada pelo
 * evento `net-devices-changed`. Mesmo padrão de `workflowRuns.ts`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import type { NetDevice } from "../utils/network";
import { isQAOffline } from "../utils/qaMode";

let devices: NetDevice[] = [];
let started = false;
const listeners = new Set<() => void>();

function emit() { for (const listener of listeners) listener(); }

export async function refreshNetDevices(): Promise<NetDevice[]> {
  if (isQAOffline()) return devices;
  try {
    devices = await invoke<NetDevice[]>("net_devices");
    emit();
  } catch { /* a rede ainda está iniciando */ }
  return devices;
}

function start() {
  if (started || isQAOffline()) return;
  started = true;
  void refreshNetDevices();
  void listen("net-devices-changed", () => { void refreshNetDevices(); });
  // A rede liga em segundo plano: tenta de novo nos primeiros segundos.
  let tries = 0;
  const timer = setInterval(() => { tries += 1; if (devices.length || tries > 10) clearInterval(timer); void refreshNetDevices(); }, 1500);
}

export function useNetDevices(): NetDevice[] {
  start();
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => devices, () => devices);
}

/** Computadores que podem responder o chat daqui (pareados, online, com a IA liberada e com modelos). */
export function usableRemoteDevices(list: NetDevice[]): NetDevice[] {
  return list.filter((device) => !device.self && device.paired && device.online && device.models.length > 0 && device.permissions?.usarIA !== false);
}
