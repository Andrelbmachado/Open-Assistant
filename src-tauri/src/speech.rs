//! Voz local: reconhecimento (NVIDIA NeMo / OpenAI Whisper) e síntese (Piper) pelo
//! sherpa-onnx sobre o Microsoft ONNX Runtime.
//!
//! O reconhecimento do WebView2 (`webkitSpeechRecognition`) depende de um serviço em nuvem
//! que o WebView2 não tem e sempre falha com `network`; por isso o áudio é capturado na
//! interface e transcrito aqui. Os modelos ficam carregados entre as falas.

use super::tools::{self, find_file, SHERPA_RUNTIME};
use sherpa_onnx::{
    GenerationConfig, OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig, OfflineTts,
    OfflineTtsConfig, OfflineTtsModelConfig, OfflineTtsVitsModelConfig, OfflineWhisperModelConfig,
};
use std::{
    ffi::c_void,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Instant,
};
use tauri::{ipc::InvokeBody, AppHandle, Manager};

#[derive(Default)]
pub struct SpeechState {
    runtime_loaded: Mutex<bool>,
    recognizer: Mutex<Option<(String, OfflineRecognizer)>>,
    tts: Mutex<Option<(String, OfflineTts)>>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum AsrKind {
    NemoTransducer,
    Whisper,
}

fn asr_kind(model_id: &str) -> Option<AsrKind> {
    match model_id {
        "asr-nemo-pt" | "asr-parakeet-v3" => Some(AsrKind::NemoTransducer),
        "asr-whisper-small" | "asr-whisper-turbo" | "asr-whisper-large-v3" => Some(AsrKind::Whisper),
        _ => None,
    }
}

fn is_tts_voice(voice_id: &str) -> bool {
    voice_id.starts_with("tts-piper-")
}

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
    fn GetLastError() -> u32;
}

const LOAD_WITH_ALTERED_SEARCH_PATH: u32 = 0x0000_0008;

fn load_library(path: &Path) -> Result<(), String> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let handle = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH) };
    if handle.is_null() {
        let code = unsafe { GetLastError() };
        return Err(format!("Não foi possível carregar {} (erro {code}).", path.display()));
    }
    Ok(())
}

/// Carrega as DLLs baixadas pelo caminho completo. Só depois disso é seguro chamar o
/// sherpa-onnx: o /DELAYLOAD resolve pelo nome e reaproveita o módulo já carregado.
fn ensure_runtime(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<SpeechState>();
    let mut loaded = state.runtime_loaded.lock().map_err(|_| "estado da voz indisponível")?;
    if *loaded {
        return Ok(());
    }
    if !tools::is_installed(app, SHERPA_RUNTIME) {
        return Err("A runtime de voz (sherpa-onnx) não está instalada. Baixe um modelo em Configurações › Voz.".into());
    }
    let root = tools::tool_dir(app, SHERPA_RUNTIME)?;
    let c_api = find_file(&root, &|name| name == "sherpa-onnx-c-api.dll")
        .ok_or("A instalação da runtime de voz está incompleta; remova e baixe de novo.")?;
    let lib_dir = c_api.parent().unwrap_or(&root).to_path_buf();
    load_library(&lib_dir.join("onnxruntime.dll"))?;
    load_library(&c_api)?;
    *loaded = true;
    Ok(())
}

fn model_file(dir: &Path, part: &str) -> Option<String> {
    // Prefere a versão int8 (menor e mais rápida na CPU) quando o pacote traz as duas.
    find_file(dir, &|name| name.ends_with(".onnx") && name.contains(part) && name.contains("int8"))
        .or_else(|| find_file(dir, &|name| name.ends_with(".onnx") && name.contains(part)))
        .map(path_string)
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn recognizer_config(dir: &Path, kind: AsrKind, language: &str) -> Result<OfflineRecognizerConfig, String> {
    let missing = || "Arquivos do modelo de voz incompletos; remova e baixe de novo.".to_string();
    let tokens = find_file(dir, &|name| name.ends_with("tokens.txt")).map(path_string).ok_or_else(missing)?;
    let mut config = OfflineRecognizerConfig::default();
    match kind {
        AsrKind::NemoTransducer => {
            config.model_config.transducer = OfflineTransducerModelConfig {
                encoder: Some(model_file(dir, "encoder").ok_or_else(missing)?),
                decoder: Some(model_file(dir, "decoder").ok_or_else(missing)?),
                joiner: Some(model_file(dir, "joiner").ok_or_else(missing)?),
            };
            config.model_config.model_type = Some("nemo_transducer".into());
        }
        AsrKind::Whisper => {
            config.model_config.whisper = OfflineWhisperModelConfig {
                encoder: Some(model_file(dir, "encoder").ok_or_else(missing)?),
                decoder: Some(model_file(dir, "decoder").ok_or_else(missing)?),
                language: Some(language.to_string()),
                task: Some("transcribe".into()),
                ..Default::default()
            };
        }
    }
    config.model_config.tokens = Some(tokens);
    config.model_config.num_threads = 4;
    config.model_config.provider = Some("cpu".into());
    Ok(config)
}

fn tts_config(dir: &Path) -> Result<OfflineTtsConfig, String> {
    let missing = || "Arquivos da voz incompletos; remova e baixe de novo.".to_string();
    let model = find_file(dir, &|name| name.ends_with(".onnx")).map(path_string).ok_or_else(missing)?;
    let tokens = find_file(dir, &|name| name == "tokens.txt").map(path_string).ok_or_else(missing)?;
    let data_dir = find_file(dir, &|name| name == "phontab")
        .and_then(|file| file.parent().map(Path::to_path_buf))
        .map(path_string)
        .ok_or_else(missing)?;
    Ok(OfflineTtsConfig {
        model: OfflineTtsModelConfig {
            vits: OfflineTtsVitsModelConfig {
                model: Some(model),
                tokens: Some(tokens),
                data_dir: Some(data_dir),
                ..Default::default()
            },
            num_threads: 4,
            provider: Some("cpu".into()),
            ..Default::default()
        },
        max_num_sentences: 1,
        ..Default::default()
    })
}

fn installed_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !tools::is_installed(app, id) {
        return Err("Este modelo de voz não está instalado. Baixe-o em Configurações › Voz.".into());
    }
    tools::tool_dir(app, id)
}

fn transcribe(app: &AppHandle, model_id: &str, language: &str, sample_rate: i32, samples: &[f32]) -> Result<String, String> {
    let kind = asr_kind(model_id).ok_or_else(|| format!("Modelo de reconhecimento desconhecido: {model_id}"))?;
    ensure_runtime(app)?;
    let state = app.state::<SpeechState>();
    let mut slot = state.recognizer.lock().map_err(|_| "estado da voz indisponível")?;
    let key = format!("{model_id}:{language}");
    if slot.as_ref().map(|(loaded, _)| loaded != &key).unwrap_or(true) {
        *slot = None;
        let config = recognizer_config(&installed_dir(app, model_id)?, kind, language)?;
        let recognizer = OfflineRecognizer::create(&config)
            .ok_or("O sherpa-onnx não conseguiu abrir o modelo de voz.")?;
        *slot = Some((key, recognizer));
    }
    let (_, recognizer) = slot.as_ref().expect("recognizer carregado");
    let stream = recognizer.create_stream();
    stream.accept_waveform(sample_rate, samples);
    recognizer.decode(&stream);
    Ok(stream.get_result().map(|result| result.text.trim().to_string()).unwrap_or_default())
}

/// WAV PCM 16 bits mono, para a interface tocar com `decodeAudioData`.
pub fn wav_bytes(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        out.extend_from_slice(&value.to_le_bytes());
    }
    out
}

fn synthesize(app: &AppHandle, voice_id: &str, text: &str, speed: f32) -> Result<Vec<u8>, String> {
    if !is_tts_voice(voice_id) {
        return Err(format!("Voz desconhecida: {voice_id}"));
    }
    ensure_runtime(app)?;
    let state = app.state::<SpeechState>();
    let mut slot = state.tts.lock().map_err(|_| "estado da voz indisponível")?;
    if slot.as_ref().map(|(loaded, _)| loaded != voice_id).unwrap_or(true) {
        *slot = None;
        let tts = OfflineTts::create(&tts_config(&installed_dir(app, voice_id)?)?)
            .ok_or("O sherpa-onnx não conseguiu abrir a voz.")?;
        *slot = Some((voice_id.to_string(), tts));
    }
    let (_, tts) = slot.as_ref().expect("voz carregada");
    // CString não aceita NUL; o resto do texto segue em UTF-8 (acentos preservados).
    let clean: String = text.chars().filter(|c| *c != '\0').collect();
    let config = GenerationConfig { speed: speed.clamp(0.5, 2.0), ..Default::default() };
    let audio = tts
        .generate_with_config::<fn(&[f32], f32) -> bool>(&clean, &config, None)
        .ok_or("A síntese de voz falhou.")?;
    Ok(wav_bytes(audio.samples(), audio.sample_rate().max(1) as u32))
}

/// Libera o modelo carregado antes de apagar os arquivos dele.
pub fn release(app: &AppHandle, tool_id: &str) {
    let state = app.state::<SpeechState>();
    if let Ok(mut slot) = state.recognizer.lock() {
        if slot.as_ref().is_some_and(|(key, _)| key.starts_with(&format!("{tool_id}:"))) {
            *slot = None;
        }
    }
    if let Ok(mut slot) = state.tts.lock() {
        if slot.as_ref().is_some_and(|(key, _)| key == tool_id) {
            *slot = None;
        }
    };
}

fn header<'a>(request: &'a tauri::ipc::Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcription {
    text: String,
    elapsed_ms: u64,
}

/// Corpo: amostras Float32 little-endian. Cabeçalhos: `x-model`, `x-sample-rate`, `x-language`.
#[tauri::command]
pub async fn asr_transcribe(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Transcription, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Áudio inválido.".into());
    };
    let model = header(&request, "x-model").unwrap_or_default().to_string();
    let language = header(&request, "x-language").unwrap_or("pt").to_string();
    let sample_rate: i32 = header(&request, "x-sample-rate").and_then(|value| value.parse().ok()).unwrap_or(16_000);
    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let text = transcribe(&app, &model, &language, sample_rate, &samples)?;
        Ok(Transcription { text, elapsed_ms: started.elapsed().as_millis() as u64 })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Sintetiza fala com uma voz Piper; devolve WAV binário (sem JSON).
#[tauri::command]
pub async fn tts_synthesize(app: AppHandle, voice_id: String, text: String, speed: Option<f32>) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || synthesize(&app, &voice_id, &text, speed.unwrap_or(1.0)))
        .await
        .map_err(|error| error.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_header_describes_16_bit_mono_pcm() {
        let wav = wav_bytes(&[0.0, 1.0, -1.0], 22_050);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 22_050);
        assert_eq!(u16::from_le_bytes(wav[34..36].try_into().unwrap()), 16);
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        assert_eq!(i16::from_le_bytes(wav[46..48].try_into().unwrap()), i16::MAX);
        assert_eq!(wav.len(), 44 + 6);
    }

    #[test]
    fn every_speech_model_has_an_install_recipe() {
        for id in ["asr-nemo-pt", "asr-parakeet-v3", "asr-whisper-small", "asr-whisper-turbo", "asr-whisper-large-v3"] {
            assert!(asr_kind(id).is_some());
            assert!(tools::recipe(id).is_some(), "{id}");
        }
        for recipe in tools::RECIPES.iter().filter(|recipe| is_tts_voice(recipe.id)) {
            assert!(recipe.requires.contains(&SHERPA_RUNTIME));
        }
    }
}
