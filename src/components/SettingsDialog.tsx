import React, { useState } from "react";
import { X, Shield, Key, Eye, EyeOff, Terminal, Settings, Palette, Plus, Clipboard, Check, ChevronDown } from "lucide-react";
import { AppSettings } from "../types";
import { GeminiLogo, OpenAILogo, AnthropicLogo, GrokLogo } from "./AILogos";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onNavigateToMarketplace?: () => void;
  onImmediateColorChange?: (color: string) => void;
}

export default function SettingsDialog({ 
  isOpen, 
  onClose, 
  settings, 
  onSave,
  onNavigateToMarketplace,
  onImmediateColorChange
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"general" | "keys" | "runtime" | "skills" | "appearance">("general");
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [pastedKeyId, setPastedKeyId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleKey = (keyName: string) => {
    setShowKeys((prev) => ({ ...prev, [keyName]: !prev[keyName] }));
  };

  const handlePasteKey = async (keyName: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleKeyChange(keyName, text.trim());
        setPastedKeyId(keyName);
        setTimeout(() => setPastedKeyId(null), 1500);
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleGeneralChange = (field: string, value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      general: { ...prev.general, [field]: value },
    }));
  };

  const handleKeyChange = (field: string, value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [field]: value },
    }));
  };

  const handleRuntimeChange = (field: string, value: any) => {
    setLocalSettings((prev) => ({
      ...prev,
      localRuntime: { ...prev.localRuntime, [field]: value },
    }));
  };

  const handleToggleSkill = (skillId: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s)),
    }));
  };

  const handleAccentColorSelect = (color: string) => {
    const updated = {
      ...localSettings,
      appearance: { ...localSettings.appearance, accentColor: color },
    };
    setLocalSettings(updated);
    if (onImmediateColorChange) {
      onImmediateColorChange(color);
    }
    // Also save directly so changes persist immediately across the app
    onSave(updated);
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const KEY_PROVIDERS = [
    { 
      id: "google", 
      name: "Google Gemini", 
      placeholder: "Chave Gemini API (AIzaSy...)", 
      Logo: GeminiLogo 
    },
    { 
      id: "openai", 
      name: "OpenAI", 
      placeholder: "Chave OpenAI Secret (sk-proj-...)", 
      Logo: OpenAILogo 
    },
    { 
      id: "anthropic", 
      name: "Anthropic", 
      placeholder: "Chave Anthropic Claude (sk-ant-...)", 
      Logo: AnthropicLogo 
    },
    { 
      id: "groq", 
      name: "xAI Grok", 
      placeholder: "Chave xAI Grok (xai-... / gsk_...)", 
      Logo: GrokLogo 
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex h-[520px] w-[800px] overflow-hidden rounded-2xl border border-white/10 bg-[#121318] shadow-2xl">
        {/* Sidebar */}
        <div className="w-[190px] border-r border-white/5 bg-[#0d0e13] p-3.5 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Configurações</h3>
            <button
              onClick={() => setActiveTab("general")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "general" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings size={14} />
              Geral
            </button>
            <button
              onClick={() => setActiveTab("keys")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "keys" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Key size={14} />
              Chaves de API
            </button>
            <button
              onClick={() => setActiveTab("runtime")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "runtime" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Terminal size={14} />
              Runtime Local
            </button>
            <button
              onClick={() => setActiveTab("skills")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "skills" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Shield size={14} />
              Skills / Segurança
            </button>
            <button
              onClick={() => setActiveTab("appearance")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "appearance" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Palette size={14} />
              Aparência
            </button>
          </div>
          <div className="px-3 py-2 text-[10px] text-white/30 font-mono">
            v1.2.6 (macOS Build)
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col justify-between bg-[#121318]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <h2 className="text-sm font-bold capitalize text-white">
              {activeTab === "keys" ? "Chaves de API dos Provedores" : activeTab === "runtime" ? "Parâmetros do Runtime" : activeTab === "skills" ? "Skills & Permissões" : activeTab === "appearance" ? "Aparência & Cores" : "Geral"}
            </h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeTab === "general" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Nome do Usuário</label>
                  <input
                    type="text"
                    value={localSettings.general.username}
                    onChange={(e) => handleGeneralChange("username", e.target.value)}
                    className="col-span-2 rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Idioma de Trabalho</label>
                  <div className="col-span-2 relative">
                    <select
                      value={localSettings.general.language}
                      onChange={(e) => handleGeneralChange("language", e.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 [&>option]:bg-[#181920] [&>option]:text-white cursor-pointer"
                    >
                      <option value="Português (BR)">Português (BR)</option>
                      <option value="English">English</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Tema do Painel</label>
                  <div className="col-span-2 relative">
                    <select
                      value={localSettings.general.theme}
                      onChange={(e) => handleGeneralChange("theme", e.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 [&>option]:bg-[#181920] [&>option]:text-white cursor-pointer"
                    >
                      <option value="Dark Slate">Dark Slate (Recomendado)</option>
                      <option value="Brutalist Charcoal">Brutalist Charcoal</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "keys" && (
              <div className="space-y-4">
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Insira as chaves dos provedores de IA. Use o botão de colar dentro do campo para transferir a chave diretamente.
                </p>
                <div className="space-y-3.5 pt-1">
                  {KEY_PROVIDERS.map((item) => {
                    const LogoComponent = item.Logo;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        {/* Logo em formato quadrado branco com a mesma altura da inputbar */}
                        <div 
                          title={item.name}
                          className="h-10 w-10 min-w-[40px] rounded-xl bg-white p-2 flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105"
                        >
                          <LogoComponent className="h-full w-full object-contain" />
                        </div>

                        {/* Inputbar com botão de colar e botão de ocultar/mostrar */}
                        <div className="relative flex-1">
                          <input
                            type={showKeys[item.id] ? "text" : "password"}
                            value={(localSettings.apiKeys as any)[item.id] || ""}
                            placeholder={item.placeholder}
                            onChange={(e) => handleKeyChange(item.id, e.target.value)}
                            className="w-full h-10 rounded-xl border border-white/10 bg-[#181920] pl-3.5 pr-20 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {/* Botão Colar da Clipboard */}
                            <button
                              type="button"
                              onClick={() => handlePasteKey(item.id)}
                              className="flex items-center justify-center h-7 w-7 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer"
                              title="Colar chave da Área de Transferência"
                            >
                              {pastedKeyId === item.id ? (
                                <Check size={14} className="text-emerald-400" />
                              ) : (
                                <Clipboard size={14} />
                              )}
                            </button>

                            {/* Botão Visualizar Senha */}
                            <button
                              type="button"
                              onClick={() => handleToggleKey(item.id)}
                              className="flex items-center justify-center h-7 w-7 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer"
                              title={showKeys[item.id] ? "Ocultar Chave" : "Mostrar Chave"}
                            >
                              {showKeys[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "runtime" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Status do Setup do Sandbox</h4>
                    <p className="text-[10px] text-white/50">Ollama e OpenClaw estão rodando simulados neste container.</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">Ativo</span>
                </div>

                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Ollama Port</label>
                  <input
                    type="number"
                    value={localSettings.localRuntime.ollamaPort}
                    onChange={(e) => handleRuntimeChange("ollamaPort", parseInt(e.target.value))}
                    className="col-span-2 rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">OpenClaw Gateway Port</label>
                  <input
                    type="number"
                    value={localSettings.localRuntime.openClawPort}
                    onChange={(e) => handleRuntimeChange("openClawPort", parseInt(e.target.value))}
                    className="col-span-2 rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Modelo Local Padrão</label>
                  <input
                    type="text"
                    value={localSettings.localRuntime.defaultLocalModelTag}
                    onChange={(e) => handleRuntimeChange("defaultLocalModelTag", e.target.value)}
                    className="col-span-2 rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>
            )}

            {activeTab === "skills" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Privilégios & Capacidades</h4>
                    <p className="text-[11px] text-white/40">Gerencie permissões para os Agentes de IA locais.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToMarketplace) {
                        onNavigateToMarketplace();
                      }
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                    title="Abrir o Marketplace de Skills"
                  >
                    <Plus size={14} className="stroke-[2.5]" />
                    <span>Adicionar Skill</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {localSettings.skills.map((skill) => (
                    <div key={skill.id} className="rounded-xl border border-white/5 bg-white/5 p-3 flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-white">{skill.name}</h4>
                          {skill.permissions.map((p, i) => (
                            <span key={i} className="rounded-full bg-cyan-500/10 px-1.5 py-0.2 text-[8px] font-medium text-cyan-400">
                              {p}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-white/50">{skill.description}</p>
                      </div>
                      <button
                        onClick={() => handleToggleSkill(skill.id)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          skill.enabled ? "bg-cyan-500" : "bg-white/10"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            skill.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Cor de Destaque</label>
                  <div className="col-span-2 flex gap-2.5">
                    {["#55FCFF", "#3b82f6", "#a855f7", "#ec4899", "#f43f5e", "#eab308"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleAccentColorSelect(c)}
                        style={{ backgroundColor: c }}
                        className={`h-7 w-7 rounded-full border-2 transition-transform cursor-pointer shadow-sm ${
                          localSettings.appearance.accentColor === c ? "scale-110 border-white ring-2 ring-white/30" : "border-transparent hover:scale-105"
                        }`}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* Dropdown com background escuro e textos claros */}
                <div className="grid grid-cols-3 gap-4 items-center">
                  <label className="text-xs text-white/60 font-medium">Densidade do Layout</label>
                  <div className="col-span-2 relative">
                    <select
                      value={localSettings.appearance.density}
                      onChange={(e) => {
                        const updated = {
                          ...localSettings,
                          appearance: { ...localSettings.appearance, density: e.target.value as any },
                        };
                        setLocalSettings(updated);
                        onSave(updated);
                      }}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-[#181920] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400 [&>option]:bg-[#181920] [&>option]:text-white [&>option]:py-2 cursor-pointer shadow-sm"
                    >
                      <option value="comfortable" className="bg-[#181920] text-white">Confortável (Comfortable)</option>
                      <option value="normal" className="bg-[#181920] text-white">Padrão (Normal)</option>
                      <option value="compact" className="bg-[#181920] text-white">Compacto (Compact)</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 border-t border-white/5 px-6 py-4 bg-[#0d0e13]">
            <button
              onClick={onClose}
              className="rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-bold hover:bg-zinc-200 transition-colors cursor-pointer shadow-sm active:scale-95"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

