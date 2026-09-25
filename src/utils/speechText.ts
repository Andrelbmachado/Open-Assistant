/** Remove o que não deve ser lido em voz alta (blocos de código, marcação Markdown, links). */
export function textForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (trecho de código na tela) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "o link na tela")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Divide o texto em frases de até `maxLength` caracteres: a primeira fica pronta rápido
 * e as seguintes são sintetizadas enquanto a anterior toca.
 */
export function speechChunks(text: string, maxLength = 220): string[] {
  const sentences = text.match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxLength) {
      if (current) { chunks.push(current); current = ""; }
      const words = sentence.split(" ");
      let part = "";
      for (const word of words) {
        if ((part + " " + word).trim().length > maxLength && part) { chunks.push(part); part = word; }
        else part = (part + " " + word).trim();
      }
      if (part) chunks.push(part);
      continue;
    }
    // A primeira frase sai sozinha para o áudio começar logo.
    if (chunks.length === 0 && !current) { chunks.push(sentence); continue; }
    if ((current + " " + sentence).trim().length > maxLength) { chunks.push(current); current = sentence; }
    else current = (current + " " + sentence).trim();
  }
  if (current) chunks.push(current);
  return chunks;
}
