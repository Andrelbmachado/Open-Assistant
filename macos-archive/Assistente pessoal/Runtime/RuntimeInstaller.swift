import Foundation

struct RuntimeInstallPlan: Identifiable, Hashable {
    var id = UUID()
    var mode: RuntimeInstallMode
    var summary: String
    var commands: [RuntimeShellCommand]
    var warnings: [String]
    var createdAt: Date = Date()
}

struct RuntimeInstaller {
    func command(for action: RuntimeAction, settings: AppSettings.LocalRuntime) -> RuntimeShellCommand? {
        switch action {
        case .installOllama:
            return RuntimeShellCommand(
                action: action,
                component: .ollama,
                executable: "/bin/zsh",
                arguments: [
                    "-lc",
                    """
                    set -e
                    installer="$(mktemp -t openassistant-ollama.XXXXXX.sh)"
                    curl -fsSL https://ollama.com/install.sh -o "$installer"
                    chmod +x "$installer"
                    /bin/sh "$installer"
                    rm -f "$installer"
                    """
                ],
                requiresApproval: true,
                sourceURL: URL(string: "https://ollama.com/install.sh"),
                impact: "Baixa e executa o instalador oficial do Ollama no usuario atual."
            )
        case .startOllama:
            return RuntimeShellCommand(
                action: action,
                component: .ollama,
                executable: "/bin/zsh",
                arguments: [
                    "-lc",
                    "/usr/bin/open -a Ollama || (nohup ollama serve >/tmp/open-assistant-ollama.log 2>&1 &)"
                ],
                requiresApproval: false,
                sourceURL: nil,
                impact: "Inicia o app Ollama ou o servidor local em segundo plano."
            )
        case .pullDefaultModel:
            return RuntimeShellCommand(
                action: action,
                component: .ollama,
                executable: "/bin/zsh",
                arguments: [
                    "-lc",
                    "ollama pull \(RuntimeShellCommand.shellQuoted(settings.defaultLocalModelTag))"
                ],
                requiresApproval: true,
                sourceURL: nil,
                impact: "Baixa o modelo \(settings.defaultLocalModelTag), que pode consumir varios GB."
            )
        case .installOpenClaw:
            return RuntimeShellCommand(
                action: action,
                component: .openClaw,
                executable: "/bin/zsh",
                arguments: [
                    "-lc",
                    """
                    set -e
                    installer="$(mktemp -t openassistant-openclaw.XXXXXX.sh)"
                    curl -fsSL https://openclaw.ai/install.sh -o "$installer"
                    chmod +x "$installer"
                    /bin/bash "$installer"
                    rm -f "$installer"
                    """
                ],
                requiresApproval: true,
                sourceURL: URL(string: "https://openclaw.ai/install.sh"),
                impact: "Baixa e executa o instalador oficial do OpenClaw."
            )
        case .configureOpenClawWithOllama:
            return RuntimeShellCommand(
                action: action,
                component: .openClaw,
                executable: "/bin/zsh",
                arguments: [
                    "-lc",
                    [
                        "openclaw onboard",
                        "--non-interactive",
                        "--accept-risk",
                        "--mode local",
                        "--auth-choice ollama",
                        "--custom-model-id \(RuntimeShellCommand.shellQuoted(settings.defaultLocalModelTag))",
                        "--gateway-bind loopback",
                        "--gateway-port \(settings.openClawPort)",
                        "--install-daemon",
                        "--json"
                    ].joined(separator: " ")
                ],
                requiresApproval: true,
                sourceURL: nil,
                impact: "Escreve configuracao do OpenClaw em modo local, usando Ollama como provider e Gateway em loopback."
            )
        case .startOpenClawGateway:
            return RuntimeShellCommand(
                action: action,
                component: .openClaw,
                executable: "/bin/zsh",
                arguments: ["-lc", "openclaw gateway start || openclaw gateway restart"],
                requiresApproval: false,
                sourceURL: nil,
                impact: "Inicia ou reinicia o Gateway local do OpenClaw."
            )
        default:
            return nil
        }
    }

    func commands(for mode: RuntimeInstallMode, settings: AppSettings.LocalRuntime) -> [RuntimeShellCommand] {
        let actions: [RuntimeAction]
        switch mode {
        case .full, .repair:
            actions = [.installOllama, .startOllama, .pullDefaultModel, .installOpenClaw, .configureOpenClawWithOllama, .startOpenClawGateway]
        case .ollamaOnly:
            actions = [.installOllama, .startOllama, .pullDefaultModel]
        case .openClawOnly:
            actions = [.installOpenClaw, .configureOpenClawWithOllama, .startOpenClawGateway]
        }
        return actions.compactMap { command(for: $0, settings: settings) }
    }
}

struct RuntimePermissionBroker {
    func makePlan(mode: RuntimeInstallMode, settings: AppSettings.LocalRuntime, statuses: [RuntimeComponent: RuntimeStatus]) -> RuntimeInstallPlan {
        let installer = RuntimeInstaller()
        let commands = installer.commands(for: mode, settings: settings)
        var warnings: [String] = [
            "Nenhum comando com sudo sera executado automaticamente.",
            "Downloads oficiais sao mostrados antes da execucao.",
            "O Gateway do OpenClaw sera configurado em loopback na porta \(settings.openClawPort)."
        ]

        if statuses[.ollama]?.state == .running, mode == .full || mode == .ollamaOnly {
            warnings.append("Ollama parece estar rodando; o node de instalacao pode ser pulado.")
        }
        if statuses[.openClaw]?.state == .running, mode == .full || mode == .openClawOnly {
            warnings.append("OpenClaw Gateway parece estar rodando; instalacao pode virar reparo/verificacao.")
        }

        return RuntimeInstallPlan(
            mode: mode,
            summary: "O System Setup Agent vai preparar \(mode.title) com comandos visiveis, logs e workflow auditavel.",
            commands: commands,
            warnings: warnings
        )
    }
}
