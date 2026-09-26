import type { Chat } from "../store/store";

/** Conversa em Markdown para compartilhar (copiar ou salvar como .md). Passos do agente viram lista. */
export function chatToMarkdown(chat: Pick<Chat, "title" | "messages">, now = new Date()): string {
  const lines = [`# ${chat.title}`, "", `_Exportado do Open Assistant em ${now.toLocaleString("pt-BR")}_`, ""];
  for (const message of chat.messages) {
    if (message.loading || (!message.text.trim() && !message.steps?.length)) continue;
    lines.push(message.sender === "user" ? "## Você" : `## Assistente${message.source ? ` · ${message.source}` : ""}`, "");
    if (message.steps?.length) {
      for (const step of message.steps) lines.push(`- ${step.status === "ok" ? "✓" : step.status === "denied" ? "✗" : "•"} ${step.label}`);
      lines.push("");
    }
    if (message.text.trim()) lines.push(message.text.trim(), "");
    if (message.changes?.files.length) {
      lines.push(`_Arquivos alterados: ${message.changes.files.map((file) => `${file.name} (+${file.additions} −${file.deletions})`).join(", ")}_`, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Nome de arquivo seguro a partir do título ("Curiosidades sobre o mar.md"). */
export function chatFileName(title: string): string {
  const clean = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${clean || "Conversa"}.md`;
}
