import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../utils/useDismiss";

export interface DropdownOption {
  value: string;
  label: string;
  /** Linha menor embaixo do rótulo. */
  description?: string;
  icon?: ReactNode;
  /** Título da seção (opções com o mesmo `group` ficam juntas). */
  group?: string;
  disabled?: boolean;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** Mostra a busca no topo (padrão: mais de 8 opções). */
  searchable?: boolean;
}

/**
 * Lista suspensa no visual do app (substitui o `<select>` do Windows, que abre branco e fora do tema).
 * Abre num portal com posição fixa — funciona dentro do canvas com zoom — e vira para cima se não couber.
 * Teclado: ↑/↓ escolhe, Enter confirma, Esc fecha, digitar filtra.
 */
export function Dropdown({ value, options, onChange, placeholder = "Escolha…", ariaLabel, size = "md", className = "", disabled, searchable }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean }>();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const withSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((option) => `${option.label} ${option.description ?? ""} ${option.group ?? ""}`.toLowerCase().includes(text)) : options;
  }, [options, query]);
  useDismiss(open, [button, panel], () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const box = button.current.getBoundingClientRect();
    const height = Math.min(340, 12 + options.length * 34 + (withSearch ? 44 : 0));
    const up = box.bottom + height + 8 > innerHeight && box.top > height + 8;
    const width = Math.max(box.width, 220);
    setPlace({ left: Math.min(box.left, innerWidth - width - 8), top: up ? box.top - 6 : box.bottom + 6, width, up });
  }, [open, options.length, withSearch]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(Math.max(0, options.findIndex((option) => option.value === value)));
    requestAnimationFrame(() => (withSearch ? search.current : panel.current)?.focus());
    // Rolar a página ou mudar o tamanho da janela deixaria a lista solta no lugar errado.
    const close = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("wheel", close, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { panel.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  function choose(option: DropdownOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    button.current?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((index) => Math.min(shown.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(shown[cursor]); }
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
  }

  let lastGroup: string | undefined;
  return <>
    <button ref={button} type="button" className={`oa-select ${size} ${open ? "open" : ""} ${className}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
      onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
      onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) { event.preventDefault(); setOpen(true); } }}>
      {selected?.icon && <span className="oa-select-icon">{selected.icon}</span>}
      <span className={`oa-select-value ${selected ? "" : "placeholder"}`}>{selected?.label ?? placeholder}</span>
      <ChevronDown size={size === "sm" ? 12 : 14} className="oa-select-chevron" />
    </button>
    {open && place && createPortal(<div ref={panel} className={`oa-select-panel ${place.up ? "up" : ""}`} role="listbox" tabIndex={-1} aria-label={ariaLabel}
      style={{ left: place.left, width: place.width, ...(place.up ? { bottom: innerHeight - place.top } : { top: place.top }) }}
      onKeyDown={onKey} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      {withSearch && <label className="oa-select-search"><Search size={13} /><input ref={search} value={query} placeholder="Buscar…" onChange={(event) => { setQuery(event.target.value); setCursor(0); }} /></label>}
      <div className="oa-select-options">
        {shown.map((option, index) => {
          const header = option.group && option.group !== lastGroup ? <span className="oa-select-group">{option.group}</span> : null;
          lastGroup = option.group;
          return <div key={`${option.group ?? ""}-${option.value}`}>{header}
            <button type="button" role="option" data-index={index} aria-selected={option.value === value} disabled={option.disabled}
              className={`${index === cursor ? "cursor" : ""} ${option.value === value ? "selected" : ""}`}
              onMouseEnter={() => setCursor(index)} onClick={() => choose(option)}>
              {option.icon && <span className="oa-select-icon">{option.icon}</span>}
              <span className="oa-select-text"><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>
              {option.value === value && <Check size={13} className="oa-select-check" />}
            </button>
          </div>;
        })}
        {!shown.length && <p className="oa-select-empty">Nada encontrado.</p>}
      </div>
    </div>, document.body)}
  </>;
}
