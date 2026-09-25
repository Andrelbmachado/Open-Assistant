/**
 * Conectores MCP sugeridos em Configurações › Conectores MCP. O conjunto "essencial" cobre
 * navegador (Playwright), qualquer app do Windows (Windows-MCP) e leitura da web (Fetch) sem
 * sobreposição — cada servidor ligado aumenta o prompt do agente. Espelha `references/mcp.md`.
 */
export interface McpPreset {
  id: string;
  name: string;
  company: string;
  description: string;
  command: string;
  args: string[];
  /** Precisa de `npx` (Node.js) ou `uvx` (uv). */
  runtime: "npx" | "uvx";
  essential?: boolean;
}

/** Conectores sugeridos; `essential` marca o conjunto mínimo recomendado. */
export const MCP_PRESETS: McpPreset[] = [
  { id: "playwright", name: "Playwright", company: "Microsoft", runtime: "npx", essential: true, command: "npx", args: ["-y", "@playwright/mcp@latest", "--browser", "chrome"], description: "Navega, clica e preenche páginas pela árvore de acessibilidade, sem prints." },
  { id: "windows-mcp", name: "Windows-MCP", company: "CursorTouch", runtime: "uvx", essential: true, command: "uvx", args: ["windows-mcp"], description: "Árvore de interface de qualquer programa do Windows, cliques, digitação e PowerShell." },
  { id: "fetch", name: "Fetch", company: "Anthropic (oficial)", runtime: "uvx", essential: true, command: "uvx", args: ["mcp-server-fetch"], description: "Baixa páginas como Markdown para ler sem abrir o navegador." },
  { id: "chrome-devtools", name: "Chrome DevTools", company: "Google", runtime: "npx", command: "npx", args: ["-y", "chrome-devtools-mcp@latest"], description: "Depura sites no Chrome: console, rede e desempenho." },
  { id: "filesystem", name: "Filesystem", company: "Anthropic (oficial)", runtime: "npx", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "%USERPROFILE%\\Projects"], description: "Lê e edita arquivos só dentro das pastas permitidas (edite o caminho no JSON)." },
  { id: "git", name: "Git", company: "Anthropic (oficial)", runtime: "uvx", command: "uvx", args: ["mcp-server-git"], description: "Histórico, diffs e commits de repositórios." },
  { id: "desktop-commander", name: "Desktop Commander", company: "Comunidade", runtime: "npx", command: "npx", args: ["-y", "@wonderwhy-er/desktop-commander"], description: "Terminal persistente e edição de arquivos grandes." },
  { id: "duckduckgo", name: "DuckDuckGo", company: "Comunidade", runtime: "uvx", command: "uvx", args: ["duckduckgo-mcp-server"], description: "Busca na web quando a busca nativa não bastar." },
  { id: "memory", name: "Memory", company: "Anthropic (oficial)", runtime: "npx", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], description: "Guarda fatos sobre você entre conversas (grafo de conhecimento)." },
];

export interface McpServerConfig { command: string; args: string[]; env?: Record<string, string>; disabled?: boolean }
export interface McpConfig { mcpServers: Record<string, McpServerConfig> }

/** Troca `%USERPROFILE%` pelo caminho real (o servidor recebe os argumentos sem passar por um shell que expanda). */
export function expandArgs(args: string[], userProfile: string): string[] {
  return args.map((arg) => arg.replace(/%USERPROFILE%/gi, userProfile));
}

/** Adiciona (ou substitui) um conector sugerido na configuração. */
export function addPreset(config: McpConfig, preset: McpPreset, userProfile: string): McpConfig {
  return { mcpServers: { ...config.mcpServers, [preset.id]: { command: preset.command, args: expandArgs(preset.args, userProfile) } } };
}

/** Remove um conector da configuração. */
export function removeServer(config: McpConfig, name: string): McpConfig {
  const servers = { ...config.mcpServers };
  delete servers[name];
  return { mcpServers: servers };
}

/** Liga/desliga um conector sem apagar a configuração. */
export function toggleServer(config: McpConfig, name: string, disabled: boolean): McpConfig {
  const server = config.mcpServers[name];
  if (!server) return config;
  return { mcpServers: { ...config.mcpServers, [name]: { ...server, disabled } } };
}
