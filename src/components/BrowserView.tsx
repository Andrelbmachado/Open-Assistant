import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowRight, Bot, Download, Globe, LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { installTool, useTools } from "../store/toolsStore";
import { extractLinks, normalizeAddress } from "../utils/browserLinks";
import { isQAOffline } from "../utils/qaMode";

interface BrowserPage { url: string; text: string; screenshot?: string | null; byAgent: boolean }

/**
 * Tela Browser (ROADMAP §12, fase 2): o Obscura (browser sem janela) abre a página e o app mostra o print
 * renderizado + os links. Quando o agente lê uma página (`read_url`), ela aparece aqui também: dá para ver
 * o agente navegando.
 */
export function BrowserView() {
  const tools = useTools();
  const installed = tools.installed.has("obscura");
  const [history, setHistory] = useState<BrowserPage[]>([]);
  const [index, setIndex] = useState(-1);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const page = index >= 0 ? history[index] : undefined;

  const push = (next: BrowserPage) => {
    setHistory((list) => [...list.slice(0, index + 1), next].slice(-30));
    setIndex((value) => Math.min(value + 1, 29));
    setAddress(next.url);
  };

  useEffect(() => {
    if (isQAOffline()) return;
    const stop = listen<BrowserPage>("browser-page", (event) => {
      setHistory((list) => [...list, event.payload].slice(-30));
      setIndex(() => Number.MAX_SAFE_INTEGER);
      setAddress(event.payload.url);
    });
    return () => { void stop.then((unlisten) => unlisten()); };
  }, []);

  // O evento do agente põe o índice no fim da lista.
  useEffect(() => { if (index >= history.length) setIndex(history.length - 1); }, [index, history.length]);

  const open = async (target: string) => {
    const url = normalizeAddress(target);
    if (!url) return;
    setLoading(true);
    setError(null);
    try { push(await invoke<BrowserPage>("browser_open", { url })); }
    catch (reason) { setError(String(reason)); }
    finally { setLoading(false); }
  };

  const links = page ? extractLinks(page.text, page.url).slice(0, 60) : [];

  return <section className="view browser-view">
    <header className="browser-bar">
      <button className="icon-button" aria-label="Voltar" disabled={index <= 0} onClick={() => { const next = index - 1; setIndex(next); setAddress(history[next].url); }}><ArrowLeft size={15} /></button>
      <button className="icon-button" aria-label="Avançar" disabled={index >= history.length - 1} onClick={() => { const next = index + 1; setIndex(next); setAddress(history[next].url); }}><ArrowRight size={15} /></button>
      <button className="icon-button" aria-label="Recarregar" disabled={!page || loading} onClick={() => page && void open(page.url)}><RotateCw size={14} /></button>
      <form className="browser-address" onSubmit={(event) => { event.preventDefault(); void open(address); }}>
        <Globe size={14} />
        <input value={address} spellCheck={false} placeholder="Endereço ou pesquisa" onChange={(event) => setAddress(event.target.value)} aria-label="Endereço" />
        {loading && <LoaderCircle size={14} className="spin" />}
      </form>
      {page?.byAgent && <span className="browser-agent-badge" title="Esta página foi lida pelo agente"><Bot size={13} />agente</span>}
    </header>
    {!installed ? <div className="browser-empty">
      <Globe size={26} />
      <p>A tela Browser usa o Obscura, um navegador sem janela feito em Rust (70 MB, grátis).</p>
      <button className="page-button primary" onClick={() => void installTool("obscura")} disabled={tools.progress["obscura"]?.state === "running"}><Download size={14} />{tools.progress["obscura"]?.state === "running" ? "Instalando…" : "Instalar o Obscura"}</button>
    </div> : !page ? <div className="browser-empty">
      <Globe size={26} />
      <p>Digite um endereço acima. Quando o agente ler uma página, ela aparece aqui também.</p>
      {error && <p className="node-note error">{error}</p>}
    </div> : <div className="browser-body">
      <div className="browser-shot">
        {page.screenshot ? <img src={page.screenshot} alt={`Print de ${page.url}`} /> : <p className="network-hint">Sem print desta página (o Obscura não conseguiu renderizar).</p>}
        {error && <p className="node-note error">{error}</p>}
      </div>
      <aside className="browser-side">
        <div className="browser-side-tabs"><button className={!showText ? "active" : ""} onClick={() => setShowText(false)}>Links ({links.length})</button><button className={showText ? "active" : ""} onClick={() => setShowText(true)}>Texto</button></div>
        {showText ? <pre className="browser-text">{page.text}</pre> : <ul className="browser-links">{links.map((link) => <li key={link.url}><button onClick={() => void open(link.url)} title={link.url}>{link.text}</button></li>)}</ul>}
      </aside>
    </div>}
  </section>;
}
