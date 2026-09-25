/** "/" (skills) e "@" (conectores MCP) no compositor. */
import type { Invocation } from "../store/store";

/** "/" ou "@" logo antes do cursor: devolve o tipo, o texto digitado e onde começa. */
export function findMention(text: string, caret: number): { kind: Invocation["kind"]; query: string; start: number } | undefined {
  const match = text.slice(0, caret).match(/(^|\s)([/@])([\p{L}\p{N}_.-]*)$/u);
  if (!match) return undefined;
  return { kind: match[2] === "/" ? "skill" : "mcp", query: match[3], start: caret - match[3].length - 1 };
}
