import React, { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Globe, ShieldAlert } from "lucide-react";

interface BrowserPanelProps {
  initialURL?: string;
  accentColor: string;
}

export default function BrowserPanel({ initialURL = "http://localhost:3000/brutalist-preview.html", accentColor }: BrowserPanelProps) {
  const [address, setAddress] = useState(initialURL);

  const isBlank = !address || address.trim() === "" || address === "about:blank";

  return (
    <div className="flex h-full flex-col bg-[#26282e] text-zinc-100">
      {/* Navigation address bar */}
      <div className="flex items-center gap-3 border-b border-zinc-700/60 bg-[#202227] px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-1 text-zinc-400">
          <button className="rounded p-1 hover:bg-zinc-800 hover:text-white transition-colors" disabled={isBlank}>
            <ArrowLeft size={13} />
          </button>
          <button className="rounded p-1 hover:bg-zinc-800 hover:text-white transition-colors" disabled={isBlank}>
            <ArrowRight size={13} />
          </button>
          <button 
            onClick={() => setAddress(address || "http://localhost:3000/brutalist-preview.html")} 
            className="rounded p-1 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <RotateCw size={13} />
          </button>
        </div>

        {/* Address Input */}
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1 text-xs text-zinc-200">
          <Globe size={11} className="text-zinc-500" />
          <input
            type="text"
            placeholder="Digite uma URL ou termo de pesquisa..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-zinc-500 text-white"
          />
        </div>
      </div>

      {/* Browser Canvas Content Area */}
      <div className="flex-1 bg-[#18191d] flex flex-col items-center justify-center p-8 overflow-y-auto">
        {isBlank ? (
          <div className="w-full max-w-md rounded-2xl border border-zinc-700/60 bg-[#22242a] p-8 shadow-2xl text-center space-y-5">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-zinc-300 shadow-inner">
              <Globe size={22} className="text-zinc-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Nova Guia em Branco</h2>
              <p className="text-xs text-zinc-400 mt-1">Nenhum site carregado. Digite uma URL na barra acima ou selecione um atalho rápido.</p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddress("http://localhost:3000/brutalist-preview.html")}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white text-xs font-semibold text-white hover:text-zinc-950 transition-all border border-white/10 shadow-sm"
              >
                Carregar Preview Local (localhost:3000)
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-[#26282e] p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-3 py-1 rounded-full w-fit">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Sandbox Localhost: Ativo
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
                ⚡ Brutalist Web Concept
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Esta é uma representação simulada do arquivo de visualização compilado gerado pelos seus Agentes de automação.
              </p>
            </div>

            {/* Mini UI Sandbox Elements */}
            <div className="rounded-lg border border-dashed border-zinc-700 p-5 bg-zinc-800/40 space-y-3 font-mono">
              <div className="flex items-center justify-between border-b border-zinc-700/60 pb-2">
                <span className="text-[10px] text-zinc-400">Item</span>
                <span className="text-[10px] text-zinc-400">Status</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200">brutalist-ui-2026.txt</span>
                <span className="text-emerald-400 font-bold">Compilado</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200">styles.css</span>
                <span className="text-emerald-400 font-bold">Compilado</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200">index.html</span>
                <span className="text-emerald-400 font-bold">Compilado</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-[10px] text-zinc-400 leading-relaxed bg-[#202227] p-3.5 rounded-lg border border-zinc-700/60">
              <ShieldAlert size={14} className="text-amber-400 shrink-0" />
              <span>O navegador embutido roda num ambiente isolado. Todas as requisições externas não seguras são redirecionadas pelo gateway local proxy.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
