/**
 * "Mova a pasta teste mover para o outro lado da tela" sem modelo: frase de mover arquivo/janela vira
 * direto `move_file` ou `move_window` (o robô pega de primeira pelo mouse virtual). O que não encaixa
 * nos padrões segue para o agente com modelo, que tem as mesmas ferramentas.
 */

export interface MoveIntent {
  kind: "file" | "window";
  /** Nome do item da área de trabalho ou parte do título/app da janela. */
  target: string;
  /** Lugar em palavras, no vocabulário de `places.rs` (`cima direita`, `outro lado`, `70% 30%`, `maximizar`…). */
  place: string;
  /** "devagar", "rapido"… quando a frase pede uma velocidade (sem isso: a do menu "+"). */
  speed?: string;
  /** "reto" quando a frase pede linha reta (sem isso: caminho natural, com uma curva leve). */
  path?: "reto";
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SPECIAL: [RegExp, string][] = [
  [/outro lado|lado oposto/, "outro lado"],
  [/outro monitor|outra tela|segundo monitor|proximo monitor/, "outro monitor"],
  [/tela cheia|maximiz/, "maximizar"],
];

/** Palavras de velocidade/caminho no fim do lugar ("para a direita devagar") não fazem parte do lugar. */
const GAIT_TAIL = /\s+(?:(?:bem|muito)\s+)?(?:devagar|devagarinho|r[aá]pido|depressa|lentamente|em linha reta|reto)(?:\s+em linha reta)?$/i;
const LEADING_PREPOSITION = /^(?:(?:para|pra|pro|ate|no|na|em)\s+)?(?:(?:o|a|os|as)\s+)?/;

/**
 * Lugar dito em palavras → frase que o Rust entende (mapa da tela 3 × 3 de `places.rs`). Junta vertical e
 * horizontal ("canto de cima à direita" → "cima direita"); relativo, porcentagem e "ao lado de X" vão como
 * foram ditos.
 */
export function normalizePlace(text: string): string | undefined {
  const folded = fold(text).replace(/\s+/g, " ").trim();
  const special = SPECIAL.find(([pattern]) => pattern.test(folded));
  if (special) return special[1];
  const near = folded.match(/\b(ao lado d[eoa]s?|do lado d[eoa]s?|perto d[eoa]s?|junto d[eoa]s?|embaixo d[eoa]s?|abaixo d[eoa]s?|debaixo d[eoa]s?|acima d[eoa]s?|em cima d[eoa]s?|a (?:direita|esquerda) d[eoa]s?)\s+(.+)$/);
  if (near) return `${near[1]} ${near[2]}`.replace(GAIT_TAIL, "");
  const zone = folded.match(/\bzona\s+[1-9]\b/);
  if (zone) return zone[0];
  const percent = folded.match(/\d+(?:[.,]\d+)?\s*%(?:[^%\d]*\d+(?:[.,]\d+)?\s*%)?/);
  if (percent) return percent[0];
  const vertical = /\b(cima|topo|alto|superior)\b/.test(folded) ? "cima" : /\b(baixo|embaixo|rodape|inferior)\b/.test(folded) ? "baixo" : undefined;
  const horizontal = /direit/.test(folded) ? "direita" : /esquerd/.test(folded) ? "esquerda" : undefined;
  const middle = /\b(centro|meio)\b/.test(folded);
  if (/\b(um pouco|pouquinho|mais|bem|\d+\s*px)\b/.test(folded) && (vertical || horizontal)) {
    return folded.replace(GAIT_TAIL, "").replace(LEADING_PREPOSITION, "");
  }
  if (vertical && horizontal) return `${vertical} ${horizontal}`;
  if (vertical && middle) return `${vertical} centro`;
  if (horizontal && middle) return `meio ${horizontal}`;
  if (middle) return "centro";
  return vertical ?? horizontal;
}

/** Velocidade e caminho pedidos na frase ("devagar", "bem rápido", "em linha reta"). */
function gaitOf(folded: string): Pick<MoveIntent, "speed" | "path"> {
  const gait: Pick<MoveIntent, "speed" | "path"> = {};
  if (/\b(bem|muito) devagar\b/.test(folded)) gait.speed = "bem devagar";
  else if (/\b(devagar|devagarinho|lentamente|com calma|sem pressa)\b/.test(folded)) gait.speed = "devagar";
  else if (/\b(bem|muito) rapido\b/.test(folded)) gait.speed = "muito rapido";
  else if (/\b(rapido|depressa|rapidinho)\b/.test(folded)) gait.speed = "rapido";
  if (/\b(linha reta|em reta|reto)\b/.test(folded)) gait.path = "reto";
  return gait;
}

const VERB = "(?:mova|move|mover|leve|leva|levar|arraste|arrasta|arrastar|coloque|coloca|colocar|jogue|joga|jogar|passe|passa|passar|pegue e leve|pega e leva|posicione|posiciona|posicionar|mande|manda|ande com|anda com)";
const NOUN_FILE = "(?:o arquivo|a pasta|o icone|o atalho|a imagem|o documento|arquivo|pasta|icone|atalho)";
const NOUN_WINDOW = "(?:a janela|janela)";
/** Onde o lugar começa: "para/pra/no/na/em …" ou "ao lado de/perto de/embaixo de/acima de …". */
const WHERE = "(?:(?:para|pra|pro|ate|no|na|em)\\s+.+|(?:ao lado|do lado|perto|junto|embaixo|abaixo|debaixo|acima)\\s+d[eoa]s?\\s+.+)";
/** Advérbio de quantidade grudado no nome ("fotos um pouco para a direita"): vai para o lugar. */
const AMOUNT_TAIL = /^(.+?)\s+((?:um pouco|um pouquinho|bem|mais|\d+\s*px)(?:\s+mais)?)$/;

/** Reconhece pedidos de mover arquivo/janela; `undefined` quando a frase não é disso. */
export function parseMoveIntent(text: string): MoveIntent | undefined {
  const original = text.trim().replace(/[.!?]+$/, "");
  const folded = fold(original);
  // "maximize a janela do chrome" / "maximiza o chrome"
  const maximize = folded.match(/^(?:por favor,?\s*)?(?:maximize|maximiza|maximizar)\s+(?:a janela\s+)?(?:d[oae]s?\s+)?(.+)$/);
  if (maximize) return { kind: "window", target: slice(original, folded, maximize[1]), place: "maximizar" };
  const pattern = new RegExp(`^(?:por favor,?\\s*)?(?:robo,?\\s*)?${VERB}\\s+(${NOUN_WINDOW}\\s+(?:d[oae]s?\\s+)?|${NOUN_FILE}\\s+|(?:o|a)\\s+)?(.+?)\\s+(${WHERE})$`);
  const match = folded.match(pattern);
  if (!match) return undefined;
  let name = match[2];
  let where = match[3];
  const amount = name.match(AMOUNT_TAIL);
  if (amount) { name = amount[1]; where = `${amount[2]} ${where}`; }
  const place = normalizePlace(where);
  if (!place) return undefined;
  const noun = match[1] ?? "";
  const kind: MoveIntent["kind"] = /janela/.test(noun) || place === "maximizar" || place === "outro monitor" ? "window" : "file";
  const target = slice(original, folded, name).replace(/^["'“”]|["'“”]$/g, "").replace(GAIT_TAIL, "").trim();
  if (!target || target.split(/\s+/).length > 8) return undefined;
  return { kind, target, place, ...gaitOf(folded) };
}

/** Recorta do texto original (com acentos e maiúsculas) o trecho encontrado no texto dobrado. */
function slice(original: string, folded: string, piece: string): string {
  const index = folded.lastIndexOf(piece);
  return index >= 0 ? original.slice(index, index + piece.length).trim() : piece.trim();
}
