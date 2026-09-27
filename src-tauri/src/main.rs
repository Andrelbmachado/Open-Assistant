// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `--mcp-rede`: servidor MCP da rede no stdin/stdout (sem janela). Ver network/mcp.rs.
    if std::env::args().any(|arg| arg == "--mcp-rede") {
        std::process::exit(open_assistant_lib::run_mcp_rede());
    }
    open_assistant_lib::run()
}
