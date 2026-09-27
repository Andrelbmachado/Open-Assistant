import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardCopy, Copy, Download, FolderOpen, Globe, History, KeyRound, Link2, LoaderCircle, Network, Plus, Radar, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { refreshNetDevices, useNetDevices, useRemoteActivity } from "../store/network";
import { connectLink, formatPairCode, lastSeenLabel, meshLayout, normalizePairCode, parseConnectLink, type NetDevice } from "../utils/network";
import { DEVICE_KIND_LABEL, DeviceIcon } from "./DeviceIcon";
import { PageHeader } from "./PageHeader";

interface Neighbor { ip: string; mac: string }
interface NetStatus { visible: boolean; internet: boolean; internetSaved: boolean; selfInfo: { id: string } }
interface CurrentCode { code: string; expiresIn: number }
interface InstallerFile { fileName: string; version: string; size: number; builtAt: number }
/** Envio do instalador para um computador (fase 3). */
interface UpdateSend { status: "sending" | "ok" | "error"; sent: number; total: number; text?: string }
type UpdateSends = Record<string, UpdateSend>;

const ICON = 46;
/** Altura reservada no topo do mapa para a barra do código. */
const CODE_BAR_SPACE = 84;
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/**
 * Tela Remoto (ROADMAP §15): o mapa com os computadores conectados ocupa a tela toda. O código deste computador
 * fica sempre no topo; "+" conecta por código, por link ou a um computador do histórico; "Scan" procura na rede.
 * Quem é pareado pode tudo (usar a IA, controlar e mandar atualizações; a instalação ainda pede confirmação).
 */
export function NetworkView() {
  const devices = useNetDevices();
  const activity = useRemoteActivity();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<NetStatus | null>(null);
  const [code, setCode] = useState<CurrentCode | null>(null);
  const [scan, setScan] = useState<null | { loading: boolean; neighbors: Neighbor[] }>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: "code"; deviceId?: string } | { kind: "link" }>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [installer, setInstaller] = useState<InstallerFile | null>(null);
  const [sends, setSends] = useState<UpdateSends>({});
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const mesh = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });

  const loadStatus = () => void invoke<NetStatus>("net_status").then(setStatus).catch(() => undefined);
  const loadCode = () => void invoke<CurrentCode>("net_current_code").then(setCode).catch(() => undefined);

  useEffect(() => {
    void refreshNetDevices();
    loadStatus();
    loadCode();
    void invoke<InstallerFile | null>("net_installer_info").then(setInstaller).catch(() => undefined);
    // O código troca quando expira ou quando alguém o usa: confere de tempos em tempos e conta os segundos aqui.
    // O estado (Visível/Internet) também é relido: a tela pode abrir antes de a rede terminar de iniciar.
    const poll = setInterval(() => { loadCode(); loadStatus(); }, 5000);
    const tick = setInterval(() => setCode((current) => current && current.expiresIn > 0 ? { ...current, expiresIn: current.expiresIn - 1 } : current), 1000);
    const stop = listen<{ deviceId: string; sent: number; total: number }>("net-update-progress", (event) => {
      const { deviceId, sent, total } = event.payload;
      setSends((current) => current[deviceId]?.status === "sending" ? { ...current, [deviceId]: { ...current[deviceId], sent, total } } : current);
    });
    return () => { clearInterval(poll); clearInterval(tick); void stop.then((unlisten) => unlisten()); };
  }, []);

  useEffect(() => { if (code && code.expiresIn <= 0) loadCode(); }, [code]);

  useEffect(() => {
    const element = mesh.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(320, entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // No mapa: este computador e os conectados (histórico). Os achados na rede só aparecem depois do Scan.
  const shown = useMemo(() => devices.filter((device) => device.self || device.paired || (scan && device.online)), [devices, scan]);
  // A faixa de cima é da barra do código: o mapa é desenhado abaixo dela.
  const layout = useMemo(() => {
    const mapped = meshLayout(shown, size.width, size.height - CODE_BAR_SPACE);
    return { ...mapped, nodes: mapped.nodes.map((node) => ({ ...node, y: node.y + CODE_BAR_SPACE })) };
  }, [shown, size]);
  const byId = new Map(devices.map((device) => [device.id, device]));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const history = devices.filter((device) => !device.self && device.paired).sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  const discovered = devices.filter((device) => !device.self && !device.paired && device.online);
  const updatable = history.filter((device) => device.online);
  // Pareados offline que nunca foram vistos por IP da rede local: sem Internet, este PC não tem como achá-los.
  const neverLocal = status && !status.internet ? history.filter((device) => !device.online && !(device.addrs ?? []).some((addr) => !addr.startsWith("relay:"))) : [];

  const toggleVisible = () => {
    if (!status) return;
    const visible = !status.visible;
    setStatus({ ...status, visible });
    void invoke("net_set_visible", { visible }).catch(() => setStatus({ ...status }));
  };

  const [switchingInternet, setSwitchingInternet] = useState(false);
  /** Liga/desliga na hora: a rede reinicia sem reabrir o app. */
  const setInternet = async (enabled: boolean) => {
    if (enabled && !confirm("Conectar pela internet usa os servidores públicos do iroh (empresa n0) para achar este computador fora de casa. O conteúdo continua criptografado de ponta a ponta; o servidor só vê o endereço de rede. Ligar?")) return;
    setSwitchingInternet(true);
    try {
      await invoke("net_set_internet", { enabled });
      setNotice({ text: enabled ? "Internet ligada: reconectando os computadores…" : "Internet desligada: só a rede local." });
      await refreshNetDevices();
    } catch (reason) {
      setNotice({ text: String(reason), error: true });
    }
    loadStatus();
    setSwitchingInternet(false);
  };
  const toggleInternet = () => { if (status && !switchingInternet) void setInternet(!status.internetSaved); };

  const reconnectAll = async () => {
    setAddOpen(false);
    const answered = await invoke<string[]>("net_reconnect_all").catch(() => [] as string[]);
    await refreshNetDevices();
    const total = devices.filter((device) => !device.self && device.paired).length;
    setNotice({ text: total ? `${answered.length} de ${total} computadores responderam.` : "Nenhum computador no histórico ainda.", error: total > 0 && answered.length < total });
  };

  const copyReport = async () => {
    setAddOpen(false);
    try {
      await navigator.clipboard.writeText(await invoke<string>("net_report"));
      setNotice({ text: "Relatório copiado: cole na conversa com a IA." });
    } catch (reason) { setNotice({ text: String(reason), error: true }); }
  };

  const runScan = async () => {
    setScan((current) => ({ loading: true, neighbors: current?.neighbors ?? [] }));
    await invoke("net_reconnect_all").catch(() => undefined);
    await refreshNetDevices();
    const neighbors = await invoke<Neighbor[]>("net_lan_neighbors").catch(() => [] as Neighbor[]);
    setScan({ loading: false, neighbors });
  };

  const reconnect = async (device: NetDevice) => {
    setAddOpen(false);
    setReconnecting(device.id);
    try {
      await invoke("net_reconnect", { deviceId: device.id });
      await refreshNetDevices();
      setNotice({ text: `${device.name} conectado.` });
    } catch (reason) {
      setNotice({ text: `${device.name}: ${String(reason)}`, error: true });
    }
    setReconnecting(null);
  };

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
  const updateAll = () => {
    if (!installer || !updatable.length) return;
    if (!confirm(`Enviar ${installer.fileName} para ${updatable.map((device) => device.name).join(", ")}? Em cada um aparece um aviso para instalar agora ou depois.`)) return;
    for (const device of updatable) void sendUpdate(device);
  };

  const copyLink = () => {
    if (!status || !code) return;
    void navigator.clipboard.writeText(connectLink(status.selfInfo.id, code.code)).then(() => setNotice({ text: "Link copiado. Vale enquanto este código valer." }));
  };

  return <section className="view page-view network-view remote-view">
    <PageHeader eyebrow="Sua rede" title="Remoto" icon={<Network size={17} />}>
      <Switch on={Boolean(status?.visible)} label="Visível" title="Outros computadores da rede local conseguem ver este" onChange={toggleVisible} />
      <Switch on={Boolean(status?.internetSaved)} label={switchingInternet ? "Internet…" : "Internet"} title="Conectar computadores fora da rede de casa (liga na hora)" onChange={toggleInternet} />
      <button className={`page-button ${scan ? "active" : ""}`} onClick={() => void runScan()} title="Procura aparelhos na rede local"><Radar size={14} className={scan?.loading ? "spin" : ""} />Scan</button>
      <button className="page-button" disabled={!installer || !updatable.length} onClick={updateAll} title={installer ? `Envia ${installer.fileName} para os computadores conectados e online` : "Nenhum instalador na pasta Instalador ao lado do app"}><Download size={14} />Atualizar todos</button>
      <div className="remote-add">
        <button className="page-button primary remote-add-button" aria-haspopup="menu" aria-expanded={addOpen} aria-label="Conectar computador" title="Conectar computador" onClick={() => setAddOpen((open) => !open)}><Plus size={16} /></button>
        {addOpen && <>
          <div className="remote-add-backdrop" onClick={() => setAddOpen(false)} />
          <div className="remote-add-menu page-card" role="menu">
            <button role="menuitem" onClick={() => { setAddOpen(false); setDialog({ kind: "code" }); }}><KeyRound size={14} /><span><b>Conectar por código</b><small>Computador na mesma rede</small></span></button>
            <button role="menuitem" onClick={() => { setAddOpen(false); setDialog({ kind: "link" }); }}><Link2 size={14} /><span><b>Conectar por link</b><small>Cole o link ou o endereço do outro</small></span></button>
            <button role="menuitem" onClick={() => void reconnectAll()}><RefreshCw size={14} /><span><b>Reconectar todos</b><small>Sem código, pelos endereços salvos</small></span></button>
            <span className="menu-section-label"><History size={12} />Já conectados</span>
            {history.length ? history.map((device) => <button key={device.id} role="menuitem" onClick={() => void reconnect(device)}>
              <DeviceIcon kind={device.kind} size={20} /><span><b>{device.name}</b><small>{device.online ? "online" : `visto ${lastSeenLabel(device.lastSeen)}`}</small></span>
              {reconnecting === device.id ? <LoaderCircle size={13} className="spin" /> : <i className={`remote-dot ${device.online ? "on" : ""}`} />}
            </button>) : <small className="remote-add-empty">Nenhum ainda.</small>}
            <span className="menu-section-label">Diagnóstico</span>
            <button role="menuitem" onClick={() => void copyReport()}><ClipboardCopy size={14} /><span><b>Copiar relatório para IA</b><small>Estado e últimas 80 linhas do log</small></span></button>
            <button role="menuitem" onClick={() => { setAddOpen(false); void invoke("net_open_logs").catch((reason) => setNotice({ text: String(reason), error: true })); }}><FolderOpen size={14} /><span><b>Abrir logs da rede</b><small>Pasta rede (log.jsonl, estado.json)</small></span></button>
          </div>
        </>}
      </div>
    </PageHeader>

    <div className="remote-canvas" ref={mesh}>
      <div className="remote-code-bar page-card" aria-live="polite">
        <span>Código deste computador</span>
        <b className="remote-code">{code ? formatPairCode(code.code) : "··· ···"}</b>
        <small>{code ? `troca em ${Math.floor(code.expiresIn / 60)}:${String(code.expiresIn % 60).padStart(2, "0")}` : ""}</small>
        <button className="page-button" onClick={copyLink} disabled={!code || !status} title="Link com o endereço e o código deste computador"><Copy size={13} />Copiar link</button>
      </div>

      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Mapa dos computadores conectados">
        {layout.edges.map((edge) => { const a = layout.nodes.find((node) => node.id === edge.from)!; const b = layout.nodes.find((node) => node.id === edge.to)!; return <line key={`${edge.from}-${edge.to}`} className={`mesh-edge ${edge.link} ${(byId.get(edge.from)?.self && activity[edge.to]) || (byId.get(edge.to)?.self && activity[edge.from]) ? "flowing" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
        {layout.nodes.map((node) => {
          const device = byId.get(node.id);
          if (!device) return null;
          return <g key={node.id} className={`mesh-node ${device.online ? "" : "offline"} ${device.self ? "self" : ""} ${device.paired ? "" : "unpaired"} ${selectedId === node.id ? "selected" : ""}`} transform={`translate(${node.x - ICON / 2}, ${node.y - ICON / 2})`} onClick={() => setSelectedId(node.id)} onDoubleClick={() => { if (device.paired && !device.self && !device.online) void reconnect(device); }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(node.id); }}>
            <circle className="mesh-halo" cx={ICON / 2} cy={ICON / 2} r={ICON / 2 + 10} />
            <DeviceIcon kind={device.kind} size={ICON} />
            <circle className={`mesh-dot ${device.online ? "on" : "off"}`} cx={ICON - 2} cy={4} r={4} />
            <text className="mesh-label" x={ICON / 2} y={ICON + 18}>{device.name}</text>
            <text className="mesh-sub" x={ICON / 2} y={ICON + 32}>{device.self ? "este computador" : !device.paired ? "não conectado" : device.online ? DEVICE_KIND_LABEL[device.kind] : `offline · ${lastSeenLabel(device.lastSeen)}`}</text>
          </g>;
        })}
      </svg>
      {neverLocal.length > 0 && <div className="remote-hint page-card"><Globe size={15} /><span><b>{neverLocal.map((device) => device.name).join(", ")}</b> {neverLocal.length === 1 ? "nunca apareceu" : "nunca apareceram"} na rede local deste PC. Para conectar de outra rede, ligue <b>Internet</b> nos dois computadores.</span><button className="page-button primary" disabled={switchingInternet} onClick={() => void setInternet(true)}>Ligar Internet</button></div>}
      {history.length === 0 && <p className="remote-empty">Nenhum computador conectado ainda. Use <b>+</b> para conectar por código ou link, ou <b>Scan</b> para procurar na rede.</p>}

      {selected && !selected.self && <DeviceCard device={selected} installer={installer} send={sends[selected.id]} reconnecting={reconnecting === selected.id}
        onReconnect={() => void reconnect(selected)} onConnect={() => setDialog({ kind: "code", deviceId: selected.id })} onSendUpdate={() => void sendUpdate(selected)}
        onForget={() => void invoke("net_forget", { deviceId: selected.id }).then(() => { setSelectedId(null); void refreshNetDevices(); }).catch((reason) => setNotice({ text: String(reason), error: true }))}
        onClose={() => setSelectedId(null)} />}

      {scan && <aside className="remote-scan page-card">
        <header><Radar size={14} /><b>Encontrados na rede</b>{scan.loading && <LoaderCircle size={13} className="spin" />}<button className="icon-button" aria-label="Fechar" onClick={() => setScan(null)}><X size={13} /></button></header>
        <span className="menu-section-label">Com o Open Assistant</span>
        {discovered.length ? <ul className="network-list">{discovered.map((device) => <li key={device.id}><DeviceIcon kind={device.kind} size={20} /><b>{device.name}</b><small>{DEVICE_KIND_LABEL[device.kind]}{device.mac ? ` · ${device.mac}` : ""}</small><button className="page-button" onClick={() => setDialog({ kind: "code", deviceId: device.id })}><Link2 size={13} />Conectar</button></li>)}</ul>
          : <p className="network-hint">{scan.loading ? "Procurando…" : "Nenhum outro computador com o app visível agora."}</p>}
        <span className="menu-section-label">Sem o Open Assistant</span>
        {scan.neighbors.length ? <ul className="network-list">{scan.neighbors.map((item) => <li key={item.ip + item.mac}><Network size={15} /><b>{item.ip}</b><small>MAC {item.mac}</small><button className="page-button" title="Abre a pasta do instalador para você copiar para o outro computador" onClick={() => void invoke("net_reveal_installer").catch((reason) => setNotice({ text: String(reason), error: true }))}><Send size={13} />Enviar instalador</button></li>)}</ul>
          : <p className="network-hint">{scan.loading ? "Lendo a tabela da rede…" : "Nenhum aparelho encontrado."}</p>}
      </aside>}

      {(Object.keys(sends).length > 0 || notice) && <div className="remote-toasts">
        {notice && <p className={`remote-toast page-card ${notice.error ? "error" : ""}`} onClick={() => setNotice(null)}>{notice.text}</p>}
        {Object.entries(sends).map(([id, send]) => <div key={id} className="remote-toast page-card"><Download size={14} /><b>{byId.get(id)?.name ?? "Computador"}</b><UpdateStatus send={send} /><button className="icon-button" aria-label="Fechar" disabled={send.status === "sending"} onClick={() => setSends((current) => { const next = { ...current }; delete next[id]; return next; })}><X size={12} /></button></div>)}
      </div>}
    </div>

    {dialog?.kind === "code" && <CodeConnectDialog devices={devices} deviceId={dialog.deviceId} onClose={() => setDialog(null)} onDone={(name) => { setDialog(null); setNotice({ text: `${name} conectado.` }); }} />}
    {dialog?.kind === "link" && <LinkConnectDialog onClose={() => setDialog(null)} onDone={(name) => { setDialog(null); setNotice({ text: `${name} conectado.` }); }} />}
  </section>;
}

function Switch({ on, label, title, onChange }: { on: boolean; label: string; title: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={on} title={title} className={`wf-switch remote-switch ${on ? "on" : ""}`} onClick={onChange}><i /><span>{label}</span></button>;
}

function UpdateStatus({ send }: { send: UpdateSend }) {
  if (send.status === "sending") {
    const percent = send.total ? Math.round((send.sent / send.total) * 100) : 0;
    return <small className="network-update-status"><LoaderCircle size={12} className="spin" />{send.sent ? `Enviando… ${percent}%` : "Esperando alguém aceitar lá…"}</small>;
  }
  return <small className={`network-update-status ${send.status}`}>{send.text}</small>;
}

function DeviceCard({ device, installer, send, reconnecting, onReconnect, onConnect, onSendUpdate, onForget, onClose }: {
  device: NetDevice; installer: InstallerFile | null; send?: UpdateSend; reconnecting: boolean;
  onReconnect: () => void; onConnect: () => void; onSendUpdate: () => void; onForget: () => void; onClose: () => void;
}) {
  return <aside className="remote-device-card page-card">
    <header><DeviceIcon kind={device.kind} size={30} /><div><h3>{device.name}</h3><small>{DEVICE_KIND_LABEL[device.kind]} · {device.os}</small></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
    <dl>
      <dt>Estado</dt><dd>{device.online ? "online" : `offline · visto ${lastSeenLabel(device.lastSeen)}`}{device.link === "local" ? " · rede local" : device.link === "internet" ? " · internet" : ""}</dd>
      {device.gpu && <><dt>Placa de vídeo</dt><dd>{device.gpu}</dd></>}
      {device.mac && <><dt>MAC</dt><dd><code>{device.mac}</code></dd></>}
      <dt>Modelos</dt><dd className="network-chips">{device.models.length ? device.models.map((model) => <span key={model}>{model}</span>) : <small>{device.paired ? "nenhum (o Ollama está aberto lá?)" : "aparece depois de conectar"}</small>}</dd>
    </dl>
    {!device.paired && <button className="page-button primary" onClick={onConnect}><Link2 size={14} />Conectar por código</button>}
    {device.paired && !device.online && <button className="page-button primary" disabled={reconnecting} onClick={onReconnect}>{reconnecting ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}Reconectar</button>}
    {device.paired && <div className="network-update">
      <span className="menu-section-label">Atualizar o app lá</span>
      {installer ? <small>{installer.fileName} · {megabytes(installer.size)} · {new Date(installer.builtAt * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small> : <small>Nenhum instalador na pasta Instalador ao lado do app.</small>}
      <button className="page-button" disabled={!installer || !device.online || send?.status === "sending"} onClick={onSendUpdate}><Download size={13} />Enviar atualização</button>
      {send && <UpdateStatus send={send} />}
    </div>}
    {device.paired && <button className="page-button danger" onClick={onForget}><Trash2 size={13} />Esquecer este computador</button>}
  </aside>;
}

function CodeConnectDialog({ devices, deviceId, onClose, onDone }: { devices: NetDevice[]; deviceId?: string; onClose: () => void; onDone: (name: string) => void }) {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState(deviceId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const candidates = devices.filter((device) => !device.self && !device.paired && device.online);
  const code = normalizePairCode(input);
  const connect = async () => {
    if (!code) return;
    setBusy(true);
    setMessage(null);
    const order = target ? devices.filter((device) => device.id === target) : candidates;
    let last = "Nenhum computador encontrado na rede local. Abra o Open Assistant no outro computador, deixe \"Visível\" ligado ou use Conectar por link.";
    for (const device of order) {
      try {
        await invoke("net_pair", { deviceId: device.id, code });
        await refreshNetDevices();
        onDone(device.name);
        return;
      } catch (reason) { last = String(reason); }
    }
    setMessage(last);
    setBusy(false);
  };
  return <div className="network-dialog-backdrop" onClick={onClose}>
    <div className="network-dialog page-card" role="dialog" aria-label="Conectar por código" onClick={(event) => event.stopPropagation()}>
      <header><KeyRound size={16} /><h3>Conectar por código</h3><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
      <label className="network-field"><span>Computador</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Procurar na rede local</option>
          {candidates.map((device) => <option key={device.id} value={device.id}>{device.name} · {DEVICE_KIND_LABEL[device.kind]}</option>)}
        </select>
      </label>
      <label className="network-field"><span>Código de 6 dígitos que aparece no outro computador</span>
        <input autoFocus inputMode="numeric" placeholder="000 000" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} />
      </label>
      {message && <p className="node-note error">{message}</p>}
      <footer><button className="page-button" onClick={onClose}>Cancelar</button><button className="page-button primary" disabled={!code || busy} onClick={() => void connect()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Link2 size={14} />}Conectar</button></footer>
    </div>
  </div>;
}

function LinkConnectDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [text, setText] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const parsed = parseConnectLink(text);
  const code = parsed?.code ?? normalizePairCode(codeInput);
  const connect = async () => {
    if (!parsed || !code) return;
    setBusy(true);
    setMessage(null);
    try {
      await invoke("net_pair", { deviceId: parsed.deviceId, code });
      const list = await refreshNetDevices();
      onDone(list.find((device) => device.id === parsed.deviceId)?.name ?? "Computador");
    } catch (reason) {
      setMessage(String(reason));
      setBusy(false);
    }
  };
  return <div className="network-dialog-backdrop" onClick={onClose}>
    <div className="network-dialog page-card" role="dialog" aria-label="Conectar por link" onClick={(event) => event.stopPropagation()}>
      <header><Link2 size={16} /><h3>Conectar por link</h3><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={14} /></button></header>
      <label className="network-field"><span>Link (Copiar link no outro computador) ou endereço</span>
        <input className="address" autoFocus spellCheck={false} placeholder="openassistant://conectar/…" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} />
      </label>
      {text.trim() && !parsed && <p className="node-note error">Isto não é um link nem um endereço do Open Assistant.</p>}
      {parsed && !parsed.code && <label className="network-field"><span>Código de 6 dígitos do outro computador</span>
        <input inputMode="numeric" placeholder="000 000" value={codeInput} onChange={(event) => setCodeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} />
      </label>}
      <p className="network-hint">Fora de casa, ligue "Internet" nos dois computadores.</p>
      {message && <p className="node-note error">{message}</p>}
      <footer><button className="page-button" onClick={onClose}>Cancelar</button><button className="page-button primary" disabled={!parsed || !code || busy} onClick={() => void connect()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Link2 size={14} />}Conectar</button></footer>
    </div>
  </div>;
}
