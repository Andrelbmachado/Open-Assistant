//! Mouse virtual do robô: pega ícones da área de trabalho e janelas **sem usar o ponteiro do usuário**.
//!
//! Em vez de adivinhar pixels num print e segurar o botão do mouse real (frágil: errava a barra de
//! título do Chrome, soltava cedo), o app pergunta ao Windows onde as coisas estão e as move direto:
//! - ícones da área de trabalho: `IFolderView` do Explorer (nome, caminho e posição exatos;
//!   `SelectAndPositionItems` move o ícone) + UI Automation para o retângulo visível do ícone;
//! - janelas: `DWMWA_EXTENDED_FRAME_BOUNDS` (retângulo visível real) e `SetWindowPos` (move/redimensiona).
//!
//! O robô na janela transparente (`AgentCursor.tsx`) só encena o gesto por cima do alvo real: aponta
//! com o indicador, aperta, segura com as duas mãos e carrega — o objeto anda junto com as mãos, com a
//! coreografia de `choreo.rs` (agacha, estica o braço, fecha a mão, levanta, vira, flutua, solta).

use crate::choreo::{self, Gait, Load};
use crate::places::{self, Area, Spot};
use crate::computer::{self, travel_to, CarryTarget};
use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use windows::core::{Interface, PWSTR};
use windows::Win32::{
    Foundation::{HWND, LPARAM, POINT, RECT, WPARAM},
    Graphics::{
        Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS},
        Gdi::{ClientToScreen, GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    },
    System::{
        Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED},
        Variant::{VARIANT, VT_I4},
    },
    UI::{
        Shell::{
            Common::{ITEMIDLIST, STRRET},
            IEnumIDList, IFolderView, IFolderView2, IShellBrowser, IShellFolder, IShellWindows, IUnknown_QueryService, ShellExecuteW,
            ShellWindows, StrRetToStrW, FWF_AUTOARRANGE, SHGDN_FORPARSING, SHGDN_NORMAL, SID_STopLevelBrowser, SVGIO_ALLVIEW,
            SVSI_DESELECTOTHERS, SVSI_ENSUREVISIBLE, SVSI_FOCUSED, SVSI_POSITIONITEM, SVSI_SELECT, SWC_DESKTOP, SWFO_NEEDDISPATCH,
        },
        WindowsAndMessaging::{
            GetWindowRect, IsIconic, IsZoomed, SendMessageTimeoutW, SetWindowPos, ShowWindow, SMTO_ABORTIFHUNG, SMTO_BLOCK, SWP_NOACTIVATE,
            SWP_NOZORDER, SW_MAXIMIZE, SW_RESTORE, SW_SHOWNORMAL, WM_NCHITTEST,
        },
    },
};

// ---------------------------------------------------------------- movimento (igual ao robotMotion.ts; andar carregando: choreo.rs)

/// Duração da viagem para `distance` pixels: curta de perto, nunca lenta demais de longe.
pub fn travel_ms(distance: f64) -> u64 {
    (260.0 + distance.max(0.0).sqrt() * 22.0).clamp(320.0, 1150.0) as u64
}

fn lerp(a: i32, b: i32, t: f64) -> i32 {
    a + ((b - a) as f64 * t).round() as i32
}

// ---------------------------------------------------------------- monitores

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    fn width(&self) -> i32 {
        self.right - self.left
    }
    fn height(&self) -> i32 {
        self.bottom - self.top
    }
    fn center(&self) -> (i32, i32) {
        ((self.left + self.right) / 2, (self.top + self.bottom) / 2)
    }
}

impl From<Rect> for Area {
    fn from(rect: Rect) -> Self {
        Area { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }
}

impl From<RECT> for Rect {
    fn from(rect: RECT) -> Self {
        Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }
}

/// Área útil (sem a barra de tarefas) do monitor que contém o ponto.
fn work_area_at(x: i32, y: i32) -> Rect {
    unsafe {
        let monitor = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            return info.rcWork.into();
        }
    }
    Rect { left: 0, top: 0, right: 1920, bottom: 1040 }
}

/// Áreas úteis de todos os monitores, da esquerda para a direita.
pub fn work_areas() -> Vec<Rect> {
    let mut areas: Vec<Rect> = xcap::Monitor::all()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let (x, y) = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
            work_area_at(x + 10, y + 10)
        })
        .collect();
    areas.sort_by_key(|area| (area.left, area.top));
    areas.dedup();
    areas
}

/// Destino dito em palavras ("direita", "cima direita", "70% 30%", "um pouco para cima", "outro lado") dentro
/// da área útil `area`, para algo com centro em `from`. Devolve o novo centro. `margin` = meia largura/altura
/// do objeto (não encosta na borda). "Ao lado de X" precisa do retângulo de X (resolvido em `move_item`).
#[cfg(test)]
fn place_point(place: &str, from: (i32, i32), area: Rect, margin: (i32, i32)) -> Option<(i32, i32)> {
    match places::parse(place)? {
        Spot::Near { .. } => None,
        spot => Some(spot.resolve(from, area.into(), margin, None)),
    }
}

/// Mensagem quando o lugar não foi entendido: as mesmas palavras de `posicoes_na_tela.md`.
pub const PLACE_HELP: &str = "Use uma zona (cima esquerda, cima centro, cima direita, meio esquerda, centro, meio direita, baixo esquerda, baixo centro, baixo direita — ou zona 1 a 9), direita/esquerda/cima/baixo, porcentagem (\"70% 30%\"), relativo (\"um pouco para a direita\", \"200 px para baixo\"), \"outro lado\" ou \"ao lado de <nome>\".";

// ---------------------------------------------------------------- área de trabalho (IFolderView)

/// COM inicializado nesta thread enquanto viver (as threads do `spawn_blocking` são reaproveitadas).
struct ComScope(bool);
impl ComScope {
    fn enter() -> ComScope {
        ComScope(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok())
    }
}
impl Drop for ComScope {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

/// PIDL relativo de um item da área de trabalho (liberado no fim).
struct Pidl(*mut ITEMIDLIST);
impl Drop for Pidl {
    fn drop(&mut self) {
        unsafe { CoTaskMemFree(Some(self.0 as *const core::ffi::c_void)) };
    }
}

struct DesktopView {
    view: IFolderView,
    folder: IShellFolder,
    shell_view: windows::Win32::UI::Shell::IShellView,
    /// Lista de ícones (SysListView32): as posições do IFolderView são relativas a ela.
    list: HWND,
}

/// A "pasta" da área de trabalho aberta no Explorer (receita do Raymond Chen, The Old New Thing).
fn desktop_view() -> Result<DesktopView, String> {
    let fail = |step: &str, error: windows::core::Error| format!("Não consegui acessar a área de trabalho ({step}): {error}");
    unsafe {
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).map_err(|error| fail("ShellWindows", error))?;
        let mut location = VARIANT::default();
        (*location.Anonymous.Anonymous).vt = VT_I4; // CSIDL_DESKTOP = 0
        let empty = VARIANT::default();
        let mut hwnd = 0i32;
        let dispatch = windows
            .FindWindowSW(&location, &empty, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)
            .map_err(|error| fail("FindWindowSW", error))?;
        let browser: IShellBrowser = IUnknown_QueryService(&dispatch, &SID_STopLevelBrowser).map_err(|error| fail("QueryService", error))?;
        let shell_view = browser.QueryActiveShellView().map_err(|error| fail("ShellView", error))?;
        let view: IFolderView = shell_view.cast().map_err(|error| fail("IFolderView", error))?;
        let folder: IShellFolder = view.GetFolder().map_err(|error| fail("pasta", error))?;
        let list = computer::desktop_icons_window().map(|handle| HWND(handle as *mut core::ffi::c_void)).ok_or("Não encontrei os ícones da área de trabalho.")?;
        Ok(DesktopView { view, folder, shell_view, list })
    }
}

fn display_name(folder: &IShellFolder, pidl: *const ITEMIDLIST, flags: windows::Win32::UI::Shell::SHGDNF) -> String {
    unsafe {
        let mut value = STRRET::default();
        if folder.GetDisplayNameOf(pidl, flags, &mut value).is_err() {
            return String::new();
        }
        let mut text = PWSTR::null();
        if StrRetToStrW(&mut value, Some(pidl), &mut text).is_err() || text.is_null() {
            return String::new();
        }
        let result = text.to_string().unwrap_or_default();
        CoTaskMemFree(Some(text.0 as *const core::ffi::c_void));
        result
    }
}

/// Item da área de trabalho: nome como aparece, caminho completo e retângulo na tela (pixels físicos).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopItem {
    pub name: String,
    pub path: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl DesktopItem {
    pub fn center(&self) -> (i32, i32) {
        (self.x + self.width / 2, self.y + self.height / 2)
    }
}

struct Entry {
    pidl: Pidl,
    item: DesktopItem,
    /// Posição do IFolderView (cliente da lista de ícones).
    position: POINT,
}

fn entries(desktop: &DesktopView) -> Result<Vec<Entry>, String> {
    // Retângulos visíveis pelo UI Automation (o IFolderView só dá o canto do item).
    let visible = computer::desktop_icon_rects();
    let mut spacing = POINT { x: 76, y: 100 };
    let mut origin = POINT { x: 0, y: 0 };
    unsafe {
        let _ = desktop.view.GetSpacing(&mut spacing);
        let _ = ClientToScreen(desktop.list, &mut origin);
    }
    let list: IEnumIDList = unsafe { desktop.view.Items(SVGIO_ALLVIEW) }.map_err(|error| format!("Não consegui listar a área de trabalho: {error}"))?;
    let mut result = Vec::new();
    loop {
        let mut slot = [std::ptr::null_mut::<ITEMIDLIST>(); 1];
        let mut fetched = 0u32;
        let status = unsafe { list.Next(&mut slot, Some(&mut fetched)) };
        if status.is_err() || fetched == 0 || slot[0].is_null() {
            break;
        }
        let pidl = Pidl(slot[0]);
        let name = display_name(&desktop.folder, pidl.0, SHGDN_NORMAL);
        let path = display_name(&desktop.folder, pidl.0, SHGDN_FORPARSING);
        let Ok(position) = (unsafe { desktop.view.GetItemPosition(pidl.0) }) else { continue };
        let (sx, sy) = (origin.x + position.x, origin.y + position.y);
        // Casa pelo nome e pela vizinhança (dois itens podem ter o mesmo nome visível).
        let rect = visible
            .iter()
            .filter(|(label, _)| label == &name)
            .map(|(_, rect)| *rect)
            .min_by_key(|rect| (rect.left - sx).abs() + (rect.top - sy).abs())
            .filter(|rect| (rect.left - sx).abs() + (rect.top - sy).abs() < spacing.x + spacing.y);
        let (x, y, width, height) = match rect {
            Some(rect) => (rect.left, rect.top, rect.width(), rect.height()),
            None => (sx, sy, spacing.x, spacing.y),
        };
        result.push(Entry { pidl, item: DesktopItem { name, path, x, y, width, height }, position });
    }
    Ok(result)
}

/// Ícones da área de trabalho com nome, caminho e posição exatos.
pub fn desktop_items() -> Result<Vec<DesktopItem>, String> {
    let _com = ComScope::enter();
    let desktop = desktop_view()?;
    Ok(entries(&desktop)?.into_iter().map(|entry| entry.item).collect())
}

/// Nota de quanto `query` combina com o item (maior = melhor; 0 = nada).
fn match_score(query: &str, item: &DesktopItem) -> u32 {
    let query = crate::agent::normalize(query);
    let name = crate::agent::normalize(&item.name);
    let file = crate::agent::normalize(item.path.rsplit('\\').next().unwrap_or_default());
    if query.is_empty() {
        0
    } else if name == query || file == query {
        100
    } else if name.starts_with(&query) || file.starts_with(&query) {
        70
    } else if name.contains(&query) || file.contains(&query) {
        50
    } else if query.split(' ').all(|word| name.contains(word)) {
        30
    } else {
        0
    }
}

fn find_entry<'a>(entries: &'a [Entry], query: &str) -> Result<&'a Entry, String> {
    let best = entries.iter().map(|entry| (match_score(query, &entry.item), entry)).filter(|(score, _)| *score > 0).max_by_key(|(score, _)| *score);
    best.map(|(_, entry)| entry).ok_or_else(|| {
        let names: Vec<&str> = entries.iter().map(|entry| entry.item.name.as_str()).take(30).collect();
        format!("Não há \"{query}\" na área de trabalho. Itens: {}.", names.join(", "))
    })
}

/// Onde soltar: ponto exato da tela ou lugar dito em palavras.
#[derive(Default, Debug, Clone)]
pub struct Destination {
    pub screen_x: Option<i32>,
    pub screen_y: Option<i32>,
    pub place: Option<String>,
    /// Pasta da área de trabalho onde guardar o item (o arquivo muda de pasta de verdade).
    pub into: Option<String>,
    /// Velocidade e caminho da caminhada (padrão: a velocidade escolhida pelo usuário, caminho natural).
    pub gait: Option<Gait>,
}

/// O robô aponta para o ícone (para a pergunta "É este?"), sem mexer em nada.
pub fn point_at_item(app: &AppHandle, query: &str) -> Option<String> {
    let _com = ComScope::enter();
    let desktop = desktop_view().ok()?;
    let list = entries(&desktop).ok()?;
    let entry = find_entry(&list, query).ok()?;
    let (x, y) = entry.item.center();
    travel_to(app, x, y, "point", &entry.item.name, None);
    Some(entry.item.name.clone())
}

/// Ícone da área de trabalho sendo carregado.
///
/// O Explorer (Windows 11, build 29671) **não repinta** um ícone reposicionado várias vezes seguidas: um
/// `SelectAndPositionItems` sozinho aparece em ~120 ms, mas vários em sequência (a cada 16 ms ou até a cada
/// 130 ms) só aparecem quando param. Então o robô faz como o próprio Windows num arrasto: o ícone original
/// fica no lugar (selecionado) e uma **imagem do ícone** (a mesma que o Explorer desenha + o nome) anda nas
/// mãos do robô a 60 quadros/s; ao soltar, o ícone real vai para o destino de uma vez e a imagem some.
struct IconLoad<'a> {
    /// Centro do ícone na tela e quanto ele anda até o destino.
    from: (i32, i32),
    delta: (i32, i32),
    /// Das mãos até o centro do ícone: o robô segura a borda de cima (o rosto fica acima, sem tampar).
    grip: i32,
    /// Imagem que o robô carrega (vai para a janela do robô ao pegar; some ao soltar).
    ghost: Option<computer::CarryGhost>,
    app: &'a AppHandle,
    /// Onde as mãos ficam depois de soltar (o "Alinhar à grade" pode encaixar o ícone numa célula vizinha).
    landed: std::rc::Rc<std::cell::Cell<Option<(i32, i32)>>>,
}

impl Load for IconLoad<'_> {
    /// O ícone real só muda de lugar ao soltar (`move_item`); no caminho quem anda é a imagem nas mãos.
    fn put(&mut self, _t: f64, _offset: (i32, i32)) {}
    fn hands(&self, t: f64, (dx, dy): (i32, i32)) -> (i32, i32) {
        (lerp(self.from.0, self.from.0 + self.delta.0, t) + dx, lerp(self.from.1, self.from.1 + self.delta.1, t) + self.grip + dy)
    }
    fn grabbed(&mut self) {
        if let Some(ghost) = self.ghost.clone() {
            computer::emit_carry_ghost(self.app, Some(ghost));
        }
    }
    fn released(&mut self) {
        computer::emit_carry_ghost(self.app, None);
    }
    fn final_hands(&self) -> Option<(i32, i32)> {
        self.landed.get()
    }
}

/// Imagem do item como o Explorer mostra (miniatura de foto ou ícone), `size` px, em PNG (data URL).
fn icon_data_url(path: &str, size: i32) -> Option<String> {
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK};
    let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(windows::core::PCWSTR(wide.as_ptr()), None).ok()?;
        let bitmap = factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_BIGGERSIZEOK).ok()?;
        let mut info = BITMAP::default();
        GetObjectW(bitmap.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut BITMAP as *mut core::ffi::c_void));
        let (width, height) = (info.bmWidth, info.bmHeight.abs());
        let mut header = BITMAPINFO::default();
        header.bmiHeader = BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: width, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() };
        let mut pixels = vec![0u8; (width * height * 4).max(0) as usize];
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(dc, bitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut core::ffi::c_void), &mut header, DIB_RGB_COLORS);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(bitmap.into());
        if lines == 0 || width <= 0 || height <= 0 {
            return None;
        }
        // BGRA → RGBA. Sem alfa nenhum = imagem opaca; com alfa, vem pré-multiplicado.
        let has_alpha = pixels.chunks(4).any(|px| px[3] != 0);
        for px in pixels.chunks_mut(4) {
            px.swap(0, 2);
            if !has_alpha {
                px[3] = 255;
            } else if px[3] > 0 && px[3] < 255 {
                let a = px[3] as u32;
                for channel in &mut px[..3] {
                    *channel = ((*channel as u32 * 255 + a / 2) / a).min(255) as u8;
                }
            }
        }
        let image = image::RgbaImage::from_raw(width as u32, height as u32, pixels)?;
        let mut png = std::io::Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).ok()?;
        Some(format!("data:image/png;base64,{}", computer::base64_encode(png.get_ref())))
    }
}

/// Tamanho dos ícones da área de trabalho em px (pequenos 32, médios 48, grandes 96 — já com a escala).
fn desktop_icon_size(view: &IFolderView) -> i32 {
    let mut mode = windows::Win32::UI::Shell::FOLDERVIEWMODE::default();
    let mut size = 48;
    if let Ok(view2) = view.cast::<IFolderView2>() {
        let _ = unsafe { view2.GetViewModeAndIconSize(&mut mode, &mut size) };
    }
    size.clamp(16, 256)
}

/// Guarda o arquivo/pasta `source` dentro da pasta `folder` (mesmo nome); não sobrescreve nada.
fn move_into(source: &str, folder: &str) -> Result<std::path::PathBuf, String> {
    let source = std::path::Path::new(source);
    let name = source.file_name().ok_or("Item sem nome.")?;
    let destination = std::path::Path::new(folder).join(name);
    if destination.exists() {
        return Err(format!("Já existe \"{}\" dentro de \"{folder}\"; não sobrescrevo.", name.to_string_lossy()));
    }
    std::fs::rename(source, &destination).map_err(|error| format!("O Windows não deixou mover para a pasta: {error}"))?;
    Ok(destination)
}

/// Pega um ícone da área de trabalho com as mãos e o leva a outro lugar da tela (A → B) ou para dentro
/// de uma pasta da área de trabalho, sem usar o mouse.
pub fn move_item(app: &AppHandle, query: &str, to: &Destination) -> Result<String, String> {
    let _com = ComScope::enter();
    let desktop = desktop_view()?;
    let list = entries(&desktop)?;
    let entry = find_entry(&list, query)?;
    let item = &entry.item;
    let from = item.center();
    let folder = match to.into.as_deref().filter(|name| !name.trim().is_empty()) {
        Some(name) => {
            let target = list
                .iter()
                .filter(|other| other.item.path != item.path && std::path::Path::new(&other.item.path).is_dir())
                .map(|other| (match_score(name, &other.item), other))
                .filter(|(score, _)| *score > 0)
                .max_by_key(|(score, _)| *score)
                .map(|(_, other)| other)
                .ok_or_else(|| format!("Não há uma pasta \"{name}\" na área de trabalho."))?;
            let inside = std::path::Path::new(&target.item.path).join(std::path::Path::new(&item.path).file_name().unwrap_or_default());
            if inside.exists() {
                return Err(format!("Já existe \"{}\" dentro de \"{}\"; não sobrescrevo.", item.name, target.item.name));
            }
            Some(target)
        }
        None => None,
    };
    let flags = desktop.view.cast::<IFolderView2>().ok().and_then(|view| unsafe { view.GetCurrentFolderFlags() }.ok()).unwrap_or(0);
    if folder.is_none() && flags & FWF_AUTOARRANGE.0 as u32 != 0 {
        return Err("A área de trabalho está com \"Organizar ícones automaticamente\" ligado: o Windows devolve o ícone ao lugar. Desligue em botão direito › Exibir.".into());
    }
    let area = work_area_at(from.0, from.1);
    let target = match (folder, to.screen_x, to.screen_y, to.place.as_deref()) {
        // Para dentro da pasta: solta o ícone em cima dela, um pouco acima do centro.
        (Some(folder), ..) => {
            let (x, y) = folder.item.center();
            (x, y - folder.item.height / 6)
        }
        (None, Some(x), Some(y), _) => (x, y),
        (None, _, _, Some(place)) => {
            let spot = places::parse(place).ok_or_else(|| format!("Lugar desconhecido: \"{place}\". {PLACE_HELP}"))?;
            let margin = (item.width / 2, item.height / 2);
            match &spot {
                // "ao lado da Lixeira": encosta no ícone (ou janela) citado.
                Spot::Near { name, .. } => {
                    let other = list
                        .iter()
                        .filter(|other| other.item.path != item.path)
                        .map(|other| (match_score(name, &other.item), other))
                        .filter(|(score, _)| *score > 0)
                        .max_by_key(|(score, _)| *score)
                        .map(|(_, other)| Area { left: other.item.x, top: other.item.y, right: other.item.x + other.item.width, bottom: other.item.y + other.item.height })
                        .or_else(|| find_window(name).ok().map(|window| window.rect.into()))
                        .ok_or_else(|| format!("Não achei \"{name}\" na área de trabalho nem nas janelas."))?;
                    spot.resolve(from, area.into(), margin, Some(other))
                }
                _ => spot.resolve(from, area.into(), margin, None),
            }
        }
        _ => return Err("Diga para onde: `place` (ex.: \"cima direita\", \"outro lado\"), `screen_x`/`screen_y` ou `into` (uma pasta).".into()),
    };
    let label = item.name.clone();
    let pidl = entry.pidl.0 as *const ITEMIDLIST;
    let delta = (target.0 - from.0, target.1 - from.1);

    // O robô chega apontando e o ícone fica selecionado (o "clique" do dedo); depois a coreografia.
    unsafe {
        let _ = desktop.shell_view.SelectItem(pidl, (SVSI_SELECT.0 | SVSI_DESELECTOTHERS.0 | SVSI_FOCUSED.0) as u32);
    }
    let icon = desktop_icon_size(&desktop.view);
    let ghost = icon_data_url(&item.path, icon).map(|image| computer::CarryGhost { image, label: item.name.clone(), width: item.width, height: item.height, icon, grip: 6 });
    let landed = std::rc::Rc::new(std::cell::Cell::new(None));
    let mut load = IconLoad { from, delta, grip: -(item.height / 2) + 6, ghost, app, landed: landed.clone() };
    let final_position = POINT { x: entry.position.x + delta.0, y: entry.position.y + delta.1 };
    let mut stored = None;
    let source = item.path.clone();
    choreo::carry(app, &label, &mut load, to.gait.unwrap_or_default(), |load| {
        load.put(1.0, (0, 0));
        match folder {
            Some(folder) => {
                stored = Some(move_into(&source, &folder.item.path)?);
                Ok(())
            }
            None => {
                unsafe {
                    let _ = desktop.view.SelectAndPositionItems(1, &pidl, Some(&final_position), (SVSI_POSITIONITEM.0 | SVSI_ENSUREVISIBLE.0) as u32);
                }
                // Com "Alinhar à grade" o ícone encaixa na célula mais perto: as mãos (e a imagem) vão junto.
                if let Ok(snapped) = unsafe { desktop.view.GetItemPosition(pidl) } {
                    let center = (from.0 + snapped.x - entry.position.x, from.1 + snapped.y - entry.position.y);
                    landed.set(Some((center.0, center.1 - item.height / 2 + 6)));
                }
                Ok(())
            }
        }
    })?;
    if let (Some(folder), Some(stored)) = (folder, stored) {
        return Ok(format!("Guardei \"{label}\" dentro da pasta \"{}\" ({}).", folder.item.name, stored.display()));
    }
    // Confere onde o ícone ficou (com "Alinhar à grade" ele encaixa na célula mais próxima).
    let landed = unsafe { desktop.view.GetItemPosition(pidl) }.unwrap_or(final_position);
    let mut origin = POINT { x: 0, y: 0 };
    unsafe {
        let _ = ClientToScreen(desktop.list, &mut origin);
    }
    Ok(format!(
        "Levei \"{label}\" de ({},{}) para ({},{}) na tela — {} (canto do ícone agora em {},{}).",
        from.0,
        from.1,
        target.0,
        target.1,
        places::describe(target, area.into()),
        origin.x + landed.x,
        origin.y + landed.y
    ))
}

/// Aperta o ícone com o dedo: seleciona e abre (como um clique duplo), sem usar o mouse.
pub fn open_item(app: &AppHandle, query: &str) -> Result<String, String> {
    let _com = ComScope::enter();
    let desktop = desktop_view()?;
    let list = entries(&desktop)?;
    let entry = find_entry(&list, query)?;
    let (x, y) = entry.item.center();
    travel_to(app, x, y, "point", &entry.item.name, None);
    unsafe {
        let _ = desktop.shell_view.SelectItem(entry.pidl.0, (SVSI_SELECT.0 | SVSI_DESELECTOTHERS.0 | SVSI_FOCUSED.0) as u32);
    }
    computer::emit_robot(app, x, y, "double-click", &entry.item.name, 0, None);
    std::thread::sleep(Duration::from_millis(280));
    let path: Vec<u16> = entry.item.path.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(None, windows::core::PCWSTR(verb.as_ptr()), windows::core::PCWSTR(path.as_ptr()), windows::core::PCWSTR::null(), windows::core::PCWSTR::null(), SW_SHOWNORMAL)
    };
    if result.0 as isize <= 32 {
        return Err(format!("O Windows não abriu \"{}\" (código {}).", entry.item.name, result.0 as isize));
    }
    Ok(format!("Abri \"{}\" ({}).", entry.item.name, entry.item.path))
}

// ---------------------------------------------------------------- janelas

/// Janela do usuário com o retângulo **visível** (sem as bordas invisíveis de redimensionar).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBox {
    pub title: String,
    pub app: String,
    pub hwnd: isize,
    pub rect: Rect,
    pub maximized: bool,
    pub minimized: bool,
}

fn visible_rect(hwnd: HWND) -> Rect {
    unsafe {
        let mut rect = RECT::default();
        if DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &mut rect as *mut RECT as *mut core::ffi::c_void, std::mem::size_of::<RECT>() as u32).is_ok() {
            return rect.into();
        }
        let _ = GetWindowRect(hwnd, &mut rect);
        rect.into()
    }
}

/// Janelas do usuário (as do Alt+Tab), da mais ao topo para a mais ao fundo.
pub fn user_windows() -> Vec<WindowBox> {
    let own_pid = std::process::id();
    let mut windows = xcap::Window::all().unwrap_or_default();
    windows.sort_by_key(|window| std::cmp::Reverse(window.z().unwrap_or(i32::MIN)));
    windows
        .into_iter()
        .filter_map(|window| {
            let title = window.title().unwrap_or_default();
            let id = window.id().ok()? as isize;
            if title.trim().is_empty() || window.pid().ok()? == own_pid || !computer::is_user_window(id) {
                return None;
            }
            let hwnd = HWND(id as *mut core::ffi::c_void);
            let rect = visible_rect(hwnd);
            if rect.width() < 80 || rect.height() < 40 {
                return None;
            }
            Some(WindowBox {
                title,
                app: window.app_name().unwrap_or_default(),
                hwnd: id,
                rect,
                maximized: unsafe { IsZoomed(hwnd).as_bool() },
                minimized: unsafe { IsIconic(hwnd).as_bool() },
            })
        })
        .collect()
}

/// A janela que o usuário quis dizer: título ou app contendo `query` (a mais ao topo vence).
pub fn find_window(query: &str) -> Result<WindowBox, String> {
    let needle = crate::agent::normalize(query);
    let windows = user_windows();
    windows
        .iter()
        .find(|window| crate::agent::normalize(&window.title).contains(&needle) || crate::agent::normalize(&window.app).contains(&needle))
        .cloned()
        .ok_or_else(|| {
            if windows.is_empty() {
                return format!("Nenhuma janela com \"{query}\": não há janelas abertas (só a área de trabalho). Para ícone/pasta da área de trabalho use move_file.");
            }
            let titles: Vec<String> = windows.iter().take(15).map(|window| format!("\"{}\"", window.title)).collect();
            format!("Nenhuma janela com \"{query}\". Abertas: {}. Para ícone/pasta da área de trabalho use move_file.", titles.join(", "))
        })
}

/// Ponto da barra de título quando o Windows não diz onde ela está: perto do topo, à esquerda do meio.
pub fn grip_point(rect: Rect) -> (i32, i32) {
    (rect.left + (rect.width() * 2 / 5).clamp(40, 520), rect.top + 14)
}

/// Resposta do programa a "o que tem neste ponto da janela?" (`WM_NCHITTEST`); `HTCAPTION` (2) = área de
/// arrastar da barra de título, sem botão, aba, campo ou menu. Janela travada: nada em 60 ms.
fn hit_test(hwnd: HWND, x: i32, y: i32) -> Option<isize> {
    let lparam = (((y as i16 as u16 as u32) << 16) | (x as i16 as u16 as u32)) as i32 as isize;
    let mut result = 0usize;
    let ok = unsafe { SendMessageTimeoutW(hwnd, WM_NCHITTEST, WPARAM(0), LPARAM(lparam), SMTO_ABORTIFHUNG | SMTO_BLOCK, 60, Some(&mut result)) };
    (ok.0 != 0).then_some(result as isize)
}

const HT_CAPTION: isize = 2;

/// Trechos seguidos de barra de título livre numa linha: (início, fim) em x.
fn caption_runs(hits: &[(i32, bool)], step: i32) -> Vec<(i32, i32)> {
    let mut runs = Vec::new();
    let mut start: Option<i32> = None;
    for (x, free) in hits {
        match (free, start) {
            (true, None) => start = Some(*x),
            (false, Some(begin)) => {
                runs.push((begin, x - step));
                start = None;
            }
            _ => {}
        }
    }
    if let (Some(begin), Some((last, _))) = (start, hits.last()) {
        runs.push((begin, *last));
    }
    runs
}

/// Maior trecho livre entre as linhas lidas: (comprimento, x do meio, y da linha).
fn best_caption_run(rows: &[(i32, Vec<(i32, bool)>)], step: i32) -> Option<(i32, i32, i32)> {
    let mut best: Option<(i32, i32, i32)> = None;
    for (y, hits) in rows {
        for (begin, end) in caption_runs(hits, step) {
            let length = end - begin;
            if best.map_or(true, |(best_length, ..)| length > best_length) {
                best = Some((length, (begin + end) / 2, *y));
            }
        }
    }
    best
}

/// Onde uma pessoa seguraria a janela para arrastar: o maior trecho **livre** da barra de título (sem
/// botões, abas, busca ou menus), perguntando ao próprio programa ponto a ponto. Escolhe o meio desse
/// trecho, na altura do meio da barra. Sem resposta útil → `grip_point`.
pub fn title_grip(hwnd: HWND, rect: Rect) -> (i32, i32) {
    const STEP: i32 = 6;
    let mut rows = Vec::new();
    for dy in [8, 14, 20, 26, 34, 42] {
        if dy >= rect.height() / 2 {
            break;
        }
        let y = rect.top + dy;
        let hits: Vec<(i32, bool)> = (rect.left + 8..rect.right - 8).step_by(STEP as usize).map(|x| (x, hit_test(hwnd, x, y) == Some(HT_CAPTION))).collect();
        if hits.iter().any(|(_, free)| *free) {
            rows.push((y, hits));
        }
    }
    match best_caption_run(&rows, STEP) {
        // Trecho curto demais (menos de 36 px) é fresta entre botões: melhor não arriscar.
        Some((length, x, row)) if length >= 36 => {
            // Altura: o meio das linhas com barra de título (a borda de cima serve para redimensionar).
            let middle = (rows[0].0 + rows[rows.len() - 1].0) / 2;
            (x, if hit_test(hwnd, x, middle) == Some(HT_CAPTION) { middle } else { row })
        }
        // Barra desenhada pelo próprio programa (Explorador com abas, apps em WebView): o Windows diz
        // "cliente" em tudo. Aí procura os botões/abas no topo pelo UI Automation e segura no vão livre.
        _ => free_gap_by_automation(hwnd, rect).unwrap_or_else(|| grip_point(rect)),
    }
}

/// Maior vão sem botões/abas/campos na faixa da barra de título (linha a 16 px do topo).
fn free_gap_by_automation(hwnd: HWND, rect: Rect) -> Option<(i32, i32)> {
    const STEP: i32 = 6;
    let y = rect.top + 16.min(rect.height() / 3);
    let blockers = computer::clickable_rects_in(hwnd.0 as isize, (rect.left, rect.top, rect.right, rect.top + 40));
    // Folga de 6 px em volta de cada controle: a mão não encosta num botão.
    let covered = |x: i32| blockers.iter().any(|(l, t, r, b)| x >= l - 6 && x <= r + 6 && y >= t - 2 && y <= b + 2);
    let hits: Vec<(i32, bool)> = (rect.left + 12..rect.right - 12).step_by(STEP as usize).map(|x| (x, !covered(x))).collect();
    free_gap(&hits, y, STEP, blockers.is_empty())
}

/// Meio do maior vão livre; sem nenhum controle na faixa não dá para saber onde é barra: `None`.
fn free_gap(hits: &[(i32, bool)], y: i32, step: i32, nothing_found: bool) -> Option<(i32, i32)> {
    if nothing_found {
        return None;
    }
    let (length, x, y) = best_caption_run(&[(y, hits.to_vec())], step)?;
    (length >= 36).then_some((x, y))
}

/// Retângulo visível de destino para a janela.
pub fn window_target(window: &WindowBox, to: &Destination) -> Result<(Rect, bool), String> {
    let rect = window.rect;
    let (cx, cy) = rect.center();
    let area = work_area_at(cx, cy);
    if let (Some(x), Some(y)) = (to.screen_x, to.screen_y) {
        return Ok((Rect { left: x, top: y, right: x + rect.width(), bottom: y + rect.height() }, false));
    }
    let place = crate::agent::normalize(to.place.as_deref().ok_or("Diga para onde: `place` (ex.: \"direita\") ou `x`/`y`.")?);
    let half = area.width() / 2;
    let keep = |left: i32, top: i32| Rect { left, top, right: left + rect.width().min(area.width()), bottom: top + rect.height().min(area.height()) };
    Ok(match place.as_str() {
        "direita" | "metade direita" | "lado direito" | "right" => (Rect { left: area.left + half, top: area.top, right: area.right, bottom: area.bottom }, false),
        "esquerda" | "metade esquerda" | "lado esquerdo" | "left" => (Rect { left: area.left, top: area.top, right: area.left + half, bottom: area.bottom }, false),
        "centro" | "meio" | "center" => (keep(area.left + (area.width() - rect.width().min(area.width())) / 2, area.top + (area.height() - rect.height().min(area.height())) / 2), false),
        "maximizar" | "tela cheia" | "maximizada" | "maximize" => (area, true),
        "canto superior esquerdo" | "superior esquerdo" => (keep(area.left, area.top), false),
        "canto superior direito" | "superior direito" => (keep(area.right - rect.width().min(area.width()), area.top), false),
        "canto inferior esquerdo" | "inferior esquerdo" => (keep(area.left, area.bottom - rect.height().min(area.height())), false),
        "canto inferior direito" | "inferior direito" => (keep(area.right - rect.width().min(area.width()), area.bottom - rect.height().min(area.height())), false),
        "outro monitor" | "proximo monitor" | "outra tela" => {
            let areas = work_areas();
            if areas.len() < 2 {
                return Err("Só há um monitor.".into());
            }
            let index = areas.iter().position(|candidate| *candidate == area).unwrap_or(0);
            let next = areas[(index + 1) % areas.len()];
            let (dx, dy) = (rect.left - area.left, rect.top - area.top);
            let left = (next.left + dx).min(next.right - rect.width().min(next.width()));
            let top = (next.top + dy).min(next.bottom - rect.height().min(next.height()));
            (Rect { left, top, right: left + rect.width().min(next.width()), bottom: top + rect.height().min(next.height()) }, false)
        }
        // Qualquer outro lugar do mapa da tela (zonas, porcentagem, relativo, outro lado): o centro da janela vai para lá.
        other => {
            let spot = places::parse(other).filter(|spot| !matches!(spot, Spot::Near { .. })).ok_or_else(|| {
                format!("Lugar desconhecido para janela: \"{other}\". Janelas: direita/esquerda (metade da tela), maximizar, outro monitor, cantos. {PLACE_HELP}")
            })?;
            let (width, height) = (rect.width().min(area.width()), rect.height().min(area.height()));
            // Margem 16 px menor: a janela pode encostar na borda da área útil.
            let (x, y) = spot.resolve((cx, cy), area.into(), (width / 2 - 16, height / 2 - 16), None);
            (keep(x - width / 2, y - height / 2), false)
        }
    })
}

/// Move a janela para que o retângulo **visível** fique em `rect` (compensa as bordas invisíveis).
fn place_window(hwnd: HWND, rect: Rect) {
    unsafe {
        let mut outer = RECT::default();
        let _ = GetWindowRect(hwnd, &mut outer);
        let visible = visible_rect(hwnd);
        let (dl, dt) = (visible.left - outer.left, visible.top - outer.top);
        let (dr, db) = (outer.right - visible.right, outer.bottom - visible.bottom);
        let _ = SetWindowPos(
            hwnd,
            None,
            rect.left - dl,
            rect.top - dt,
            rect.width() + dl + dr,
            rect.height() + dt + db,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

/// O robô vai até a barra de título apontando (antes de perguntar "É esta?").
pub fn point_at_window(app: &AppHandle, query: &str) -> Option<String> {
    let window = find_window(query).ok()?;
    let (x, y) = title_grip(HWND(window.hwnd as *mut core::ffi::c_void), window.rect);
    travel_to(app, x, y, "point", &window.title, None);
    Some(window.title)
}

/// Janela sendo carregada pela barra de título (pode mudar de tamanho no caminho, ex.: metade da tela).
struct WindowLoad {
    hwnd: HWND,
    start: Rect,
    target: Rect,
    /// Onde a mão fica na janela: fração da largura e px abaixo do topo.
    grip: (f64, i32),
}

impl WindowLoad {
    fn rect(&self, t: f64, (dx, dy): (i32, i32)) -> Rect {
        Rect {
            left: lerp(self.start.left, self.target.left, t) + dx,
            top: lerp(self.start.top, self.target.top, t) + dy,
            right: lerp(self.start.right, self.target.right, t) + dx,
            bottom: lerp(self.start.bottom, self.target.bottom, t) + dy,
        }
    }
}

impl Load for WindowLoad {
    fn put(&mut self, t: f64, offset: (i32, i32)) {
        place_window(self.hwnd, self.rect(t, offset));
    }
    fn hands(&self, t: f64, offset: (i32, i32)) -> (i32, i32) {
        let rect = self.rect(t, offset);
        (rect.left + (self.grip.0 * rect.width() as f64) as i32, rect.top + self.grip.1)
    }
    fn size(&self, t: f64) -> Option<CarryTarget> {
        let rect = self.rect(t, (0, 0));
        Some(CarryTarget { width: rect.width(), height: rect.height() })
    }
}

/// Segura a janela pela barra de título com as duas mãos e a carrega até o destino — sem mouse real.
pub fn move_window(app: &AppHandle, query: &str, to: &Destination) -> Result<String, String> {
    let mut window = find_window(query)?;
    let hwnd = HWND(window.hwnd as *mut core::ffi::c_void);
    let (target, maximize) = window_target(&window, to)?;
    if window.minimized || (window.maximized && !maximize) {
        // Maximizada/minimizada não anda: primeiro volta ao tamanho normal (como arrastar a barra faria).
        unsafe {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        std::thread::sleep(Duration::from_millis(220));
        window.rect = visible_rect(hwnd);
    }
    let start = window.rect;
    // Segura onde uma pessoa seguraria: um trecho livre da barra de título (sem botões nem abas).
    let grip = title_grip(hwnd, start);
    let mut load = WindowLoad { hwnd, start, target, grip: ((grip.0 - start.left) as f64 / start.width().max(1) as f64, grip.1 - start.top) };
    choreo::carry(app, &window.title, &mut load, to.gait.unwrap_or_default(), |load| {
        load.put(1.0, (0, 0));
        if maximize {
            unsafe {
                let _ = ShowWindow(hwnd, SW_MAXIMIZE);
            }
        }
        Ok(())
    })?;
    let end = visible_rect(hwnd);
    let (ex, ey) = end.center();
    Ok(format!(
        "Levei a janela \"{}\" (segurei a barra de título em {},{}) para ({},{}) {}x{}{} — centro: {}.",
        window.title,
        grip.0,
        grip.1,
        end.left,
        end.top,
        end.width(),
        end.height(),
        if maximize { " (maximizada)" } else { "" },
        places::describe((ex, ey), work_area_at(ex, ey).into())
    ))
}

/// Texto curto para o modelo: monitores, janelas com retângulo e ícones da área de trabalho.
pub fn overview_text(include_desktop: bool) -> String {
    let mut lines = Vec::new();
    for (index, area) in work_areas().iter().enumerate() {
        lines.push(format!("Monitor {}: área útil ({},{})–({},{})", index + 1, area.left, area.top, area.right, area.bottom));
    }
    lines.push("Janelas (da frente para o fundo):".into());
    let windows = user_windows();
    if windows.is_empty() {
        lines.push("- nenhuma janela aberta".into());
    }
    for window in windows.iter().take(20) {
        let state = if window.minimized { " minimizada" } else if window.maximized { " maximizada" } else { "" };
        let (cx, cy) = window.rect.center();
        lines.push(format!(
            "- \"{}\" ({}) em ({},{}) {}x{}{state} — centro: {}",
            window.title,
            window.app,
            window.rect.left,
            window.rect.top,
            window.rect.width(),
            window.rect.height(),
            places::describe((cx, cy), work_area_at(cx, cy).into())
        ));
    }
    if include_desktop {
        match desktop_items() {
            Ok(items) => {
                lines.push("Área de trabalho (nome → centro na tela, zona e % da tela):".into());
                for item in items.iter().take(60) {
                    let (x, y) = item.center();
                    lines.push(format!("- \"{}\" @({x},{y}) {}", item.name, places::describe((x, y), work_area_at(x, y).into())));
                }
            }
            Err(error) => lines.push(format!("Área de trabalho: {error}")),
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn travel_time_grows_with_distance_but_is_capped() {
        assert!(travel_ms(10.0) < travel_ms(900.0));
        assert_eq!(travel_ms(100_000.0), 1150);
        assert!(travel_ms(0.0) >= 320);
    }

    #[test]
    fn places_resolve_inside_the_work_area() {
        let area = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        let left_icon = (100, 400);
        assert_eq!(place_point("outro lado", left_icon, area, (38, 40)), Some((1820, 400)));
        // Perto do meio: não para logo ali do lado, vai até 80 % do outro lado.
        assert_eq!(place_point("outro lado", (738, 420), area, (38, 40)), Some((1536, 420)));
        assert_eq!(place_point("outro lado", (1182, 420), area, (38, 40)), Some((384, 420)));
        let (x, _) = place_point("direita", left_icon, area, (38, 40)).unwrap();
        assert!(x > 1800 && x < 1920);
        assert_eq!(place_point("centro", left_icon, area, (38, 40)), Some((960, 520)));
        assert_eq!(place_point("lua", left_icon, area, (38, 40)), None);
    }

    #[test]
    fn window_places_snap_to_halves_and_corners() {
        let window = WindowBox { title: "x".into(), app: "x".into(), hwnd: 0, rect: Rect { left: 100, top: 100, right: 900, bottom: 700 }, maximized: false, minimized: false };
        let area = work_area_at(500, 400);
        let right = window_target(&window, &Destination { place: Some("direita".into()), ..Default::default() }).unwrap().0;
        assert_eq!(right.right, area.right);
        assert_eq!(right.left, area.left + area.width() / 2);
        let exact = window_target(&window, &Destination { screen_x: Some(10), screen_y: Some(20), ..Default::default() }).unwrap().0;
        assert_eq!((exact.left, exact.top, exact.width(), exact.height()), (10, 20, 800, 600));
        assert!(window_target(&window, &Destination { place: Some("marte".into()), ..Default::default() }).is_err());
        // Zona do mapa da tela: o centro da janela vai para lá, sem mudar o tamanho.
        let top_right = window_target(&window, &Destination { place: Some("cima direita".into()), ..Default::default() }).unwrap().0;
        assert_eq!((top_right.width(), top_right.height()), (800, 600));
        assert_eq!(top_right.right, area.right);
        assert_eq!(top_right.top, area.top);
    }

    #[test]
    fn grip_picks_the_widest_free_stretch_of_the_title_bar() {
        // Linha de cima: abas até 400, livre de 400 a 700, botões depois. Linha de baixo: livre curtinho.
        let row = |free: &dyn Fn(i32) -> bool| (0..1000).step_by(6).map(|x| (x, free(x))).collect::<Vec<_>>();
        let rows = vec![(8, row(&|x| (400..700).contains(&x))), (14, row(&|x| (100..130).contains(&x)))];
        let (length, x, y) = best_caption_run(&rows, 6).unwrap();
        assert!(length > 280, "{length}");
        assert!((540..560).contains(&x), "{x}");
        assert_eq!(y, 8);
        assert_eq!(caption_runs(&[(0, true), (6, true), (12, false), (18, true)], 6), vec![(0, 6), (18, 18)]);
        // Pelo UI Automation: abas até 500, botões depois de 900 → segura no meio do vão (500–900).
        let hits: Vec<(i32, bool)> = (0..1000).step_by(6).map(|x| (x, (500..900).contains(&x))).collect();
        let (x, _) = free_gap(&hits, 16, 6, false).unwrap();
        assert!((690..710).contains(&x), "{x}");
        assert_eq!(free_gap(&hits, 16, 6, true), None);
    }

    #[test]
    fn grip_is_on_the_title_bar_away_from_the_buttons() {
        let (x, y) = grip_point(Rect { left: 0, top: 0, right: 1000, bottom: 800 });
        assert_eq!(y, 14);
        assert!(x > 100 && x < 700);
    }

    /// Lê a área de trabalho de verdade (rode com `cargo test --lib live_desktop -- --ignored --nocapture`).
    #[test]
    #[ignore]
    fn live_desktop_items_and_windows() {
        println!("{}", overview_text(true));
        assert!(!desktop_items().expect("área de trabalho").is_empty());
    }

    /// Onde o robô seguraria cada janela aberta (rode com `cargo test --lib live_title -- --ignored --nocapture`).
    #[test]
    #[ignore]
    fn live_title_grips() {
        for window in user_windows() {
            let hwnd = HWND(window.hwnd as *mut core::ffi::c_void);
            let (x, y) = title_grip(hwnd, window.rect);
            println!("{} — janela ({},{})–({},{}) → segura em ({x},{y}), hit {:?}", window.title, window.rect.left, window.rect.top, window.rect.right, window.rect.bottom, hit_test(hwnd, x, y));
        }
    }

    /// Retângulos dos ícones: UI Automation × IFolderView (rode com --ignored --nocapture).
    #[test]
    #[ignore]
    fn live_icon_rects() {
        let _com = ComScope::enter();
        let desktop = desktop_view().unwrap();
        let rects = computer::desktop_icon_rects();
        println!("UIA: {} retângulos; primeiros: {:?}", rects.len(), rects.iter().take(4).collect::<Vec<_>>());
        for entry in entries(&desktop).unwrap().iter().take(6) {
            println!("{} → posição {:?} item {:?}", entry.item.name, (entry.position.x, entry.position.y), (entry.item.x, entry.item.y, entry.item.width, entry.item.height));
        }
    }

    /// A imagem que o robô carrega sai do mesmo ícone que o Explorer desenha (rode com --ignored).
    #[test]
    #[ignore]
    fn live_icon_image() {
        let _com = ComScope::enter();
        let desktop = desktop_view().unwrap();
        let size = desktop_icon_size(&desktop.view);
        let items = entries(&desktop).unwrap();
        let url = icon_data_url(&items[0].item.path, size).expect("imagem do ícone");
        println!("{} → ícone {size}px, {} bytes", items[0].item.name, url.len());
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn item_matching_prefers_exact_names() {
        let item = |name: &str| DesktopItem { name: name.into(), path: format!("C:\\Users\\x\\Desktop\\{name}"), x: 0, y: 0, width: 10, height: 10 };
        assert_eq!(match_score("teste mover", &item("teste mover")), 100);
        assert!(match_score("teste", &item("teste mover")) > match_score("mover", &item("teste mover")));
        assert_eq!(match_score("planilha", &item("teste mover")), 0);
    }
}
