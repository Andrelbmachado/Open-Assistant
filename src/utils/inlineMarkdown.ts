/** Markdown mínimo usado pelos modelos locais: negrito, código inline e títulos. */
export interface InlineToken {
  type: "text" | "bold" | "code";
  value: string;
}

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

/** Quebra uma linha em texto, **negrito** e `código` para renderizar. */
export function tokenizeInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", value: line.slice(last, index) });
    const raw = match[0];
    tokens.push(raw.startsWith("**") ? { type: "bold", value: raw.slice(2, -2) } : { type: "code", value: raw.slice(1, -1) });
    last = index + raw.length;
  }
  if (last < line.length) tokens.push({ type: "text", value: line.slice(last) });
  return tokens;
}

/** Texto de um título Markdown (`## Título`) ou undefined. */
export function headingText(line: string): string | undefined {
  return line.match(/^#{1,6}\s+(.+)$/)?.[1];
}
