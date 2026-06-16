import type { ChatChunk, ChatRequest, ModelDescriptor, ModelProvider } from "@open-assistant/shared";

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai" as const;
  readonly kind = "cloud" as const;
  constructor(private apiKey: string, private baseUrl = "https://api.openai.com/v1") {}

  async listModels(): Promise<ModelDescriptor[]> {
    return [];
  }
  async *chat(_req: ChatRequest): AsyncIterable<ChatChunk> {
    // TODO: stream /chat/completions
    yield { delta: "", done: true };
  }
}
