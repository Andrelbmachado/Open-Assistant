export interface GpuProfile {
  name: string;
  vramMb: number;
  driverVersion?: string;
  vendor: "nvidia" | "other";
}

export interface HardwareProfile {
  gpus: GpuProfile[];
  cpuName: string;
  ramMb: number;
  availableDiskMb: number;
  warnings: string[];
}

export interface ModelRecommendation {
  eligible: boolean;
  modelId?: string;
  modelName?: string;
  downloadSizeMb?: number;
  minimumVramMb?: number;
  minimumRamMb?: number;
  minimumDiskMb?: number;
  reason: string;
}

const profiles = [
  { modelId: "qwen3.5:9b", modelName: "Qwen3.5 9B", downloadSizeMb: 6600, minimumVramMb: 10240, minimumRamMb: 16384, minimumDiskMb: 10240 },
  { modelId: "qwen3.5:4b", modelName: "Qwen3.5 4B", downloadSizeMb: 3400, minimumVramMb: 6144, minimumRamMb: 12288, minimumDiskMb: 6144 },
  { modelId: "qwen3.5:2b", modelName: "Qwen3.5 2B", downloadSizeMb: 2700, minimumVramMb: 4096, minimumRamMb: 8192, minimumDiskMb: 5120 },
  { modelId: "qwen3.5:0.8b", modelName: "Qwen3.5 0.8B", downloadSizeMb: 1000, minimumVramMb: 3072, minimumRamMb: 8192, minimumDiskMb: 3072 },
] as const;

export function recommendLocalModel(hardware: HardwareProfile): ModelRecommendation {
  const nvidiaGpu = hardware.gpus.filter((gpu) => gpu.vendor === "nvidia").sort((a, b) => b.vramMb - a.vramMb)[0];
  if (!nvidiaGpu) return { eligible: false, reason: "Nenhuma GPU NVIDIA compatível foi detectada." };

  const profile = profiles.find((candidate) =>
    nvidiaGpu.vramMb >= candidate.minimumVramMb
    && hardware.ramMb >= candidate.minimumRamMb
    && hardware.availableDiskMb >= candidate.minimumDiskMb,
  );
  if (!profile) {
    const smallestProfile = profiles[profiles.length - 1];
    if (nvidiaGpu.vramMb < smallestProfile.minimumVramMb) return { eligible: false, reason: "A GPU detectada não possui VRAM suficiente para um modelo local equilibrado." };
    if (hardware.ramMb < smallestProfile.minimumRamMb) return { eligible: false, reason: "A memória RAM disponível não atende ao mínimo para o modelo local." };
    return { eligible: false, reason: "O disco não possui espaço livre suficiente para baixar e preparar o modelo." };
  }

  return { eligible: true, ...profile, reason: `${profile.modelName} equilibra qualidade, VRAM disponível e memória do sistema.` };
}
