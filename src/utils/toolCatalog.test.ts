import toolsRs from "../../src-tauri/src/tools.rs?raw";
import { describe, expect, it } from "vitest";
import { ASR_MODELS, COMPANY_ORDER, groupByCompany, resolveAsrModel, resolveTtsVoice, SYSTEM_VOICE_ID, TOOL_CATALOG } from "./toolCatalog";

describe("tool catalog", () => {
  it("has a backend recipe for every tool installed by recipe", () => {
    const recipeIds = new Set([...toolsRs.matchAll(/id: "([a-z0-9-]+)"/g)].map((match) => match[1]));
    recipeIds.add("sherpa-onnx"); // declarada como constante SHERPA_RUNTIME
    for (const tool of TOOL_CATALOG.filter((item) => item.install.kind === "recipe")) expect(recipeIds, tool.id).toContain(tool.id);
  });

  it("uses unique ids and known companies", () => {
    expect(new Set(TOOL_CATALOG.map((tool) => tool.id)).size).toBe(TOOL_CATALOG.length);
    for (const tool of TOOL_CATALOG) expect(COMPANY_ORDER).toContain(tool.company);
  });

  it("groups tools by company in a fixed order, skipping empty companies", () => {
    const groups = groupByCompany(TOOL_CATALOG.filter((tool) => tool.company === "Meta" || tool.company === "NVIDIA"));
    expect(groups.map((group) => group.company)).toEqual(["NVIDIA", "Meta"]);
  });

  it("offers a Portuguese speech model from NVIDIA as the recommended default", () => {
    const recommended = ASR_MODELS.find((tool) => tool.recommended);
    expect(recommended).toMatchObject({ company: "NVIDIA", languages: "Português" });
  });
});

describe("resolveAsrModel", () => {
  it("keeps the chosen model while it is installed", () => {
    expect(resolveAsrModel("asr-whisper-turbo", new Set(["asr-whisper-turbo", "asr-nemo-pt"]))).toBe("asr-whisper-turbo");
  });

  it("falls back to the recommended installed model", () => {
    expect(resolveAsrModel("asr-whisper-turbo", new Set(["asr-parakeet-v3", "asr-nemo-pt"]))).toBe("asr-nemo-pt");
  });

  it("returns nothing when no model is installed", () => {
    expect(resolveAsrModel(undefined, new Set(["sherpa-onnx"]))).toBeUndefined();
  });
});

describe("resolveTtsVoice", () => {
  it("uses the Windows voice when no local voice is installed", () => {
    expect(resolveTtsVoice(undefined, new Set())).toBe(SYSTEM_VOICE_ID);
  });

  it("prefers an installed local voice when nothing was chosen", () => {
    expect(resolveTtsVoice(undefined, new Set(["tts-piper-cadu"]))).toBe("tts-piper-cadu");
  });

  it("respects an explicit choice of the Windows voice", () => {
    expect(resolveTtsVoice(SYSTEM_VOICE_ID, new Set(["tts-piper-faber"]))).toBe(SYSTEM_VOICE_ID);
  });
});
