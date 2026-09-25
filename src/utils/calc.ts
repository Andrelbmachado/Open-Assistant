/**
 * Contas básicas ("quanto é 12 x 8?", "150 dividido por 4", "15% de 200") resolvidas no app,
 * sem modelo: a resposta aparece na calculadora do chat e não gasta tokens.
 * O avaliador é próprio (descida recursiva) — nunca `eval`.
 */

export interface Calculation {
  /** Expressão como o usuário lê: "12 × 8". */
  expression: string;
  /** Resultado formatado em pt-BR: "96", "2,5". */
  result: string;
  value: number;
}

const LEAD = /^(quanto\s+(é|e|da|dá|fica|seria)|calcul[ae]r?|calcule|faz\s+(a\s+conta|as\s+contas)|fa[çc]a\s+(a\s+conta|as\s+contas)|resolve|resolva|qual\s+(é|e)\s+o\s+resultado\s+de|resultado\s+de|me\s+diz\s+quanto\s+(é|e|da|dá)|conta)\s*:?\s*/i;

/** Troca palavras por operadores e vírgula decimal por ponto. `undefined` se sobrar algo que não é conta. */
export function normalizeExpression(text: string): string | undefined {
  let expr = text.toLowerCase().trim().replace(/[?!]+$/g, "").replace(/\s*=\s*$/, "").trim();
  for (let pass = 0; pass < 2; pass++) expr = expr.replace(/^(por\s+favor,?\s*|oi,?\s*|me\s+ajuda\s*,?\s*)/, "").replace(LEAD, "");
  expr = expr
    .replace(/(\d+(?:[.,]\d+)?)\s*%\s*(de|of)\s*/g, "($1/100)*")
    .replace(/(\d+(?:[.,]\d+)?)\s*por\s*cento\s*de\s*/g, "($1/100)*")
    .replace(/raiz\s+(quadrada\s+)?de\s*(\d+(?:[.,]\d+)?)/g, "√$2")
    .replace(/multiplicad[oa]\s+por|vezes|×|\bx\b|\*/g, "*")
    .replace(/dividid[oa]\s+por|÷|:/g, "/")
    .replace(/\bmais\b/g, "+")
    .replace(/\bmenos\b/g, "-")
    .replace(/elevad[oa]\s+(a|ao|à)|\*\*|\^/g, "^")
    .replace(/(\d)\.(?=\d{3}(\D|$))/g, "$1") // 1.000 → 1000
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, "");
  if (!expr || !/^[\d.+\-*/^()√]+$/.test(expr)) return undefined;
  // Precisa ter pelo menos uma operação: "2026" sozinho não é conta.
  if (!/[+\-*/^√]/.test(expr.replace(/^-/, "")) || !/\d/.test(expr)) return undefined;
  return expr;
}

/** Avalia + − × ÷ ^ √ e parênteses. Lança erro em conta inválida. */
export function evaluate(expr: string): number {
  let pos = 0;
  const peek = () => expr[pos];
  const expect = (char: string) => { if (expr[pos] !== char) throw new Error("Conta inválida."); pos++; };
  const number = (): number => {
    const match = expr.slice(pos).match(/^\d+(\.\d+)?|^\.\d+/);
    if (!match) throw new Error("Conta inválida.");
    pos += match[0].length;
    return Number(match[0]);
  };
  const primary = (): number => {
    if (peek() === "(") { pos++; const value = sum(); expect(")"); return value; }
    if (peek() === "√") { pos++; const value = unary(); if (value < 0) throw new Error("Raiz de número negativo."); return Math.sqrt(value); }
    return number();
  };
  const unary = (): number => {
    if (peek() === "-") { pos++; return -unary(); }
    if (peek() === "+") { pos++; return unary(); }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (peek() === "^") { pos++; return base ** unary(); }
    return base;
  };
  const product = (): number => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const op = expr[pos++];
      const right = unary();
      if (op === "/" && right === 0) throw new Error("Não dá para dividir por zero.");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = expr[pos++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  if (pos !== expr.length) throw new Error("Conta inválida.");
  if (!Number.isFinite(value)) throw new Error("Resultado grande demais.");
  return value;
}

/** Número em pt-BR, sem ruído de ponto flutuante (0,1 + 0,2 = 0,3). */
export function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 1e15 ? Number(value.toPrecision(12)) : value;
  return rounded.toLocaleString("pt-BR", { maximumFractionDigits: 10 });
}

/** Expressão bonita para exibir: "12*8" → "12 × 8". */
export function prettyExpression(expr: string): string {
  return expr
    .replace(/\((\d+(?:\.\d+)?)\/100\)\*/g, "$1% de ")
    .replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\+/g, " + ").replace(/(?<=[\d)])-/g, " − ").replace(/\^/g, " ^ ")
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/\s+/g, " ").trim();
}

/** Reconhece uma conta na mensagem; `undefined` quando é outra coisa (ou a conta é inválida). */
export function parseCalculation(text: string): Calculation | undefined {
  const line = text.split("\n").find((item) => item.trim() && !item.startsWith("[Anexos:"))?.trim() ?? "";
  if (!line || line.length > 120) return undefined;
  const expr = normalizeExpression(line);
  if (!expr) return undefined;
  try {
    const value = evaluate(expr);
    return { expression: prettyExpression(expr), result: formatNumber(value), value };
  } catch {
    return undefined;
  }
}
