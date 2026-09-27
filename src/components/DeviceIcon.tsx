import type { DeviceKind } from "../utils/network";

/**
 * Ícones da página Rede, no traço dos ícones lucide do app. PC de mesa (monitor + gabinete), notebook
 * Windows (dobradiça reta, logo de 4 quadrados), MacBook (cantos redondos, entalhe na tela, base fina com
 * recorte) e Mac de mesa (tela única com queixo e pé) têm desenhos diferentes.
 */
export function DeviceIcon({ kind, size = 48 }: { kind: DeviceKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "desktop") return <svg {...common}><rect x="3" y="10" width="27" height="19" rx="2" /><path d="M12.5 35h8M16.5 29v6" /><rect x="34" y="8" width="11" height="29" rx="2" /><path d="M37.5 13h4M37.5 17h4" /><circle cx="39.5" cy="31" r="1.3" /></svg>;
  if (kind === "laptop") return <svg {...common}><rect x="9" y="10" width="30" height="20" rx="1.5" /><path d="M4 36h40l-3-6H7z" /><path d="M20 33.2h8" /><path d="M20.5 16.5h3v3h-3zM24.5 16.5h3v3h-3zM20.5 20.5h3v3h-3zM24.5 20.5h3v3h-3z" strokeWidth={1.2} /></svg>;
  if (kind === "macbook") return <svg {...common}><rect x="8.5" y="10" width="31" height="21" rx="3" /><path d="M21 10h6v1.4a1.2 1.2 0 0 1-1.2 1.2h-3.6A1.2 1.2 0 0 1 21 11.4z" /><path d="M3 34h42a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 34z" /><path d="M20.5 34.3h7" /></svg>;
  return <svg {...common}><rect x="5" y="6" width="38" height="26" rx="3" /><path d="M5 26.5h38" /><path d="M20 32l-1.4 7h10.8L28 32" /><path d="M15.5 39h17" /></svg>;
}

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = { desktop: "PC de mesa", laptop: "Notebook", macbook: "MacBook", mac: "Mac" };
