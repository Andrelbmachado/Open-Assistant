import { Delete } from "lucide-react";
import { useState } from "react";
import { evaluate, formatNumber, normalizeExpression, prettyExpression } from "../utils/calc";

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ",", "⌫", "="] as const;

/**
 * Calculadora do app dentro da resposta: mostra a conta pedida ("12 × 8 = 96") e continua
 * funcionando para contas seguintes — tudo no app, sem gastar tokens do modelo.
 */
export function CalculatorCard({ expression, result }: { expression: string; result: string }) {
  const [input, setInput] = useState(expression);
  const [shown, setShown] = useState(result);
  const [error, setError] = useState("");

  function solve(text: string) {
    const expr = normalizeExpression(text) ?? text.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".").replace(/\s+/g, "");
    try {
      const value = evaluate(expr);
      setShown(formatNumber(value));
      setInput(prettyExpression(expr));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conta inválida.");
    }
  }

  function press(key: (typeof KEYS)[number]) {
    if (key === "C") { setInput(""); setShown("0"); setError(""); return; }
    if (key === "⌫") { setInput((text) => text.trimEnd().slice(0, -1).trimEnd()); return; }
    if (key === "=") { solve(input); return; }
    // Depois de um resultado, operador continua a conta a partir dele; número começa outra.
    const operator = ["÷", "×", "−", "+"].includes(key);
    setInput((text) => {
      const base = shown && !error && text === "" && operator ? shown : text;
      return operator ? `${base} ${key} ` : `${base}${key}`;
    });
  }

  return <div className="calc-card" role="group" aria-label="Calculadora">
    <div className="calc-display">
      <small>{input || " "}</small>
      <strong aria-live="polite">{error || shown}</strong>
    </div>
    <div className="calc-keys">
      {KEYS.map((key) => <button key={key} className={key === "=" ? "equals" : ["÷", "×", "−", "+"].includes(key) ? "operator" : key === "C" || key === "⌫" ? "muted" : ""} onClick={() => press(key)} aria-label={key === "⌫" ? "Apagar" : key}>
        {key === "⌫" ? <Delete size={15} /> : key}
      </button>)}
    </div>
  </div>;
}
