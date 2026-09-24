import Foundation

struct RuntimeNodeUpdate {
    var action: RuntimeAction
    var status: NodeStatus
    var progress: Double?
    var lastLogLine: String?
    var commandPreview: String?
    var startedAt: Date?
    var finishedAt: Date?
}

final class LocalRuntimeManager {
    let statusService: RuntimeStatusProviding
    let installer: RuntimeInstaller
    let permissionBroker: RuntimePermissionBroker
    let workflowFactory: RuntimeWorkflowTemplateFactory
    let workflowRunner: InstallerWorkflowRunner

    init(
        statusService: RuntimeStatusProviding = RuntimeStatusService(),
        installer: RuntimeInstaller = RuntimeInstaller(),
        processRunner: RuntimeProcessRunning = RuntimeProcessRunner(),
        stateStore: RuntimeStateStore = RuntimeStateStore()
    ) {
        self.statusService = statusService
        self.installer = installer
        self.permissionBroker = RuntimePermissionBroker()
        self.workflowFactory = RuntimeWorkflowTemplateFactory()
        self.workflowRunner = InstallerWorkflowRunner(
            statusService: statusService,
            installer: installer,
            processRunner: processRunner,
            stateStore: stateStore
        )
    }

    func refreshStatuses(settings: AppSettings.LocalRuntime) async -> [RuntimeComponent: RuntimeStatus] {
        await statusService.checkAll(settings: settings)
    }

    func makeInstallPlan(mode: RuntimeInstallMode, settings: AppSettings.LocalRuntime, statuses: [RuntimeComponent: RuntimeStatus]) -> RuntimeInstallPlan {
        permissionBroker.makePlan(mode: mode, settings: settings, statuses: statuses)
    }

    func makeInstallWorkflow(settings: AppSettings.LocalRuntime, mode: RuntimeInstallMode) -> Workflow {
        workflowFactory.makeInstallWorkflow(settings: settings, mode: mode)
    }
}

final class InstallerWorkflowRunner {
    private let statusService: RuntimeStatusProviding
    private let installer: RuntimeInstaller
    private let processRunner: RuntimeProcessRunning
    private let stateStore: RuntimeStateStore

    init(
        statusService: RuntimeStatusProviding,
        installer: RuntimeInstaller,
        processRunner: RuntimeProcessRunning,
        stateStore: RuntimeStateStore
    ) {
        self.statusService = statusService
        self.installer = installer
        self.processRunner = processRunner
        self.stateStore = stateStore
    }

    func run(
        plan: RuntimeInstallPlan,
        settings: AppSettings.LocalRuntime,
        initialStatuses: [RuntimeComponent: RuntimeStatus],
        onLog: @escaping (RuntimeLogEntry) -> Void,
        onNodeUpdate: @escaping (RuntimeNodeUpdate) -> Void,
        onRegisterMCPBridge: @escaping () -> Void
    ) async -> [RuntimeComponent: RuntimeStatus] {
        var statuses = initialStatuses

        for action in RuntimeWorkflowTemplateFactory.mainInstallActions {
            guard shouldVisit(action, mode: plan.mode) else {
                onNodeUpdate(RuntimeNodeUpdate(action: action, status: .skipped, progress: 1, lastLogLine: "Fora do escopo de \(plan.mode.title).", commandPreview: nil, startedAt: nil, finishedAt: Date()))
                continue
            }

            onNodeUpdate(RuntimeNodeUpdate(action: action, status: .running, progress: 0.08, lastLogLine: action.description, commandPreview: installer.command(for: action, settings: settings)?.displayCommand, startedAt: Date(), finishedAt: nil))
            appendLog(action: action, level: .info, message: action.description, onLog: onLog)

            let outcome = await perform(action: action, plan: plan, settings: settings, statuses: &statuses, onLog: onLog, onNodeUpdate: onNodeUpdate, onRegisterMCPBridge: onRegisterMCPBridge)

            switch outcome {
            case .success(let message):
                onNodeUpdate(RuntimeNodeUpdate(action: action, status: .success, progress: 1, lastLogLine: message, commandPreview: installer.command(for: action, settings: settings)?.displayCommand, startedAt: nil, finishedAt: Date()))
                appendLog(action: action, level: .success, message: message, onLog: onLog)
            case .warning(let message):
                onNodeUpdate(RuntimeNodeUpdate(action: action, status: .warning, progress: 1, lastLogLine: message, commandPreview: installer.command(for: action, settings: settings)?.displayCommand, startedAt: nil, finishedAt: Date()))
                appendLog(action: action, level: .warning, message: message, onLog: onLog)
            case .skipped(let message):
                onNodeUpdate(RuntimeNodeUpdate(action: action, status: .skipped, progress: 1, lastLogLine: message, commandPreview: installer.command(for: action, settings: settings)?.displayCommand, startedAt: nil, finishedAt: Date()))
                appendLog(action: action, level: .info, message: message, onLog: onLog)
            case .failure(let message, let recoverableAction):
                onNodeUpdate(RuntimeNodeUpdate(action: action, status: .error, progress: 1, lastLogLine: message, commandPreview: installer.command(for: action, settings: settings)?.displayCommand, startedAt: nil, finishedAt: Date()))
                appendLog(action: action, level: .error, message: message, onLog: onLog)
                if let recoverableAction {
                    onNodeUpdate(RuntimeNodeUpdate(action: recoverableAction, status: .warning, progress: 1, lastLogLine: message, commandPreview: nil, startedAt: Date(), finishedAt: Date()))
                }
                return statuses
            }
        }

        return statuses
    }

    private enum StepOutcome {
        case success(String)
        case warning(String)
        case skipped(String)
        case failure(String, RuntimeAction?)
    }

    private func shouldVisit(_ action: RuntimeAction, mode: RuntimeInstallMode) -> Bool {
        switch mode {
        case .full, .repair:
            return true
        case .ollamaOnly:
            return [
                .start, .detectOS, .checkArchitecture, .checkDiskSpace, .checkNetwork,
                .checkExistingOllama, .installOllama, .startOllama, .verifyOllamaAPI,
                .pullDefaultModel, .registerRuntimeState, .healthCheck, .finish
            ].contains(action)
        case .openClawOnly:
            return [
                .start, .detectOS, .checkArchitecture, .checkDiskSpace, .checkNetwork,
                .checkExistingOllama, .startOllama, .verifyOllamaAPI, .checkNodeJS,
                .checkExistingOpenClaw, .installOpenClaw, .configureOpenClawWithOllama,
                .startOpenClawGateway, .verifyGateway, .createMCPBridge,
                .registerRuntimeState, .healthCheck, .finish
            ].contains(action)
        }
    }

    private func perform(
        action: RuntimeAction,
        plan: RuntimeInstallPlan,
        settings: AppSettings.LocalRuntime,
        statuses: inout [RuntimeComponent: RuntimeStatus],
        onLog: @escaping (RuntimeLogEntry) -> Void,
        onNodeUpdate: @escaping (RuntimeNodeUpdate) -> Void,
        onRegisterMCPBridge: @escaping () -> Void
    ) async -> StepOutcome {
        switch action {
        case .start:
            return .success("System Setup Agent inicializado.")
        case .detectOS:
            #if os(macOS)
            return .success("macOS detectado.")
            #else
            return .failure("Runtime local automatico esta habilitado apenas no macOS neste MVP.", nil)
            #endif
        case .checkArchitecture:
            #if arch(arm64)
            return .success("Arquitetura Apple Silicon detectada.")
            #elseif arch(x86_64)
            return .success("Arquitetura Intel x86_64 detectada.")
            #else
            return .warning("Arquitetura nao reconhecida; prosseguindo com comandos oficiais.")
            #endif
        case .checkDiskSpace:
            return checkDiskSpace()
        case .checkNetwork:
            return await statusService.checkNetwork()
                ? .success("Internet disponivel para downloads oficiais.")
                : .failure("Sem acesso de rede para baixar Ollama/OpenClaw.", nil)
        case .checkExistingOllama:
            statuses = await statusService.checkAll(settings: settings)
            let state = statuses[.ollama]?.state ?? .notInstalled
            return state == .notInstalled ? .success("Ollama nao encontrado; instalacao sera necessaria.") : .success("Ollama detectado: \(state.title).")
        case .installOllama:
            if (statuses[.ollama]?.state ?? .notInstalled) != .notInstalled, plan.mode != .repair {
                return .skipped("Ollama ja esta instalado; node pulado.")
            }
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .startOllama:
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .verifyOllamaAPI:
            statuses = await statusService.checkAll(settings: settings)
            if statuses[.ollama]?.state == .running {
                return .success("Ollama API respondeu em localhost:\(settings.ollamaPort).")
            }
            if let owner = statusService.portOwner(port: settings.ollamaPort) {
                return .failure("Porta \(settings.ollamaPort) ocupada ou API indisponivel: \(owner)", .portBusy)
            }
            return .failure("Ollama API nao respondeu em localhost:\(settings.ollamaPort).", .ollamaAPIError)
        case .pullDefaultModel:
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .checkNodeJS:
            let node = statusService.checkNodeJS()
            if node.compatible {
                return .success("Node.js \(node.version ?? "") compativel detectado.")
            }
            if node.installed {
                return .failure("Node.js \(node.version ?? "desconhecido") detectado, mas OpenClaw requer 22.19+, 23.11+ ou 24+.", .missingNode)
            }
            return .failure("Node.js nao encontrado. Instale Node.js 24 antes do OpenClaw.", .missingNode)
        case .checkExistingOpenClaw:
            statuses = await statusService.checkAll(settings: settings)
            let state = statuses[.openClaw]?.state ?? .notInstalled
            return state == .notInstalled ? .success("OpenClaw nao encontrado; instalacao sera necessaria.") : .success("OpenClaw detectado: \(state.title).")
        case .installOpenClaw:
            if (statuses[.openClaw]?.state ?? .notInstalled) != .notInstalled, plan.mode != .repair {
                return .skipped("OpenClaw ja esta instalado; node pulado.")
            }
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .configureOpenClawWithOllama:
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .startOpenClawGateway:
            return await runCommand(action: action, settings: settings, onLog: onLog, onNodeUpdate: onNodeUpdate)
        case .verifyGateway:
            statuses = await statusService.checkAll(settings: settings)
            if statuses[.openClaw]?.state == .running {
                return .success("OpenClaw Gateway respondeu em 127.0.0.1:\(settings.openClawPort).")
            }
            return .failure("OpenClaw Gateway nao respondeu em 127.0.0.1:\(settings.openClawPort).", .openClawGatewayError)
        case .createMCPBridge:
            guard settings.allowLocalMCPBridge else {
                return .warning("MCP Bridge local esta desativado nas preferencias.")
            }
            onRegisterMCPBridge()
            statuses[.mcpBridge] = RuntimeStatus(
                component: .mcpBridge,
                state: .running,
                version: "1.0.0",
                binaryPath: nil,
                port: nil,
                url: "internal://openassistant-runtime-mcp",
                models: [],
                error: nil,
                lastCheckedAt: Date()
            )
            return .success("Open Assistant Runtime MCP registrado.")
        case .registerRuntimeState:
            do {
                try stateStore.save(statuses: statuses, to: settings.runtimeStatePath)
                return .success("runtime-state.json salvo em \(settings.runtimeStatePath).")
            } catch {
                return .failure("Falha ao persistir runtime-state.json: \(error.localizedDescription)", nil)
            }
        case .healthCheck:
            let freshStatuses = await statusService.checkAll(settings: settings)
            statuses = freshStatuses.merging(statuses) { fresh, existing in
                fresh.state == .notInstalled ? existing : fresh
            }
            return healthOutcome(mode: plan.mode, statuses: statuses)
        case .finish:
            return .success("Runtime local finalizado.")
        default:
            return .skipped("Node recuperavel aguardando erro relacionado.")
        }
    }

    private func checkDiskSpace() -> StepOutcome {
        do {
            let url = FileManager.default.homeDirectoryForCurrentUser
            let values = try url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            let available = values.volumeAvailableCapacityForImportantUsage ?? 0
            let minimum: Int64 = 8 * 1024 * 1024 * 1024
            if available < minimum {
                return .failure("Espaco livre abaixo de 8 GB. Libere espaco ou escolha um modelo menor.", .lowDisk)
            }
            let gb = Double(available) / 1_073_741_824
            return .success(String(format: "%.1f GB livres detectados.", gb))
        } catch {
            return .warning("Nao foi possivel medir espaco livre; prosseguindo com cautela.")
        }
    }

    private func runCommand(
        action: RuntimeAction,
        settings: AppSettings.LocalRuntime,
        onLog: @escaping (RuntimeLogEntry) -> Void,
        onNodeUpdate: @escaping (RuntimeNodeUpdate) -> Void
    ) async -> StepOutcome {
        guard let command = installer.command(for: action, settings: settings) else {
            return .skipped("Sem comando para \(action.title).")
        }

        appendLog(action: action, level: .command, message: command.displayCommand, onLog: onLog)
        var observedOutput = false
        let result = await processRunner.run(command) { text in
            let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { return }
            observedOutput = true
            onLog(RuntimeLogEntry(timestamp: Date(), level: .info, component: command.component, nodeId: RuntimeWorkflowTemplateFactory.nodeId(for: action), message: clean))
            onNodeUpdate(RuntimeNodeUpdate(action: action, status: .running, progress: 0.55, lastLogLine: clean, commandPreview: command.displayCommand, startedAt: nil, finishedAt: nil))
        }

        if result.succeeded {
            let message = observedOutput
                ? "\(action.title) concluido."
                : "\(action.title) concluido sem output adicional."
            return .success(message)
        }

        let error = [result.errorOutput, result.output]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return .failure(error.isEmpty ? "\(action.title) falhou com codigo \(result.exitCode)." : error, recoverableAction(for: action))
    }

    private func healthOutcome(mode: RuntimeInstallMode, statuses: [RuntimeComponent: RuntimeStatus]) -> StepOutcome {
        let required: [RuntimeComponent]
        switch mode {
        case .full, .repair:
            required = [.ollama, .openClaw]
        case .ollamaOnly:
            required = [.ollama]
        case .openClawOnly:
            required = [.openClaw]
        }

        let failing = required.filter { statuses[$0]?.state != .running }
        if failing.isEmpty {
            return .success("Health check concluido.")
        }
        return .warning("Health check terminou com atencao em: \(failing.map(\.title).joined(separator: ", ")).")
    }

    private func recoverableAction(for action: RuntimeAction) -> RuntimeAction? {
        switch action {
        case .pullDefaultModel, .checkDiskSpace: .lowDisk
        case .verifyOllamaAPI: .ollamaAPIError
        case .checkNodeJS: .missingNode
        case .verifyGateway, .startOpenClawGateway: .openClawGatewayError
        case .createMCPBridge: .mcpBridgeWarning
        default: nil
        }
    }

    private func appendLog(action: RuntimeAction, level: RuntimeLogLevel, message: String, onLog: @escaping (RuntimeLogEntry) -> Void) {
        onLog(RuntimeLogEntry(timestamp: Date(), level: level, component: component(for: action), nodeId: RuntimeWorkflowTemplateFactory.nodeId(for: action), message: message))
    }

    private func component(for action: RuntimeAction) -> RuntimeComponent? {
        switch action {
        case .checkExistingOllama, .installOllama, .startOllama, .verifyOllamaAPI, .pullDefaultModel:
            return .ollama
        case .checkExistingOpenClaw, .installOpenClaw, .configureOpenClawWithOllama, .startOpenClawGateway, .verifyGateway:
            return .openClaw
        case .createMCPBridge:
            return .mcpBridge
        default:
            return nil
        }
    }
}
