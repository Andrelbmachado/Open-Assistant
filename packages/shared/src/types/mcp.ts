/** MCP server management. Implemented in @open-assistant/mcp. */

export type McpTransport = "stdio" | "sse" | "http" | "ws";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  /** For stdio. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** For sse/http/ws. */
  url?: string;
  enabled: boolean;
}

export type McpServerState = "stopped" | "starting" | "ready" | "error";

export interface McpServerStatus {
  id: string;
  state: McpServerState;
  error?: string;
  toolCount?: number;
}

export interface McpTool {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Entry shown in the visual marketplace. */
export interface McpRegistryEntry {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  install: Pick<McpServerConfig, "transport" | "command" | "args" | "url">;
}
