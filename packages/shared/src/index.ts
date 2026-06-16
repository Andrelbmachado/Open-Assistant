/**
 * @open-assistant/shared
 * Single source of truth for cross-package types. Import contracts from here;
 * never redefine them inside another package.
 */
export * from "./types/model.js";
export * from "./types/agent.js";
export * from "./types/memory.js";
export * from "./types/skill.js";
export * from "./types/mcp.js";
export * from "./types/artifact.js";
export * from "./types/task.js";
