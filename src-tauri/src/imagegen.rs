//! Geração de imagens local.
//!
//! Dois motores, como os modelos de texto usam o Ollama:
//! - **stable-diffusion.cpp** (`sd-cli.exe`, Vulkan): FLUX.1/FLUX.2, SD 1.5/SDXL/SD 3.5,
//!   Qwen-Image, Z-Image e PixArt em GGUF/safetensors. Binário pequeno, sem Python.
//! - **diffusers** (Python + PyTorch CUDA, ferramenta `py-diffusers`): Sana, Kolors, HunyuanDiT
//!   e GLM-Image, que o stable-diffusion.cpp ainda não roda.
//!
//! Cada modelo é uma receita `img-*` em Configurações › Modelos locais; arquivos usados por vários
//! modelos (VAE, codificadores de texto) ficam uma vez só em `tools/image-shared`.

use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::{
    collections::HashMap,
    fs,
    io::{BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

use super::tools;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const PROGRESS_EVENT: &str = "image-progress";
pub const SD_RUNTIME: &str = "sd-cpp-cuda";
pub const DIFFUSERS_RUNTIME: &str = "py-diffusers";
const SHARED_DIR: &str = "image-shared";

/// Um arquivo de modelo e a opção do `sd-cli` que o recebe.
pub struct ImageFile {
    pub flag: &'static str,
    pub url: &'static str,
    pub name: &'static str,
    /// Usado por outros modelos: fica em `image-shared` e não é apagado junto com um modelo só.
    pub shared: bool,
}

pub enum Engine {
    SdCpp { files: &'static [ImageFile], extra: &'static [&'static str] },
    Diffusers { repo: &'static str, variant: Option<&'static str>, bf16: bool },
}

pub struct ImageModel {
    pub id: &'static str,
    pub engine: Engine,
    pub steps: u32,
    pub cfg: f32,
    pub width: u32,
    pub height: u32,
}

macro_rules! file {
    ($flag:expr, $url:expr, $name:expr, shared) => {
        ImageFile { flag: $flag, url: $url, name: $name, shared: true }
    };
    ($flag:expr, $url:expr, $name:expr) => {
        ImageFile { flag: $flag, url: $url, name: $name, shared: false }
    };
}

// Componentes compartilhados (URLs públicas, sem login no Hugging Face).
const FLUX1_VAE: ImageFile = file!("--vae", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors", "ae.safetensors", shared);
const CLIP_L: ImageFile = file!("--clip_l", "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors", "clip_l.safetensors", shared);
const CLIP_G: ImageFile = file!("--clip_g", "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/text_encoders/clip_g.safetensors", "clip_g.safetensors", shared);
const T5XXL: ImageFile = file!("--t5xxl", "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors", "t5xxl_fp8_e4m3fn.safetensors", shared);
const FLUX2_VAE: ImageFile = file!("--vae", "https://huggingface.co/Comfy-Org/flux2-klein-4B/resolve/main/split_files/vae/flux2-vae.safetensors", "flux2-vae.safetensors", shared);
const QWEN3_4B_INSTRUCT: ImageFile = file!("--llm", "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", shared);
const QWEN3_4B: ImageFile = file!("--llm", "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf", "Qwen3-4B-Q4_K_M.gguf", shared);
const QWEN3_8B: ImageFile = file!("--llm", "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf", "Qwen3-8B-Q4_K_M.gguf", shared);
const QWEN_IMAGE_VAE: ImageFile = file!("--vae", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "qwen_image_vae.safetensors", shared);
const QWEN25_VL: ImageFile = file!("--llm", "https://huggingface.co/mradermacher/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf", "Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf", shared);
const MISTRAL_SMALL: ImageFile = file!("--llm", "https://huggingface.co/unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf", "Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf", shared);
const SDXL_VAE: ImageFile = file!("--vae", "https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors", "sdxl_vae_fp16_fix.safetensors", shared);

/// Pouca VRAM: pesos na RAM e só a parte em uso na GPU; atenção otimizada no DiT.
const OFFLOAD: &[&str] = &["--offload-to-cpu", "--diffusion-fa"];

pub const MODELS: &[ImageModel] = &[
    ImageModel {
        id: "img-z-image-turbo",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf", "z_image_turbo-Q4_K.gguf"), FLUX1_VAE, QWEN3_4B_INSTRUCT],
            extra: OFFLOAD,
        },
        steps: 8, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-flux1-schnell",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/leejet/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-q4_k.gguf", "flux1-schnell-q4_k.gguf"), FLUX1_VAE, CLIP_L, T5XXL],
            extra: &["--clip-on-cpu", "--sampling-method", "euler", "--diffusion-fa"],
        },
        steps: 4, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-flux1-dev",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/leejet/FLUX.1-dev-gguf/resolve/main/flux1-dev-q4_k.gguf", "flux1-dev-q4_k.gguf"), FLUX1_VAE, CLIP_L, T5XXL],
            extra: &["--clip-on-cpu", "--sampling-method", "euler", "--diffusion-fa"],
        },
        steps: 20, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-flux2-klein-4b",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf", "flux-2-klein-4b-Q8_0.gguf"), FLUX2_VAE, QWEN3_4B],
            extra: OFFLOAD,
        },
        steps: 4, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-flux2-klein-9b",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/leejet/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q4_0.gguf", "flux-2-klein-9b-Q4_0.gguf"), FLUX2_VAE, QWEN3_8B],
            extra: OFFLOAD,
        },
        steps: 4, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-flux2-dev",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/city96/FLUX.2-dev-gguf/resolve/main/flux2-dev-Q4_K_S.gguf", "flux2-dev-Q4_K_S.gguf"), FLUX2_VAE, MISTRAL_SMALL],
            extra: &["--offload-to-cpu", "--diffusion-fa", "--sampling-method", "euler"],
        },
        steps: 28, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-qwen-image-2512",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/unsloth/Qwen-Image-2512-GGUF/resolve/main/qwen-image-2512-Q4_K_S.gguf", "qwen-image-2512-Q4_K_S.gguf"), QWEN_IMAGE_VAE, QWEN25_VL],
            extra: &["--offload-to-cpu", "--diffusion-fa", "--sampling-method", "euler", "--flow-shift", "3"],
        },
        steps: 20, cfg: 2.5, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-sd35-large",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/resolve/main/sd3.5_large-Q4_0.gguf", "sd3.5_large-Q4_0.gguf"), CLIP_L, CLIP_G, T5XXL],
            extra: &["--clip-on-cpu", "--sampling-method", "euler"],
        },
        steps: 28, cfg: 4.5, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-sd35-large-turbo",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/resolve/main/sd3.5_large_turbo-Q4_0.gguf", "sd3.5_large_turbo-Q4_0.gguf"), CLIP_L, CLIP_G, T5XXL],
            extra: &["--clip-on-cpu", "--sampling-method", "euler"],
        },
        steps: 4, cfg: 1.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-sd35-medium",
        engine: Engine::SdCpp {
            files: &[file!("--diffusion-model", "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/resolve/main/sd3.5_medium-Q8_0.gguf", "sd3.5_medium-Q8_0.gguf"), CLIP_L, CLIP_G, T5XXL],
            extra: &["--clip-on-cpu", "--sampling-method", "euler"],
        },
        steps: 28, cfg: 4.5, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-sdxl",
        engine: Engine::SdCpp {
            files: &[file!("-m", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors", "sd_xl_base_1.0.safetensors"), SDXL_VAE],
            extra: &[],
        },
        steps: 25, cfg: 7.0, width: 1024, height: 1024,
    },
    ImageModel {
        id: "img-sd15",
        engine: Engine::SdCpp {
            files: &[file!("-m", "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors", "v1-5-pruned-emaonly.safetensors")],
            extra: &[],
        },
        steps: 25, cfg: 7.0, width: 512, height: 512,
    },
    ImageModel {
        id: "img-pixart-sigma",
        engine: Engine::SdCpp {
            files: &[
                file!("--diffusion-model", "https://huggingface.co/PixArt-alpha/PixArt-Sigma-XL-2-1024-MS/resolve/main/transformer/diffusion_pytorch_model.safetensors", "pixart_sigma_xl2_1024_ms.safetensors"),
                file!("--vae", "https://huggingface.co/PixArt-alpha/PixArt-Sigma-XL-2-1024-MS/resolve/main/vae/diffusion_pytorch_model.safetensors", "pixart_sigma_vae.safetensors"),
                T5XXL,
            ],
            extra: &[],
        },
        steps: 20, cfg: 4.5, width: 1024, height: 1024,
    },
    ImageModel { id: "img-sana-1.5", engine: Engine::Diffusers { repo: "Efficient-Large-Model/SANA1.5_1.6B_1024px_diffusers", variant: None, bf16: true }, steps: 20, cfg: 4.5, width: 1024, height: 1024 },
    ImageModel { id: "img-kolors", engine: Engine::Diffusers { repo: "Kwai-Kolors/Kolors-diffusers", variant: Some("fp16"), bf16: false }, steps: 25, cfg: 5.0, width: 1024, height: 1024 },
    ImageModel { id: "img-hunyuandit", engine: Engine::Diffusers { repo: "Tencent-Hunyuan/HunyuanDiT-v1.2-Diffusers", variant: None, bf16: false }, steps: 25, cfg: 5.0, width: 1024, height: 1024 },
    ImageModel { id: "img-glm-image", engine: Engine::Diffusers { repo: "zai-org/GLM-Image", variant: None, bf16: true }, steps: 30, cfg: 1.5, width: 1024, height: 1024 },
];

pub fn model(id: &str) -> Option<&'static ImageModel> {
    MODELS.iter().find(|model| model.id == id)
}

fn shared_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(tools::tools_root(app)?.join(SHARED_DIR))
}

fn file_path(app: &AppHandle, model: &ImageModel, file: &ImageFile) -> Result<PathBuf, String> {
    Ok(if file.shared { shared_dir(app)?.join(file.name) } else { tools::tool_dir(app, model.id)?.join(file.name) })
}

// ---------------------------------------------------------------- instalação

/// Baixa os arquivos do modelo (os compartilhados só se ainda não existirem).
pub fn install(app: &AppHandle, progress_id: &str, model: &ImageModel, cancel: &std::sync::atomic::AtomicBool) -> Result<(), String> {
    // Motor Vulkan das primeiras versões (substituído pelo CUDA): não serve mais.
    if let Ok(old) = tools::tool_dir(app, "sd-cpp") {
        let _ = fs::remove_dir_all(old);
    }
    match &model.engine {
        Engine::SdCpp { files, .. } => {
            for (index, file) in files.iter().enumerate() {
                let target = file_path(app, model, file)?;
                if target.is_file() {
                    continue;
                }
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let phase = format!("Baixando {} de {} · {}", index + 1, files.len(), file.name);
                tools::download_file(app, progress_id, &phase, file.url, &target, cancel)?;
            }
            Ok(())
        }
        Engine::Diffusers { repo, .. } => {
            let python = diffusers_python(app)?;
            let target = tools::tool_dir(app, model.id)?.join("model");
            let script = tools::tool_dir(app, DIFFUSERS_RUNTIME)?.join("download_model.py");
            fs::write(&script, DOWNLOAD_SCRIPT).map_err(|error| error.to_string())?;
            let mut command = Command::new(python);
            command.arg(&script).arg(repo).arg(&target).env("HF_HUB_DISABLE_TELEMETRY", "1").env("PYTHONIOENCODING", "utf-8");
            tools::run_with_folder_progress(app, progress_id, "Baixando o modelo do Hugging Face", command, &target, expected_bytes(model), cancel)
        }
    }
}

/// Tamanho aproximado do download de um modelo diffusers (para a barra de progresso).
fn expected_bytes(model: &ImageModel) -> Option<u64> {
    let gb = match model.id {
        "img-sana-1.5" => 9.7,
        "img-kolors" => 17.8,
        "img-hunyuandit" => 14.4,
        "img-glm-image" => 35.8,
        _ => return None,
    };
    Some((gb * 1e9) as u64)
}

/// Depois de remover um modelo, apaga os arquivos compartilhados que nenhum modelo instalado usa.
pub fn prune_shared(app: &AppHandle) {
    let Ok(dir) = shared_dir(app) else { return };
    let Ok(entries) = fs::read_dir(&dir) else { return };
    let in_use: Vec<&str> = MODELS
        .iter()
        .filter(|model| tools::is_installed(app, model.id))
        .flat_map(|model| match &model.engine {
            Engine::SdCpp { files, .. } => files.iter().filter(|file| file.shared).map(|file| file.name).collect::<Vec<_>>(),
            Engine::Diffusers { .. } => Vec::new(),
        })
        .collect();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !in_use.contains(&name.as_str()) && !name.ends_with(".part") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

const DOWNLOAD_SCRIPT: &str = r#"
import sys
from huggingface_hub import snapshot_download
repo, target = sys.argv[1], sys.argv[2]
snapshot_download(repo, local_dir=target, ignore_patterns=["imgs/*", "*.md", "*.bin", "*.pt", "*.ckpt", "*.msgpack", "*.onnx", "*.h5"])
print("OK", flush=True)
"#;

const GENERATE_SCRIPT: &str = r#"
import json, sys, torch
from diffusers import DiffusionPipeline
args = json.loads(open(sys.argv[1], encoding="utf-8").read())
dtype = torch.bfloat16 if args.get("bf16") else torch.float16
print("PHASE Carregando o modelo", flush=True)
kwargs = {"torch_dtype": dtype}
if args.get("variant"):
    kwargs["variant"] = args["variant"]
pipe = DiffusionPipeline.from_pretrained(args["model_dir"], **kwargs)
pipe.enable_model_cpu_offload()
total = args["steps"]
def on_step(pipe, index, timestep, values):
    print(f"STEP {index + 1}/{total}", flush=True)
    return values
generator = torch.Generator("cpu").manual_seed(args["seed"])
call = dict(prompt=args["prompt"], num_inference_steps=total, guidance_scale=args["cfg"], width=args["width"], height=args["height"], generator=generator)
if args.get("negative"):
    call["negative_prompt"] = args["negative"]
print("PHASE Gerando", flush=True)
try:
    image = pipe(**call, callback_on_step_end=on_step).images[0]
except TypeError:
    image = pipe(**call).images[0]
image.save(args["output"])
print("DONE", flush=True)
"#;

fn diffusers_python(app: &AppHandle) -> Result<PathBuf, String> {
    let python = tools::tool_dir(app, DIFFUSERS_RUNTIME)?.join("venv").join("Scripts").join("python.exe");
    python.is_file().then_some(python).ok_or_else(|| "Instale o motor Python de imagens (diffusers) primeiro.".into())
}

fn sd_cli(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = tools::tool_dir(app, SD_RUNTIME)?;
    tools::find_file(&dir, &|name| name == "sd-cli.exe" || name == "sd.exe")
        .ok_or_else(|| "O motor de imagens (stable-diffusion.cpp) não está instalado.".into())
}

// ---------------------------------------------------------------- geração

#[derive(Default)]
pub struct ImageState {
    /// Processos de geração em andamento (para cancelar).
    jobs: Mutex<HashMap<String, u32>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRequest {
    request_id: String,
    model_id: String,
    prompt: String,
    negative_prompt: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    steps: Option<u32>,
    seed: Option<i64>,
    /// Foto de partida para editar com IA (img2img): a imagem nova segue o prompt mantendo a composição.
    #[serde(default)]
    init_image: Option<String>,
    /// Quanto mudar a foto: 0,1 = quase igual; 0,9 = quase tudo novo.
    #[serde(default)]
    strength: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResult {
    path: String,
    seed: i64,
    width: u32,
    height: u32,
    elapsed_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageProgress {
    request_id: String,
    phase: String,
    step: Option<u32>,
    total: Option<u32>,
}

/// Pasta onde as imagens geradas ficam: Imagens\Open Assistant.
pub fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().picture_dir().or_else(|_| app.path().app_local_data_dir()).map_err(|error| error.to_string())?;
    let dir = base.join("Open Assistant");
    fs::create_dir_all(&dir).map_err(|error| format!("Não foi possível criar {}: {error}", dir.display()))?;
    Ok(dir)
}

/// `| 3/8 - 1.52s/it` → (3, 8). A barra de carregamento dos pesos (`452/452 - 700MB/s`) não conta.
pub fn parse_step(line: &str) -> Option<(u32, u32)> {
    let re = regex::Regex::new(r"\|\s*(\d+)/(\d+)\s*-\s*[\d.]+\s*(?:s/it|it/s)").ok()?;
    let captures = re.captures(line)?;
    Some((captures[1].parse().ok()?, captures[2].parse().ok()?))
}

fn emit(app: &AppHandle, request_id: &str, phase: &str, step: Option<(u32, u32)>) {
    let _ = app.emit(PROGRESS_EVENT, ImageProgress { request_id: request_id.into(), phase: phase.into(), step: step.map(|value| value.0), total: step.map(|value| value.1) });
}

fn build_command(app: &AppHandle, model: &ImageModel, request: &ImageRequest, output: &Path, seed: i64, steps: u32, width: u32, height: u32) -> Result<(Command, Option<PathBuf>), String> {
    match &model.engine {
        Engine::SdCpp { files, extra } => {
            let mut command = Command::new(sd_cli(app)?);
            for file in *files {
                let path = file_path(app, model, file)?;
                if !path.is_file() {
                    return Err(format!("Falta o arquivo {} do modelo; baixe o modelo de novo em Configurações.", file.name));
                }
                command.arg(file.flag).arg(path);
            }
            command
                .args(["-p", &request.prompt])
                .args(["--steps", &steps.to_string(), "--cfg-scale", &model.cfg.to_string()])
                .args(["-W", &width.to_string(), "-H", &height.to_string(), "-s", &seed.to_string()])
                .arg("-o")
                .arg(output)
                .args(extra.iter());
            if let Some(negative) = request.negative_prompt.as_deref().filter(|value| !value.trim().is_empty()) {
                command.args(["-n", negative]);
            }
            if let Some(init) = request.init_image.as_deref().filter(|value| !value.trim().is_empty()) {
                if !Path::new(init).is_file() {
                    return Err(format!("A foto {init} não existe."));
                }
                command.args(["-i", init, "--strength", &request.strength.unwrap_or(0.55).clamp(0.05, 0.95).to_string()]);
            }
            Ok((command, None))
        }
        Engine::Diffusers { .. } if request.init_image.is_some() => {
            Err("Editar foto com IA usa os modelos do motor stable-diffusion.cpp (Z-Image, FLUX, SD). Escolha um deles.".into())
        }
        Engine::Diffusers { variant, bf16, .. } => {
            let python = diffusers_python(app)?;
            let runtime = tools::tool_dir(app, DIFFUSERS_RUNTIME)?;
            let script = runtime.join("generate_image.py");
            fs::write(&script, GENERATE_SCRIPT).map_err(|error| error.to_string())?;
            let args_file = std::env::temp_dir().join(format!("oa-image-{}.json", request.request_id));
            let args = serde_json::json!({
                "model_dir": tools::tool_dir(app, model.id)?.join("model"),
                "prompt": request.prompt, "negative": request.negative_prompt, "steps": steps, "cfg": model.cfg,
                "width": width, "height": height, "seed": seed, "output": output, "variant": variant, "bf16": bf16,
            });
            fs::write(&args_file, args.to_string()).map_err(|error| error.to_string())?;
            let mut command = Command::new(python);
            command.arg(script).arg(&args_file).env("PYTHONIOENCODING", "utf-8").env("HF_HUB_OFFLINE", "1");
            Ok((command, Some(args_file)))
        }
    }
}

/// Tira da VRAM os modelos de texto que o Ollama deixou carregados: imagem e texto não cabem juntos.
/// Devolve os nomes que saíram.
pub fn unload_ollama_models() -> Vec<String> {
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(10)).build();
    let Ok(response) = agent.get("http://127.0.0.1:11434/api/ps").call() else { return Vec::new() };
    let Ok(body) = response.into_json::<serde_json::Value>() else { return Vec::new() };
    let mut names = Vec::new();
    for model in body.get("models").and_then(|models| models.as_array()).into_iter().flatten() {
        if let Some(name) = model.get("name").and_then(|name| name.as_str()) {
            let _ = agent.post("http://127.0.0.1:11434/api/generate").send_json(serde_json::json!({ "model": name, "keep_alive": 0 }));
            names.push(name.to_string());
        }
    }
    names
}

/// Últimas linhas úteis do log (sem barras de progresso nem códigos de cor do terminal).
fn clean_tail(lines: &[String]) -> String {
    let ansi = regex::Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").expect("regex");
    lines
        .iter()
        .map(|line| ansi.replace_all(line, "").to_string())
        .filter(|line| !line.trim_start().starts_with('|'))
        .collect::<Vec<_>>()
        .join("\n")
}

fn run_generation(app: &AppHandle, request: ImageRequest) -> Result<ImageResult, String> {
    let model = model(&request.model_id).ok_or_else(|| format!("Modelo de imagem desconhecido: {}", request.model_id))?;
    if !tools::is_installed(app, model.id) {
        return Err("Este modelo de imagem ainda não foi baixado. Baixe em Configurações › Modelos locais › Modelos de imagem.".into());
    }
    let started = Instant::now();
    let seed = request.seed.unwrap_or_else(|| (SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0) % 2_147_483_647) as i64);
    // Editando uma foto: o tamanho segue a foto (lado maior até 1024, múltiplos de 64).
    let photo = request.init_image.as_deref().and_then(|path| image::image_dimensions(path).ok()).map(|(w, h)| {
        let scale = (1024.0 / w.max(h) as f64).min(1.0);
        ((w as f64 * scale) as u32, (h as f64 * scale) as u32)
    });
    let (base_width, base_height) = photo.unwrap_or((request.width.unwrap_or(model.width), request.height.unwrap_or(model.height)));
    let (width, height) = (base_width.clamp(256, 2048) / 64 * 64, base_height.clamp(256, 2048) / 64 * 64);
    let steps = request.steps.unwrap_or(model.steps).clamp(1, 80);
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let output = images_dir(app)?.join(format!("{stamp}-{}.png", model.id.trim_start_matches("img-")));
    emit(app, &request.request_id, "Liberando memória", None);
    crate::resources::free_for(app, "imagem");
    // 1ª tentativa normal; se faltar memória, tenta de novo no modo econômico (menos VRAM/RAM de uma vez).
    let mut last_error = String::new();
    for attempt in 0..2 {
        let economic = attempt == 1;
        let (mut command, cleanup) = build_command(app, model, &request, &output, seed, steps, width, height)?;
        if economic {
            if !matches!(model.engine, Engine::SdCpp { .. }) {
                break;
            }
            emit(app, &request.request_id, "Faltou memória — tentando no modo econômico", None);
            crate::logs::warn("imagem", &format!("{}: sem memória na 1ª tentativa, repetindo no modo econômico", model.id));
            crate::resources::free_for(app, "imagem");
            let has = |flag: &str| match &model.engine { Engine::SdCpp { extra, .. } => extra.contains(&flag), _ => false };
            for flag in ["--offload-to-cpu", "--vae-tiling", "--clip-on-cpu", "--diffusion-fa"] {
                if !has(flag) {
                    command.arg(flag);
                }
            }
        } else {
            emit(app, &request.request_id, "Carregando o modelo", None);
        }
        match run_process(app, &request, command, &output) {
            Ok(()) => {
                if let Some(file) = cleanup {
                    let _ = fs::remove_file(file);
                }
                return Ok(ImageResult { path: output.to_string_lossy().to_string(), seed, width, height, elapsed_ms: started.elapsed().as_millis() as u64 });
            }
            Err(failure) => {
                if let Some(file) = cleanup {
                    let _ = fs::remove_file(file);
                }
                let out_of_memory = failure.to_lowercase().contains("out of memory") || failure.to_lowercase().contains("alloc");
                last_error = failure;
                if last_error == "Geração cancelada." || !out_of_memory {
                    break;
                }
                if economic {
                    last_error = format!("{}\n\n{}", crate::resources::explain_out_of_memory(), last_error);
                }
            }
        }
    }
    if last_error != "Geração cancelada." {
        crate::logs::error("imagem", &format!("{} ({width}x{height}): {last_error}", model.id));
    }
    Err(last_error)
}

/// Roda o gerador uma vez, repassando o progresso. `Err` traz a mensagem pronta para a pessoa.
fn run_process(app: &AppHandle, request: &ImageRequest, mut command: Command, output: &Path) -> Result<(), String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Não foi possível iniciar o gerador de imagens: {error}"))?;
    if let Ok(mut jobs) = app.state::<ImageState>().jobs.lock() {
        jobs.insert(request.request_id.clone(), child.id());
    }
    let tail: std::sync::Arc<Mutex<Vec<String>>> = Default::default();
    let mut readers = Vec::new();
    let streams: Vec<Box<dyn Read + Send>> = vec![Box::new(child.stdout.take().expect("stdout")), Box::new(child.stderr.take().expect("stderr"))];
    for stream in streams {
        let (app, request_id, tail) = (app.clone(), request.request_id.clone(), tail.clone());
        readers.push(std::thread::spawn(move || {
            // O stable-diffusion.cpp redesenha a barra com \r: cada \r ou \n fecha uma linha.
            let mut reader = BufReader::new(stream);
            let mut line = Vec::new();
            let mut byte = [0u8; 1];
            let mut phase = String::from("Carregando o modelo");
            while reader.read(&mut byte).unwrap_or(0) == 1 {
                if byte[0] != b'\r' && byte[0] != b'\n' {
                    line.push(byte[0]);
                    continue;
                }
                let text = String::from_utf8_lossy(&line).trim().to_string();
                line.clear();
                if text.is_empty() {
                    continue;
                }
                let lower = text.to_lowercase();
                let step = parse_step(&text).or_else(|| text.strip_prefix("STEP ").and_then(|rest| {
                    let (a, b) = rest.split_once('/')?;
                    Some((a.trim().parse().ok()?, b.trim().parse().ok()?))
                }));
                if let Some(rest) = text.strip_prefix("PHASE ") {
                    phase = rest.to_string();
                } else if lower.contains("loading tensors") || lower.contains("mb/s") {
                    phase = "Carregando o modelo".into();
                } else if lower.contains("sampling") || step.is_some() {
                    phase = "Gerando".into();
                } else if lower.contains("decod") {
                    phase = "Finalizando".into();
                }
                emit(&app, &request_id, &phase, step);
                if let Ok(mut tail) = tail.lock() {
                    tail.push(text);
                    if tail.len() > 12 {
                        tail.remove(0);
                    }
                }
            }
        }));
    }
    let status = child.wait().map_err(|error| error.to_string());
    for reader in readers {
        let _ = reader.join();
    }
    let cancelled = app.state::<ImageState>().jobs.lock().map(|mut jobs| jobs.remove(&request.request_id).is_none()).unwrap_or(false);
    if cancelled {
        let _ = fs::remove_file(output);
        return Err("Geração cancelada.".into());
    }
    let status = status?;
    if !status.success() || !output.is_file() {
        let tail = tail.lock().map(|lines| clean_tail(&lines)).unwrap_or_default();
        let hint = if tail.to_lowercase().contains("out of memory") || tail.to_lowercase().contains("alloc") {
            "\nFaltou memória de vídeo/RAM (out of memory)."
        } else {
            ""
        };
        return Err(format!("O gerador de imagens falhou ({status}).{hint}\n{tail}"));
    }
    Ok(())
}

/// Gera uma imagem; o progresso sai pelo evento `image-progress`.
#[tauri::command]
pub async fn image_generate(app: AppHandle, request: ImageRequest) -> Result<ImageResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_generation(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

/// Cancela uma geração (encerra o processo e os filhos).
#[tauri::command]
pub fn image_cancel(state: State<ImageState>, request_id: String) -> Result<(), String> {
    let pid = state.jobs.lock().map_err(|_| "estado indisponível")?.remove(&request_id);
    if let Some(pid) = pid {
        let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).creation_flags(CREATE_NO_WINDOW).status();
    }
    Ok(())
}

/// Lê uma imagem gerada (só da pasta de imagens do app).
#[tauri::command]
pub fn image_read(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let dir = images_dir(&app)?.canonicalize().map_err(|error| error.to_string())?;
    let file = PathBuf::from(&path).canonicalize().map_err(|_| "Imagem não encontrada (foi apagada ou movida).".to_string())?;
    if !file.starts_with(&dir) {
        return Err("Só é possível abrir imagens geradas pelo app.".into());
    }
    fs::read(&file).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
}

/// Mostra a imagem no Explorador de Arquivos.
#[tauri::command]
pub fn image_reveal(app: AppHandle, path: String) -> Result<(), String> {
    let dir = images_dir(&app)?;
    let file = PathBuf::from(&path);
    if !file.starts_with(&dir) {
        return Err("Só é possível abrir imagens geradas pelo app.".into());
    }
    Command::new("explorer.exe").arg(format!("/select,{}", file.display())).spawn().map(|_| ()).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HF: &str = "https://huggingface.co";

    #[test]
    fn parses_the_sd_cpp_progress_bar() {
        assert_eq!(parse_step("  |==========>                     | 3/8 - 1.52s/it"), Some((3, 8)));
        assert_eq!(parse_step("loading model"), None);
        assert_eq!(parse_step("|##########| 452/452 - 724.86MB/s"), None);
        assert_eq!(parse_step("  |=====>   | 6/8 - 1.25s/it\x1b[K"), Some((6, 8)));
    }

    #[test]
    fn every_image_model_has_a_recipe_and_public_https_files() {
        for model in MODELS {
            assert!(tools::recipe(model.id).is_some(), "{} sem receita", model.id);
            if let Engine::SdCpp { files, .. } = &model.engine {
                assert!(files.iter().any(|file| file.flag == "--diffusion-model" || file.flag == "-m"), "{} sem pesos principais", model.id);
                for file in *files {
                    assert!(file.url.starts_with(HF), "{}", file.url);
                    assert!(!file.url.contains("black-forest-labs") && !file.url.contains("/stabilityai/stable-diffusion-3"), "repositório com login: {}", file.url);
                }
            }
        }
    }

    #[test]
    fn shared_files_with_the_same_name_are_identical() {
        let mut seen: HashMap<&str, &str> = HashMap::new();
        for model in MODELS {
            if let Engine::SdCpp { files, .. } = &model.engine {
                for file in files.iter().filter(|file| file.shared) {
                    if let Some(url) = seen.insert(file.name, file.url) {
                        assert_eq!(url, file.url, "{}", file.name);
                    }
                }
            }
        }
    }
}
