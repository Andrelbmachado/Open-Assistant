import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, Download, Eye, EyeOff, Globe, KeyRound, Link2, LoaderCircle, Network, Radar, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { refreshNetDevices, useNetDevices, useRemoteActivity } from "../store/network";
import { formatPairCode, meshLayout, normalizePairCode, type NetDevice } from "../utils/network";
import { DEVICE_KIND_LABEL, DeviceIcon } from "./DeviceIcon";
import { PageHeader } from "./PageHeader";

interface Neighbor { ip: string; mac: string }
interface NetStatus { visible: boolean; internet: boolean; internetSaved: boolean; selfInfo: { id: string } }
type Permissions = NonNullable<NetDevice["permissions"]>;
interface InstallerFile { fileName: string; version: string; size: number; builtAt: number }
/** Envio do instalador para um computador (fase 3). */
interface UpdateSend { status: "sending" | "ok" | "error"; sent: number; total: number; text?: string }
type UpdateSends = Record<string, UpdateSend>;

const ICON = 46;

/**
 * Página Rede (ROADMAP §15): os computadores da sua rede numa malha, cada um com o seu ícone (PC de mesa,
 * notebook, MacBook, Mac) e uma linha entre cada par conectado. Conecta por código de 6 dígitos (tipo
 * AnyDesk) e mostra os aparelhos da rede local, inclusive os que ainda não têm o Open Assistant.
 */
export function NetworkView() {
  const devices = useNetDevices();
  const activity = useRemoteActivity();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState<NetStatus | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "code" } | { kind: "connect"; deviceId?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const mesh = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 380 });
  const [installer, setInstaller] = useState<InstallerFile | null>(null);
  const [sends, setSends] = useState<UpdateSends>({});

  useEffect(() => {
    void invoke<InstallerFile | null>("net_installer_info").then(setInstaller).catch(() => undefined);
    const stop = listen<{ deviceId: string; sent: number; total: number }>("net-update-progress", (event) => {
      const { deviceId, sent, total } = event.payload;
      setSends((current) => current[deviceId]?.status === "sending" ? { ...current, [deviceId]: { ...current[deviceId], sent, total } } : current);
    });
    return () => { void stop.then((unlisten) => unlisten()); };
  }, []);

  /** Manda o instalador; lá aparece "Instalar agora / Depois" e só instala se aceitarem. */
  const sendUpdate = async (device: NetDevice) => {
    setSends((current) => ({ ...current, [device.id]: { status: "sending", sent: 0, total: installer?.size ?? 0 } }));
    try {
      const text = await invoke<string>("net_send_update", { deviceId: device.id });
      setSends((current) => ({ ...current, [device.id]: { ...current[device.id], status: "ok", text } }));
    } catch (reason) {
      setSends((current) => ({ ...current, [device.id]: { ...current[device.id], status: "error", text: String(reason) } }));
    }
  };
  const updatable = devices.filter((device) => !device.self && device.paired && device.online);
  const updateAll = () => {
    if (!installer || !updatable.length) return;
    if (!confirm(`Enviar ${installer.fileName} para ${updatable.map((device) => device.name).join(", ")}? Em cada um aparece um aviso para instalar agora ou depois.`)) return;
    for (const device of updatable) void sendUpdate(device);
  };

  useEffect(() => {
    void refreshNetDevices();
    void invoke<NetStatus>("net_status").then((value) => { setStatus(value); setVisible(value.visible); }).catch(() => undefined);
    const loadNeighbors = () => void invoke<Neighbor[]>("net_lan_neighbors").then(setNeighbors).catch(() => undefined);
    loadNeighbors();
    const timer = setInterval(loadNeighbors, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = mesh.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(300, entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => meshLayout(devices, size.width, size.height), [devices, size]);
  const byId = new Map(devices.map((device) => [device.id, device]));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const discovered = devices.filter((device) => !device.self && !device.paired && device.online);
  const withoutApp = neighbors;

  const toggleVisible = () => {
    const next = !visible;
    setVisible(next);
    void invoke("net_set_visible", { visible: next }).catch(() => setVisible(!next));
  };

  const toggleInternet = () => {
    if (!status) return;
    const enabled = !status.internetSaved;
    if (enabled && !confirm("Conectar pela internet usa os servidores públicos do iroh (empresa n0) para achar este computador fora de casa. O conteúdo continua criptografado de ponta a ponta; o servidor só vê o endereço de rede. Vale ao reabrir o app. Ligar?")) return;
    void invoke("net_set_internet", { enabled }).then(() => setStatus({ ...status, internetSaved: enabled })).catch((reason) => setError(String(reason)));
  };

  return <section className="view page-view network-view">
    <PageHeader eyebrow="Sua rede" title="Computadores" icon={<Network size={17} />}>
      <button className={`page-button ${visible ? "" : "muted"}`} onClick={toggleVisible} title={visible ? "Outros computadores da rede local conseguem ver este" : "Só computadores já conectados enxergam este"}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}{visible ? "Visível" : "Invisível"}</button>
      <button className={`page-button ${status?.internetSaved ? "" : "muted"}`} onClick={toggleInternet} title={status && status.internetSaved !== status.internet ? "Vale ao reabrir o app" : "Conectar computadores fora da rede de casa (opcional)"}><Globe size={14} />{status?.internetSaved ? "Internet" : "Só local"}{status && status.internetSaved !== status.internet ? " · reabra" : ""}</button>
      <button className="page-button" onClick={() => setDialog({ kind: "code" })}><KeyRound size={14} />Meu código</button>
      <button className="page-button" disabled={!installer || !updatable.length} onClick={updateAll} title={installer ? `Envia ${installer.fileName} para os computadores conectados e online` : "Nenhum instalador encontrado (pasta Instalador ao lado do app)"}><Download size={14} />Atualizar todos</button>
      <button className="page-button primary" onClick={() => setDialog({ kind: "connect" })}><Link2 size={14} />Conectar por código</button>
    </PageHeader>
    <div className="page-scroll network-scroll">
      <p className="page-subtitle">Use a placa de vídeo de outro computador no chat: conecte os dois com um código e escolha o modelo dele em + › Modelo de IA.</p>
      <div className="network-main">
        <div className="network-mesh page-card" ref={mesh}>
          <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Malha de computadores conectados">
            {layout.edges.map((edge) => { const a = layout.nodes.find((node) => node.id === edge.from)!; const b = layout.nodes.find((node) => node.id === edge.to)!; return <line key={`${edge.from}-${edge.to}`} className={`mesh-edge ${edge.link} ${(byId.get(edge.from)?.self && activity[edge.to]) || (byId.get(edge.to)?.self && activity[edge.from]) ? "flowing" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
            {layout.nodes.map((node) => {
              const device = byId.get(node.id);
              if (!device) return null;
              return <g key={node.id} className={`mesh-node ${device.online ? "" : "offline"} ${device.self ? "self" : ""} ${device.paired ? "" : "unpaired"} ${selectedId === node.id ? "selected" : ""}`} transform={`translate(${node.x - ICON / 2}, ${node.y - ICON / 2})`} onClick={() => setSelectedId(node.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(node.id); }}>
                <circle className="mesh-halo" cx={ICON / 2} cy={ICON / 2} r={ICON / 2 + 10} />
                <DeviceIcon kind={device.kind} size={ICON} />
                <circle className={`mesh-dot ${device.online ? "on" : "off"}`} cx={ICON - 2} cy={4} r={4} />
                <text className="mesh-label" x={ICON / 2} y={ICON + 18}>{device.name}</text>
                <text className="mesh-sub" x={ICON / 2} y={ICON + 32}>{device.self ? "este computador" : !device.paired ? "não conectado" : device.online ? DEVICE_KIND_LABEL[device.kind] : "offline"}</text>
              </g>;
            })}
          </svg>
          {devices.length <= 1 && <p className="mesh-empty"><Radar size={15} />Procurando computadores com o Open Assistant na rede local…</p>}
        </div>
        {selected && <DevicePanel device={selected} installer={installer} send={sends[selected.id]} onSendUpdate={() => void sendUpdate(selected)} onClose={() => setSelectedId(null)} onConnect={() => setDialog({ kind: "connect", deviceId: selected.id })} onError={setError} />}
      </div>

      {error && <p className="node-note error network-error" onClick={() => setError(null)}>{error}</p>}

      {Object.keys(sends).length > 0 && <ul className="network-list network-updates">
        {Object.entries(sends).map(([id, send]) => <li key={id}><Download size={16} /><b>{byId.get(id)?.name ?? "Computador"}</b><UpdateStatus send={send} /><button className="icon-button" aria-label="Fechar" disabled={send.status === "sending"} onClick={() => setSends((current) => { const next = { ...current }; delete next[id]; return next; })}><X size={13} /></button></li>)}
      </ul>}

      <h3 className="agents-section-title">Encontrados na rede</h3>
      {discovered.length ? <ul className="network-list">
        {discovered.map((device) => <li key={device.id}><DeviceIcon kind={device.kind} size={22} /><b>{device.name}</b><small>{DEVICE_KIND_LABEL[device.kind]}{device.mac ? ` · ${device.mac}` : ""}</small><button className="page-button" onClick={() => setDialog({ kind: "connect", deviceId: device.id })}><Link2 size={13} />Conectar</button></li>)}
      </ul> : <p className="network-hint">Nenhum outro computador com o Open Assistant visível agora. Abra o app no outro computador (mesma rede Wi-Fi ou cabo).</p>}

      <h3 className="agents-section-title">Aparelhos da rede sem o Open Assistant</h3>
      {withoutApp.length ? <ul className="network-list">
        {withoutApp.map((item) => <li key={item.ip + item.mac}><Network size={16} /><b>{item.ip}</b><small>MAC {item.mac}</small><button className="page-button" title="Abre a pasta do instalador para você copiar para o outro computador" onClick={() => void invoke("net_reveal_installer").catch((reason) => setError(String(reason)))}><Send size={13} />Enviar instalador</button></li>)}
      </ul> : <p className="network-hint">A tabela da rede local está vazia ou ainda carregando.</p>}
    </div>
    {dialog?.kind === "code" && <CodeDialog address={status?.internet ? status.selfInfo.id : undefined} onClose={() => setDialog(null)} />}
    {dialog?.kind === "connect" && <ConnectDialog devices={devices} deviceId={dialog.deviceId} internet={Boolean(status?.internet)} onClose={() => setDialog(null)} />}
  </section>;
}

function UpdateStatus({ send }: { send: UpdateSend }) {
  if (send.status === "sending") {
    const percent = send.total ? Math.round((send.sent / send.total) * 100) : 0;
    return <small className="network-update-status"><LoaderCircle size={12} className="spin" />{send.sent ? `Enviando… ${percent}%` : "Esperando alguém aceitar lá…"}</small>;
  }
  return <small className={`network-update-status ${send.status}`}>{send.text}</small>;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

function DevicePanel({ device, installer, send, onSendUpdate, onClose, onConnect, onError }: { device: NetDevice; installer: InstallerFile | null; send?: UpdateSend; onSendUpdate: () => void; onClose: () => void; onConnect: () => void; onError: (message: string) => void }) {
  const permissions = device.permissions;
  const setPermission = (key: keyof Permissions, value: boolean) => {
    if (!permissions) return;
    if (key === "atualizar" && value && !confirm(`Permitir que ${device.name} mande versões do Open Assistant para instalar neste computador? Cada instalação ainda pede a sua confirmação aqui, e o instalador precisa vir assinado pela chave de ${device.name}.`)) return;
    void invoke("net_set_permissions", { deviceId: device.id, permissions: { ...permissions, [key]: value } }).then(() => refreshNetDevices()).catch((reason) => onError(String(reason)));
  };
  return <aside className="network-panel page-card">
    <header><DeviceIcon kind={device.kind} size={34} /><div><h3>{device.name}</h3><small>{DEVICE_KIND_LABEL[device.kind]} · {device.os}{device.self ? " · este computador" : ""}</small></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
    <dl>
      <dt>Estado</dt><dd>{device.self || device.online ? "online" : "offline"}{device.link === "local" ? " · rede local" : device.link === "internet" ? " · internet" : ""}</dd>
      {device.gpu && <><dt>Placa de vídeo</dt><dd>{device.gpu}</dd></>}
      {device.mac && <><dt>MAC</dt><dd><code>{device.mac}</code></dd></>}
      <dt>Modelos</dt><dd className="network-chips">{device.models.length ? device.models.map((model) => <span key={model}>{model}</span>) : <small>{device.paired ? "nenhum (o Ollama está aberto lá?)" : "aparece depois de conectar"}</small>}</dd>
    </dl>
    {!device.self && !device.paired && <button className="page-button primary" onClick={onConnect}><Link2 size={14} />Conectar por código</button>}
    {permissions && <div className="network-permissions">
      <span className="menu-section-label">O que este computador pode fazer aqui</span>
      <label><input type="checkbox" checked={permissions.usarIA} onChange={(event) => setPermission("usarIA", event.target.checked)} /><span><b>Usar a IA deste computador</b><small>Ele manda perguntas para o seu Ollama.</small></span></label>
      <label className="soon"><input type="checkbox" checked={permissions.controlar} disabled /><span><b>Controlar este computador</b><small>Chega na fase 2 (sempre com confirmação aqui).</small></span></label>
      <label><input type="checkbox" checked={permissions.atualizar} onChange={(event) => setPermission("atualizar", event.target.checked)} /><span><b>Instalar atualizações aqui</b><small>Ele pode mandar versões novas do app; você confirma cada instalação.</small></span></label>
    </div>}
    {!device.self && device.paired && <div className="network-update">
      <span className="menu-section-label">Atualizar o app lá</span>
      {installer ? <small>{installer.fileName} · {megabytes(installer.size)} · {new Date(installer.builtAt * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small> : <small>Nenhum instalador na pasta Instalador ao lado do app.</small>}
      <button className="page-button" disabled={!installer || !device.online || send?.status === "sending"} onClick={onSendUpdate}><Download size={13} />Enviar atualização</button>
      {send && <UpdateStatus send={send} />}
    </div>}
    {!device.self && device.paired && <button className="page-button danger" onClick={() => void invoke("net_forget", { deviceId: device.id }).then(() => { onClose(); void refreshNetDevices(); }).catch((reason) => onError(String(reason)))}><Trash2 size={13} />Esquecer este computador</button>}
  </aside>;
}

function CodeDialog({ address, onClose }: { address?: string; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(300);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    void invoke<string>("net_show_code").then((value) => { setCode(value); setLeft(300); }).catch((reason) => setFailure(String(reason)));
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="network-dialog-backdrop" onClick={onClose}>
    <div className="network-dialog page-card" role="dialog" aria-label="Meu código" onClick={(event) => event.stopPropagation()}>
      <header><KeyRound size={16} /><h3>Código deste computador</h3><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
      {failure ? <p className="node-note error">{failure}</p> : <>
        <p className="pair-code-big">{code ? formatPairCode(code) : "··· ···"}</p>
        <p className="network-hint center">Digite este código no outro computador, em Rede › Conectar por código.</p>
        {address && <div className="network-address"><span>Fora de casa, mande também este endereço:</span><code>{address}</code><button className="page-button" onClick={() => void navigator.clipboard.writeText(address)}><Copy size={13} />Copiar</button></div>}
        <p className="network-hint center">{left > 0 ? `Vale por ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · só uma vez` : "Expirou: feche e gere outro."}</p>
      </>}
    </div>
  </div>;
}

function ConnectDialog({ devices, deviceId, internet, onClose }: { devices: NetDevice[]; deviceId?: string; internet: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState(deviceId ?? "");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const candidates = devices.filter((device) => !device.self && !device.paired);
  const code = normalizePairCode(input);
  const connect = async () => {
    if (!code) return;
    setBusy(true);
    setMessage(null);
    const typed = address.trim();
    const order = typed ? [typed] : target ? [target] : candidates.map((device) => device.id);
    let last = "Nenhum computador encontrado na rede local. Abra o Open Assistant no outro computador e deixe \"Visível na rede\" ligado.";
    for (const id of order) {
      try {
        await invoke("net_pair", { deviceId: id, code });
        await refreshNetDevices();
        setBusy(false);
        onClose();
        return;
      } catch (reason) { last = String(reason); }
    }
    setMessage(last);
    setBusy(false);
  };
  return <div className="network-dialog-backdrop" onClick={onClose}>
    <div className="network-dialog page-card" role="dialog" aria-label="Conectar por código" onClick={(event) => event.stopPropagation()}>
      <header><Link2 size={16} /><h3>Conectar por código</h3><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
      <label className="network-field"><span>Computador</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Procurar na rede local</option>
          {candidates.map((device) => <option key={device.id} value={device.id}>{device.name} · {DEVICE_KIND_LABEL[device.kind]}</option>)}
        </select>
      </label>
      {internet && <label className="network-field"><span>Endereço do outro computador (só fora de casa)</span>
        <input className="address" spellCheck={false} placeholder="cole o endereço que aparece no código dele" value={address} onChange={(event) => setAddress(event.target.value)} />
      </label>}
      <label className="network-field"><span>Código de 6 dígitos</span>
        <input autoFocus inputMode="numeric" placeholder="000 000" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} />
      </label>
      {message && <p className="node-note error">{message}</p>}
      <footer><button className="page-button" onClick={onClose}>Cancelar</button><button className="page-button primary" disabled={!code || busy} onClick={() => void connect()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Link2 size={14} />}Conectar</button></footer>
    </div>
  </div>;
}
