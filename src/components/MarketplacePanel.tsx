import React, { useState } from "react";
import { ShoppingBag, Star, Download, ShieldCheck, Check, Search, Sparkles, Filter, CheckCircle2 } from "lucide-react";
import { MarketplaceItem } from "../types";

interface MarketplacePanelProps {
  accentColor: string;
}

export default function MarketplacePanel({ accentColor }: MarketplacePanelProps) {
  const [downloadedIds, setDownloadedIds] = useState<string[]>(["mcp-github"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const items: (MarketplaceItem & { category: string })[] = [
    {
      id: "mcp-github",
      name: "GitHub Integration MCP",
      category: "mcp",
      description: "Habilita que agentes leiam repositórios, criem Pull Requests e sincronizem issues remotas.",
      price: "Grátis",
      downloads: "14.2k",
      rating: "4.9",
      publisher: "Open Claws Group",
      permissions: ["Sincronizar Repositórios", "Escrever Código"]
    },
    {
      id: "mcp-sqlite",
      name: "SQLite Local Driver",
      category: "database",
      description: "Skill de Banco de Dados leve para que agentes gerenciem e consultem persistências estruturadas.",
      price: "Grátis",
      downloads: "8.5k",
      rating: "4.8",
      publisher: "Community Devs",
      permissions: ["Escrever Arquivos", "Ler Diretórios"]
    },
    {
      id: "mcp-slack",
      name: "Slack Notify Agent Plugin",
      category: "notify",
      description: "Integração para que bots enviem notificações estruturadas de canais de produção ao terminar deploys.",
      price: "Grátis",
      downloads: "4.1k",
      rating: "4.5",
      publisher: "Slack Community",
      permissions: ["Conexão Rede Externa"]
    },
    {
      id: "mcp-vision",
      name: "Gemini Vision Analyzer Pro",
      category: "vision",
      description: "Ferramenta de análise de design. O agente escaneia screenshots e sugere correções visuais estruturadas.",
      price: "Grátis",
      downloads: "11.9k",
      rating: "4.9",
      publisher: "Google AI Labs",
      permissions: ["Análise de Tela", "Acesso Câmera"]
    },
    {
      id: "mcp-terminal",
      name: "Zsh / Bash Sandbox Runner",
      category: "mcp",
      description: "Execução segura de scripts de build, testes automatizados e compilação de código em contêiner.",
      price: "Grátis",
      downloads: "19.4k",
      rating: "5.0",
      publisher: "Core Systems",
      permissions: ["Execução Sandbox", "Terminal Shell"]
    },
    {
      id: "mcp-postgres",
      name: "PostgreSQL Cloud Driver",
      category: "database",
      description: "Conexão direta com instâncias gerenciadas Postgres / Cloud SQL para queries de agentes.",
      price: "Grátis",
      downloads: "6.8k",
      rating: "4.7",
      publisher: "Data Flow Team",
      permissions: ["Rede Externa", "Acesso SQL"]
    }
  ];

  const handleDownloadToggle = (id: string) => {
    if (downloadedIds.includes(id)) {
      setDownloadedIds((prev) => prev.filter((item) => item !== id));
    } else {
      setDownloadedIds((prev) => [...prev, id]);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.publisher.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-full flex-col bg-[#1e2025] text-zinc-100 overflow-hidden relative select-none">
      {/* Floating Action & Search Bar */}
      <div className="sticky top-3 z-20 mx-5 mt-3 mb-1 flex flex-wrap items-center justify-between gap-3 bg-[#1c1d22]/90 backdrop-blur-xl p-2.5 rounded-2xl border border-white/10 shadow-2xl shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar skills e ferramentas MCP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 py-1.5 pl-8 pr-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/25 transition-colors font-sans"
          />
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1 overflow-x-auto bg-black/30 p-0.5 rounded-xl border border-white/10 text-xs">
          {[
            { id: "all", label: "Todas" },
            { id: "mcp", label: "MCP Plugins" },
            { id: "database", label: "Banco de Dados" },
            { id: "vision", label: "Visão & UI" }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.id ? "bg-white/15 text-white shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid listing items */}
      <div className="flex-1 overflow-y-auto p-5 pt-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const isDownloaded = downloadedIds.includes(item.id);
            return (
              <div 
                key={item.id} 
                className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#25272e] to-[#1f2026] p-5 flex flex-col justify-between space-y-4 shadow-lg hover:border-white/20 transition-all group hover:-translate-y-0.5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">{item.name}</h4>
                      <p className="text-[10px] text-zinc-400">Por {item.publisher}</p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-semibold shrink-0">
                      <Star size={11} fill="currentColor" />
                      <span>{item.rating}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">{item.description}</p>

                  {/* Permissions tags */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.permissions.map((p, i) => (
                      <span key={i} className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-medium text-zinc-400">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-between border-t border-white/10 pt-3.5 mt-2">
                  <div className="text-[10px] text-zinc-400 font-mono">
                    <span>{item.downloads} instalações</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadToggle(item.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
                      isDownloaded
                        ? "bg-white/10 text-zinc-200 border border-white/20 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30"
                        : "bg-white text-zinc-950 hover:bg-zinc-200 border border-white"
                    }`}
                  >
                    {isDownloaded ? (
                      <>
                        <CheckCircle2 size={12} className="text-emerald-400" />
                        <span>Instalado</span>
                      </>
                    ) : (
                      <>
                        <Download size={12} />
                        <span>Instalar Skill</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
