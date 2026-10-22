import { describe, expect, it } from "vitest";
import { addPreset, expandArgs, MCP_PRESETS, removeServer, toggleServer } from "./mcpPresets";

describe("mcp presets", () => {
  it("keeps a small essential set (browser, Windows apps, web reading)", () => {
    expect(MCP_PRESETS.filter((preset) => preset.essential).map((preset) => preset.id)).toEqual(["playwright", "windows-mcp", "fetch"]);
  });

  it("offers a read-only Playwright and a Composio connector", () => {
    const read = MCP_PRESETS.find((preset) => preset.id === "playwright-read")!;
    expect(read.args).toContain("--headless");
    expect(read.args).toContain("--isolated");
    expect(read.essential).toBeUndefined();
    expect(MCP_PRESETS.some((preset) => preset.id === "composio")).toBe(true);
  });

  it("adds, toggles and removes servers in Claude Desktop format", () => {
    const playwright = MCP_PRESETS[0];
    let config = addPreset({ mcpServers: {} }, playwright, "C:\\Users\\andre");
    expect(config.mcpServers.playwright).toEqual({ command: "npx", args: ["-y", "@playwright/mcp@latest", "--browser", "chrome"] });
    config = toggleServer(config, "playwright", true);
    expect(config.mcpServers.playwright.disabled).toBe(true);
    expect(removeServer(config, "playwright").mcpServers).toEqual({});
  });

  it("expands %USERPROFILE% in arguments", () => {
    expect(expandArgs(["%USERPROFILE%\\Projects"], "C:\\Users\\andre")).toEqual(["C:\\Users\\andre\\Projects"]);
  });
});
