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
    /// Onde o robô do modo voz está dentro do app (centro do rosto, pixels da tela): o robô-mouse
    /// sai dali para agir fora do app e volta para lá no fim da tarefa.
    home: Mutex<Option<(i32, i32)>>,
    /// A janela do robô-mouse já ouve os eventos (antes disso, o primeiro gesto se perdia).
    cursor_ready: std::sync::atomic::AtomicBool,
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

/// Mesma regra do Alt+Tab: visível, não "cloaked" (outra área de trabalho/UWP suspenso),
/// sem estilo de janela-ferramenta e aceitando foco. Tira overlays (NVIDIA, Discord, Xbox Game Bar).
pub fn is_user_window(hwnd: isize) -> bool {
    use windows::Win32::{
        Foundation::HWND,
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        UI::WindowsAndMessaging::{GetWindowLongW, IsWindowVisible, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT},
    };
    let hwnd = HWND(hwnd as *mut core::ffi::c_void);
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if style & (WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TRANSPARENT.0) != 0 {
            return false;
        }
        let mut cloaked: u32 = 0;
        let ok = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut core::ffi::c_void, std::mem::size_of::<u32>() as u32);
        ok.is_err() || cloaked == 0
    }
}

/// Janela do usuário em que o agente deve agir: a que está em primeiro plano, a não ser que
/// seja o próprio Open Assistant (aí, a próxima na ordem Z).
fn target_window() -> Option<(xcap::Window, TargetWindow)> {
    let own_pid = std::process::id();
    let mut windows: Vec<xcap::Window> = xcap::Window::all().ok()?;
    let foreground = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    // No xcap, `z` maior = mais ao topo (é `total - índice` do EnumWindows).
    windows.sort_by_key(|window| {
        let is_foreground = window.id().map(|id| id as isize == foreground).unwrap_or(false);
        (std::cmp::Reverse(is_foreground), std::cmp::Reverse(window.z().unwrap_or(i32::MIN)))
    });
    windows.into_iter().find_map(|window| {
        let pid = window.pid().ok()?;
        let (width, height) = (window.width().ok()?, window.height().ok()?);
        let title = window.title().unwrap_or_default();
        if pid == own_pid || window.is_minimized().unwrap_or(true) || width < 80 || height < 60 || title.trim().is_empty() {
            return None;
        }
        if !is_user_window(window.id().ok()? as isize) {
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

/// Cliente do UI Automation que funciona em qualquer thread: `UIAutomation::new()` tenta iniciar o COM como
/// MTA e falha numa thread que já é STA (ex.: `desktop.rs`, que usa o IFolderView do Explorer) — aí usa o
/// COM que já está iniciado. Sem isso os retângulos dos ícones da área de trabalho voltavam vazios.
pub fn automation() -> Result<UIAutomation, String> {
    UIAutomation::new().or_else(|_| UIAutomation::new_direct()).map_err(|error| format!("UI Automation indisponível: {error}"))
}

/// Elementos interativos da janela, com uma única ida ao UI Automation (cache).
fn window_elements(hwnd: isize, bounds: (i32, i32, i32, i32)) -> Result<Vec<UiElement>, String> {
    let automation = automation()?;
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

/// Retângulos (esquerda, cima, direita, baixo) dos controles clicáveis — botões, abas, campos, menus, links —
/// que encostam na faixa `band` da janela. Serve para achar o trecho **vazio** da barra de título quando o
/// programa desenha a própria barra (Explorador com abas, apps em WebView) e não responde `HTCAPTION`.
pub fn clickable_rects_in(hwnd: isize, band: (i32, i32, i32, i32)) -> Vec<(i32, i32, i32, i32)> {
    let Ok(automation) = automation() else { return Vec::new() };
    let Ok(cache) = automation.create_cache_request() else { return Vec::new() };
    for property in [UIProperty::ControlType, UIProperty::BoundingRectangle, UIProperty::IsOffscreen] {
        if cache.add_property(property).is_err() {
            return Vec::new();
        }
    }
    let (Ok(root), Ok(condition)) = (automation.element_from_handle(Handle::from(hwnd)), automation.create_true_condition()) else { return Vec::new() };
    let all: Vec<UIElement> = root.find_all_build_cache(TreeScope::Descendants, &condition, &cache).unwrap_or_default();
    let (left, top, right, bottom) = band;
    all.into_iter()
        .filter_map(|element| {
            let control = element.get_cached_control_type().ok()? as i32;
            // Botão, caixa de seleção, lista suspensa, campo, link, item de lista, menu, opção, aba, botão dividido.
            if ![50000, 50002, 50003, 50004, 50005, 50007, 50011, 50013, 50019, 50031].contains(&control) || element.is_cached_offscreen().unwrap_or(false) {
                return None;
            }
            let rect = element.get_cached_bounding_rectangle().ok()?;
            let (l, t, r, b) = (rect.get_left(), rect.get_top(), rect.get_right(), rect.get_bottom());
            (r - l >= 4 && b - t >= 4 && r > left && b > top && l < right && t < bottom).then_some((l, t, r, b))
        })
        .collect()
}

/// Lista de ícones da área de trabalho (SysListView32 "FolderView" dentro de Progman ou WorkerW).
pub fn desktop_icons_window() -> Option<isize> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{EnumWindows, FindWindowExW, FindWindowW},
    };
    unsafe fn icons_in(parent: HWND) -> Option<HWND> {
        let view = FindWindowExW(Some(parent), None, w!("SHELLDLL_DefView"), PCWSTR::null()).ok()?;
        FindWindowExW(Some(view), None, w!("SysListView32"), PCWSTR::null()).ok()
    }
    unsafe extern "system" fn visit(hwnd: HWND, found: LPARAM) -> windows::core::BOOL {
        if let Some(list) = icons_in(hwnd) {
            *(found.0 as *mut isize) = list.0 as isize;
            return false.into();
        }
        true.into()
    }
    unsafe {
        if let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) {
            if let Some(list) = icons_in(progman) {
                return Some(list.0 as isize);
            }
        }
        // Com papel de parede animado/apresentação, a lista mora num WorkerW.
        let mut found: isize = 0;
        let _ = EnumWindows(Some(visit), LPARAM(&mut found as *mut isize as isize));
        (found != 0).then_some(found)
    }
}

/// Retângulo visível de cada ícone da área de trabalho (nome → retângulo), pelo UI Automation.
pub fn desktop_icon_rects() -> Vec<(String, crate::desktop::Rect)> {
    let Some(list) = desktop_icons_window() else { return Vec::new() };
    window_elements(list, (i32::MIN / 2, i32::MIN / 2, i32::MAX / 2, i32::MAX / 2))
        .unwrap_or_default()
        .into_iter()
        .map(|element| {
            let rect = crate::desktop::Rect { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + element.height };
            (element.name, rect)
        })
        .collect()
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
/// `desktop` = ícones da área de trabalho (lista do Explorer), em vez da janela da frente.
pub fn look_at(app: &AppHandle, mode: &str, desktop: bool) -> Result<LookResult, String> {
    let state = app.state::<ComputerState>();
    let target = if desktop { None } else { target_window() };
    let want_elements = mode != "screenshot";
    let want_image = mode != "elements";
    let mut elements = Vec::new();
    if desktop {
        let list = desktop_icons_window().ok_or("Não encontrei os ícones da área de trabalho.")?;
        let monitors = xcap::Monitor::all().map_err(|error| error.to_string())?;
        let (mut left, mut top, mut right, mut bottom) = (0, 0, 0, 0);
        for monitor in &monitors {
            let (x, y) = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
            left = left.min(x);
            top = top.min(y);
            right = right.max(x + monitor.width().unwrap_or(0) as i32);
            bottom = bottom.max(y + monitor.height().unwrap_or(0) as i32);
        }
        elements = window_elements(list, (left, top, right, bottom))?;
    }
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
    /// Pixels físicos da tela (sem print): usado em testes e para soltar em um ponto exato.
    pub screen_x: Option<i32>,
    pub screen_y: Option<i32>,
}

fn resolve_point(app: &AppHandle, target: &PointTarget) -> Result<(i32, i32, String), String> {
    let state = app.state::<ComputerState>();
    if let (Some(x), Some(y)) = (target.screen_x, target.screen_y) {
        return Ok((x, y, format!("tela ({x},{y})")));
    }
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

/// Tamanho do que o robô carrega (janela), para ele abrir as mãos na largura certa.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CarryTarget {
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorEvent {
    x: i32,
    y: i32,
    /// `appear`, `move`, `point`, `click`, `double-click`, `right-click`, `grab`, `carry`, `drag`, `drop`,
    /// `scroll`, `type`, `look`, `wait`, `home` (volta para o app e some).
    action: String,
    label: String,
    visible: bool,
    /// Tempo da viagem até (x, y) em ms: o Rust espera esse tempo antes de agir, o robô chega junto.
    duration: u64,
    /// Texto do cartaz que o robô segura (ex.: "Tem certeza?").
    #[serde(skip_serializing_if = "Option::is_none")]
    sign: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    carry: Option<CarryTarget>,
    /// Comprimento do braço invisível: do centro do rosto até as mãos, em frações do tamanho do robô.
    #[serde(skip_serializing_if = "Option::is_none")]
    reach: Option<f64>,
    /// Para que lado o robô anda: -1 esquerda, 1 direita.
    #[serde(skip_serializing_if = "Option::is_none")]
    facing: Option<i8>,
    /// Vista do robô: `front` (de frente para o usuário), `side` (de lado) ou `back` (de costas).
    #[serde(skip_serializing_if = "Option::is_none")]
    view: Option<&'static str>,
}

/// Imagem de um ícone da área de trabalho que o robô carrega nas mãos (como a imagem de arrasto do Windows).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CarryGhost {
    /// PNG em data URL (a mesma imagem que o Explorer desenha).
    pub image: String,
    pub label: String,
    /// Tamanho do "azulejo" do ícone (ícone + nome), px físicos.
    pub width: i32,
    pub height: i32,
    /// Tamanho do ícone em si, px físicos.
    pub icon: i32,
    /// Das mãos até a borda de cima do azulejo, px físicos.
    pub grip: i32,
}

/// Passa (ou tira, com `None`) a imagem do ícone para as mãos do robô.
pub fn emit_carry_ghost(app: &AppHandle, ghost: Option<CarryGhost>) {
    let _ = app.emit_to(CURSOR_WINDOW, "agent-cursor-carry", ghost);
}

/// Postura extra de um gesto da coreografia (`choreo.rs`).
#[derive(Clone, Copy, Default)]
pub struct Stance {
    pub reach: Option<f64>,
    pub facing: Option<i8>,
    pub view: Option<&'static str>,
}

/// Diâmetro do rosto do robô em px lógicos (igual a `ROBOT_SIZE` de robotMotion.ts).
pub const ROBOT_SIZE: f64 = 128.0;

/// Tamanho do robô em pixels físicos da tela (a coreografia mede o braço e o agachamento com ele).
pub fn robot_size_px(app: &AppHandle) -> f64 {
    let _ = ensure_cursor_window(app);
    app.get_webview_window(CURSOR_WINDOW).and_then(|window| window.scale_factor().ok()).unwrap_or(1.0) * ROBOT_SIZE
}

/// Onde o robô-mouse está agora (ponto do último gesto, pixels da tela).
pub fn robot_position(app: &AppHandle) -> Option<(i32, i32)> {
    app.state::<ComputerState>().cursor.lock().ok().and_then(|cursor| *cursor)
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
        // Janela nova: espera o React registrar o `listen` (até 3 s), senão o primeiro gesto some.
        let ready = &app.state::<ComputerState>().cursor_ready;
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while !ready.load(std::sync::atomic::Ordering::Acquire) && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(30));
        }
    }
    Ok((left, top))
}

/// A janela do robô-mouse avisa que já está ouvindo os eventos `agent-cursor`.
#[tauri::command]
pub fn robot_cursor_ready(app: AppHandle) {
    app.state::<ComputerState>().cursor_ready.store(true, std::sync::atomic::Ordering::Release);
}

/// Anima o robô-mouse até o ponto (coordenadas de tela) e espera ele chegar.
fn move_agent_cursor(app: &AppHandle, x: i32, y: i32, action: &str, label: &str) {
    travel_to(app, x, y, action, label, None);
}

/// Leva o robô até (x, y) com o tempo de viagem da distância e espera ele chegar.
pub fn travel_to(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, sign: Option<String>) {
    let from = app.state::<ComputerState>().cursor.lock().ok().and_then(|cursor| *cursor);
    let distance = from.map(|(fx, fy)| (((x - fx) * (x - fx) + (y - fy) * (y - fy)) as f64).sqrt()).unwrap_or(400.0);
    // Apontar/voar segue a velocidade escolhida pelo usuário (+ › Velocidade do robô).
    let duration = (crate::desktop::travel_ms(distance) as f64 * crate::choreo::travel_factor()) as u64;
    emit_robot_with_sign(app, x, y, action, label, duration, None, sign);
    std::thread::sleep(Duration::from_millis(duration + 40));
}

/// Manda o robô-mouse para (x, y) em `duration` ms, sem esperar (carregar emite vários pontos seguidos).
pub fn emit_robot(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, duration: u64, carry: Option<CarryTarget>) {
    emit_robot_with_sign(app, x, y, action, label, duration, carry, None);
}

fn emit_cursor(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, sign: Option<String>) {
    emit_robot_with_sign(app, x, y, action, label, 60, None, sign);
}

#[allow(clippy::too_many_arguments)]
fn emit_robot_with_sign(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, duration: u64, carry: Option<CarryTarget>, sign: Option<String>) {
    emit_full(app, x, y, action, label, duration, carry, sign, Stance::default());
}

/// Um gesto da coreografia: ponto das mãos, comprimento do braço e para onde o robô olha.
#[allow(clippy::too_many_arguments)]
pub fn emit_stance(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, duration: u64, carry: Option<CarryTarget>, stance: Stance) {
    emit_full(app, x, y, action, label, duration, carry, None, stance);
}

#[allow(clippy::too_many_arguments)]
fn emit_full(app: &AppHandle, x: i32, y: i32, action: &str, label: &str, duration: u64, carry: Option<CarryTarget>, sign: Option<String>, stance: Stance) {
    let Ok((left, top)) = ensure_cursor_window(app) else { return };
    let state = app.state::<ComputerState>();
    let was_hidden = state.cursor.lock().map(|cursor| cursor.is_none()).unwrap_or(true);
    if was_hidden {
        // Primeira ação da tarefa: o robô do modo voz sai do app (some lá) e aparece aqui no mesmo lugar.
        if let Some((hx, hy)) = state.home.lock().ok().and_then(|home| *home) {
            let _ = app.emit_to(CURSOR_WINDOW, "agent-cursor", CursorEvent { x: hx - left, y: hy - top, action: "appear".into(), label: String::new(), visible: true, duration: 0, sign: None, carry: None, reach: None, facing: None, view: None });
            let _ = app.emit("robot-away", true);
            if let Ok(mut cursor) = state.cursor.lock() {
                *cursor = Some((hx, hy));
            }
        }
    }
    if let Some(window) = app.get_webview_window(CURSOR_WINDOW) {
        let _ = window.show();
    }
    let _ = app.emit_to(
        CURSOR_WINDOW,
        "agent-cursor",
        CursorEvent { x: x - left, y: y - top, action: action.into(), label: label.into(), visible: true, duration, sign, carry, reach: stance.reach, facing: stance.facing, view: stance.view },
    );
    if let Ok(mut cursor) = state.cursor.lock() {
        *cursor = Some((x, y));
    };
}

/// O modo voz informa onde o robô está no app (centro do rosto em pixels da tela); `None` = modo voz fechado.
#[tauri::command]
pub fn robot_set_home(app: AppHandle, x: Option<i32>, y: Option<i32>) {
    if let Ok(mut home) = app.state::<ComputerState>().home.lock() {
        *home = x.zip(y);
    }
}

/// Fim da tarefa: o robô volta voando para o app (se o modo voz estiver aberto) e a janela some.
pub fn hide_agent_cursor(app: &AppHandle) {
    let state = app.state::<ComputerState>();
    let was_visible = state.cursor.lock().ok().and_then(|mut cursor| cursor.take()).is_some();
    let home = state.home.lock().ok().and_then(|home| *home);
    if let (true, Some((hx, hy))) = (was_visible, home) {
        if let Ok((left, top)) = ensure_cursor_window(app) {
            let duration = 700;
            let _ = app.emit_to(CURSOR_WINDOW, "agent-cursor", CursorEvent { x: hx - left, y: hy - top, action: "home".into(), label: String::new(), visible: true, duration, sign: None, carry: None, reach: None, facing: None, view: None });
            std::thread::sleep(Duration::from_millis(duration + 60));
        }
    }
    let _ = app.emit_to(CURSOR_WINDOW, "agent-cursor", CursorEvent { x: 0, y: 0, action: "move".into(), label: String::new(), visible: false, duration: 0, sign: None, carry: None, reach: None, facing: None, view: None });
    if let Some(window) = app.get_webview_window(CURSOR_WINDOW) {
        let _ = window.hide();
    }
    let _ = app.emit("robot-away", false);
}

/// Clique "virtual": aciona o elemento pelo UI Automation (Invoke, Selecionar, Marcar, Expandir ou a
/// ação padrão), sem mexer no ponteiro do usuário. Só vale se o elemento no ponto é o esperado.
fn virtual_click(x: i32, y: i32, expected: &str) -> Option<&'static str> {
    use uiautomation::patterns::{UIExpandCollapsePattern, UIInvokePattern, UILegacyIAccessiblePattern, UISelectionItemPattern, UITogglePattern};
    let automation = automation().ok()?;
    let element = automation.element_from_point(uiautomation::types::Point::new(x, y)).ok()?;
    let name = element.get_name().unwrap_or_default();
    if !expected.is_empty() && name.trim() != expected.trim() {
        return None;
    }
    if element.get_pattern::<UIInvokePattern>().and_then(|pattern| pattern.invoke()).is_ok() {
        return Some("acionei");
    }
    if element.get_pattern::<UISelectionItemPattern>().and_then(|pattern| pattern.select()).is_ok() {
        return Some("selecionei");
    }
    if element.get_pattern::<UITogglePattern>().and_then(|pattern| pattern.toggle()).is_ok() {
        return Some("marquei");
    }
    if element.get_pattern::<UIExpandCollapsePattern>().and_then(|pattern| pattern.expand()).is_ok() {
        return Some("abri");
    }
    if element.get_pattern::<UILegacyIAccessiblePattern>().and_then(|pattern| pattern.do_default_action()).is_ok() {
        return Some("acionei");
    }
    None
}

/// Clica com o dedo do robô. Clique simples em elemento da lista usa o mouse virtual (UI Automation);
/// o resto (coordenada de print, direito, duplo) usa o mouse real por um instante e devolve o ponteiro.
pub fn click(app: &AppHandle, target: &PointTarget, button: &str, double: bool) -> Result<String, String> {
    check_failsafe()?;
    let (x, y, label) = resolve_point(app, target)?;
    let action = match (button, double) {
        ("right", _) => "right-click",
        (_, true) => "double-click",
        _ => "click",
    };
    move_agent_cursor(app, x, y, action, &label);
    if target.element.is_some() && button == "left" && !double {
        if let Some(verb) = virtual_click(x, y, &label) {
            std::thread::sleep(Duration::from_millis(120));
            return Ok(format!("Cliquei em {label} ({x},{y}) — {verb} pelo mouse virtual."));
        }
    }
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

/// O robô vai até o alvo e aponta com o dedo, sem clicar (antes de perguntar "é este?").
pub fn point_at(app: &AppHandle, target: &PointTarget) -> Option<String> {
    let (x, y, label) = resolve_point(app, target).ok()?;
    move_agent_cursor(app, x, y, "point", &label);
    Some(label)
}

/// Arrasta com as mãos do robô: pega em `from`, carrega até `to` e solta (o mouse real faz o mesmo
/// por baixo). Serve para mover ícones, arquivos e janelas; o ponteiro do usuário volta ao lugar.
pub fn drag(app: &AppHandle, from: &PointTarget, to: &PointTarget) -> Result<String, String> {
    check_failsafe()?;
    let (x0, y0, from_label) = resolve_point(app, from)?;
    let (x1, y1, to_label) = resolve_point(app, to)?;
    move_agent_cursor(app, x0, y0, "grab", &from_label);
    let mut input = enigo()?;
    let original = input.location().ok();
    input.move_mouse(x0, y0, Coordinate::Abs).map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(60));
    input.button(Button::Left, Direction::Press).map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(180));
    // Passos pequenos: o Windows só inicia o arrasto depois de alguns pixels de movimento contínuo.
    let steps = 24;
    let result = (|| -> Result<(), String> {
        for step in 1..=steps {
            let t = step as f64 / steps as f64;
            let ease = t * t * (3.0 - 2.0 * t);
            let x = x0 + ((x1 - x0) as f64 * ease).round() as i32;
            let y = y0 + ((y1 - y0) as f64 * ease).round() as i32;
            input.move_mouse(x, y, Coordinate::Abs).map_err(|error| error.to_string())?;
            if step % 3 == 0 || step == steps {
                emit_cursor(app, x, y, "drag", &from_label, None);
            }
            std::thread::sleep(Duration::from_millis(28));
        }
        Ok(())
    })();
    std::thread::sleep(Duration::from_millis(160));
    // Solta sempre, mesmo se algo falhou no caminho, para o botão não ficar preso.
    let _ = input.button(Button::Left, Direction::Release);
    emit_cursor(app, x1, y1, "drop", &to_label, None);
    std::thread::sleep(Duration::from_millis(250));
    if let Some((ox, oy)) = original {
        let _ = input.move_mouse(ox, oy, Coordinate::Abs);
    }
    result?;
    Ok(format!("Arrastei {from_label} ({x0},{y0}) até {to_label} ({x1},{y1})."))
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

/// Título da janela em primeiro plano agora (para o modelo saber onde as teclas caíram).
pub fn foreground_title() -> String {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    let mut buffer = [0u16; 256];
    let length = unsafe { GetWindowTextW(GetForegroundWindow(), &mut buffer) };
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

/// Teclado vai para a janela em foco. Se o foco está no próprio chat (o usuário acabou de
/// mandar a mensagem), traz antes a janela alvo para frente — senão as teclas cairiam no chat.
fn ensure_target_focus() {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow},
    };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid)) };
    if pid != std::process::id() {
        return;
    }
    if let Some((window, _)) = target_window() {
        if let Ok(id) = window.id() {
            if let Ok(mut input) = enigo() {
                let _ = input.key(Key::Alt, Direction::Click);
            }
            unsafe {
                let _ = SetForegroundWindow(HWND(id as isize as *mut core::ffi::c_void));
            }
            std::thread::sleep(Duration::from_millis(150));
        }
    }
}

pub fn type_text(app: &AppHandle, text: &str, submit: bool) -> Result<String, String> {
    check_failsafe()?;
    ensure_target_focus();
    if let Some((x, y)) = app.state::<ComputerState>().cursor.lock().ok().and_then(|cursor| *cursor) {
        move_agent_cursor(app, x, y, "type", "digitando");
    }
    let mut input = enigo()?;
    input.text(text).map_err(|error| error.to_string())?;
    if submit {
        std::thread::sleep(Duration::from_millis(60));
        input.key(Key::Return, Direction::Click).map_err(|error| error.to_string())?;
    }
    if submit {
        std::thread::sleep(Duration::from_millis(900));
    }
    Ok(format!(
        "Digitei {} caracteres{} em \"{}\".",
        text.chars().count(),
        if submit { " e apertei Enter" } else { "" },
        foreground_title()
    ))
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
    ensure_target_focus();
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
    std::thread::sleep(Duration::from_millis(250));
    Ok(format!("Apertei {combo} em \"{}\".", foreground_title()))
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

