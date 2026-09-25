import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ProviderConfig } from "../utils/providers";
import anthropicLogo from "../assets/providers/anthropic.svg";
import deepseekLogo from "../assets/providers/deepseek.svg";
import fireworksLogo from "../assets/providers/fireworks.svg";
import openaiLogo from "../assets/providers/openai.svg";
import perplexityLogo from "../assets/providers/perplexity.svg";
import togetherLogo from "../assets/providers/together.png";

// Logotipos da Wikipédia (OpenAI, Anthropic, DeepSeek, Perplexity) e ícones oficiais (Together AI, Fireworks).
const BRANDS: Record<string, { src: string; kind: "wordmark" | "symbol" }> = {
  openai: { src: openaiLogo, kind: "wordmark" },
  anthropic: { src: anthropicLogo, kind: "wordmark" },
  deepseek: { src: deepseekLogo, kind: "wordmark" },
  perplexity: { src: perplexityLogo, kind: "wordmark" },
  "together-ai": { src: togetherLogo, kind: "symbol" },
  fireworks: { src: fireworksLogo, kind: "symbol" },
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("");
}

export function ProviderLogo({ provider }: { provider: ProviderConfig }) {
  const brand = BRANDS[provider.id];
  if (brand?.kind === "wordmark") return <span className={`provider-logo wordmark brand-${provider.id}`}><img src={brand.src} alt={provider.name} draggable={false} /></span>;
  return <span className="provider-logo symbol">
    <span className="provider-symbol">{brand ? <img src={brand.src} alt="" draggable={false} /> : <b>{initials(provider.name)}</b>}</span>
    <span className="provider-name">{provider.name}</span>
  </span>;
}

interface ProviderSelectProps {
  providers: ProviderConfig[];
  value: string;
  saved: Record<string, boolean>;
  onChange: (id: string) => void;
}

function statusText(provider: ProviderConfig, saved: boolean) {
  if (saved) return "Credencial protegida";
  return provider.kind === "custom" ? "Personalizado · sem chave" : "Sem credencial";
}

/** Seletor de provedor com logos, no mesmo estilo dos menus do compositor. */
export function ProviderSelect({ providers, value, saved, onChange }: ProviderSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = providers.find((item) => item.id === value) ?? providers[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openMenu() {
    setActive(Math.max(0, providers.findIndex((item) => item.id === value)));
    setOpen(true);
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>(".provider-select-trigger")?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openMenu(); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % providers.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + providers.length) % providers.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(providers.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(providers[active].id); }
    else if (event.key === "Tab") setOpen(false);
  }

  return <div className={`provider-select ${open ? "open" : ""}`} ref={root} onKeyDown={onKeyDown}>
    <button type="button" className="provider-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`Provedor: ${current.name}`} onClick={() => open ? setOpen(false) : openMenu()}>
      <ProviderLogo provider={current} />
      <span className={`provider-dot ${saved[current.id] ? "on" : ""}`} title={statusText(current, Boolean(saved[current.id]))} />
      <ChevronDown size={15} className="provider-chevron" />
    </button>
    {open && <div className="provider-select-menu" role="listbox" ref={list} aria-activedescendant={`provider-option-${active}`}>
      {providers.map((item, index) => <button
        type="button"
        key={item.id}
        id={`provider-option-${index}`}
        data-index={index}
        role="option"
        aria-selected={item.id === value}
        className={`${index === active ? "active" : ""} ${item.id === value ? "selected" : ""}`}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(item.id)}
      >
        <ProviderLogo provider={item} />
        <small>{statusText(item, Boolean(saved[item.id]))}</small>
        {item.id === value ? <Check size={14} /> : <span />}
      </button>)}
    </div>}
  </div>;
}
