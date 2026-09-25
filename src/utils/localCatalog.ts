import type { HardwareProfile } from "./localModels";

/** Prefixo dos modelos do Ollama no campo `model` dos chats. */
export const OLLAMA_MODEL_PREFIX = "Ollama: ";
/** Modelo de 1 bit da Microsoft, servido pelo bitnet.cpp (não pelo Ollama). */
export const BITNET_MODEL_PREFIX = "BitNet: ";
export const BITNET_MODEL = `${BITNET_MODEL_PREFIX}bitnet-b1.58-2b-4t`;

/** O modelo roda neste PC (Ollama ou BitNet)? */
export function isLocalChatModel(model: string | undefined): model is string {
  return Boolean(model && (model.startsWith(OLLAMA_MODEL_PREFIX) || model.startsWith(BITNET_MODEL_PREFIX)));
}

/** Modelo instalado, como informado por `GET /api/tags` do Ollama. */
export interface InstalledModel {
  name: string;
  sizeBytes: number;
  family?: string;
  parameterSize?: string;
}

interface CatalogModel {
  id: string;
  family: string;
  label: string;
  /** Tamanho real do download (soma das camadas do manifesto no registro do Ollama). */
  sizeBytes: number;
}

export type LocalModelStatus = "installed" | "available" | "incompatible";

export interface LocalModelOption {
  id: string;
  label: string;
  family: string;
  sizeBytes: number;
  status: LocalModelStatus;
  reason: string;
  recommended: boolean;
  runsOn?: "gpu" | "cpu";
}

/** Modelos sugeridos com o tamanho real do download (manifesto do registro do Ollama). */
export const LOCAL_MODEL_CATALOG: CatalogModel[] = [
  { id: "qwen3.5:0.8b", family: "Qwen", label: "Qwen3.5 0.8B", sizeBytes: 1_036_046_583 },
  { id: "qwen3.5:2b", family: "Qwen", label: "Qwen3.5 2B", sizeBytes: 2_741_192_820 },
  { id: "qwen3.5:4b", family: "Qwen", label: "Qwen3.5 4B", sizeBytes: 3_389_983_735 },
  { id: "qwen3.5:9b", family: "Qwen", label: "Qwen3.5 9B", sizeBytes: 6_594_474_711 },
  { id: "qwen3.5:27b", family: "Qwen", label: "Qwen3.5 27B", sizeBytes: 17_420_432_728 },
  { id: "gemma3:1b", family: "Gemma", label: "Gemma 3 1B", sizeBytes: 815_319_791 },
  { id: "gemma3:4b", family: "Gemma", label: "Gemma 3 4B", sizeBytes: 3_338_801_804 },
  { id: "gemma3:12b", family: "Gemma", label: "Gemma 3 12B", sizeBytes: 8_149_190_253 },
  { id: "gemma4:e2b", family: "Gemma", label: "Gemma 4 E2B", sizeBytes: 7_162_405_886 },
  { id: "gemma4:e4b", family: "Gemma", label: "Gemma 4 E4B", sizeBytes: 9_608_350_718 },
  { id: "gemma4:26b", family: "Gemma", label: "Gemma 4 26B", sizeBytes: 18_604_148_513 },
  { id: "llama3.2:1b", family: "Llama", label: "Llama 3.2 1B", sizeBytes: 1_321_098_329 },
  { id: "llama3.2:3b", family: "Llama", label: "Llama 3.2 3B", sizeBytes: 2_019_393_189 },
  { id: "llama3.1:8b", family: "Llama", label: "Llama 3.1 8B", sizeBytes: 4_920_753_328 },
  { id: "llama3.2-vision:11b", family: "Llama", label: "Llama 3.2 Vision 11B", sizeBytes: 7_816_589_186 },
  { id: "phi4-mini:3.8b", family: "Phi", label: "Phi-4 mini 3.8B", sizeBytes: 2_491_876_774 },
  { id: "phi4:14b", family: "Phi", label: "Phi-4 14B", sizeBytes: 9_053_116_391 },
  { id: "deepseek-r1:8b", family: "DeepSeek", label: "DeepSeek R1 8B", sizeBytes: 5_225_376_047 },
  { id: "gpt-oss:20b", family: "OpenAI", label: "gpt-oss 20B", sizeBytes: 13_793_441_244 },
];

const MB = 1024 * 1024;
const GB = 1024 * MB;
// Modelos até este tamanho ainda respondem de forma utilizável só com CPU.
const CPU_MAX_MODEL_MB = 4096;

/** Estimativas conservadoras: pesos + ~20% de contexto/cache + folga do runtime. */
function requirementsFor(sizeBytes: number) {
  const sizeMb = sizeBytes / MB;
  return {
    sizeMb,
    vramMb: Math.ceil(sizeMb * 1.2 + 1024),
    gpuRamMb: Math.max(8192, Math.ceil(sizeMb + 4096)),
    cpuRamMb: Math.ceil(sizeMb * 1.2 + 4096),
    diskMb: Math.ceil(sizeMb + 1024),
  };
}

const toGb = (mb: number) => Math.ceil(mb / 1024);

function evaluate(model: CatalogModel, hardware: HardwareProfile | undefined): Pick<LocalModelOption, "status" | "reason" | "runsOn"> {
  if (!hardware) return { status: "available", reason: "Compatibilidade ainda não verificada neste computador." };
  const need = requirementsFor(model.sizeBytes);
  if (hardware.availableDiskMb < need.diskMb) {
    return { status: "incompatible", reason: `Precisa de ${toGb(need.diskMb)} GB livres no disco; há ${toGb(hardware.availableDiskMb)} GB.` };
  }
  const vram = Math.max(0, ...hardware.gpus.filter((gpu) => gpu.vendor === "nvidia").map((gpu) => gpu.vramMb));
  if (vram >= need.vramMb && hardware.ramMb >= need.gpuRamMb) {
    return { status: "available", runsOn: "gpu", reason: `Cabe na GPU: usa cerca de ${toGb(need.vramMb)} GB dos ${toGb(vram)} GB de VRAM.` };
  }
  if (need.sizeMb <= CPU_MAX_MODEL_MB && hardware.ramMb >= need.cpuRamMb) {
    return { status: "available", runsOn: "cpu", reason: "Roda na CPU, com respostas mais lentas." };
  }
  if (vram > 0 && vram < need.vramMb) {
    return { status: "incompatible", reason: `Requer cerca de ${toGb(need.vramMb)} GB de VRAM; esta GPU tem ${toGb(vram)} GB.` };
  }
  if (vram === 0) {
    return { status: "incompatible", reason: `Requer uma GPU NVIDIA com cerca de ${toGb(need.vramMb)} GB de VRAM.` };
  }
  return { status: "incompatible", reason: `Requer cerca de ${toGb(need.gpuRamMb)} GB de RAM; este computador tem ${toGb(hardware.ramMb)} GB.` };
}

/** Junta catálogo + instalados + hardware em opções instalado/disponível/incompatível. */
export function buildLocalModelOptions(hardware: HardwareProfile | undefined, installedModels: InstalledModel[]): LocalModelOption[] {
  const installed = new Map(installedModels.map((model) => [model.name.toLowerCase(), model]));
  const catalog: LocalModelOption[] = LOCAL_MODEL_CATALOG.map((model) => {
    const fit = evaluate(model, hardware);
    const local = installed.get(model.id.toLowerCase());
    if (local) return { ...model, sizeBytes: local.sizeBytes || model.sizeBytes, status: "installed", reason: "Instalado no Ollama.", runsOn: fit.runsOn, recommended: false };
    return { ...model, ...fit, recommended: false };
  });

  // Recomenda o maior Qwen3.5 que roda na GPU (instalado ou não); sem GPU adequada, o maior que roda na CPU.
  const qwen = catalog.filter((item) => item.family === "Qwen" && item.status !== "incompatible" && item.runsOn);
  const onGpu = qwen.filter((item) => item.runsOn === "gpu");
  const recommended = (onGpu.length ? onGpu : qwen).sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
  if (recommended) recommended.recommended = true;

  const known = new Set(LOCAL_MODEL_CATALOG.map((item) => item.id.toLowerCase()));
  const extras: LocalModelOption[] = installedModels
    .filter((model) => !known.has(model.name.toLowerCase()))
    .map((model) => ({ id: model.name, label: model.name, family: model.family ?? "Ollama", sizeBytes: model.sizeBytes, status: "installed", reason: "Instalado no Ollama.", recommended: false }));
  return [...extras, ...catalog];
}

/** Resolve qual modelo Ollama o chat deve usar, sem nunca cair para nuvem. */
export function resolveChatModel(chatModel: string, installedIds: string[], preferred: string | undefined): string | undefined {
  if (chatModel.startsWith("Nuvem: ") || isLocalChatModel(chatModel)) return chatModel;
  if (preferred?.startsWith(BITNET_MODEL_PREFIX) || preferred?.startsWith("Nuvem: ")) return preferred;
  // Lista vazia = Ollama desligado ou ainda sem resposta: mantém a escolha para o erro real aparecer.
  if (preferred?.startsWith(OLLAMA_MODEL_PREFIX) && (!installedIds.length || installedIds.includes(preferred.slice(OLLAMA_MODEL_PREFIX.length)))) return preferred;
  return installedIds[0] ? `${OLLAMA_MODEL_PREFIX}${installedIds[0]}` : undefined;
}

/** Tamanho legível em pt-BR ("6,1 GB", "500 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
  return `${Math.round(bytes / MB).toLocaleString("pt-BR")} MB`;
}
