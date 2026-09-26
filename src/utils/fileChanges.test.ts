import { describe, expect, it } from "vitest";
import { changesTitle, languageOf, shortFolder, undoSummary } from "./fileChanges";

describe("file changes card", () => {
  it("titles the card like Claude Code", () => {
    expect(changesTitle([{ status: "modified" }, { status: "modified" }])).toBe("Editou 2 arquivos");
    expect(changesTitle([{ status: "added" }])).toBe("Criou 1 arquivo");
    expect(changesTitle([{ status: "deleted" }])).toBe("Apagou 1 arquivo");
    expect(changesTitle([{ status: "added" }, { status: "modified" }])).toBe("Alterou 2 arquivos");
  });

  it("shows only the last folders of the path", () => {
    expect(shortFolder("C:\\Users\\andre\\projeto\\src\\app.ts")).toBe("…\\projeto\\src");
    expect(shortFolder("C:/a/b.txt")).toBe("C:\\a");
    expect(shortFolder("b.txt")).toBe("");
  });

  it("names the language of the snippet", () => {
    expect(languageOf("desktop.rs")).toBe("Rust");
    expect(languageOf("App.TSX")).toBe("TSX");
    expect(languageOf("dados.xyz")).toBe("XYZ");
  });

  it("summarizes the undo", () => {
    expect(undoSummary({ restored: 2, skipped: [], errors: [] })).toBe("2 arquivos voltaram ao que era");
    expect(undoSummary({ restored: 1, skipped: ["a"], errors: [] })).toBe("1 arquivo voltou ao que era · 1 ficou como está (você mudou depois)");
  });
});
