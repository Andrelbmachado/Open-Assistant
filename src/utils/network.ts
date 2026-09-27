/**
 * Rede de computadores do Open Assistant (ROADMAP §15): tipos, malha da página Rede, código de
 * pareamento e ids de modelos que rodam em outro computador (`remote:<id>:<modelo>`).
 */

export type DeviceKind = "desktop" | "laptop" | "macbook" | "mac";

export interface NetDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  os: string;
  mac?: string;
  gpu?: string;
  models: string[];
  online: boolean;
  paired: boolean;
  self: boolean;
  link?: "local" | "internet";
  permissions?: { usarIA: boolean; controlar: boolean; atualizar: boolean };
}

export const REMOTE_PREFIX = "remote:";

export function formatPairCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function normalizePairCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function remoteModelId(deviceId: string, model: string): string {
  return `${REMOTE_PREFIX}${deviceId}:${model}`;
}

export function parseRemoteModel(id: string): { deviceId: string; model: string } | null {
  if (!id.startsWith(REMOTE_PREFIX)) return null;
  const rest = id.slice(REMOTE_PREFIX.length);
  const cut = rest.indexOf(":");
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { deviceId: rest.slice(0, cut), model: rest.slice(cut + 1) };
}

export function meshLayout(devices: NetDevice[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const self = devices.find((device) => device.self);
  const others = devices.filter((device) => !device.self);
  const radius = Math.max(60, Math.min(width, height) / 2 - 70);
  const nodes = [
    ...(self ? [{ id: self.id, x: cx, y: cy }] : []),
    ...others.map((device, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(others.length, 1);
      return { id: device.id, x: Math.round(cx + radius * Math.cos(angle)), y: Math.round(cy + radius * Math.sin(angle)) };
    }),
  ];
  const linked = devices.filter((device) => device.self || (device.online && device.paired));
  const edges: { from: string; to: string; link: "local" | "internet" }[] = [];
  for (let i = 0; i < linked.length; i++) for (let j = i + 1; j < linked.length; j++) {
    const a = linked[i];
    const b = linked[j];
    edges.push({ from: a.id, to: b.id, link: a.link === "internet" || b.link === "internet" ? "internet" : "local" });
  }
  return { nodes, edges };
}
