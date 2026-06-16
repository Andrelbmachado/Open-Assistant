import type { ChatChunk, ChatRequest, ModelDescriptor, ModelProvider } from "@open-assistant/shared";

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;
  readonly kind = "cloud" as const;
  constructor(private apiKey: string, private baseUrl = "https://api.anthropic.com/v1") {}

  async listModels(): Promise<ModelDescriptor[]> {
    return [];
  }
  async *chat(_req: ChatRequest): AsyncIterable<ChatChunk> {
    // TODO: stream /messages
    yield { delta: "", done: true };
  }
}
