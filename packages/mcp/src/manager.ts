import type {
  McpServerConfig,
  McpServerStatus,
  McpTool,
} from "@open-assistant/shared";

/** Connects to MCP servers and surfaces their tools to agents. */
export class McpManager {
  private configs = new Map<string, McpServerConfig>();
  private status = new Map<string, McpServerStatus>();

  add(config: McpServerConfig): void {
    this.configs.set(config.id, config);
    this.status.set(config.id, { id: config.id, state: "stopped" });
  }
  remove(id: string): void {
    this.configs.delete(id);
    this.status.delete(id);
  }
  setEnabled(id: string, enabled: boolean): void {
    const c = this.configs.get(id);
    if (c) c.enabled = enabled;
  }

  async start(_id: string): Promise<void> {
    // TODO: spin up transport (stdio/sse/http/ws), handshake, list tools.
  }
  async tools(): Promise<McpTool[]> {
    // TODO: aggregate tools across ready servers.
    return [];
  }
  statuses(): McpServerStatus[] {
    return [...this.status.values()];
  }
}
