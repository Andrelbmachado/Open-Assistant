//! Reconhecimento de pedidos comuns sem gastar tokens do modelo ("embeddings" leves na CPU).
//!
//! Cada frase vira um vetor de n-gramas de caracteres (hash em `DIMS` posições) depois de
//! normalizar o texto e unificar verbos sinônimos ("abre", "inicia", "entra no" → `abrir`).
//! O índice tem uma entrada por ação conhecida: intents sem parâmetro do `intents.yaml`,
//! apps do `memoria/apps.yaml`, apps do menu Iniciar (`Get-StartApps`, em cache) e sites comuns.
//!
//! Limiares do desenho do pacote `local-pc-agent`:
//! - `>= RUN_THRESHOLD` (0,82): executa direto;
//! - `>= SUGGEST_THRESHOLD` (0,65): vira sugestão (o modelo ou o usuário escolhe entre 3);
//! - abaixo disso: é conversa normal.

use super::agent::{self, Catalog};
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    path::Path,
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime},
};
use tauri::AppHandle;

const DIMS: usize = 1024;
pub const RUN_THRESHOLD: f32 = 0.82;
pub const SUGGEST_THRESHOLD: f32 = 0.65;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const START_APPS_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// Verbo canônico de "abrir" (apps e sites só casam quando a frase tem esse verbo).
const OPEN: &str = "abrir";
const OPEN_VERBS: &[&str] = &[
    "abre", "abrir", "abra", "abri", "inicia", "iniciar", "inicie", "executa", "executar", "execute", "roda", "rodar", "rode",
    "entra", "entrar", "entre", "acessa", "acessar", "acesse", "vai", "ir", "va", "open", "start", "launch", "carrega", "chama",
];
const STOPWORDS: &[&str] = &[
    "o", "a", "os", "as", "no", "na", "nos", "nas", "em", "de", "do", "da", "dos", "das", "pra", "para", "pro", "me", "meu", "minha",
    "um", "uma", "site", "app", "aplicativo", "programa", "pagina", "ai", "la", "aqui", "agora", "rapidinho", "logo", "the",
];
const QUESTION_STARTS: &[&str] = &[
    "como", "qual", "quais", "o que", "oque", "por que", "porque", "quando", "onde", "quem", "quanto", "quantos", "sera", "explica",
    "explique", "me explica", "me fala", "fala sobre", "o que e", "what", "how", "why",
];
const COMPOSITE_CONNECTORS: &[&str] = &[" e ", " depois ", " entao ", " e ai ", " clicando ", " e digita ", " e pesquisa "];

/// Sites comuns: frase falada → URL.
const SITES: &[(&str, &str)] = &[
    ("youtube", "https://www.youtube.com"),
    ("gmail", "https://mail.google.com"),
    ("github", "https://github.com"),
    ("whatsapp web", "https://web.whatsapp.com"),
    ("instagram", "https://www.instagram.com"),
    ("twitter", "https://x.com"),
    ("x com", "https://x.com"),
    ("reddit", "https://www.reddit.com"),
    ("notion", "https://www.notion.so"),
    ("chatgpt", "https://chatgpt.com"),
    ("claude", "https://claude.ai"),
    ("gemini", "https://gemini.google.com"),
    ("netflix", "https://www.netflix.com"),
    ("linkedin", "https://www.linkedin.com"),
    ("facebook", "https://www.facebook.com"),
    ("google drive", "https://drive.google.com"),
    ("google maps", "https://maps.google.com"),
    ("google agenda", "https://calendar.google.com"),
    ("google docs", "https://docs.google.com"),
    ("g1", "https://g1.globo.com"),
    ("uol", "https://www.uol.com.br"),
    ("mercado livre", "https://www.mercadolivre.com.br"),
    ("amazon", "https://www.amazon.com.br"),
    ("twitch", "https://www.twitch.tv"),
    ("outlook", "https://outlook.live.com"),
    ("wikipedia", "https://pt.wikipedia.org"),
    ("google", "https://www.google.com"),
];

/// Ação que o índice conhece: um intent do catálogo com os parâmetros já resolvidos.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub risk: String,
    pub slots: HashMap<String, String>,
    /// Texto para o usuário ("Abrir Spotify").
    pub label: String,
    pub score: f32,
}

/// Resultado da camada semântica: `run` executa o 1º candidato, `suggest` mostra até 3.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SemanticMatch {
    pub action: String,
    pub candidates: Vec<Candidate>,
}

struct Entry {
    candidate: Candidate,
    /// Apps e sites: comparados só pelo nome (sem o verbo), e só quando a frase tem "abrir".
    object: Option<Vec<f32>>,
    vector: Vec<f32>,
}

#[derive(Default)]
pub struct Index {
    entries: Vec<Entry>,
}

static INDEX: Mutex<Option<Index>> = Mutex::new(None);

// ---------------------------------------------------------------- vetores

/// Palavras da frase já normalizadas: sem acento, sem "por favor", verbos de abrir unificados, sem artigos.
pub fn tokens(text: &str) -> Vec<String> {
    agent::normalize(text)
        .split_whitespace()
        .map(|word| if OPEN_VERBS.contains(&word) { OPEN } else { word })
        .filter(|word| !STOPWORDS.contains(word))
        .map(str::to_string)
        .collect()
}

fn fnv(text: &str) -> usize {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    (hash % DIMS as u64) as usize
}

/// Contagem de trigramas de cada palavra (tolera erro de digitação); `word_weight` soma a palavra inteira.
fn grams(words: &[String], word_weight: f32) -> Vec<f32> {
    let mut vector = vec![0f32; DIMS];
    for word in words {
        if word_weight > 0.0 {
            vector[fnv(&format!("w:{word}"))] += word_weight;
        }
        let padded: Vec<char> = format!(" {word} ").chars().collect();
        for gram in padded.windows(3) {
            vector[fnv(&gram.iter().collect::<String>())] += 1.0;
        }
    }
    vector
}

fn unit(mut vector: Vec<f32>) -> Vec<f32> {
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        vector.iter_mut().for_each(|value| *value /= norm);
    }
    vector
}

/// Vetor normalizado da frase (trigramas + palavras inteiras).
pub fn embed(words: &[String]) -> Vec<f32> {
    unit(grams(words, 1.5))
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Nome falado vs nome do app: 40% cosseno + 60% cobertura ("photoshop" cobre "Adobe Photoshop 2025").
fn object_score(query: &[f32], entry: &[f32]) -> f32 {
    let total: f32 = query.iter().sum();
    if total == 0.0 {
        return 0.0;
    }
    let covered: f32 = query.iter().zip(entry).map(|(q, e)| q.min(*e)).sum();
    0.4 * cosine(&unit(query.to_vec()), &unit(entry.to_vec())) + 0.6 * covered / total
}

fn without_verb(words: &[String]) -> Vec<String> {
    words.iter().filter(|word| *word != OPEN).cloned().collect()
}

// ---------------------------------------------------------------- índice

impl Index {
    fn push(&mut self, phrase: &str, candidate: Candidate, is_object: bool) {
        let words = tokens(phrase);
        let object = without_verb(&words);
        if words.is_empty() || (is_object && object.is_empty()) {
            return;
        }
        self.entries.push(Entry { vector: embed(&words), candidate, object: is_object.then(|| grams(&object, 0.0)) });
    }

    fn add_app(&mut self, spoken: &str, app: &str, label: &str) {
        let candidate = Candidate { id: "open_app".into(), risk: "safe".into(), slots: HashMap::from([("app".into(), app.into())]), label: format!("Abrir {label}"), score: 0.0 };
        self.push(&format!("abrir {spoken}"), candidate, true);
    }

    fn add_site(&mut self, spoken: &str, url: &str) {
        let label = url.trim_start_matches("https://").trim_start_matches("www.").trim_end_matches('/');
        let candidate = Candidate { id: "open_url".into(), risk: "safe".into(), slots: HashMap::from([("url".into(), url.into())]), label: format!("Abrir {label}"), score: 0.0 };
        self.push(&format!("abrir {spoken}"), candidate, true);
    }

    /// Monta o índice a partir do catálogo, dos apps conhecidos e dos apps do menu Iniciar.
    pub fn build(catalog: &Catalog, apps_yaml: Option<&str>, start_apps: &[StartApp]) -> Index {
        let mut index = Index::default();
        // Intents sem parâmetro ("tira um print", "minimiza tudo"): cada alias/exemplo é uma entrada.
        for intent in catalog.intents.iter().filter(|intent| intent.needs_slot.is_none() && intent.extract.is_empty() && intent.risk != "deny") {
            for phrase in intent.aliases.iter().chain(intent.examples.iter()) {
                let label = phrase.chars().next().map(|first| first.to_uppercase().collect::<String>() + &phrase[first.len_utf8()..]).unwrap_or_default();
                let candidate = Candidate { id: intent.id.clone(), risk: intent.risk.clone(), slots: HashMap::new(), label, score: 0.0 };
                index.push(phrase, candidate, false);
            }
        }
        #[derive(Deserialize)]
        struct AppEntry {
            #[serde(default)]
            aliases: Vec<String>,
            exe: String,
        }
        if let Some(apps) = apps_yaml.and_then(|text| serde_yaml::from_str::<HashMap<String, AppEntry>>(text).ok()) {
            for (name, entry) in apps {
                let label = entry.aliases.first().cloned().unwrap_or_else(|| name.clone());
                for spoken in std::iter::once(name.clone()).chain(entry.aliases.iter().cloned()) {
                    index.add_app(&spoken, &entry.exe, &label);
                }
            }
        }
        for app in start_apps {
            if app.name.trim().is_empty() || app.app_id.trim().is_empty() || is_noise_app(&app.name) {
                continue;
            }
            index.add_app(&app.name, &format!("shell:AppsFolder\\{}", app.app_id), &app.name);
        }
        for (spoken, url) in SITES {
            index.add_site(spoken, url);
        }
        index
    }

    /// Candidatos mais parecidos (um por ação), do melhor para o pior.
    pub fn search(&self, text: &str, limit: usize) -> Vec<Candidate> {
        let words = tokens(text);
        if words.is_empty() {
            return Vec::new();
        }
        let has_open_verb = words.iter().any(|word| word == OPEN);
        let query = embed(&words);
        let object = without_verb(&words);
        let query_object = grams(&object, 0.0);
        let mut scored: Vec<Candidate> = self
            .entries
            .iter()
            .filter(|entry| entry.object.is_none() || (has_open_verb && !object.is_empty()))
            .map(|entry| {
                let score = match &entry.object {
                    Some(entry_object) => object_score(&query_object, entry_object),
                    None => cosine(&query, &entry.vector),
                };
                Candidate { score, ..entry.candidate.clone() }
            })
            .filter(|candidate| candidate.score >= SUGGEST_THRESHOLD)
            .collect();
        scored.sort_by(|a, b| b.score.total_cmp(&a.score));
        let mut unique: Vec<Candidate> = Vec::new();
        for candidate in scored {
            if !unique.iter().any(|seen| seen.id == candidate.id && seen.slots == candidate.slots) {
                unique.push(candidate);
            }
            if unique.len() == limit {
                break;
            }
        }
        unique
    }
}

/// Desinstaladores, manuais e links de ajuda do menu Iniciar não viram "abrir X".
fn is_noise_app(name: &str) -> bool {
    let lower = agent::normalize(name);
    ["uninstall", "desinstalar", "readme", "leia-me", "help", "ajuda", "documentation", "release notes", "website"].iter().any(|word| lower.contains(word))
}

/// Pergunta ("como abro o powershell?") é conversa, não ordem.
pub fn is_question(text: &str) -> bool {
    let normalized = agent::normalize(text);
    text.trim_end().ends_with('?') || QUESTION_STARTS.iter().any(|start| normalized == *start || normalized.starts_with(&format!("{start} ")))
}

/// Pedido com várias etapas ("abre o chrome e pesquisa…") fica para o modelo planejar.
fn is_composite(text: &str) -> bool {
    let normalized = format!(" {} ", agent::normalize(text));
    COMPOSITE_CONNECTORS.iter().any(|connector| normalized.contains(connector)) && normalized.split_whitespace().count() > 4
}

/// Decide entre executar, sugerir ou deixar para a conversa.
pub fn classify(index: &Index, text: &str) -> SemanticMatch {
    let none = SemanticMatch { action: "none".into(), candidates: Vec::new() };
    if is_question(text) || is_composite(text) || text.split_whitespace().count() > 10 {
        return none;
    }
    let candidates = index.search(text, 3);
    match candidates.first() {
        None => none,
        Some(best) if best.score >= RUN_THRESHOLD => SemanticMatch { action: "run".into(), candidates: vec![best.clone()] },
        Some(_) => SemanticMatch { action: "suggest".into(), candidates },
    }
}

// ---------------------------------------------------------------- apps do menu Iniciar

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StartApp {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "AppID")]
    pub app_id: String,
}

fn start_apps_cache(dir: &Path) -> std::path::PathBuf {
    dir.join("cache").join("startapps.json")
}

fn read_start_apps(dir: &Path) -> Vec<StartApp> {
    fs::read_to_string(start_apps_cache(dir)).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

fn start_apps_stale(dir: &Path) -> bool {
    fs::metadata(start_apps_cache(dir))
        .and_then(|meta| meta.modified())
        .map(|modified| SystemTime::now().duration_since(modified).unwrap_or_default() > START_APPS_MAX_AGE)
        .unwrap_or(true)
}

/// `Get-StartApps` leva ~1 s: roda em segundo plano, grava o cache e invalida o índice.
fn refresh_start_apps(dir: std::path::PathBuf) {
    std::thread::spawn(move || {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let Ok(output) = output else { return };
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        let apps: Vec<StartApp> = serde_json::from_str::<Vec<StartApp>>(&text)
            .or_else(|_| serde_json::from_str::<StartApp>(&text).map(|app| vec![app]))
            .unwrap_or_default();
        if apps.is_empty() {
            return;
        }
        let path = start_apps_cache(&dir);
        let _ = fs::create_dir_all(path.parent().unwrap_or(&dir));
        if fs::write(&path, serde_json::to_string(&apps).unwrap_or_default()).is_ok() {
            invalidate();
        }
    });
}

/// Esquece o índice (ex.: depois de editar `apps.yaml` ou atualizar os apps do menu Iniciar).
pub fn invalidate() {
    if let Ok(mut index) = INDEX.lock() {
        *index = None;
    }
}

/// Na abertura do app: atualiza o cache de apps do menu Iniciar se estiver velho (em segundo plano).
pub fn warm_up(app: &AppHandle) {
    if let Ok(dir) = agent::ensure_skill(app) {
        if start_apps_stale(&dir) {
            refresh_start_apps(dir);
        }
    }
}

/// Classifica a frase com o índice em memória (monta na primeira vez).
pub fn match_text(app: &AppHandle, text: &str) -> SemanticMatch {
    let Ok(dir) = agent::ensure_skill(app) else { return SemanticMatch { action: "none".into(), candidates: Vec::new() } };
    let mut guard = match INDEX.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    if guard.is_none() {
        if start_apps_stale(&dir) {
            refresh_start_apps(dir.clone());
        }
        let apps_yaml = fs::read_to_string(dir.join("memoria").join("apps.yaml")).ok();
        *guard = Some(Index::build(&agent::load_catalog(app), apps_yaml.as_deref(), &read_start_apps(&dir)));
    }
    classify(guard.as_ref().expect("índice montado"), text)
}

/// Camada semântica: `run` (executar direto), `suggest` (até 3 opções) ou `none` (conversa).
#[tauri::command]
pub async fn agent_semantic(app: AppHandle, text: String) -> SemanticMatch {
    tauri::async_runtime::spawn_blocking(move || match_text(&app, &text))
        .await
        .unwrap_or(SemanticMatch { action: "none".into(), candidates: Vec::new() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> Index {
        let catalog = agent::parse_catalog(agent::bundled_file("intents.yaml")).expect("catálogo");
        let start_apps = vec![
            StartApp { name: "Adobe Photoshop 2025".into(), app_id: "Adobe.Photoshop".into() },
            StartApp { name: "Blender".into(), app_id: "BlenderFoundation.Blender".into() },
            StartApp { name: "Uninstall Blender".into(), app_id: "x".into() },
        ];
        Index::build(&catalog, Some(agent::bundled_file("memoria/apps.yaml")), &start_apps)
    }

    fn run(index: &Index, text: &str) -> Option<Candidate> {
        let result = classify(index, text);
        (result.action == "run").then(|| result.candidates[0].clone())
    }

    #[test]
    fn common_open_requests_run_without_the_model() {
        let index = index();
        for (text, slot) in [
            ("abre powershell", "wt"),
            ("abrir o spotify", "spotify"),
            ("Abre a calculadora, por favor", "calc"),
            ("inicia o bloco de notas", "notepad"),
            ("abre o photoshop", "shell:AppsFolder\\Adobe.Photoshop"),
            ("abre o blender", "shell:AppsFolder\\BlenderFoundation.Blender"),
        ] {
            let found = run(&index, text).unwrap_or_else(|| panic!("não executou: {text} → {:?}", classify(&index, text).candidates));
            assert_eq!(found.id, "open_app", "{text}");
            assert_eq!(found.slots["app"], slot, "{text}");
        }
        let youtube = run(&index, "entra no youtube").expect("youtube");
        assert_eq!(youtube.slots["url"], "https://www.youtube.com");
    }

    #[test]
    fn typos_become_suggestions_or_runs_but_never_something_else() {
        let index = index();
        let result = classify(&index, "abre o spotifi");
        assert_ne!(result.action, "none");
        assert_eq!(result.candidates[0].slots.get("app").map(String::as_str), Some("spotify"));
    }

    #[test]
    fn questions_chat_and_compound_requests_stay_with_the_model() {
        let index = index();
        for text in [
            "como abrir o powershell?",
            "o que é o youtube",
            "qual o melhor app de música",
            "spotify",
            "abre o chrome e pesquisa o preço do dólar",
            "me conta uma piada",
        ] {
            assert_eq!(classify(&index, text).action, "none", "{text}");
        }
    }

    /// Diagnóstico manual com os apps reais deste PC: `cargo test --lib live_start_apps -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_start_apps() {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"])
            .output()
            .unwrap();
        let apps: Vec<StartApp> = serde_json::from_slice(&output.stdout).unwrap();
        let catalog = agent::parse_catalog(agent::bundled_file("intents.yaml")).unwrap();
        let index = Index::build(&catalog, Some(agent::bundled_file("memoria/apps.yaml")), &apps);
        for text in ["abre o word", "abre o excel", "abre o blender", "abre o arquivo relatorio.docx", "abre o terminal", "abre as configurações", "abre a steam", "abre o paint", "abre o obs", "abre a loja", "abre o gerenciador de tarefas", "tira um print", "abre o google", "abre o figma", "abre meu email"] {
            let result = classify(&index, text);
            println!("{text:40} → {} {:?}", result.action, result.candidates.iter().map(|c| format!("{} {:.2}", c.label, c.score)).collect::<Vec<_>>());
        }
    }

    #[test]
    fn uninstallers_are_not_indexed() {
        let index = index();
        assert!(index.search("abre uninstall blender", 3).iter().all(|candidate| !candidate.label.contains("Uninstall")));
    }
}
