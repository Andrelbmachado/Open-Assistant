/** Agent & sub-agent contracts. Implemented in @open-assistant/agents. */

import type { ChatMessage } from "./model.js";

export type AgentRole =
  | "master"
  | "research"
  | "planning"
  | "coding"
  | "design"
  | "browser"
  | "email"
  | "document"
  | "financial"
  | "monitoring"
  | string; // open-ended

export type AgentStatus =
  | "idle"
  | "planning"
  | "running"
  | "waiting_approval"
  | "done"
  | "error";

/** Declarative description of an agent. */
export interface AgentDefinition {
  id: string;
  role: AgentRole;
  systemPrompt: string;
  /** Skill/MCP/automation tool names this agent may use. */
  allowedTools: string[];
  /** Permission scopes granted to this agent. */
  permissions: string[];
  /** Optional pin to a specific model. */
  model?: string;
}

/** What an agent receives at run time. */
export interface AgentContext {
  goal: string;
  history: ChatMessage[];
  /** Handles are injected by the orchestrator (kept abstract here). */
  memory: unknown;
  model: unknown;
  tools: Record<string, (args: unknown) => Promise<unknown>>;
  spawn(spec: SubAgentSpawn): Promise<AgentResult>;
  signal?: AbortSignal;
}

export interface SubAgentSpawn {
  role: AgentRole;
  goal: string;
  allowedTools?: string[];
}

export interface AgentResult {
  agentId: string;
  status: AgentStatus;
  output: string;
  /** Ids of artifacts this agent produced. */
  artifactIds?: string[];
  error?: string;
}

export interface AgentEvent {
  agentId: string;
  status: AgentStatus;
  message?: string;
  at: number;
}
