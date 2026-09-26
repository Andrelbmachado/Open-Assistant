/**
 * Ícone e cor de cada arquivo na árvore da tela Arquivos, no espírito do tema de ícones do VS Code:
 * a cor diz a linguagem; o ícone diz o tipo (código, dados, texto, imagem, executável…).
 */
export type FileIconKind = "code" | "json" | "text" | "markdown" | "image" | "archive" | "config" | "script" | "binary" | "lock" | "git" | "html" | "style";

export interface FileIconInfo { kind: FileIconKind; color: string; label: string }

const BY_EXTENSION: Record<string, FileIconInfo> = {
  ts: { kind: "code", color: "#3b8eea", label: "TypeScript" },
  tsx: { kind: "code", color: "#4fc1ff", label: "TypeScript React" },
  js: { kind: "code", color: "#e8d44d", label: "JavaScript" },
  jsx: { kind: "code", color: "#61dafb", label: "JavaScript React" },
  mjs: { kind: "code", color: "#e8d44d", label: "JavaScript" },
  cjs: { kind: "code", color: "#e8d44d", label: "JavaScript" },
  rs: { kind: "code", color: "#dea584", label: "Rust" },
  py: { kind: "code", color: "#4b8bbe", label: "Python" },
  cs: { kind: "code", color: "#9b7bd8", label: "C#" },
  go: { kind: "code", color: "#00add8", label: "Go" },
  java: { kind: "code", color: "#e76f00", label: "Java" },
  c: { kind: "code", color: "#8fa4c9", label: "C" },
  cpp: { kind: "code", color: "#6f9fd8", label: "C++" },
  h: { kind: "code", color: "#a074c4", label: "Header" },
  json: { kind: "json", color: "#cbcb41", label: "JSON" },
  jsonl: { kind: "json", color: "#cbcb41", label: "JSON Lines" },
  md: { kind: "markdown", color: "#519aba", label: "Markdown" },
  txt: { kind: "text", color: "#a8a8ae", label: "Texto" },
  log: { kind: "text", color: "#a8a8ae", label: "Log" },
  csv: { kind: "text", color: "#89e051", label: "CSV" },
  html: { kind: "html", color: "#e44d26", label: "HTML" },
  css: { kind: "style", color: "#a074c4", label: "CSS" },
  scss: { kind: "style", color: "#cd6799", label: "SCSS" },
  toml: { kind: "config", color: "#9c9c9c", label: "TOML" },
  yml: { kind: "config", color: "#cb171e", label: "YAML" },
  yaml: { kind: "config", color: "#cb171e", label: "YAML" },
  ini: { kind: "config", color: "#9c9c9c", label: "INI" },
  conf: { kind: "config", color: "#9c9c9c", label: "Configuração" },
  env: { kind: "config", color: "#e5c07b", label: "Variáveis" },
  bat: { kind: "script", color: "#89e051", label: "Batch" },
  cmd: { kind: "script", color: "#89e051", label: "Batch" },
  ps1: { kind: "script", color: "#5391fe", label: "PowerShell" },
  sh: { kind: "script", color: "#89e051", label: "Shell" },
  png: { kind: "image", color: "#a074c4", label: "Imagem" },
  jpg: { kind: "image", color: "#a074c4", label: "Imagem" },
  jpeg: { kind: "image", color: "#a074c4", label: "Imagem" },
  gif: { kind: "image", color: "#a074c4", label: "Imagem" },
  webp: { kind: "image", color: "#a074c4", label: "Imagem" },
  svg: { kind: "image", color: "#ffb13b", label: "SVG" },
  ico: { kind: "image", color: "#a074c4", label: "Ícone" },
  zip: { kind: "archive", color: "#d4a15f", label: "Compactado" },
  "7z": { kind: "archive", color: "#d4a15f", label: "Compactado" },
  gguf: { kind: "binary", color: "#8f8f95", label: "Modelo de IA" },
  safetensors: { kind: "binary", color: "#8f8f95", label: "Modelo de IA" },
  onnx: { kind: "binary", color: "#8f8f95", label: "Modelo de IA" },
  exe: { kind: "binary", color: "#7fb3d5", label: "Programa" },
  dll: { kind: "binary", color: "#8f8f95", label: "Biblioteca" },
  pdf: { kind: "binary", color: "#e5533d", label: "PDF" },
  docx: { kind: "binary", color: "#4a8ce0", label: "Word" },
  xlsx: { kind: "binary", color: "#3f9c5f", label: "Excel" },
  pptx: { kind: "binary", color: "#d86a3a", label: "PowerPoint" },
  lock: { kind: "lock", color: "#8b8b8b", label: "Lockfile" },
};

const BY_NAME: Record<string, FileIconInfo> = {
  ".gitignore": { kind: "git", color: "#f05032", label: "Git" },
  ".gitattributes": { kind: "git", color: "#f05032", label: "Git" },
  "package-lock.json": { kind: "lock", color: "#cb3837", label: "npm" },
  "package.json": { kind: "json", color: "#cb3837", label: "npm" },
  "cargo.lock": { kind: "lock", color: "#dea584", label: "Cargo" },
  "cargo.toml": { kind: "config", color: "#dea584", label: "Cargo" },
  "dockerfile": { kind: "config", color: "#2496ed", label: "Docker" },
};

export function fileIcon(name: string): FileIconInfo {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  if (lower.startsWith(".env")) return BY_EXTENSION.env;
  const extension = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
  return BY_EXTENSION[extension] ?? { kind: "text", color: "#9d9da5", label: extension ? extension.toUpperCase() : "Arquivo" };
}

/** Cor das marcas do git, como no VS Code: M amarelo, U verde, D vermelho. */
export function gitMarkColor(mark: string | undefined): string | undefined {
  if (!mark) return undefined;
  if (mark === "M") return "#e2c08d";
  if (mark === "U" || mark === "A") return "#73c991";
  if (mark === "D") return "#f48771";
  return "#c5a86a";
}

/** "12,4 KB" */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}
