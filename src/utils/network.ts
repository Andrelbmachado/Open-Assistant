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
  /** Última vez que respondeu (segundos desde 1970): histórico dos computadores já conectados. */
  lastSeen?: number;
  /** Endereços salvos no histórico (`ip:porta` ou `relay:<url>`). */
  addrs?: string[];
}

/** Link para conectar outro computador de uma vez: endereço deste + o código atual. */
export const CONNECT_LINK_PREFIX = "openassistant://conectar/";

export function connectLink(deviceId: string, code: string): string {
  return `${CONNECT_LINK_PREFIX}${deviceId}?codigo=${code}`;
}

/** Aceita o link (`openassistant://conectar/<endereço>?codigo=123456`) ou só o endereço colado (como o app do Mac mostra). */
export function parseConnectLink(text: string): { deviceId: string; code: string | null } | null {
  const value = text.trim();
  const link = value.match(/^openassistant:\/\/conectar\/([0-9a-f]{64})(?:\?codigo=([\d\s-]+))?$/i);
  if (link) return { deviceId: link[1].toLowerCase(), code: link[2] ? normalizePairCode(link[2]) : null };
  return /^[0-9a-f]{64}$/i.test(value) ? { deviceId: value.toLowerCase(), code: null } : null;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function lastSeenLabel(seconds: number | undefined, now = Date.now() / 1000): string {
  if (!seconds) return "nunca";
  const ago = Math.max(0, now - seconds);
  if (ago < 60) return "agora";
  if (ago < 3600) return `há ${Math.floor(ago / 60)} min`;
  if (ago < 86400) return `há ${Math.floor(ago / 3600)} h`;
  const days = Math.floor(ago / 86400);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
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

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "No PC-Sala, abra o Chrome" → tarefa para o agente daquele computador (fase 2 da rede).
 * Só vale para computadores conectados (pareados) que não são este. Hífen, espaço e maiúsculas no nome não importam.
 */
export function parseRemoteTarget(text: string, devices: NetDevice[]): { deviceId: string; deviceName: string; task: string } | null {
  const candidates = devices.filter((device) => device.paired && !device.self).sort((a, b) => b.name.length - a.name.length);
  for (const device of candidates) {
    const name = device.name.trim().split(/[-_\s]+/).map(escapeRegex).join("[-_\\s]+");
    if (!name) continue;
    const pattern = new RegExp(`^\\s*(?:no|na|pelo|pela|em|usando o|usando a)\\s+(?:(?:computador|pc|notebook|note|mac|macbook)\\s+)?${name}(?=$|[\\s,:;.-])[\\s,:;.-]*(.*)$`, "iu");
    const match = text.match(pattern);
    if (!match) continue;
    const task = match[1].trim();
    return task ? { deviceId: device.id, deviceName: device.name, task } : null;
  }
  return null;
}
