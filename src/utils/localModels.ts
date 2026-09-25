export interface GpuProfile {
  name: string;
  vramMb: number;
  driverVersion?: string;
  vendor: "nvidia" | "other";
}

/** Inventário devolvido pelo comando `scan_hardware` do backend. */
export interface HardwareProfile {
  gpus: GpuProfile[];
  cpuName: string;
  ramMb: number;
  availableDiskMb: number;
  warnings: string[];
}
