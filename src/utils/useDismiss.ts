import { useEffect, useRef, type RefObject } from "react";

/**
 * Fecha um menu/popover aberto quando a pessoa clica em qualquer outro lugar da tela ou aperta Esc.
 * Usa `pointerdown` na fase de captura: telas como o editor de nodes cancelam o `mousedown`, e o menu
 * precisa fechar mesmo assim. `inside` = elementos que contam como "dentro" (o menu e o botão que o abre).
 */
export function useDismiss(open: boolean, inside: RefObject<HTMLElement | null>[], onClose: () => void, extraSelector?: string) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (inside.some((ref) => ref.current?.contains(target))) return;
      if (extraSelector && target.closest(extraSelector)) return;
      close.current();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
    // `inside` são refs estáveis; só abrir/fechar muda o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extraSelector]);
}
