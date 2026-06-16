/** Model providers: a uniform API over local and cloud LLMs. */

export type ProviderKind = "local" | "cloud";

export type ProviderId =
  | "ollama"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "grok"
  | "deepseek"
  | "together"
  | "custom";

export interface ModelDescriptor {
  /** Provider-scoped model id, e.g. "qwen2.5", "gpt-4o", "claude-3-5". */
  id: string;
  label: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present when role === "tool". */
  toolCallId?: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Tool/function schemas the model may call. */
  tools?: ToolSchema[];
  stream?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

/** A streamed piece of a completion. */
export interface ChatChunk {
  delta: string;
  done: boolean;
  toolCall?: { id: string; name: string; argumentsDelta: string };
}

export interface ChatResponse {
  content: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage?: { promptTokens: number; completionTokens: number };
}

/** Every backend (Ollama, OpenAI, …) implements this. */
export interface ModelProvider {
  readonly id: ProviderId;
  readonly kind: ProviderKind;
  listModels(): Promise<ModelDescriptor[]>;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  embeddings?(input: string | string[]): Promise<number[][]>;
}
