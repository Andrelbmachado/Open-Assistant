/** Palavras que denunciam uma rubrica ("*sorri*", "(risos)", "[pausa]") em vez de fala. */
const STAGE_DIRECTION = /\b(sorri\w*|sorriso\w*|rindo|risos?|risad\w*|pausa\w*|suspir\w*|pisca\w*|piscad\w*|acen\w*|olhando|rosto|express[aã]o|gargalh\w*|animad\w*|empolgad\w*|entusiasmad\w*|brincalh\w*|sussurr\w*|gesto\w*|tom\s+\w+|voz\s+\w+|smil\w*|laugh\w*|sigh\w*|wink\w*|grin\w*)\b/i;

/** Emojis, pictogramas e seus modificadores: o TTS os lia pelo nome ("rosto sorridente"). */
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;

/** Tira emojis e rubricas de ação/expressão, deixando só o que deve ser dito. */
export function stripStageDirections(text: string): string {
  const unlessDirection = (whole: string, inner: string) => STAGE_DIRECTION.test(inner) ? " " : whole;
  return text
    .replace(EMOJI, "")
    .replace(/\*([^*\n]{1,60})\*/g, unlessDirection)
    .replace(/\(([^()\n]{1,60})\)/g, unlessDirection)
    .replace(/\[([^\]\n]{1,60})]/g, unlessDirection)
    .replace(/:[a-z_]{2,}:/g, " ");
}

/** Remove o que não deve ser lido em voz alta (código, Markdown, links, emojis e rubricas). */
export function textForSpeech(text: string): string {
  return stripStageDirections(text)
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
