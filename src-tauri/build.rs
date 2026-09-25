fn main() {
    // A runtime de voz (sherpa-onnx + ONNX Runtime) não vem junto do executável: o usuário
    // baixa em Configurações › Voz. Com /DELAYLOAD o Windows só procura as DLLs na primeira
    // chamada, e o app as carrega antes pelo caminho completo (ver `speech::ensure_runtime`).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-arg=/DELAYLOAD:sherpa-onnx-c-api.dll");
        println!("cargo:rustc-link-arg=/DELAYLOAD:onnxruntime.dll");
        println!("cargo:rustc-link-lib=delayimp");
    }
    tauri_build::build()
}
