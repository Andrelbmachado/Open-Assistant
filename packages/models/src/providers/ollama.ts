import type { ChatChunk, ChatRequest, ModelDescriptor, ModelProvider } from "@open-assistant/shared";

/** Local models via Ollama (and any OpenAI-compatible local endpoint). */
export class OllamaProvider implements ModelProvider {
  readonly id = "ollama" as const;
  readonly kind = "local" as const;
  constructor(private baseUrl = "http://localhost:11434") {}

  async listModels(): Promise<ModelDescriptor[]> {
    // TODO: GET ${baseUrl}/api/tags
    return [];
  }

  async *chat(_req: ChatRequest): AsyncIterable<ChatChunk> {
    // TODO: POST ${baseUrl}/api/chat with stream:true, yield ChatChunk per line
    yield { delta: "", done: true };
  }
}
