/**
 * Modelos de geração de imagem abertos (Configurações › Modelos locais › Modelos de imagem).
 * O download e os arquivos de cada id ficam no backend (`src-tauri/src/imagegen.rs`); aqui só o que
 * a interface mostra. Tamanhos incluem os componentes (VAE e codificador de texto) na primeira vez.
 */
import type { HardwareProfile } from "./localModels";

export type ImageEngine = "sd-cpp-cuda" | "py-diffusers";

export interface ImageModelInfo {
  id: string;
  name: string;
  author: string;
  engine: ImageEngine;
  license: string;
  /** Pode ser usado para ganhar dinheiro sem pagar licença. */
  commercial: boolean;
  sizeGb: number;
  /** VRAM recomendada e RAM mínima para rodar sem travar (GB). */
  vramGb: number;
  ramGb: number;
  description: string;
  strengths: string[];
  recommended?: boolean;
  /** Qualidade geral das imagens (0–10), para escolher o melhor modelo instalado sozinho. */
  quality: number;
}

/** Motores (instalados uma vez, antes do primeiro modelo que os usa). */
export const IMAGE_ENGINES: Record<ImageEngine, { name: string; sizeGb: number; description: string }> = {
  "sd-cpp-cuda": { name: "stable-diffusion.cpp (CUDA)", sizeGb: .9, description: "Motor em C++ para GPU NVIDIA, sem Python." },
  "py-diffusers": { name: "Diffusers (Python + PyTorch CUDA)", sizeGb: 5, description: "Necessário para Sana, Kolors, HunyuanDiT e GLM-Image." },
};

export const IMAGE_MODELS: ImageModelInfo[] = [
  { id: "img-z-image-turbo", name: "Z-Image Turbo", author: "Alibaba Tongyi", engine: "sd-cpp-cuda", license: "Apache 2.0", commercial: true, sizeGb: 6.7, vramGb: 6, ramGb: 12, recommended: true, strengths: ["Muito rápido", "Fotorrealismo", "Texto na imagem"], description: "Modelo destilado de 6B: 8 passos, ótimo custo/qualidade e roda com pouca VRAM.", quality: 8.6 },
  { id: "img-flux2-klein-4b", name: "FLUX.2 [klein] 4B", author: "Black Forest Labs", engine: "sd-cpp-cuda", license: "Apache 2.0", commercial: true, sizeGb: 7.1, vramGb: 6, ramGb: 12, strengths: ["Rápido (4 passos)", "Boa anatomia"], description: "Versão compacta do FLUX.2, liberada para uso comercial.", quality: 7.8 },
  { id: "img-flux1-schnell", name: "FLUX.1 [schnell]", author: "Black Forest Labs", engine: "sd-cpp-cuda", license: "Apache 2.0", commercial: true, sizeGb: 12.4, vramGb: 8, ramGb: 14, strengths: ["4 passos", "Alta qualidade"], description: "FLUX.1 destilado: qualidade alta em poucos passos, 100% livre.", quality: 8.0 },
  { id: "img-flux1-dev", name: "FLUX.1 [dev]", author: "Black Forest Labs", engine: "sd-cpp-cuda", license: "FLUX.1 [dev] (não comercial)", commercial: false, sizeGb: 12.4, vramGb: 8, ramGb: 14, strengths: ["Fotorrealismo de ponta", "Mãos e anatomia"], description: "Um dos melhores em fidelidade fotográfica; uso pessoal.", quality: 9.0 },
  { id: "img-flux2-klein-9b", name: "FLUX.2 [klein] 9B", author: "Black Forest Labs", engine: "sd-cpp-cuda", license: "FLUX (não comercial)", commercial: false, sizeGb: 11, vramGb: 8, ramGb: 16, strengths: ["Qualidade maior que o 4B", "4 passos"], description: "FLUX.2 intermediário, mais detalhado que o 4B.", quality: 8.5 },
  { id: "img-flux2-dev", name: "FLUX.2 [dev]", author: "Black Forest Labs", engine: "sd-cpp-cuda", license: "FLUX (não comercial)", commercial: false, sizeGb: 34, vramGb: 16, ramGb: 48, strengths: ["Estado da arte", "Prompts longos"], description: "O maior FLUX aberto (32B + Mistral 24B). Exige muita RAM.", quality: 9.8 },
  { id: "img-qwen-image-2512", name: "Qwen-Image 2512", author: "Alibaba Qwen", engine: "sd-cpp-cuda", license: "Apache 2.0", commercial: true, sizeGb: 17.2, vramGb: 12, ramGb: 24, strengths: ["Texto legível em artes", "Entende bem o pedido"], description: "20B com renderização de texto excelente (cartazes, capas).", quality: 9.4 },
  { id: "img-sd35-large", name: "Stable Diffusion 3.5 Large", author: "Stability AI", engine: "sd-cpp-cuda", license: "Community (grátis até US$ 1 mi/ano)", commercial: true, sizeGb: 11.3, vramGb: 8, ramGb: 14, strengths: ["Composição", "Estilos variados"], description: "SD 3.5 grande, bom controle de composição.", quality: 7.6 },
  { id: "img-sd35-large-turbo", name: "Stable Diffusion 3.5 Large Turbo", author: "Stability AI", engine: "sd-cpp-cuda", license: "Community (grátis até US$ 1 mi/ano)", commercial: true, sizeGb: 11.3, vramGb: 8, ramGb: 14, strengths: ["4 passos"], description: "SD 3.5 Large destilado para 4 passos.", quality: 7.2 },
  { id: "img-sd35-medium", name: "Stable Diffusion 3.5 Medium", author: "Stability AI", engine: "sd-cpp-cuda", license: "Community (grátis até US$ 1 mi/ano)", commercial: true, sizeGb: 9.4, vramGb: 6, ramGb: 12, strengths: ["Leve"], description: "SD 3.5 de 2,5B, roda em GPUs menores.", quality: 6.4 },
  { id: "img-sdxl", name: "SDXL 1.0", author: "Stability AI", engine: "sd-cpp-cuda", license: "OpenRAIL++", commercial: true, sizeGb: 7.3, vramGb: 8, ramGb: 12, strengths: ["Maior ecossistema (LoRAs)", "Estilos artísticos"], description: "O clássico de 1024 px com milhares de estilos da comunidade.", quality: 6.6 },
  { id: "img-sd15", name: "Stable Diffusion 1.5", author: "Stability AI / RunwayML", engine: "sd-cpp-cuda", license: "CreativeML OpenRAIL-M", commercial: true, sizeGb: 4.3, vramGb: 4, ramGb: 8, strengths: ["Leve", "Roda em quase tudo"], description: "O mais leve e antigo, em 512 px.", quality: 4.0 },
  { id: "img-pixart-sigma", name: "PixArt-Σ", author: "PixArt (Huawei/Noah)", engine: "sd-cpp-cuda", license: "OpenRAIL++", commercial: true, sizeGb: 7.7, vramGb: 6, ramGb: 12, strengths: ["DiT leve", "1024 px"], description: "Transformer de difusão pequeno (0,6B) com T5.", quality: 6.3 },
  { id: "img-sana-1.5", name: "Sana 1.5 1.6B", author: "NVIDIA / MIT", engine: "py-diffusers", license: "Apache 2.0", commercial: true, sizeGb: 9.7, vramGb: 8, ramGb: 16, strengths: ["Alta resolução", "Eficiente"], description: "Linear DiT da NVIDIA, muito eficiente em resolução alta.", quality: 7.1 },
  { id: "img-kolors", name: "Kolors", author: "Kuaishou", engine: "py-diffusers", license: "Apache 2.0", commercial: true, sizeGb: 17.8, vramGb: 8, ramGb: 20, strengths: ["Prompts longos", "Vários idiomas"], description: "Base SDXL com o codificador ChatGLM3: entende prompts longos.", quality: 7.3 },
  { id: "img-hunyuandit", name: "HunyuanDiT 1.2", author: "Tencent", engine: "py-diffusers", license: "Tencent Hunyuan Community", commercial: true, sizeGb: 14.4, vramGb: 10, ramGb: 20, strengths: ["Cenas complexas"], description: "DiT da Tencent focado em entender cenas detalhadas.", quality: 7.5 },
  { id: "img-glm-image", name: "GLM-Image", author: "Zhipu AI", engine: "py-diffusers", license: "MIT", commercial: true, sizeGb: 35.8, vramGb: 24, ramGb: 48, strengths: ["Infográficos e cartazes", "Texto na imagem"], description: "Autorregressivo 9B + DiT 7B: layouts com texto. Muito pesado.", quality: 9.1 },
];

export function imageModelById(id: string | undefined): ImageModelInfo | undefined {
  return IMAGE_MODELS.find((model) => model.id === id);
}

export type ImageFit = "ok" | "slow" | "heavy";

/** Roda bem neste PC? `heavy` = provavelmente falta RAM/VRAM (ainda dá para baixar). */
export function imageModelFit(model: ImageModelInfo, hardware: HardwareProfile | undefined): { fit: ImageFit; reason: string } {
  if (!hardware) return { fit: "ok", reason: "Compatibilidade ainda não verificada." };
  const ram = hardware.ramMb / 1024;
  const vram = Math.max(0, ...hardware.gpus.map((gpu) => gpu.vramMb)) / 1024;
  if (ram + .5 < model.ramGb) return { fit: "heavy", reason: `Pede ~${model.ramGb} GB de RAM; este PC tem ${Math.round(ram)} GB. Pode falhar por falta de memória.` };
  if (vram + .5 < model.vramGb) return { fit: "slow", reason: `Ideal com ${model.vramGb} GB de VRAM; aqui roda com parte na RAM (mais lento).` };
  return { fit: "ok", reason: "Roda bem neste PC." };
}

/** Melhor modelo instalado que roda neste PC (os "pesados demais" só entram se não houver outro). */
export function bestImageModel(installed: Set<string>, hardware?: HardwareProfile): ImageModelInfo | undefined {
  const available = IMAGE_MODELS.filter((model) => installed.has(model.id));
  const runs = available.filter((model) => imageModelFit(model, hardware).fit !== "heavy");
  return [...(runs.length ? runs : available)].sort((a, b) => b.quality - a.quality)[0];
}

/** Modelo de imagem a usar: o que a pessoa escolheu em Configurações (se instalado); senão o melhor instalado. */
export function resolveImageModel(preferred: string | undefined, installed: Set<string>, hardware?: HardwareProfile): ImageModelInfo | undefined {
  const chosen = imageModelById(preferred);
  if (chosen && installed.has(chosen.id)) return chosen;
  return bestImageModel(installed, hardware);
}

/** Começo educado ou pergunta ("você pode me", "quero que você", "será que consegue"), opcional. */
const PREFIX = String.raw`^\s*(?:por favor,?\s*|ei,?\s*|oi,?\s*)?(?:(?:voc[êe]|vc)\s+)?(?:(?:pode|poderia|consegue|conseguiria|sabe|saberia|tem como|d[áa] pra|daria pra|ser[áa] que (?:voc[êe]\s+)?(?:pode|consegue))\s+|(?:eu\s+)?(?:quero|queria|gostaria)\s+que\s+(?:voc[êe]\s+)?)?(?:me\s+)?`;
const VERB = String.raw`(?:gere|gera|gerar|crie|cria|criar|desenhe|desenha|desenhar|fa[çc]a|faz|fazer|pinte|pinta|pintar|ilustre|ilustra|ilustrar|mostre|mostra|mostrar|mande|manda|mandar|quero|queria|preciso de|gostaria de)`;
const FOR_ME = String.raw`(?:\s+(?:pra|para)\s+mim)?`;
const KIND = String.raw`(imagem|imagens|foto|fotos|figura|ilustra[çc][ãa]o|desenho|arte|pintura|logo|logotipo|wallpaper|papel de parede|p[ôo]ster|cartaz)`;
const IMAGE_REQUEST = new RegExp(`${PREFIX}${VERB}${FOR_ME}\\s+(?:uma?\\s+|umas?\\s+)?(?:nova\\s+)?${KIND}(?![\\p{L}\\p{N}])[\\s:,-]*`, "iu");
/** "desenhe um dragão", "pinta pra mim um pôr do sol": o verbo já diz que é imagem. */
const DRAW_REQUEST = new RegExp(`${PREFIX}(desenhe|desenha|desenhar|ilustre|ilustra|ilustrar|pinte|pinta|pintar)${FOR_ME}\\s+(?=\\S)`, "iu");
/** Tipos que ajudam o modelo ("logo", "foto") e por isso ficam no prompt; "imagem" não acrescenta nada. */
const GENERIC = /^(imagem|imagens|figura)$/i;

/**
 * O texto começa com um pedido de imagem ("gere uma imagem", "crie uma foto de", "desenhe um logo")?
 * Liga o modo imagem enquanto a pessoa digita, antes de ela terminar a descrição.
 */
export function startsImageRequest(text: string): boolean {
  return IMAGE_REQUEST.test(text) || DRAW_REQUEST.test(text);
}

const cleanRest = (rest: string) => rest.trim().replace(/[.!?…]+$/, "").trim();

/** "gere uma imagem de um gato astronauta" → "um gato astronauta" (undefined se não for pedido de imagem). */
export function imagePromptFrom(text: string): string | undefined {
  const match = IMAGE_REQUEST.exec(text);
  if (match) {
    const rest = cleanRest(text.slice(match[0].length));
    if (!rest) return undefined;
    if (GENERIC.test(match[1])) return rest.replace(/^(?:de|do|da|dos|das|com|sobre|mostrando)\s+/i, "");
    return `${match[1].toLowerCase()} ${rest}`;
  }
  const draw = DRAW_REQUEST.exec(text);
  if (!draw) return undefined;
  const rest = cleanRest(text.slice(draw[0].length));
  if (!rest || /^(?:a|o|as|os|isso|isto|aquilo|ela|ele)\b/i.test(rest)) return undefined;
  const kind = /^desenh/i.test(draw[1]) ? "desenho" : /^ilustr/i.test(draw[1]) ? "ilustração" : "pintura";
  return `${kind} de ${rest}`;
}

/** O modelo de texto respondeu que não gera imagens ("não consigo criar imagens", "sou um modelo de linguagem"). */
const REFUSAL = /(n[ãa]o\s+(?:consigo|posso|sou capaz de|tenho (?:a\s+)?(?:capacidade|como|acesso)|[ée] poss[íi]vel)\s+(?:de\s+)?(?:gerar|criar|desenhar|produzir|fazer|mostrar|enviar|exibir)|sou (?:apenas\s+)?um (?:modelo|assistente) (?:de|baseado em) (?:linguagem|texto)|(?:apenas|somente|s[óo])\s+(?:com\s+)?texto|n[ãa]o (?:gero|crio|fa[çc]o|desenho) (?:imagens|fotos|desenhos)|can(?:not|'t|’t) (?:generate|create|draw|produce|make) (?:images|pictures|an image))/i;
const LOOSE_KIND = /(?:imagem|imagens|foto|fotos|figura|ilustra[çc][ãa]o|desenho|arte|pintura|logo|logotipo|wallpaper|papel de parede|p[ôo]ster|cartaz)\s+(?:(?:de|do|da|dos|das|com|sobre|mostrando)\s+)?(.+)/iu;
const ASKS = /\b(?:ger|cri|desenh|fa[çz]|pint|ilustr|mostr|mand|quer|precis|gostar)/i;

/**
 * O pedido era de imagem e o modelo de texto disse que não consegue: devolve o que desenhar, para o app
 * chamar o gerador de imagem sozinho (o usuário não precisa ligar o modo imagem).
 */
export function imageFallbackPrompt(userText: string, reply: string): string | undefined {
  if (!REFUSAL.test(reply)) return undefined;
  const direct = imagePromptFrom(userText);
  if (direct) return direct;
  if (!ASKS.test(userText)) return undefined;
  const loose = LOOSE_KIND.exec(userText);
  const rest = loose ? cleanRest(loose[1]) : "";
  return rest || undefined;
}
