import { Brain, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "../store/store";
import { memoryPrompt, STYLE_OPTIONS } from "../utils/memory";

/**
 * Configurações › Memória: nome, como ser chamado, jeito de conversar e o que a IA aprendeu
 * ("não use emojis"). Tudo entra no prompt de sistema de todas as conversas (`memoryPrompt`).
 */
export function MemorySettings() {
  const { state, dispatch } = useStore();
  const memory = state.memory;
  const [newFact, setNewFact] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const preview = memoryPrompt(memory).trim();

  function toggleStyle(id: string) {
    const styles = memory.styles.includes(id) ? memory.styles.filter((item) => item !== id) : [...memory.styles, id];
    dispatch({ type: "setMemory", patch: { styles } });
  }

  function addFact() {
    const text = newFact.trim();
    if (!text) return;
    dispatch({ type: "addFact", fact: { id: crypto.randomUUID(), text, source: "manual", createdAt: Date.now() } });
    setNewFact("");
  }

  function saveEdit() {
    if (!editing) return;
    if (editing.text.trim()) dispatch({ type: "updateFact", id: editing.id, text: editing.text.trim() });
    else dispatch({ type: "removeFact", id: editing.id });
    setEditing(undefined);
  }

  return <div className="memory-settings">
    <div className="settings-heading"><span>Memória</span><h3>O que a IA sabe sobre você</h3><p>Vale para todas as conversas: chat, Controlar o PC e modelos em nuvem. Fica só neste computador.</p></div>

    <div className="setting-card memory-card">
      <label>Como te chamar</label>
      <div className="memory-fields">
        <label><span>Seu nome</span><input value={memory.name} onChange={(event) => dispatch({ type: "setMemory", patch: { name: event.target.value } })} placeholder="Ex.: André Machado" /></label>
        <label><span>Como quer ser chamado</span><input value={memory.callMe} onChange={(event) => dispatch({ type: "setMemory", patch: { callMe: event.target.value } })} placeholder="Ex.: Dé" /></label>
      </div>
    </div>

    <div className="setting-card memory-card">
      <label>Jeito de conversar</label>
      <div className="memory-styles">{STYLE_OPTIONS.map((style) => <button key={style.id} className={memory.styles.includes(style.id) ? "active" : ""} aria-pressed={memory.styles.includes(style.id)} onClick={() => toggleStyle(style.id)} title={style.instruction}>{memory.styles.includes(style.id) && <Check size={12} />}{style.label}</button>)}</div>
      <textarea value={memory.about} onChange={(event) => dispatch({ type: "setMemory", patch: { about: event.target.value } })} rows={3} placeholder="Instruções extras. Ex.: Sou designer 3D, uso Blender e Windows 11. Prefiro exemplos práticos." />
    </div>

    <div className="setting-card memory-card">
      <div className="memory-card-head">
        <label>Aprendido nas conversas</label>
        <label className="memory-learn"><input type="checkbox" checked={memory.learn} onChange={(event) => dispatch({ type: "setMemory", patch: { learn: event.target.checked } })} /><span>Aprender sozinho</span></label>
      </div>
      <small className="memory-hint">Frases como "não use emojis", "me chame de…", "lembre que…" ou "sempre responda…" são guardadas aqui.</small>
      <ul className="memory-facts">
        {memory.facts.length === 0 && <li className="memory-empty"><Brain size={14} />Nada aprendido ainda.</li>}
        {memory.facts.map((fact) => <li key={fact.id}>
          {editing?.id === fact.id
            ? <input autoFocus value={editing.text} onChange={(event) => setEditing({ id: fact.id, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") saveEdit(); if (event.key === "Escape") setEditing(undefined); }} aria-label="Editar memória" />
            : <span>{fact.text}<small>{fact.source === "auto" ? "aprendido" : "adicionado por você"}</small></span>}
          <div className="memory-fact-actions">
            {editing?.id === fact.id
              ? <><button onClick={saveEdit} title="Salvar" aria-label="Salvar"><Check size={14} /></button><button onClick={() => setEditing(undefined)} title="Cancelar" aria-label="Cancelar"><X size={14} /></button></>
              : <><button onClick={() => setEditing({ id: fact.id, text: fact.text })} title="Editar" aria-label={`Editar: ${fact.text}`}><Pencil size={13} /></button><button onClick={() => dispatch({ type: "removeFact", id: fact.id })} title="Apagar" aria-label={`Apagar: ${fact.text}`}><Trash2 size={13} /></button></>}
          </div>
        </li>)}
      </ul>
      <div className="memory-add"><input value={newFact} onChange={(event) => setNewFact(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addFact(); }} placeholder="Adicionar memória. Ex.: Trabalho com design de interfaces." /><button className="flat-button" onClick={addFact} disabled={!newFact.trim()}><Plus size={14} />Adicionar</button></div>
    </div>

    {preview && <details className="setting-card memory-preview"><summary>Ver o que vai para a IA</summary><pre>{preview}</pre></details>}
  </div>;
}
