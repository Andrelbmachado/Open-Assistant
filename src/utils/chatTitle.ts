/** Títulos de conversa: nome provisório imediato a partir da 1ª mensagem, refinado depois pelo modelo local. */

export const NEW_CHAT_TITLE = "Nova conversa";
const MAX_TITLE = 42;
const GREETING = /^(oi|olá|ola|e aí|e ai|bom dia|boa tarde|boa noite|hey|hello|hi)\b[\s,!.]*/i;
const POLITE = /^(por favor,?\s*|você pode\s+|voce pode\s+|pode\s+|consegue\s+|me ajuda a\s+|me ajude a\s+|quero que você\s+|preciso que você\s+)/i;

/** "oi, pode me explicar como funciona o MCP?" → "Me explicar como funciona o MCP". */
export function titleFromMessage(text: string): string {
  const firstLine = text.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("[Anexos:")) ?? "";
  let title = firstLine.replace(GREETING, "");
  for (let pass = 0; pass < 2; pass++) title = title.replace(POLITE, "");
  title = (title.split(/(?<=[.!?])\s/)[0] ?? title).replace(/[.!?…:;,\s]+$/, "").trim();
  if (!title) return text.includes("[Anexos:") ? "Anexos" : NEW_CHAT_TITLE;
  if (title.length > MAX_TITLE) {
    const cut = title.slice(0, MAX_TITLE);
    title = `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : MAX_TITLE).trim()}…`;
  }
  return title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
}

/** Limpa a resposta do modelo ("Título: \"Configurar o MCP\"." → "Configurar o MCP"); undefined se não servir. */
export function cleanModelTitle(raw: string): string | undefined {
  const line = raw.split("\n").map((item) => item.trim()).find(Boolean) ?? "";
  const title = line.replace(/^(título|titulo|title)\s*:\s*/i, "").replace(/^["'“”*#\s]+|["'“”*.\s]+$/g, "").trim();
  if (title.length < 3 || title.length > 60 || title.split(/\s+/).length > 8) return undefined;
  return title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
}

/** Prompt curto para o modelo sugerir o assunto (2 a 5 palavras). */
export function titlePrompt(firstMessage: string): string {
  return `Resuma o assunto desta mensagem em um título de 2 a 5 palavras em português, sem aspas e sem pontuação final. Responda só com o título.\n\nMensagem: ${firstMessage.slice(0, 600)}`;
}
