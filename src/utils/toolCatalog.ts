/**
 * Ferramentas de IA de grandes empresas, agrupadas por empresa em Configurações.
 * A instalação de cada id é uma receita fixa no backend (`src-tauri/src/tools.rs`);
 * modelos do Ollama reaproveitam o download de Modelos locais.
 */

export type ToolCompany = "NVIDIA" | "Microsoft" | "Meta" | "Google" | "OpenAI" | "Open source";
export type ToolCategory = "asr" | "tts" | "llm" | "vision" | "agents" | "runtime";

export type ToolInstall =
  /** Receita do backend (download, ambiente Python ou compilação). */
  | { kind: "recipe" }
  /** Modelo baixado pelo Ollama (aparece também em Modelos locais). */
  | { kind: "ollama"; model: string }
  /** Não roda no Windows; mostra o motivo e o repositório oficial. */
  | { kind: "unsupported"; reason: string };

/** Como o app usa a ferramenta depois de instalada. */
export type ToolUsage = "voice-input" | "voice-output" | "chat-model" | "vision-model" | "runtime" | "installed-only";

export interface ToolInfo {
  id: string;
  name: string;
  company: ToolCompany;
  category: ToolCategory;
  description: string;
  sizeBytes: number;
  repo: string;
  install: ToolInstall;
  usage: ToolUsage;
  /** Idiomas reconhecidos/falados, quando relevante. */
  languages?: string;
  recommended?: boolean;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const COMPANY_ORDER: ToolCompany[] = ["NVIDIA", "Microsoft", "Meta", "Google", "OpenAI", "Open source"];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  asr: "Voz → texto",
  tts: "Texto → voz",
  llm: "Modelo de linguagem",
  vision: "Visão",
  agents: "Agentes e segurança",
  runtime: "Runtime",
};

export const SHERPA_RUNTIME_ID = "sherpa-onnx";

export const TOOL_CATALOG: ToolInfo[] = [
  // NVIDIA
  { id: "asr-nemo-pt", name: "NeMo FastConformer Português", company: "NVIDIA", category: "asr", usage: "voice-input", install: { kind: "recipe" }, sizeBytes: 102 * MB, repo: "https://huggingface.co/nvidia/stt_pt_fastconformer_hybrid_large_pc", languages: "Português", recommended: true, description: "Modelo de voz da NVIDIA treinado em português, com pontuação. Leve e muito rápido: transcreve 5 s de fala em ~0,1 s na CPU." },
  { id: "asr-parakeet-v3", name: "Parakeet TDT 0.6B v3", company: "NVIDIA", category: "asr", usage: "voice-input", install: { kind: "recipe" }, sizeBytes: 465 * MB, repo: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3", languages: "25 idiomas europeus, incluindo português", description: "Reconhecimento multilíngue de alta precisão do NVIDIA NeMo, exportado para ONNX." },
  { id: "py-nemo", name: "NeMo Framework", company: "NVIDIA", category: "asr", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 6 * GB, repo: "https://github.com/NVIDIA/NeMo", description: "Framework Python completo (ASR, TTS, treino e fine-tuning) com PyTorch CUDA para a RTX. O modo voz já usa os modelos NeMo via ONNX; instale este para treinar ou ajustar modelos." },
  { id: "py-nemo-guardrails", name: "NeMo Guardrails", company: "NVIDIA", category: "agents", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 400 * MB, repo: "https://github.com/NVIDIA/NeMo-Guardrails", description: "Barreiras de segurança programáveis para conversas e agentes (limites de escopo, bloqueio de ações perigosas). Base para a segurança do agente que constrói apps." },
  { id: "py-whisperlive", name: "WhisperLive", company: "NVIDIA", category: "asr", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 4 * GB, repo: "https://github.com/collabora/WhisperLive", description: "Servidor de transcrição contínua via WebSocket (Collabora, com backend TensorRT da NVIDIA no Linux). No Windows roda com faster-whisper." },
  { id: "trt-llm", name: "TensorRT-LLM", company: "NVIDIA", category: "llm", usage: "installed-only", install: { kind: "unsupported", reason: "A NVIDIA encerrou o suporte ao Windows; roda em Linux ou WSL2 com Docker." }, sizeBytes: 0, repo: "https://github.com/NVIDIA/TensorRT-LLM", description: "Otimização de inferência de LLMs para GPUs NVIDIA (FP8, INT4, in-flight batching)." },

  // Microsoft
  { id: "bitnet-2b4t", name: "BitNet b1.58 2B4T", company: "Microsoft", category: "llm", usage: "chat-model", install: { kind: "recipe" }, sizeBytes: 1.1 * GB, repo: "https://github.com/microsoft/BitNet", languages: "Inglês (português limitado)", description: "LLM de 1 bit (pesos −1, 0, +1) no bitnet.cpp oficial, compilado neste PC (precisa de Visual Studio com Clang, Git, Python e CMake). Roda só na CPU com ~1,2 GB de RAM e ~25 tokens/s. Bom para código e respostas curtas; erra fatos com frequência. Aparece no seletor de modelos do chat." },
  { id: SHERPA_RUNTIME_ID, name: "ONNX Runtime + sherpa-onnx", company: "Microsoft", category: "runtime", usage: "runtime", install: { kind: "recipe" }, sizeBytes: 8 * MB, repo: "https://github.com/k2-fsa/sherpa-onnx", description: "Motor de voz local de baixa latência (Microsoft ONNX Runtime). É baixado junto com o primeiro modelo de voz." },
  { id: "phi4:14b", name: "Phi-4 14B", company: "Microsoft", category: "llm", usage: "chat-model", install: { kind: "ollama", model: "phi4:14b" }, sizeBytes: 9_053_116_391, repo: "https://ollama.com/library/phi4", description: "Modelo compacto da Microsoft com raciocínio forte para o tamanho. Cabe nos 12 GB de VRAM." },
  { id: "phi4-mini:3.8b", name: "Phi-4 mini 3.8B", company: "Microsoft", category: "llm", usage: "chat-model", install: { kind: "ollama", model: "phi4-mini:3.8b" }, sizeBytes: 2_491_876_774, repo: "https://ollama.com/library/phi4-mini", description: "Versão leve do Phi-4, rápida inclusive na CPU." },
  { id: "py-autogen", name: "AutoGen", company: "Microsoft", category: "agents", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 250 * MB, repo: "https://github.com/microsoft/autogen", description: "Orquestração multiagente (um agente planeja, outro programa, outro testa). Já vem com o conector para o Ollama local." },
  { id: "py-florence2", name: "Florence-2", company: "Microsoft", category: "vision", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 4 * GB, repo: "https://huggingface.co/microsoft/Florence-2-large", description: "Visão computacional unificada: OCR, legendas e detecção de objetos em prints e quadros de vídeo. Instala PyTorch CUDA; o modelo é baixado no primeiro uso." },

  // Meta
  { id: "llama3.2-vision:11b", name: "Llama 3.2 Vision 11B", company: "Meta", category: "vision", usage: "vision-model", install: { kind: "ollama", model: "llama3.2-vision:11b" }, sizeBytes: 7_816_589_186, repo: "https://ollama.com/library/llama3.2-vision", description: "LLM multimodal: anexe prints e fotos no chat para ele descrever, ler erros na tela e comparar com o esperado." },
  { id: "py-mms", name: "MMS (Massively Multilingual Speech)", company: "Meta", category: "asr", usage: "installed-only", install: { kind: "recipe" }, sizeBytes: 4 * GB, repo: "https://huggingface.co/facebook/mms-1b-all", languages: "1.100+ idiomas", description: "Reconhecimento e síntese de fala para mais de 1.100 idiomas via Transformers (PyTorch CUDA)." },
  { id: "seamless", name: "SeamlessM4T / Streaming", company: "Meta", category: "asr", usage: "installed-only", install: { kind: "unsupported", reason: "Depende do fairseq2, que não tem versão para Windows; use WSL2." }, sizeBytes: 0, repo: "https://github.com/facebookresearch/seamless_communication", description: "Tradução de fala em tempo real preservando a entonação da voz." },
  { id: "llama-omni", name: "LLaMA-Omni", company: "Meta", category: "asr", usage: "installed-only", install: { kind: "unsupported", reason: "Requer Linux com CUDA e flash-attention; use WSL2." }, sizeBytes: 0, repo: "https://github.com/ictnlp/LLaMA-Omni", description: "Conversa por voz de ponta a ponta sobre o Llama 3.1 (~226 ms de latência)." },

  // Google
  { id: "gemma3:12b", name: "Gemma 3 12B", company: "Google", category: "vision", usage: "vision-model", install: { kind: "ollama", model: "gemma3:12b" }, sizeBytes: 8_149_190_253, repo: "https://ollama.com/library/gemma3", description: "Modelo aberto do Google com visão: lê imagens anexadas e responde em português." },
  { id: "gemma3:4b", name: "Gemma 3 4B", company: "Google", category: "vision", usage: "vision-model", install: { kind: "ollama", model: "gemma3:4b" }, sizeBytes: 3_338_801_804, repo: "https://ollama.com/library/gemma3", description: "Versão leve do Gemma 3, também com visão." },

  // OpenAI
  { id: "asr-whisper-turbo", name: "Whisper large-v3 turbo", company: "OpenAI", category: "asr", usage: "voice-input", install: { kind: "recipe" }, sizeBytes: 538 * MB, repo: "https://github.com/openai/whisper", languages: "99 idiomas", description: "Whisper rápido e preciso (ONNX int8). Boa escolha para sotaques e ruído." },
  { id: "asr-whisper-small", name: "Whisper small", company: "OpenAI", category: "asr", usage: "voice-input", install: { kind: "recipe" }, sizeBytes: 610 * MB, repo: "https://github.com/openai/whisper", languages: "99 idiomas", description: "Whisper pequeno, leve na CPU." },
  { id: "asr-whisper-large-v3", name: "Whisper large-v3", company: "OpenAI", category: "asr", usage: "voice-input", install: { kind: "recipe" }, sizeBytes: 1019 * MB, repo: "https://github.com/openai/whisper", languages: "99 idiomas", description: "O Whisper mais preciso; mais lento na CPU." },

  // Open source
  { id: "tts-piper-faber", name: "Voz Faber (pt-BR)", company: "Open source", category: "tts", usage: "voice-output", install: { kind: "recipe" }, sizeBytes: 21 * MB, repo: "https://github.com/rhasspy/piper", languages: "Português do Brasil", recommended: true, description: "Voz masculina natural (Piper/VITS), gerada localmente em tempo real." },
  { id: "tts-piper-cadu", name: "Voz Cadu (pt-BR)", company: "Open source", category: "tts", usage: "voice-output", install: { kind: "recipe" }, sizeBytes: 21 * MB, repo: "https://github.com/rhasspy/piper", languages: "Português do Brasil", description: "Voz masculina (Piper/VITS)." },
  { id: "tts-piper-jeff", name: "Voz Jeff (pt-BR)", company: "Open source", category: "tts", usage: "voice-output", install: { kind: "recipe" }, sizeBytes: 21 * MB, repo: "https://github.com/rhasspy/piper", languages: "Português do Brasil", description: "Voz masculina (Piper/VITS)." },
  { id: "tts-piper-dii", name: "Voz Dii (pt-BR)", company: "Open source", category: "tts", usage: "voice-output", install: { kind: "recipe" }, sizeBytes: 21 * MB, repo: "https://github.com/rhasspy/piper", languages: "Português do Brasil", description: "Voz feminina de alta qualidade (Piper/VITS)." },
];

export function toolById(id: string): ToolInfo | undefined {
  return TOOL_CATALOG.find((tool) => tool.id === id);
}

export const ASR_MODELS = TOOL_CATALOG.filter((tool) => tool.usage === "voice-input");
export const TTS_VOICES = TOOL_CATALOG.filter((tool) => tool.usage === "voice-output");

/** Voz do Windows (SAPI via WebView2), sempre disponível. */
export const SYSTEM_VOICE_ID = "system";

export function groupByCompany(tools: ToolInfo[]): { company: ToolCompany; tools: ToolInfo[] }[] {
  return COMPANY_ORDER.map((company) => ({ company, tools: tools.filter((tool) => tool.company === company) })).filter((group) => group.tools.length > 0);
}

/**
 * Modelo de reconhecimento efetivo: o escolhido, se instalado; senão o primeiro instalado,
 * dando preferência ao recomendado.
 */
export function resolveAsrModel(selected: string | undefined, installed: Set<string>): string | undefined {
  if (selected && installed.has(selected)) return selected;
  const available = ASR_MODELS.filter((tool) => installed.has(tool.id));
  return (available.find((tool) => tool.recommended) ?? available[0])?.id;
}

/** Sem escolha salva, uma voz local instalada soa melhor que a do Windows. */
export function resolveTtsVoice(selected: string | undefined, installed: Set<string>): string {
  if (selected && (selected === SYSTEM_VOICE_ID || installed.has(selected))) return selected;
  const available = TTS_VOICES.filter((tool) => installed.has(tool.id));
  return (available.find((tool) => tool.recommended) ?? available[0])?.id ?? SYSTEM_VOICE_ID;
}
