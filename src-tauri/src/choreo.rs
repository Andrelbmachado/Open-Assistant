//! Coreografia do robô ao carregar algo (ícone, pasta, janela): os mesmos estados, na mesma ordem e com
//! os mesmos tempos em todo lugar. Tabela para a IA em `skills/mover-arquivos-e-janelas/movimento_robo.md`.
//!
//! andar até o objeto (de lado, de costas ou de frente, conforme a direção) → virar de frente para o
//! usuário → agachar → esticar o braço → fechar a mão → levantar o objeto → virar de lado para o destino →
//! andar carregando (velocidade do usuário, caminho reto ou com uma curva leve de gente) → virar de frente →
//! agachar → esticar o braço → abrir a mão → subir.
//!
//! O braço é invisível: o rosto fica a `reach` × tamanho acima das mãos. O Rust manda o ponto das mãos, o
//! `reach` e para onde o robô olha (`view` + `facing`); o robô (`AgentCursor.tsx`) desenha o resto.
//! O objeto real anda junto com as mãos.

use crate::computer::{self, CarryTarget, Stance};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tauri::AppHandle;

const FRAME: Duration = Duration::from_millis(16);

/// Braço recolhido: mãos logo abaixo do rosto (fração do tamanho do robô).
pub const ARM_REST: f64 = 0.37;
/// Quanto o braço estica para pegar/soltar — e quanto o objeto sobe ao ser levantado.
pub const ARM_REACH: f64 = 0.2;
/// Quanto o robô se abaixa para pegar/soltar.
pub const CROUCH: f64 = 0.12;
/// Quanto sobe no fim, depois de soltar (fica à vista, sem tampar o objeto).
pub const RISE: f64 = 0.35;

/// Tempo de cada gesto (ms) na velocidade padrão; mais devagar = gestos um pouco mais calmos.
pub const FACE_MS: u64 = 420;
pub const CROUCH_MS: u64 = 300;
pub const REACH_MS: u64 = 340;
pub const GRIP_MS: u64 = 260;
pub const LIFT_MS: u64 = 380;
pub const TURN_MS: u64 = 460;
pub const LOWER_MS: u64 = 320;
pub const EXTEND_MS: u64 = 340;
pub const RELEASE_MS: u64 = 300;
pub const RISE_MS: u64 = 460;

// ---------------------------------------------------------------- velocidade (controle do usuário)

/// Velocidade de caminhada carregando algo, em pixels da tela por segundo.
pub const SPEED_DEFAULT: u32 = 240;
pub const SPEED_MIN: u32 = 60;
pub const SPEED_MAX: u32 = 900;
static SPEED: AtomicU32 = AtomicU32::new(SPEED_DEFAULT);

/// O app manda a velocidade escolhida pelo usuário (+ › Velocidade do robô).
#[tauri::command]
pub fn robot_set_speed(speed: u32) {
    SPEED.store(speed.clamp(SPEED_MIN, SPEED_MAX), Ordering::Relaxed);
}

pub fn user_speed() -> f64 {
    SPEED.load(Ordering::Relaxed) as f64
}

/// Viagens curtas sem carregar nada (apontar, clicar) também ficam mais lentas/rápidas com o controle.
pub fn travel_factor() -> f64 {
    (SPEED_DEFAULT as f64 / user_speed()).clamp(0.5, 2.5)
}

/// Velocidade pedida pela IA numa chamada: "devagar"/"lento", "normal", "rapido" ou px/s. Sem nada = a do usuário.
pub fn parse_speed(text: &str) -> Option<f64> {
    let text = crate::agent::normalize(text);
    let value = match text.as_str() {
        "" => return None,
        "bem devagar" | "muito lento" | "muito devagar" => 110.0,
        "devagar" | "lento" | "devagarinho" | "calmo" => 160.0,
        "normal" | "medio" | "padrao" => SPEED_DEFAULT as f64,
        "rapido" | "depressa" | "ligeiro" => 480.0,
        "muito rapido" | "bem rapido" => 750.0,
        other => other.trim_end_matches("px/s").trim_end_matches("px").trim().parse::<f64>().ok()?,
    };
    Some(value.clamp(SPEED_MIN as f64, SPEED_MAX as f64))
}

/// Caminho da viagem: reto ou natural (uma curva leve e um balanço mínimo, como uma pessoa andando).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PathStyle {
    Straight,
    Natural,
}

impl PathStyle {
    pub fn parse(text: &str) -> PathStyle {
        match crate::agent::normalize(text).as_str() {
            "reto" | "linha reta" | "direto" | "straight" => PathStyle::Straight,
            _ => PathStyle::Natural,
        }
    }
}

/// Como andar numa chamada: velocidade (px/s) e caminho.
#[derive(Clone, Copy, Debug)]
pub struct Gait {
    pub speed: f64,
    pub path: PathStyle,
}

impl Default for Gait {
    fn default() -> Self {
        Gait { speed: user_speed(), path: PathStyle::Natural }
    }
}

impl Gait {
    /// Gestos (agachar, pegar, virar) ficam mais calmos quando o usuário escolhe uma velocidade baixa.
    fn gesture(&self, base: u64) -> u64 {
        (base as f64 * (SPEED_DEFAULT as f64 / self.speed).clamp(0.8, 1.7)) as u64
    }
    /// Andar carregando: acelera, anda na velocidade escolhida e freia (0,7 s a 30 s).
    pub fn walk_ms(&self, distance: f64) -> u64 {
        (distance.max(0.0) / self.speed * 1000.0 / WALK_EFFICIENCY + 250.0).clamp(700.0, 30_000.0) as u64
    }
    /// Ir até o objeto de mãos vazias: um pouco mais rápido que carregando.
    pub fn approach_ms(&self, distance: f64) -> u64 {
        (distance.max(0.0) / (self.speed * 1.35) * 1000.0 / WALK_EFFICIENCY + 200.0).clamp(500.0, 20_000.0) as u64
    }
}

// ---------------------------------------------------------------- andar: perfil de velocidade e caminho

/// Fração do tempo acelerando e freando.
const RAMP_UP: f64 = 0.18;
const RAMP_DOWN: f64 = 0.24;
/// Distância percorrida / (velocidade de cruzeiro × tempo): as rampas "gastam" tempo.
const WALK_EFFICIENCY: f64 = 1.0 - RAMP_UP / 2.0 - RAMP_DOWN / 2.0;

/// Posição (0 a 1) no tempo `u` (0 a 1): sai parado, acelera suave, anda constante e freia suave até parar.
/// Sem passar do ponto: quem carrega algo devagar não dá tranco.
pub fn walk_profile(u: f64) -> f64 {
    let u = u.clamp(0.0, 1.0);
    // Área de uma rampa suave (smoothstep) de 0 a t: t³ − t⁴/2.
    let ramp = |t: f64| t * t * t - t * t * t * t / 2.0;
    let area = if u < RAMP_UP {
        RAMP_UP * ramp(u / RAMP_UP)
    } else if u <= 1.0 - RAMP_DOWN {
        RAMP_UP / 2.0 + (u - RAMP_UP)
    } else {
        let t = (u - (1.0 - RAMP_DOWN)) / RAMP_DOWN;
        RAMP_UP / 2.0 + (1.0 - RAMP_DOWN - RAMP_UP) + RAMP_DOWN * (t - ramp(t))
    };
    (area / WALK_EFFICIENCY).min(1.0)
}

/// Desvio lateral do caminho no ponto `p` (0 a 1 do caminho), em px, perpendicular à direção da viagem.
/// Natural: um arco leve (até 3,5 % da distância, no máximo 34 px) e um balanço bem pequeno por cima;
/// começa e termina em zero para pegar e soltar no lugar exato.
pub fn path_offset(style: PathStyle, distance: f64, p: f64, seed: f64) -> f64 {
    if style == PathStyle::Straight || distance < 40.0 {
        return 0.0;
    }
    let p = p.clamp(0.0, 1.0);
    let side = if seed.fract() < 0.5 { -1.0 } else { 1.0 };
    let arc = (distance * 0.035).min(34.0) * (0.7 + 0.3 * seed.fract()) * side;
    let sway = (distance * 0.006).min(5.0) * (std::f64::consts::TAU * 2.0 * p + seed * 7.0).sin();
    (arc + sway) * (std::f64::consts::PI * p).sin()
}

// ---------------------------------------------------------------- para onde o robô olha

/// Vista do robô: de frente (para o usuário), de lado (andando para a esquerda/direita) ou de costas
/// (andando para cima da tela, "para dentro").
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum View {
    Front,
    Side,
    Back,
}

impl View {
    pub fn name(self) -> &'static str {
        match self {
            View::Front => "front",
            View::Side => "side",
            View::Back => "back",
        }
    }
}

/// Vista e lado para andar de `from` até `to`: subindo reto → de costas; descendo reto → de frente;
/// o resto → de lado, virado para onde vai. Viagem curta mantém o lado atual.
pub fn heading(from: (i32, i32), to: (i32, i32), current: i8) -> (View, i8) {
    let (dx, dy) = ((to.0 - from.0) as f64, (to.1 - from.1) as f64);
    let facing = if dx > 12.0 {
        1
    } else if dx < -12.0 {
        -1
    } else {
        current
    };
    if dx.hypot(dy) < 24.0 {
        return (View::Front, facing);
    }
    if dy.abs() > dx.abs() * 1.6 {
        return (if dy < 0.0 { View::Back } else { View::Front }, facing);
    }
    (View::Side, facing)
}

/// Curva suave de 0 a 1 (sai e chega devagar) para os gestos curtos.
fn ease(u: f64) -> f64 {
    let u = u.clamp(0.0, 1.0);
    u * u * (3.0 - 2.0 * u)
}

/// O que o robô carrega. `t` = caminho (0 origem, 1 destino); `offset` = desvio do objeto em px
/// (x = curva do caminho, y negativo = levantado).
pub trait Load {
    /// Põe o objeto real nesse ponto.
    fn put(&mut self, t: f64, offset: (i32, i32));
    /// Onde ficam as mãos quando o objeto está nesse ponto (a borda de cima, onde o robô segura).
    fn hands(&self, t: f64, offset: (i32, i32)) -> (i32, i32);
    /// Tamanho do objeto (janela), para as mãos abrirem na largura certa.
    fn size(&self, _t: f64) -> Option<CarryTarget> {
        None
    }
    /// As mãos acabaram de fechar no objeto (ícone: a imagem dele passa para as mãos do robô).
    fn grabbed(&mut self) {}
    /// As mãos abriram e o objeto real já está no lugar (ícone: a imagem some).
    fn released(&mut self) {}
    /// Onde as mãos ficam depois de soltar, se o objeto encaixou num lugar diferente do pedido.
    fn final_hands(&self) -> Option<(i32, i32)> {
        None
    }
}

struct Stage<'a> {
    app: &'a AppHandle,
    label: &'a str,
    size: f64,
    facing: i8,
    view: View,
}

impl Stage<'_> {
    fn px(&self, fraction: f64) -> i32 {
        (fraction * self.size).round() as i32
    }

    fn emit(&self, point: (i32, i32), action: &str, duration: u64, reach: f64, carry: Option<CarryTarget>) {
        computer::emit_stance(
            self.app,
            point.0,
            point.1,
            action,
            self.label,
            duration,
            carry,
            Stance { reach: Some(reach), facing: Some(self.facing), view: Some(self.view.name()) },
        );
    }

    /// Gesto parado ou de mãos vazias: o robô anima sozinho em `ms` e o Rust espera.
    fn beat(&self, point: (i32, i32), action: &str, ms: u64, reach: f64) {
        self.emit(point, action, ms, reach, None);
        std::thread::sleep(Duration::from_millis(ms + 30));
    }

    /// Gesto segurando: quadro a quadro, o objeto real e as mãos andam juntos.
    /// `shape(u)` devolve (caminho, desvio do objeto, braço) para u de 0 a 1.
    fn hold(&self, load: &mut dyn Load, action: &str, ms: u64, shape: impl Fn(f64) -> (f64, (i32, i32), f64)) -> Result<(), String> {
        let frames = (ms / FRAME.as_millis() as u64).max(4);
        for frame in 1..=frames {
            let (t, offset, reach) = shape(frame as f64 / frames as f64);
            load.put(t, offset);
            if frame % 2 == 0 || frame == frames {
                self.emit(load.hands(t, offset), action, 40, reach, load.size(t));
            }
            // O usuário pode parar o robô levando o mouse ao canto superior esquerdo.
            if frame % 8 == 0 {
                computer::check_failsafe()?;
            }
            std::thread::sleep(FRAME);
        }
        Ok(())
    }
}

/// Pega `load` onde ele está e o leva ao destino com a coreografia completa. `release` roda na hora de
/// abrir a mão (encaixe final, guardar na pasta, maximizar); se falhar, o objeto volta ao lugar.
pub fn carry(app: &AppHandle, label: &str, load: &mut dyn Load, gait: Gait, release: impl FnOnce(&mut dyn Load) -> Result<(), String>) -> Result<(), String> {
    let size = computer::robot_size_px(app);
    let mut stage = Stage { app, label, size, facing: 1, view: View::Front };
    let (lift, dip) = (stage.px(ARM_REACH), stage.px(CROUCH));
    let reach_full = ARM_REST + ARM_REACH;
    let grip = load.hands(0.0, (0, 0));
    let goal = load.hands(1.0, (0, 0));
    let seed = ((grip.0 * 31 + grip.1 * 17 + goal.0 * 7 + goal.1) as f64 * 0.618_034).abs();

    // 1. Anda até em cima do objeto (de lado, de costas ou de frente, conforme a direção).
    let above = (grip.0, grip.1 - lift - dip);
    let from = computer::robot_position(app).unwrap_or((above.0 + 200, above.1 + 150));
    (stage.view, stage.facing) = heading(from, above, stage.facing);
    let distance = (((above.0 - from.0).pow(2) + (above.1 - from.1).pow(2)) as f64).sqrt();
    stage.beat(above, "approach", gait.approach_ms(distance), ARM_REST);
    // 2. Chegou: gira e fica de frente para o usuário.
    stage.view = View::Front;
    stage.beat(above, "face", gait.gesture(FACE_MS), ARM_REST);
    // 3. Agacha; 4. estica o braço até a borda do objeto; 5. fecha a mão.
    stage.beat((grip.0, grip.1 - lift), "crouch", gait.gesture(CROUCH_MS), ARM_REST);
    stage.beat(grip, "reach", gait.gesture(REACH_MS), reach_full);
    stage.emit(grip, "grab", gait.gesture(GRIP_MS), reach_full, load.size(0.0));
    load.grabbed();
    std::thread::sleep(Duration::from_millis(gait.gesture(GRIP_MS) + 30));
    // 6. Recolhe o braço: o objeto sobe até as mãos (o rosto fica parado).
    stage.hold(load, "lift", gait.gesture(LIFT_MS), |u| {
        let k = ease(u);
        (0.0, (0, -((lift as f64) * k).round() as i32), reach_full - ARM_REACH * k)
    })?;
    // 7. Levanta e gira de lado (ou de costas/de frente) para o destino.
    (stage.view, stage.facing) = heading(grip, goal, stage.facing);
    stage.hold(load, "turn", gait.gesture(TURN_MS), |u| (0.0, (0, -lift - ((dip as f64) * ease(u)).round() as i32), ARM_REST))?;
    // 8. Anda até lá carregando, na velocidade escolhida; caminho reto ou com uma curva leve.
    let path = (((goal.0 - grip.0).pow(2) + (goal.1 - grip.1).pow(2)) as f64).sqrt();
    let normal = if path > 0.0 { (-((goal.1 - grip.1) as f64) / path, (goal.0 - grip.0) as f64 / path) } else { (0.0, 0.0) };
    stage.hold(load, "carry", gait.walk_ms(path), |u| {
        let p = walk_profile(u);
        let side = path_offset(gait.path, path, p, seed);
        (p, ((normal.0 * side).round() as i32, (normal.1 * side).round() as i32 - lift - dip), ARM_REST)
    })?;
    // 9. Chegou: gira de frente para o usuário, ainda segurando.
    stage.view = View::Front;
    stage.hold(load, "arrive", gait.gesture(FACE_MS), |_| (1.0, (0, -lift - dip), ARM_REST))?;
    // 10. Agacha; 11. estica o braço e desce o objeto até o lugar.
    stage.hold(load, "lower", gait.gesture(LOWER_MS), |u| (1.0, (0, -lift - dip + ((dip as f64) * ease(u)).round() as i32), ARM_REST))?;
    stage.hold(load, "extend", gait.gesture(EXTEND_MS), |u| {
        let k = ease(u);
        (1.0, (0, -lift + ((lift as f64) * k).round() as i32), ARM_REST + ARM_REACH * k)
    })?;
    // 12. Abre a mão e solta (se o objeto encaixou ao lado, as mãos acompanham).
    let placed = release(load);
    if placed.is_err() {
        load.put(0.0, (0, 0));
    }
    let end = if placed.is_ok() { load.final_hands().unwrap_or(goal) } else { grip };
    stage.beat(end, "release", gait.gesture(RELEASE_MS), reach_full);
    load.released();
    // 13. Recolhe o braço e sobe, deixando o objeto à vista, de frente para o usuário.
    stage.beat((end.0, end.1 - lift - dip - stage.px(RISE)), "rise", gait.gesture(RISE_MS), ARM_REST);
    placed
}

/// Duração total aproximada de uma coreografia (a mesma conta de movimento_robo.md).
#[cfg(test)]
fn total_ms(gait: Gait, approach: f64, path: f64) -> u64 {
    gait.approach_ms(approach)
        + [FACE_MS, CROUCH_MS, REACH_MS, GRIP_MS, LIFT_MS, TURN_MS, FACE_MS, LOWER_MS, EXTEND_MS, RELEASE_MS, RISE_MS].iter().map(|ms| gait.gesture(*ms)).sum::<u64>()
        + gait.walk_ms(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gait(speed: f64) -> Gait {
        Gait { speed, path: PathStyle::Natural }
    }

    #[test]
    fn walking_speed_follows_the_user_setting() {
        // Atravessar uma tela Full HD na velocidade padrão leva uns 6 s andando: dá para ver tudo.
        let walk = gait(SPEED_DEFAULT as f64).walk_ms(1400.0);
        assert!((6000..8000).contains(&walk), "{walk}");
        // Metade da velocidade ≈ o dobro do tempo.
        let slow = gait(120.0).walk_ms(1400.0);
        assert!(slow > walk * 18 / 10, "{slow} vs {walk}");
        assert_eq!(gait(900.0).walk_ms(10.0), 700);
        assert_eq!(gait(60.0).walk_ms(100_000.0), 30_000);
        let full = total_ms(gait(SPEED_DEFAULT as f64), 400.0, 1400.0);
        assert!((10_000..14_000).contains(&full), "{full}");
    }

    #[test]
    fn speed_words_and_numbers() {
        assert_eq!(parse_speed("devagar"), Some(160.0));
        assert_eq!(parse_speed("Rápido"), Some(480.0));
        assert_eq!(parse_speed("300 px/s"), Some(300.0));
        assert_eq!(parse_speed("5"), Some(SPEED_MIN as f64));
        assert_eq!(parse_speed(""), None);
        assert_eq!(parse_speed("voando"), None);
    }

    #[test]
    fn walk_starts_and_stops_still_without_overshoot() {
        assert_eq!(walk_profile(0.0), 0.0);
        assert!((walk_profile(1.0) - 1.0).abs() < 1e-9);
        let mut last = 0.0;
        for step in 1..=200 {
            let p = walk_profile(step as f64 / 200.0);
            assert!(p >= last - 1e-12 && p <= 1.0 + 1e-9, "passo {step}: {p}");
            last = p;
        }
        // Começa e termina devagar; no meio anda na velocidade de cruzeiro (inclinação 1/eficiência).
        assert!(walk_profile(0.02) < 0.004);
        assert!(1.0 - walk_profile(0.98) < 0.004);
        let cruise = (walk_profile(0.51) - walk_profile(0.49)) / 0.02;
        assert!((cruise - 1.0 / WALK_EFFICIENCY).abs() < 0.01, "{cruise}");
    }

    #[test]
    fn natural_path_curves_a_little_and_lands_exactly() {
        for seed in [0.1, 0.7, 3.3] {
            assert_eq!(path_offset(PathStyle::Natural, 1400.0, 0.0, seed), 0.0);
            assert!(path_offset(PathStyle::Natural, 1400.0, 1.0, seed).abs() < 1e-6);
            let peak = (0..=100).map(|i| path_offset(PathStyle::Natural, 1400.0, i as f64 / 100.0, seed).abs()).fold(0.0, f64::max);
            assert!(peak > 15.0 && peak < 42.0, "pico {peak}");
        }
        assert_eq!(path_offset(PathStyle::Straight, 1400.0, 0.5, 0.3), 0.0);
        assert_eq!(PathStyle::parse("reto"), PathStyle::Straight);
        assert_eq!(PathStyle::parse(""), PathStyle::Natural);
    }

    #[test]
    fn heading_picks_side_back_or_front() {
        assert_eq!(heading((100, 500), (900, 520), 0), (View::Side, 1));
        assert_eq!(heading((900, 500), (100, 400), 1), (View::Side, -1));
        assert_eq!(heading((500, 900), (520, 100), 1), (View::Back, 1));
        assert_eq!(heading((500, 100), (480, 900), 1), (View::Front, -1));
        // Viagem curta: fica de frente, sem trocar o lado.
        assert_eq!(heading((500, 500), (505, 510), -1), (View::Front, -1));
    }

    #[test]
    fn gestures_start_and_end_still() {
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
        assert!(ease(0.1) < 0.1 && ease(0.9) > 0.9);
    }
}
