//! Mapa da tela em palavras: o jeito de um modelo pequeno dizer "para onde" sem calcular pixels.
//!
//! A área útil de cada monitor é dividida em 3 × 3 zonas (tabela em
//! `skills/mover-arquivos-e-janelas/posicoes_na_tela.md`):
//!
//! ```text
//!            esquerda        centro         direita
//! cima     1 cima esquerda  2 cima centro   3 cima direita
//! meio     4 meio esquerda  5 centro        6 meio direita
//! baixo    7 baixo esquerda 8 baixo centro  9 baixo direita
//! ```
//!
//! Aceita também: porcentagem da área (`"70% 30%"` = 70 % da largura, 30 % da altura), movimento relativo
//! (`"um pouco para a direita"`, `"300 px para baixo"`), `"outro lado"` (espelha na horizontal) e perto de
//! outra coisa (`"ao lado de Lixeira"`, `"embaixo de fotos"`). Só texto → posição; quem chama converte em
//! pixels com `Spot::resolve`.

use crate::agent::normalize;

/// Lugar entendido a partir do texto.
#[derive(Clone, Debug, PartialEq)]
pub enum Spot {
    /// Fração da área útil (0 = esquerda/cima, 1 = direita/baixo); `None` = mantém o eixo atual.
    Fraction { x: Option<f64>, y: Option<f64> },
    /// Espelha na horizontal ("outro lado").
    Mirror,
    /// Anda a partir de onde está: frações da área (`um pouco` = 0,12) ou pixels.
    Relative { dx: Step, dy: Step },
    /// Encosta em outro item: `dir` = (-1/0/1, -1/0/1) do lado dele.
    Near { name: String, dir: (i32, i32) },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Step {
    None,
    Fraction(f64),
    Pixels(f64),
}

/// Retângulo simples (pixels da tela).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Area {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

/// Nomes das 9 zonas, na ordem de leitura (1 a 9).
pub const ZONES: [&str; 9] = ["cima esquerda", "cima centro", "cima direita", "meio esquerda", "centro", "meio direita", "baixo esquerda", "baixo centro", "baixo direita"];

fn has(words: &[&str], any: &[&str]) -> bool {
    words.iter().any(|word| any.contains(word))
}

fn contains_phrase(text: &str, phrase: &str) -> bool {
    format!(" {text} ").contains(&format!(" {phrase} "))
}

const RIGHT: &[&str] = &["direita", "direito", "right", "leste"];
const LEFT: &[&str] = &["esquerda", "esquerdo", "left", "oeste"];
const UP: &[&str] = &["cima", "topo", "superior", "alto", "top", "acima", "norte", "subir", "sobe"];
const DOWN: &[&str] = &["baixo", "embaixo", "inferior", "rodape", "bottom", "abaixo", "sul", "descer", "desce"];
const MIDDLE: &[&str] = &["centro", "meio", "center", "central", "middle"];

/// Entende o lugar dito em palavras. `None` = não deu para entender (a mensagem de erro lista as opções).
pub fn parse(text: &str) -> Option<Spot> {
    let text = normalize(text).replace(['%'], " % ").replace(['(', ')', '"', '\'', '-', '_', '/'], " ");
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return None;
    }
    let words: Vec<&str> = text.split(' ').collect();

    // Perto de outra coisa: "ao lado de X", "embaixo da X", "acima do X", "a esquerda de X".
    for (prefixes, dir) in [
        (&["ao lado de", "ao lado do", "ao lado da", "do lado de", "do lado do", "do lado da", "perto de", "perto do", "perto da", "junto de", "junto do", "junto da", "a direita de", "a direita do", "a direita da", "direita de", "direita do", "direita da"][..], (1, 0)),
        (&["a esquerda de", "a esquerda do", "a esquerda da", "esquerda de", "esquerda do", "esquerda da"][..], (-1, 0)),
        (&["embaixo de", "embaixo do", "embaixo da", "abaixo de", "abaixo do", "abaixo da", "debaixo de", "debaixo do", "debaixo da"][..], (0, 1)),
        (&["acima de", "acima do", "acima da", "em cima de", "em cima do", "em cima da", "sobre o", "sobre a"][..], (0, -1)),
    ] {
        for prefix in prefixes {
            if let Some(index) = format!(" {text}").find(&format!(" {prefix} ")) {
                let name = text[(index + prefix.len()).min(text.len())..].trim().to_string();
                if !name.is_empty() {
                    return Some(Spot::Near { name, dir });
                }
            }
        }
    }

    if ["outro lado", "lado oposto", "oposto", "outro canto", "do outro lado"].iter().any(|phrase| contains_phrase(&text, phrase)) {
        return Some(Spot::Mirror);
    }

    // Zona pelo número ("zona 3").
    if let Some(position) = words.iter().position(|word| *word == "zona" || *word == "area" || *word == "quadrante") {
        if let Some(number) = words.get(position + 1).and_then(|word| word.parse::<usize>().ok()).filter(|n| (1..=9).contains(n)) {
            let (col, row) = ((number - 1) % 3, (number - 1) / 3);
            return Some(Spot::Fraction { x: Some(col as f64 / 2.0), y: Some(row as f64 / 2.0) });
        }
    }

    // Porcentagem: "70% 30%", "x 70% y 30%", "70 % da largura".
    let percents: Vec<f64> = words.windows(2).filter(|pair| pair[1] == "%").filter_map(|pair| pair[0].parse::<f64>().ok()).collect();
    if !percents.is_empty() {
        let fraction = |value: f64| (value / 100.0).clamp(0.0, 1.0);
        let vertical_only = percents.len() == 1 && (has(&words, &["y", "altura", "vertical"]) || (has(&words, UP) || has(&words, DOWN)) && !has(&words, RIGHT) && !has(&words, LEFT));
        return Some(match percents.as_slice() {
            [x, y, ..] => Spot::Fraction { x: Some(fraction(*x)), y: Some(fraction(*y)) },
            [value] if vertical_only => Spot::Fraction { x: None, y: Some(fraction(*value)) },
            [value] => Spot::Fraction { x: Some(fraction(*value)), y: None },
            [] => unreachable!(),
        });
    }

    // Relativo: "um pouco para a direita", "mais para cima", "300 px para baixo", "bem para a esquerda".
    // Cada número em px vale para a próxima direção dita ("300 px para a esquerda e 100 px para baixo").
    let is_px = |word: Option<&&str>| matches!(word, Some(&"px") | Some(&"pixels") | Some(&"pixel"));
    let any_px = words.iter().enumerate().any(|(i, word)| word.parse::<f64>().is_ok() && is_px(words.get(i + 1)));
    if any_px || has(&words, &["pouco", "pouquinho", "mais", "bem", "muito", "leve", "levemente"]) {
        let amount = if has(&words, &["bem", "muito"]) { 0.3 } else { 0.12 };
        let (mut dx, mut dy) = (Step::None, Step::None);
        let mut pending: Option<f64> = None;
        for (i, word) in words.iter().enumerate() {
            if let Ok(number) = word.parse::<f64>() {
                if is_px(words.get(i + 1)) {
                    pending = Some(number);
                }
                continue;
            }
            let (sign, horizontal) = if RIGHT.contains(word) {
                (1.0, true)
            } else if LEFT.contains(word) {
                (-1.0, true)
            } else if DOWN.contains(word) {
                (1.0, false)
            } else if UP.contains(word) {
                (-1.0, false)
            } else {
                continue;
            };
            let step = match pending.take() {
                Some(px) => Step::Pixels(px * sign),
                None => Step::Fraction(amount * sign),
            };
            if horizontal {
                dx = step;
            } else {
                dy = step;
            }
        }
        if dx != Step::None || dy != Step::None {
            return Some(Spot::Relative { dx, dy });
        }
    }

    // Zonas e cantos: "direita", "cima direita", "canto superior esquerdo", "topo centro", "meio".
    let x = if has(&words, RIGHT) {
        Some(1.0)
    } else if has(&words, LEFT) {
        Some(0.0)
    } else {
        None
    };
    let y = if has(&words, UP) {
        Some(0.0)
    } else if has(&words, DOWN) {
        Some(1.0)
    } else {
        None
    };
    let middle = has(&words, MIDDLE);
    match (x, y, middle) {
        (None, None, true) => Some(Spot::Fraction { x: Some(0.5), y: Some(0.5) }),
        (None, None, false) => None,
        // "cima centro" / "centro de baixo": meio na horizontal. "meio direita": meio na vertical.
        (None, Some(y), true) => Some(Spot::Fraction { x: Some(0.5), y: Some(y) }),
        (Some(x), None, true) => Some(Spot::Fraction { x: Some(x), y: Some(0.5) }),
        (x, y, false) => Some(Spot::Fraction { x, y }),
        (Some(x), Some(y), true) => Some(Spot::Fraction { x: Some(x), y: Some(y) }),
    }
}

impl Spot {
    /// Ponto (centro do objeto) dentro de `area`, sem encostar na borda: `margin` = meia largura/altura
    /// do objeto. `from` = centro atual. `near` = retângulo do item citado em `Spot::Near`.
    pub fn resolve(&self, from: (i32, i32), area: Area, margin: (i32, i32), near: Option<Area>) -> (i32, i32) {
        let (mx, my) = margin;
        let (left, right) = (area.left + mx + 16, (area.right - mx - 16).max(area.left + mx + 16));
        let (top, bottom) = (area.top + my + 16, (area.bottom - my - 16).max(area.top + my + 16));
        let clamp = |(x, y): (i32, i32)| (x.clamp(left, right), y.clamp(top, bottom));
        let lerp = |a: i32, b: i32, t: f64| a + ((b - a) as f64 * t).round() as i32;
        clamp(match self {
            Spot::Fraction { x, y } => (x.map_or(from.0, |fx| lerp(left, right, fx)), y.map_or(from.1, |fy| lerp(top, bottom, fy))),
            Spot::Mirror => {
                let width = area.width();
                let cx = (area.left + area.right) / 2;
                let mirrored = cx + (cx - from.0);
                // Perto do meio o espelho quase não anda: aí vai até 80 % da largura do outro lado.
                let x = if (mirrored - from.0).abs() < width * 3 / 10 {
                    if from.0 <= cx {
                        area.left + width * 4 / 5
                    } else {
                        area.left + width / 5
                    }
                } else {
                    mirrored
                };
                (x, from.1)
            }
            Spot::Relative { dx, dy } => {
                let step = |step: &Step, size: i32| match step {
                    Step::None => 0,
                    Step::Fraction(f) => (f * size as f64).round() as i32,
                    Step::Pixels(px) => px.round() as i32,
                };
                (from.0 + step(dx, area.width()), from.1 + step(dy, area.height()))
            }
            Spot::Near { dir, .. } => match near {
                // Encosta no item com uma folga, centralizado no outro eixo.
                Some(other) => {
                    let (ocx, ocy) = ((other.left + other.right) / 2, (other.top + other.bottom) / 2);
                    let gap = 12;
                    (
                        match dir.0 {
                            1 => other.right + gap + mx,
                            -1 => other.left - gap - mx,
                            _ => ocx,
                        },
                        match dir.1 {
                            1 => other.bottom + gap + my,
                            -1 => other.top - gap - my,
                            _ => ocy,
                        },
                    )
                }
                None => from,
            },
        })
    }
}

/// Zona (1 a 9 e nome) e porcentagem de um ponto na área útil — o que a IA lê em `list_windows`.
pub fn describe(point: (i32, i32), area: Area) -> String {
    let fx = ((point.0 - area.left) as f64 / area.width().max(1) as f64).clamp(0.0, 1.0);
    let fy = ((point.1 - area.top) as f64 / area.height().max(1) as f64).clamp(0.0, 1.0);
    let col = ((fx * 3.0) as usize).min(2);
    let row = ((fy * 3.0) as usize).min(2);
    let zone = row * 3 + col;
    format!("zona {} {} · {:.0}% {:.0}%", zone + 1, ZONES[zone], fx * 100.0, fy * 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Area = Area { left: 0, top: 0, right: 1920, bottom: 1040 };

    fn at(text: &str, from: (i32, i32)) -> (i32, i32) {
        parse(text).unwrap_or_else(|| panic!("não entendeu {text:?}")).resolve(from, AREA, (38, 40), None)
    }

    #[test]
    fn zones_and_corners_in_many_wordings() {
        let corner = at("canto superior direito", (100, 500));
        assert_eq!(corner, (1866, 56));
        for text in ["cima direita", "direita em cima", "topo direito", "superior direito", "zona 3", "no canto de cima à direita"] {
            assert_eq!(at(text, (100, 500)), corner, "{text}");
        }
        assert_eq!(at("baixo esquerda", (900, 100)), (54, 984));
        assert_eq!(at("centro", (100, 100)), (960, 520));
        assert_eq!(at("zona 5", (100, 100)), (960, 520));
        assert_eq!(at("cima centro", (100, 500)), (960, 56));
        assert_eq!(at("meio direita", (100, 100)), (1866, 520));
        // Uma direção só mantém o outro eixo.
        assert_eq!(at("direita", (100, 400)), (1866, 400));
        assert_eq!(at("para baixo", (700, 300)), (700, 984));
    }

    #[test]
    fn percents_relative_and_mirror() {
        assert_eq!(at("70% 30%", (100, 100)), (1322, 334));
        assert_eq!(at("x 50% y 50%", (100, 100)), (960, 520));
        assert_eq!(at("um pouco para a direita", (500, 500)), (730, 500));
        assert_eq!(at("bem para cima", (500, 800)), (500, 488));
        assert_eq!(at("300 px para a esquerda e 100 px para baixo", (900, 500)), (600, 600));
        assert_eq!(at("outro lado", (100, 400)), (1820, 400));
        assert_eq!(at("lado oposto", (1182, 420)), (384, 420));
        assert_eq!(parse("lua"), None);
        assert_eq!(parse(""), None);
    }

    #[test]
    fn near_other_items() {
        assert_eq!(parse("ao lado de Lixeira"), Some(Spot::Near { name: "lixeira".into(), dir: (1, 0) }));
        assert_eq!(parse("embaixo da pasta fotos"), Some(Spot::Near { name: "pasta fotos".into(), dir: (0, 1) }));
        let near = Area { left: 20, top: 20, right: 96, bottom: 120 };
        let spot = parse("ao lado de Lixeira").unwrap();
        assert_eq!(spot.resolve((900, 900), AREA, (38, 50), Some(near)), (146, 70));
    }

    #[test]
    fn describes_where_things_are() {
        assert_eq!(describe((100, 60), AREA), "zona 1 cima esquerda · 5% 6%");
        assert_eq!(describe((960, 520), AREA), "zona 5 centro · 50% 50%");
        assert_eq!(describe((1900, 1030), AREA), "zona 9 baixo direita · 99% 99%");
    }
}
