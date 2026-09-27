/** Links `[texto](url)` do Markdown que o Obscura devolve, com endereço absoluto (tela Browser). */
export function extractLinks(markdown: string, base: string): { text: string; url: string }[] {
  const seen = new Set<string>();
  const links: { text: string; url: string }[] = [];
  for (const match of markdown.matchAll(/(?<!!)\[([^\]]{1,120})\]\(([^)\s]+)\)/g)) {
    const text = match[1].replace(/[*_`]/g, "").replace(/^#+\s*/, "").trim();
    let url: string;
    try { url = new URL(match[2], base).toString(); } catch { continue; }
    if (!/^https?:/.test(url) || seen.has(url) || !text || text.startsWith("!")) continue;
    seen.add(url);
    links.push({ text, url });
  }
  return links;
}

/** O que o usuário digitou na barra → endereço (sem "https://", completa; com espaço e sem ponto, vira pesquisa). */
export function normalizeAddress(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (!/\s/.test(text) && /\.[a-z]{2,}(\/|$)/i.test(text)) return `https://${text}`;
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(text)}`;
}
