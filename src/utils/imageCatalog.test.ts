import { describe, expect, it } from "vitest";
import { bestImageModel, IMAGE_MODELS, imageFallbackPrompt, imageModelFit, imagePromptFrom, resolveImageModel, startsImageRequest } from "./imageCatalog";

const rtx5070 = { gpus: [{ name: "NVIDIA GeForce RTX 5070", vramMb: 12227, driverVersion: "610.88", vendor: "nvidia" as const }], cpu: "x", cores: 8, ramMb: 15462, availableDiskMb: 40_000 };

describe("imageCatalog", () => {
  it("entende pedidos de imagem e separa a descrição", () => {
    expect(imagePromptFrom("gere uma imagem de um gato astronauta")).toBe("um gato astronauta");
    expect(imagePromptFrom("Crie um logo para minha padaria.")).toBe("logo para minha padaria");
    expect(imagePromptFrom("desenhe uma ilustração: floresta ao pôr do sol")).toBe("ilustração floresta ao pôr do sol");
    expect(imagePromptFrom("me gera uma foto de praia")).toBe("foto de praia");
    expect(imagePromptFrom("qual a melhor imagem do Windows?")).toBeUndefined();
    expect(imagePromptFrom("gere uma imagem")).toBeUndefined();
  });

  it("understands polite and indirect image requests", () => {
    expect(imagePromptFrom("você pode gerar uma imagem de um farol na praia?")).toBe("um farol na praia");
    expect(imagePromptFrom("consegue me criar uma foto de um cachorro correndo")).toBe("foto de um cachorro correndo");
    expect(imagePromptFrom("quero que você faça uma imagem de uma cidade futurista")).toBe("uma cidade futurista");
    expect(imagePromptFrom("gera pra mim uma imagem de um bolo de chocolate")).toBe("um bolo de chocolate");
    expect(imagePromptFrom("manda uma foto de um gato")).toBe("foto de um gato");
    expect(imagePromptFrom("desenhe um dragão azul")).toBe("desenho de um dragão azul");
    expect(imagePromptFrom("pinta pra mim um pôr do sol no mar")).toBe("pintura de um pôr do sol no mar");
    expect(imagePromptFrom("consegue criar uma imagem?")).toBeUndefined();
    expect(imagePromptFrom("você pode me mostrar a imagem que eu mandei?")).toBeUndefined();
    expect(imagePromptFrom("desenha isso")).toBeUndefined();
  });

  it("calls the image generator when the text model says it cannot draw", () => {
    expect(imageFallbackPrompt("me faz um desenho de um gato de óculos", "Desculpe, não consigo gerar imagens, sou um modelo de linguagem.")).toBe("desenho de um gato de óculos");
    expect(imageFallbackPrompt("preciso de uma arte com um leão para a camiseta", "Infelizmente não posso criar imagens.")).toBe("arte com um leão para a camiseta");
    expect(imageFallbackPrompt("Oi! Tudo bem? Queria ver uma imagem de um astronauta", "Sou apenas um assistente de texto.")).toBe("um astronauta");
    // Resposta normal ou pedido que não é de imagem: não chama.
    expect(imageFallbackPrompt("me faz uma imagem de um gato", "Claro! Aqui está.")).toBeUndefined();
    expect(imageFallbackPrompt("qual o melhor editor de fotos?", "Não consigo mostrar fotos, mas o GIMP é ótimo.")).toBeUndefined();
  });

  it("avisa quando o modelo é pesado demais para o PC", () => {
    const glm = IMAGE_MODELS.find((model) => model.id === "img-glm-image")!;
    const zImage = IMAGE_MODELS.find((model) => model.id === "img-z-image-turbo")!;
    expect(imageModelFit(glm, rtx5070 as never).fit).toBe("heavy");
    expect(imageModelFit(zImage, rtx5070 as never).fit).toBe("ok");
  });

  it("usa o modelo escolhido só se estiver instalado", () => {
    expect(resolveImageModel("img-flux1-dev", new Set(["img-sd15"]))?.id).toBe("img-sd15");
    expect(resolveImageModel("img-sd15", new Set(["img-sd15", "img-z-image-turbo"]))?.id).toBe("img-sd15");
    expect(resolveImageModel(undefined, new Set(["img-sd15", "img-z-image-turbo"]))?.id).toBe("img-z-image-turbo");
    expect(resolveImageModel(undefined, new Set())).toBeUndefined();
  });

  it("turns image mode on as soon as the request starts", () => {
    expect(startsImageRequest("gere uma imagem")).toBe(true);
    expect(startsImageRequest("Crie uma foto de")).toBe(true);
    expect(startsImageRequest("desenhe um dragão")).toBe(true);
    expect(startsImageRequest("gere um relatório")).toBe(false);
    expect(startsImageRequest("qual imagem é melhor?")).toBe(false);
  });

  it("picks the best installed model that runs on this PC unless one was chosen", () => {
    const installed = new Set(["img-sd15", "img-z-image-turbo", "img-flux2-dev"]);
    const smallPc = { ramMb: 15 * 1024, gpus: [{ name: "RTX 5070", vramMb: 12 * 1024 }] } as never;
    expect(bestImageModel(installed, smallPc)?.id).toBe("img-z-image-turbo");
    expect(bestImageModel(installed)?.id).toBe("img-flux2-dev");
    expect(resolveImageModel("img-sd15", installed, smallPc)?.id).toBe("img-sd15");
    expect(resolveImageModel(undefined, new Set())).toBeUndefined();
  });
});
