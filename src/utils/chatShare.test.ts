import { describe, expect, it } from "vitest";
import { chatFileName, chatToMarkdown } from "./chatShare";

describe("chat share", () => {
  it("exports the conversation as markdown", () => {
    const text = chatToMarkdown({
      title: "Mar",
      messages: [
        { id: "1", sender: "user", text: "Me conta algo do mar", time: "10:00" },
        { id: "2", sender: "assistant", text: "Baleias cantam.", time: "10:00", source: "Ollama", steps: [{ id: "s", tool: "web_search", args: {}, label: "Pesquisando", status: "ok" }] },
        { id: "3", sender: "assistant", text: "", time: "10:01", loading: true },
      ],
    }, new Date(2026, 8, 26, 10, 0));
    expect(text).toContain("# Mar");
    expect(text).toContain("## Você\n\nMe conta algo do mar");
    expect(text).toContain("## Assistente · Ollama\n\n- ✓ Pesquisando\n\nBaleias cantam.");
    expect(text.match(/## Assistente/g)).toHaveLength(1);
  });

  it("makes a safe file name", () => {
    expect(chatFileName('O que é "IA"? / teste')).toBe("O que é IA teste.md");
    expect(chatFileName("   ")).toBe("Conversa.md");
  });
});
