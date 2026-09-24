import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../store/store";

function handleMinimize() {
  try { getCurrentWindow().minimize().catch(() => undefined); } catch {}
}

function handleMaximize() {
  try { getCurrentWindow().toggleMaximize().catch(() => undefined); } catch {}
}

function handleClose() {
  try { getCurrentWindow().close().catch(() => undefined); } catch {}
}

export function TitleBar() {
  const { state, dispatch } = useStore();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <button className="icon-button" onClick={() => dispatch({ type: "sidebar" })} aria-label="Alternar barra lateral">
          {state.sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <div className="titlebar-actions">
        <span className="window-divider" />
        <button className="window-button" onClick={handleMinimize} aria-label="Minimizar"><Minus size={16} /></button>
        <button className="window-button" onClick={handleMaximize} aria-label="Maximizar"><Square size={13} /></button>
        <button className="window-button close" onClick={handleClose} aria-label="Fechar"><X size={16} /></button>
      </div>
    </header>
  );
}
