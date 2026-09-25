import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { askAI, NO_LOCAL_MODEL_ERROR } from "./aiService";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);
let deltaHandler: ((event: { payload: unknown }) => void) | undefined;

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  deltaHandler = undefined;
  listenMock.mockImplementation(async (_event, handler) => {
    deltaHandler = handler as typeof deltaHandler;
    return () => undefined;
  });
});

describe("askAI", () => {
  it("recusa modelos que não são do Ollama sem tentar nuvem ou resposta simulada", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(askAI("GPT-5", [{ role: "user", content: "oi" }])).rejects.toThrow(NO_LOCAL_MODEL_ERROR);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("envia o id exato ao backend e identifica a resposta como Ollama(<modelo>)", async () => {
    invokeMock.mockResolvedValue({ model: "qwen3.5:9b", content: " Olá! ", thinking: "", cancelled: false, tokensPerSecond: 61.2 });

    const reply = await askAI("Ollama: qwen3.5:9b", [{ role: "user", content: "oi" }], { think: true });

    expect(invokeMock).toHaveBeenCalledWith("ollama_chat", expect.objectContaining({ model: "qwen3.5:9b", think: true }));
    expect(reply).toEqual({ wantsComputer: false, text: "Olá!", thinking: undefined, source: "Ollama (qwen3.5:9b)", tokensPerSecond: 61.2, cancelled: false });
  });

  it("oferece a ferramenta controlar_computador e avisa quando o modelo pede o controle do PC", async () => {
    invokeMock.mockResolvedValue({ model: "qwen3.5:9b", content: "", thinking: "", cancelled: false, toolCalls: [{ function: { name: "controlar_computador", arguments: { motivo: "abrir o youtube" } } }] });

    const reply = await askAI("Ollama: qwen3.5:9b", [{ role: "user", content: "coloca um vídeo de gatos" }], { allowComputerControl: true });

    const args = invokeMock.mock.calls[0][1] as { options?: { tools: { function: { name: string } }[] }; messages: { content: string }[] };
    expect(args.options?.tools.map((tool) => tool.function.name)).toEqual(["controlar_computador"]);
    expect(args.messages[0].content).toContain("chame a ferramenta controlar_computador");
    expect(reply.wantsComputer).toBe(true);
  });

  it("traduz o esforço em raciocínio, nível e instrução extra, e devolve os tokens de raciocínio", async () => {
    invokeMock.mockResolvedValue({ model: "gpt-oss:20b", content: "ok", thinking: "pensei", cancelled: false, thinkingTokens: 321 });

    const reply = await askAI("Ollama: gpt-oss:20b", [{ role: "user", content: "oi" }], { effort: "ultra" });

    const args = invokeMock.mock.calls[0][1] as { think: boolean; thinkLevel?: string; messages: { role: string; content: string }[] };
    expect(args.think).toBe(true);
    expect(args.thinkLevel).toBe("high");
    expect(args.messages[0].content).toContain("verifique cada etapa");
    expect(reply.thinkingTokens).toBe(321);
  });

  it("no esforço rápido desliga o raciocínio sem instrução extra", async () => {
    invokeMock.mockResolvedValue({ model: "qwen3.5:9b", content: "ok", thinking: "", cancelled: false });

    await askAI("Ollama: qwen3.5:9b", [{ role: "user", content: "oi" }], { effort: "fast" });

    expect(invokeMock).toHaveBeenCalledWith("ollama_chat", expect.objectContaining({ think: false, thinkLevel: undefined }));
  });

  it("repassa o erro do Ollama desligado sem fallback", async () => {
    invokeMock.mockRejectedValue("O Ollama não está respondendo em 127.0.0.1:11434.");

    await expect(askAI("Ollama: qwen3.5:9b", [{ role: "user", content: "oi" }])).rejects.toThrow("O Ollama não está respondendo");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("entrega ao chat apenas os trechos da própria requisição", async () => {
    const deltas: string[] = [];
    invokeMock.mockImplementation(async () => {
      deltaHandler?.({ payload: { requestId: "outra", content: "x", thinking: "" } });
      deltaHandler?.({ payload: { requestId: "minha", content: "Olá", thinking: "" } });
      return { model: "gemma3:4b", content: "Olá", thinking: "", cancelled: false };
    });

    await askAI("Ollama: gemma3:4b", [{ role: "user", content: "oi" }], { requestId: "minha", onDelta: (delta) => deltas.push(delta.content) });

    expect(deltas).toEqual(["Olá"]);
  });

  it("envia o BitNet ao bitnet.cpp, não ao Ollama", async () => {
    invokeMock.mockResolvedValue({ model: "bitnet-b1.58-2b-4t", content: " Paris. ", thinking: "", cancelled: false, tokensPerSecond: 29.4 });

    const reply = await askAI("BitNet: bitnet-b1.58-2b-4t", [{ role: "user", content: "capital?" }], { requestId: "b1" });

    expect(invokeMock).toHaveBeenCalledWith("bitnet_chat", expect.objectContaining({ requestId: "b1" }));
    expect(reply).toMatchObject({ text: "Paris.", source: "BitNet (bitnet.cpp)", tokensPerSecond: 29.4 });
  });

  it("repassa imagens anexadas ao Ollama", async () => {
    invokeMock.mockResolvedValue({ model: "qwen3.5:9b", content: "Um gato.", thinking: "", cancelled: false });

    await askAI("Ollama: qwen3.5:9b", [{ role: "user", content: "o que é?", images: ["aGVsbG8="] }]);

    const args = invokeMock.mock.calls[0][1] as { messages: { images?: string[] }[] };
    expect(args.messages[args.messages.length - 1].images).toEqual(["aGVsbG8="]);
  });
});
