/**
 * Sincroniza `state.memory` com `%LOCALAPPDATA%\\com.openassistant.windows\\memoria-da-ia.md`.
 * O arquivo manda: ao abrir o app (e ao voltar para a janela) ele é lido; cada mudança na memória é gravada nele.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { parseMemoryFile, serializeMemoryFile } from "../utils/memory";
import { isQAOffline } from "../utils/qaMode";

export function useMemoryFileSync() {
  const { state, dispatch } = useStore();
  const [ready, setReady] = useState(false);
  const lastText = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isQAOffline()) { setReady(true); return; }
    const load = () => invoke<string | null>("memory_file_read")
      .then((text) => {
        if (text && text !== lastText.current) {
          lastText.current = text;
          dispatch({ type: "setMemory", patch: parseMemoryFile(text) });
        }
      })
      .catch(() => undefined);
    void load().finally(() => setReady(true));
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [dispatch]);

  useEffect(() => {
    if (!ready || isQAOffline()) return;
    const text = serializeMemoryFile(state.memory);
    // Mesmo conteúdo (ex.: acabou de ser lido do arquivo) não precisa ser regravado.
    if (text === lastText.current || (lastText.current && serializeMemoryFile(parseMemoryFile(lastText.current)) === text)) return;
    const timer = setTimeout(() => { lastText.current = text; void invoke("memory_file_write", { text }).catch(() => undefined); }, 400);
    return () => clearTimeout(timer);
  }, [state.memory, ready]);
}
