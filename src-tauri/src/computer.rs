//! Controle do computador para o agente local: olhar a tela, listar elementos clicáveis,
//! mover o mouse, clicar, digitar, atalhos e janelas.
//!
//! Escada de observação (do mais barato ao mais caro, igual ao Claude Code/Codex):
//! 1. lista de elementos da janela alvo via UI Automation (texto, poucos tokens);
//! 2. print da janela alvo com os elementos numerados desenhados (Set-of-Mark);
//! 3. clique por coordenada no print, quando o elemento não aparece na lista.
//!
//! "Janela alvo" é a janela visível mais ao topo que não seja o próprio Open Assistant:
//! quando o usuário dá a ordem, o chat está em primeiro plano e não é ele que deve ser olhado.

use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use image::{imageops::FilterType, DynamicImage, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{
    io::Cursor,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use uiautomation::{
    types::{Handle, TreeScope, UIProperty},
    UIAutomation, UIElement,
};

/// Largura máxima do print enviado ao modelo: mais pixels custam mais tokens de visão.
const MAX_SHOT_WIDTH: u32 = 1280;
/// Limite de elementos listados; janelas enormes (IDE, planilhas) passariam de milhares.
const MAX_ELEMENTS: usize = 90;
pub const CURSOR_WINDOW: &str = "agent-cursor";
/// Tempo da animação do cursor próprio antes do clique real (ver `AgentCursor.tsx`).
const CURSOR_TRAVEL_MS: u64 = 380;

/// Elemento de interface numerado, em coordenadas físicas da tela.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiElement {
    pub id: u32,
    pub role: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl UiElement {
    fn center(&self) -> (i32, i32) {
        (self.x + self.width / 2, self.y + self.height / 2)
    }
}

/// Como mapear um ponto do último print (pixels da imagem) para a tela.
#[derive(Clone, Copy)]
struct ShotGeometry {
    origin_x: i32,
    origin_y: i32,
    /// Pixels de tela por pixel da imagem (o print é reduzido para economizar tokens).
    scale: f64,
    width: u32,
    height: u32,
}

#[derive(Default)]
pub struct ComputerState {
    elements: Mutex<Vec<UiElement>>,
    shot: Mutex<Option<ShotGeometry>>,
    /// Última posição do cursor próprio, para animar do ponto anterior até o novo alvo.
    cursor: Mutex<Option<(i32, i32)>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetWindow {
    pub title: String,
    pub app: String,
    pub pid: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookResult {
    pub window: Option<TargetWindow>,
    /// Lista compacta para o modelo: `[3] Botão "Enviar"`.
    pub elements_text: String,
    pub elements: Vec<UiElement>,
    /// JPEG em base64 (sem `data:`), quando o modo pediu imagem.
    pub image: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
}

/// Janela visível mais ao topo que não pertence a este processo.
fn target_window() -> Option<(xcap::Window, TargetWindow)> {
    let own_pid = std::process::id();
    let mut windows: Vec<xcap::Window> = xcap::Window::all().ok()?;
    windows.sort_by_key(|window| window.z().unwrap_or(i32::MAX));
    windows.into_iter().find_map(|window| {
        let pid = window.pid().ok()?;
        let (width, height) = (window.width().ok()?, window.height().ok()?);
        let title = window.title().unwrap_or_default();
        if pid == own_pid || window.is_minimized().unwrap_or(true) || width < 80 || height < 60 || title.trim().is_empty() {
            return None;
        }
        let info = TargetWindow {
            title,
            app: window.app_name().unwrap_or_default(),
            pid,
            x: window.x().ok()?,
            y: window.y().ok()?,
            width,
            height,
        };
        Some((window, info))
    })
}

fn role_label(control: i32) -> Option<&'static str> {
    // Só o que dá para clicar, digitar ou ler com proveito.
    Some(match control {
        50000 => "botão",
        50002 => "caixa de seleção",
        50003 => "lista suspensa",
        50004 => "campo de texto",
        50005 => "link",
        50007 => "item de lista",
        50011 => "item de menu",
        50013 => "opção",
        50019 => "aba",
        50024 => "item de árvore",
        50029 => "item",
        50031 => "botão",
        50020 => "texto",
        _ => return None,
    })
}

/// Elementos interativos da janela, com uma única ida ao UI Automation (cache).
fn window_elements(hwnd: isize, bounds: (i32, i32, i32, i32)) -> Result<Vec<UiElement>, String> {
    let automation = UIAutomation::new().map_err(|error| format!("UI Automation indisponível: {error}"))?;
    let cache = automation.create_cache_request().map_err(|error| error.to_string())?;
    for property in [UIProperty::Name, UIProperty::ControlType, UIProperty::BoundingRectangle, UIProperty::IsOffscreen] {
        cache.add_property(property).map_err(|error| error.to_string())?;
    }
    let root = automation
        .element_from_handle(Handle::from(hwnd))
        .map_err(|error| format!("Não foi possível ler a janela: {error}"))?;
    let condition = automation.create_true_condition().map_err(|error| error.to_string())?;
    let all: Vec<UIElement> = root
        .find_all_build_cache(TreeScope::Descendants, &condition, &cache)
        .map_err(|error| error.to_string())?;
    let (left, top, right, bottom) = bounds;
    let mut elements = Vec::new();
    let mut texts = 0;
    for element in all {
        let Ok(control) = element.get_cached_control_type() else { continue };
        let Some(role) = role_label(control as i32) else { continue };
        let name = element.get_cached_name().unwrap_or_default().trim().to_string();
        if element.is_cached_offscreen().unwrap_or(false) {
            continue;
        }
        let Ok(rect) = element.get_cached_bounding_rectangle() else { continue };
        let (x, y) = (rect.get_left(), rect.get_top());
        let (width, height) = (rect.get_right() - x, rect.get_bottom() - y);
        let inside = x + width > left && y + height > top && x < right && y < bottom;
        if width < 4 || height < 4 || !inside {
            continue;
        }
        // Textos soltos só ajudam se tiverem conteúdo; limita para não afogar os controles.
        if role == "texto" {
            if name.is_empty() || texts >= 25 {
                continue;
            }
            texts += 1;
        } else if name.is_empty() && role != "campo de texto" {
            continue;
        }
        elements.push(UiElement {
            id: 0,
            role: role.to_string(),
            name: name.chars().take(80).collect(),
            x,
            y,
            width,
            height,
        });
        if elements.len() >= MAX_ELEMENTS {
            break;
        }
    }
    for (index, element) in elements.iter_mut().enumerate() {
        element.id = index as u32 + 1;
    }
    Ok(elements)
}

fn describe_elements(elements: &[UiElement]) -> String {
    if elements.is_empty() {
        return "(nenhum elemento acessível; use um print para ver a tela)".into();
    }
    elements
        .iter()
        .map(|element| {
            let (cx, cy) = element.center();
            if element.name.is_empty() {
                format!("[{}] {} @({cx},{cy})", element.id, element.role)
            } else {
                format!("[{}] {} \"{}\" @({cx},{cy})", element.id, element.role, element.name)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Fonte bitmap 3x5 para os números do Set-of-Mark (evita embutir uma fonte TTF).
const DIGITS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b010, 0b010, 0b010],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];

fn fill_rect(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>) {
    for py in y.max(0)..(y + height).min(image.height() as i32) {
        for px in x.max(0)..(x + width).min(image.width() as i32) {
            image.put_pixel(px as u32, py as u32, color);
        }
    }
}

fn stroke_rect(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>) {
    fill_rect(image, x, y, width, 2, color);
    fill_rect(image, x, y + height - 2, width, 2, color);
    fill_rect(image, x, y, 2, height, color);
    fill_rect(image, x + width - 2, y, 2, height, color);
}

/// Etiqueta "12" em fundo magenta no canto do elemento.
fn draw_label(image: &mut RgbaImage, x: i32, y: i32, number: u32) {
    let text = number.to_string();
    let scale = 2;
    let width = text.len() as i32 * 4 * scale + scale * 2;
    let height = 5 * scale + scale * 2;
    fill_rect(image, x, y, width, height, Rgba([214, 0, 140, 255]));
    for (index, digit) in text.bytes().enumerate() {
        let glyph = DIGITS[(digit - b'0') as usize];
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..3 {
                if bits & (0b100 >> column) != 0 {
                    let px = x + scale + index as i32 * 4 * scale + column * scale;
                    let py = y + scale + row as i32 * scale;
                    fill_rect(image, px, py, scale, scale, Rgba([255, 255, 255, 255]));
                }
            }
        }
    }
}

fn encode_jpeg(image: &RgbaImage) -> Result<String, String> {
    let rgb = DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    let mut bytes = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 72)
        .encode_image(&rgb)
        .map_err(|error| error.to_string())?;
    Ok(base64_encode(bytes.get_ref()))
}

/// Base64 padrão; evita puxar uma dependência só para isto.
pub fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Olha a janela alvo. `mode`: `elements` (só texto), `screenshot` ou `both` (print com números).
pub fn look(app: &AppHandle, mode: &str) -> Result<LookResult, String> {
    let state = app.state::<ComputerState>();
    let target = target_window();
    let want_elements = mode != "screenshot";
    let want_image = mode != "elements";
    let mut elements = Vec::new();
    if let Some((window, info)) = &target {
        if want_elements || want_image {
            let bounds = (info.x, info.y, info.x + info.width as i32, info.y + info.height as i32);
            elements = window_elements(window.id().unwrap_or_default() as isize, bounds).unwrap_or_default();
        }
    }
    *state.elements.lock().map_err(|_| "estado do agente indisponível")? = elements.clone();

    let mut image = None;
    let (mut image_width, mut image_height) = (None, None);
    if want_image {
        // Janela alvo recortada; sem janela (área de trabalho), o monitor principal inteiro.
        let (raw, origin_x, origin_y) = match &target {
            Some((window, info)) => (window.capture_image().map_err(|error| format!("Falha no print: {error}"))?, info.x, info.y),
            None => {
                let monitor = xcap::Monitor::all()
                    .map_err(|error| error.to_string())?
                    .into_iter()
                    .find(|monitor| monitor.is_primary().unwrap_or(false))
                    .ok_or("Nenhum monitor encontrado")?;
                let origin = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
                (monitor.capture_image().map_err(|error| format!("Falha no print: {error}"))?, origin.0, origin.1)
            }
        };
        let scale = (raw.width() as f64 / MAX_SHOT_WIDTH as f64).max(1.0);
        let (width, height) = ((raw.width() as f64 / scale) as u32, (raw.height() as f64 / scale) as u32);
        let mut shot = if scale > 1.0 { image::imageops::resize(&raw, width, height, FilterType::Triangle) } else { raw };
        if mode == "both" {
            for element in elements.iter().filter(|element| element.role != "texto") {
                let x = ((element.x - origin_x) as f64 / scale) as i32;
                let y = ((element.y - origin_y) as f64 / scale) as i32;
                let (w, h) = ((element.width as f64 / scale) as i32, (element.height as f64 / scale) as i32);
                stroke_rect(&mut shot, x, y, w.max(4), h.max(4), Rgba([214, 0, 140, 255]));
                draw_label(&mut shot, x, y, element.id);
            }
        }
        *state.shot.lock().map_err(|_| "estado do agente indisponível")? =
            Some(ShotGeometry { origin_x, origin_y, scale, width: shot.width(), height: shot.height() });
        image_width = Some(shot.width());
        image_height = Some(shot.height());
        image = Some(encode_jpeg(&shot)?);
    }
    Ok(LookResult {
        window: target.map(|(_, info)| info),
        elements_text: describe_elements(&elements),
        elements,
        image,
        image_width,
        image_height,
    })
}

/// Onde clicar: elemento numerado do último `look` ou coordenada do último print.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PointTarget {
    pub element: Option<u32>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

fn resolve_point(app: &AppHandle, target: &PointTarget) -> Result<(i32, i32, String), String> {
    let state = app.state::<ComputerState>();
    if let Some(id) = target.element {
        let elements = state.elements.lock().map_err(|_| "estado do agente indisponível")?;
        let element = elements
            .iter()
            .find(|element| element.id == id)
            .ok_or_else(|| format!("O elemento [{id}] não existe na última leitura da tela. Chame look de novo."))?;
        let (x, y) = element.center();
        let label = if element.name.is_empty() { element.role.clone() } else { element.name.clone() };
        return Ok((x, y, label));
    }
    let (Some(x), Some(y)) = (target.x, target.y) else {
        return Err("Informe `element` (número da lista) ou `x` e `y` (pixels do último print).".into());
    };
    let shot = state
        .shot
        .lock()
        .map_err(|_| "estado do agente indisponível")?
        .ok_or("Tire um print (look com screenshot) antes de clicar por coordenada.")?;
    if x < 0.0 || y < 0.0 || x > shot.width as f64 || y > shot.height as f64 {
        return Err(format!("({x},{y}) está fora do print ({}x{}).", shot.width, shot.height));
    }
    let screen_x = shot.origin_x + (x * shot.scale).round() as i32;
    let screen_y = shot.origin_y + (y * shot.scale).round() as i32;
    Ok((screen_x, screen_y, format!("({x:.0},{y:.0})")))
}

fn enigo() -> Result<Enigo, String> {
    Enigo::new(&Settings::default()).map_err(|error| format!("Não foi possível controlar mouse/teclado: {error}"))
}

/// Mouse no canto superior esquerdo = o usuário quer parar o agente (como o FAILSAFE do pyautogui).
pub fn check_failsafe() -> Result<(), String> {
    if let Ok((x, y)) = enigo()?.location() {
        if x <= 2 && y <= 2 {
            return Err("Interrompido: o mouse foi levado ao canto superior esquerdo da tela.".into());
        }
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorEvent {
    x: i32,
    y: i32,
    action: String,
    label: String,
    visible: bool,
}

/// Cria (uma vez) a janela transparente do cursor próprio, cobrindo todos os monitores.
fn ensure_cursor_window(app: &AppHandle) -> Result<(i32, i32), String> {
    let monitors = xcap::Monitor::all().map_err(|error| error.to_string())?;
    let (mut left, mut top, mut right, mut bottom) = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
    for monitor in &monitors {
        let (x, y) = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
        left = left.min(x);
        top = top.min(y);
        right = right.max(x + monitor.width().unwrap_or(0) as i32);
        bottom = bottom.max(y + monitor.height().unwrap_or(0) as i32);
    }
    if left == i32::MAX {
        return Err("Nenhum monitor encontrado".into());
    }
    if app.get_webview_window(CURSOR_WINDOW).is_none() {
        let window = WebviewWindowBuilder::new(app, CURSOR_WINDOW, WebviewUrl::App("index.html#agent-cursor".into()))
            .title("Cursor do Open Assistant")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .build()
            .map_err(|error| format!("Não foi possível criar o cursor próprio: {error}"))?;
        let _ = window.set_position(PhysicalPosition::new(left, top));
        let _ = window.set_size(PhysicalSize::new((right - left) as u32, (bottom - top) as u32));
        let _ = window.set_ignore_cursor_events(true);
        if let Ok(hwnd) = window.hwnd() {
            // Fora dos prints: o agente não pode "ver" o próprio cursor tampando um botão.
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                    windows::Win32::Foundation::HWND(hwnd.0),
                    windows::Win32::UI::WindowsAndMessaging::WDA_EXCLUDEFROMCAPTURE,
                );
            }
        }
        let _ = window.show();
    }
    Ok((left, top))
}

/// Anima o cursor próprio até o ponto (coordenadas de tela) e espera ele chegar.
fn move_agent_cursor(app: &AppHandle, x: i32, y: i32, action: &str, label: &str) {
    let Ok((left, top)) = ensure_cursor_window(app) else { return };
    if let Some(window) = app.get_webview_window(CURSOR_WINDOW) {
        let _ = window.show();
    }
    let _ = app.emit_to(
        CURSOR_WINDOW,
        "agent-cursor",
        CursorEvent { x: x - left, y: y - top, action: action.into(), label: label.into(), visible: true },
    );
    if let Ok(mut cursor) = app.state::<ComputerState>().cursor.lock() {
        *cursor = Some((x, y));
    }
    std::thread::sleep(Duration::from_millis(CURSOR_TRAVEL_MS));
}

pub fn hide_agent_cursor(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CURSOR_WINDOW) {
        let _ = window.hide();
    }
}

/// Clica sem "roubar" o mouse do usuário: o ponteiro real volta para onde estava.
pub fn click(app: &AppHandle, target: &PointTarget, button: &str, double: bool) -> Result<String, String> {
    check_failsafe()?;
    let (x, y, label) = resolve_point(app, target)?;
    move_agent_cursor(app, x, y, "click", &label);
    let mut input = enigo()?;
    let original = input.location().ok();
    let button = match button {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    input.move_mouse(x, y, Coordinate::Abs).map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(40));
    for _ in 0..if double { 2 } else { 1 } {
        input.button(button, Direction::Click).map_err(|error| error.to_string())?;
        std::thread::sleep(Duration::from_millis(60));
    }
    if let Some((ox, oy)) = original {
        let _ = input.move_mouse(ox, oy, Coordinate::Abs);
    }
    Ok(format!("Cliquei em {label} ({x},{y})."))
}

pub fn scroll(app: &AppHandle, target: &PointTarget, amount: i32) -> Result<String, String> {
    check_failsafe()?;
    let point = resolve_point(app, target).ok();
    let mut input = enigo()?;
    let original = input.location().ok();
    if let Some((x, y, label)) = &point {
        move_agent_cursor(app, *x, *y, "scroll", label);
        input.move_mouse(*x, *y, Coordinate::Abs).map_err(|error| error.to_string())?;
    }
    input.scroll(amount, Axis::Vertical).map_err(|error| error.to_string())?;
    if let (Some(_), Some((ox, oy))) = (point, original) {
        let _ = input.move_mouse(ox, oy, Coordinate::Abs);
    }
    Ok(format!("Rolei {} {} passos.", if amount > 0 { "para baixo" } else { "para cima" }, amount.abs()))
}

pub fn type_text(app: &AppHandle, text: &str, submit: bool) -> Result<String, String> {
    check_failsafe()?;
    if let Some((x, y)) = app.state::<ComputerState>().cursor.lock().ok().and_then(|cursor| *cursor) {
        move_agent_cursor(app, x, y, "type", "digitando");
    }
    let mut input = enigo()?;
    input.text(text).map_err(|error| error.to_string())?;
    if submit {
        std::thread::sleep(Duration::from_millis(60));
        input.key(Key::Return, Direction::Click).map_err(|error| error.to_string())?;
    }
    Ok(format!("Digitei {} caracteres{}.", text.chars().count(), if submit { " e apertei Enter" } else { "" }))
}

/// Converte "ctrl+shift+t" em teclas do enigo.
pub fn parse_key(name: &str) -> Result<Key, String> {
    let lower = name.trim().to_lowercase();
    Ok(match lower.as_str() {
        "ctrl" | "control" => Key::Control,
        "shift" => Key::Shift,
        "alt" => Key::Alt,
        "win" | "windows" | "meta" | "cmd" | "super" => Key::Meta,
        "enter" | "return" => Key::Return,
        "esc" | "escape" => Key::Escape,
        "tab" => Key::Tab,
        "space" | "espaço" | "espaco" => Key::Space,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" | "pgup" => Key::PageUp,
        "pagedown" | "pgdn" => Key::PageDown,
        "up" | "cima" => Key::UpArrow,
        "down" | "baixo" => Key::DownArrow,
        "left" | "esquerda" => Key::LeftArrow,
        "right" | "direita" => Key::RightArrow,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        single if single.chars().count() == 1 => Key::Unicode(single.chars().next().unwrap_or(' ')),
        other => return Err(format!("Tecla desconhecida: {other}")),
    })
}

pub fn press_keys(combo: &str) -> Result<String, String> {
    check_failsafe()?;
    let keys = combo.split('+').map(parse_key).collect::<Result<Vec<_>, _>>()?;
    let (last, modifiers) = keys.split_last().ok_or("Atalho vazio")?;
    let mut input = enigo()?;
    for key in modifiers {
        input.key(*key, Direction::Press).map_err(|error| error.to_string())?;
    }
    let result = input.key(*last, Direction::Click).map_err(|error| error.to_string());
    for key in modifiers.iter().rev() {
        let _ = input.key(*key, Direction::Release);
    }
    result?;
    Ok(format!("Apertei {combo}."))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    title: String,
    app: String,
    pid: u32,
    focused: bool,
    minimized: bool,
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let own_pid = std::process::id();
    let mut windows = xcap::Window::all().map_err(|error| error.to_string())?;
    windows.sort_by_key(|window| window.z().unwrap_or(i32::MAX));
    Ok(windows
        .into_iter()
        .filter_map(|window| {
            let title = window.title().unwrap_or_default();
            let pid = window.pid().ok()?;
            if title.trim().is_empty() || pid == own_pid || window.width().unwrap_or(0) < 80 {
                return None;
            }
            Some(WindowInfo {
                title,
                app: window.app_name().unwrap_or_default(),
                pid,
                focused: window.is_focused().unwrap_or(false),
                minimized: window.is_minimized().unwrap_or(false),
            })
        })
        .take(40)
        .collect())
}

/// Traz para frente a primeira janela cujo título ou app contenha `query`.
pub fn focus_window(query: &str) -> Result<String, String> {
    use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::{SetForegroundWindow, ShowWindow, SW_RESTORE}};
    let needle = query.to_lowercase();
    let window = xcap::Window::all()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|window| {
            window.title().unwrap_or_default().to_lowercase().contains(&needle)
                || window.app_name().unwrap_or_default().to_lowercase().contains(&needle)
        })
        .ok_or_else(|| format!("Nenhuma janela com \"{query}\" no título."))?;
    let hwnd = HWND(window.id().map_err(|error| error.to_string())? as isize as *mut core::ffi::c_void);
    // O Windows só libera SetForegroundWindow depois de uma tecla; Alt é inofensivo.
    let mut input = enigo()?;
    let _ = input.key(Key::Alt, Direction::Click);
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(format!("Janela \"{}\" em primeiro plano.", window.title().unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_alphabet() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn key_combos_parse_modifiers_and_letters() {
        assert!(matches!(parse_key("Ctrl"), Ok(Key::Control)));
        assert!(matches!(parse_key("l"), Ok(Key::Unicode('l'))));
        assert!(matches!(parse_key("enter"), Ok(Key::Return)));
        assert!(parse_key("hyper").is_err());
    }

    #[test]
    fn element_list_is_compact_and_numbered() {
        let elements = vec![UiElement { id: 1, role: "botão".into(), name: "Enviar".into(), x: 10, y: 20, width: 30, height: 10 }];
        assert_eq!(describe_elements(&elements), "[1] botão \"Enviar\" @(25,25)");
    }

    #[test]
    fn labels_draw_inside_the_image() {
        let mut image = RgbaImage::new(40, 20);
        draw_label(&mut image, 0, 0, 12);
        assert_eq!(*image.get_pixel(0, 0), Rgba([214, 0, 140, 255]));
    }
}
