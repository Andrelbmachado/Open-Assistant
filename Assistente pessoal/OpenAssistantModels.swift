import Foundation
import SwiftUI

enum VoiceInteractionState: String, Sendable {
    case idle
    case listening
    case processing
    case speaking
    case error
}

enum SpeechPermissionKind: String, Sendable {
    case microphone = "Microfone"
    case speechRecognition = "Reconhecimento de Fala"
}

enum APIKeyVerificationState: Equatable, Sendable {
    case idle
    case verifying
    case verified
    case failed(String)
}

struct TokenUsage: Hashable, Sendable {
    var inputTokens: Int
    var outputTokens: Int
    var contextLimit: Int
    var isEstimated: Bool

    var totalTokens: Int { inputTokens + outputTokens }
    var fraction: Double { min(max(Double(totalTokens) / Double(max(contextLimit, 1)), 0), 1) }
    var remainingTokens: Int { max(contextLimit - totalTokens, 0) }

    static func empty(limit: Int) -> TokenUsage {
        TokenUsage(inputTokens: 0, outputTokens: 0, contextLimit: limit, isEstimated: true)
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case chat
    case agents
    case workflows
    case terminals
    case files
    case browser
    case marketplace
    case photoEditor
    case videoEditor
    case dashboard

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chat: "Chat"
        case .agents: "Agentes"
        case .workflows: "Workflow"
        case .terminals: "Terminal"
        case .files: "Arquivos"
        case .browser: "Browser"
        case .marketplace: "Marketplace"
        case .photoEditor: "Fotos"
        case .videoEditor: "Vídeos"
        case .dashboard: "Dashboard"
        }
    }

    var symbol: String {
        switch self {
        case .chat: "message"
        case .agents: "person.3"
        case .workflows: "square.stack.3d.up"
        case .terminals: "terminal"
        case .files: "folder"
        case .browser: "globe"
        case .marketplace: "storefront"
        case .photoEditor: "photo.on.rectangle.angled"
        case .videoEditor: "film.stack"
        case .dashboard: "chart.xyaxis.line"
        }
    }
}

enum ModelId: String, CaseIterable, Identifiable, Sendable {
    case gpt = "gpt-5.5"
    case claude = "claude-sonnet-4-5"
    case qwen = "qwen-2-5-local"
    case llama = "llama-3-3-local"
    case together = "together-llama-3-3"
    case deepseek = "deepseek-chat"
    case perplexity = "perplexity-sonar"
    case fireworks = "fireworks-llama-3-3"

    var id: String { rawValue }
}

struct ModelConfig: Identifiable, Hashable, Sendable {
    enum Provider: String, Sendable {
        case openai
        case anthropic
        case local
        case together
        case deepseek
        case perplexity
        case fireworks

        nonisolated var displayName: String {
            switch self {
            case .openai: "OpenAI"
            case .anthropic: "Anthropic"
            case .local: "Ollama"
            case .together: "Together AI"
            case .deepseek: "DeepSeek"
            case .perplexity: "Perplexity"
            case .fireworks: "Fireworks AI"
            }
        }

        nonisolated var keychainAccount: String { rawValue }

        nonisolated var endpoint: String {
            switch self {
            case .together: "https://api.together.xyz/v1/chat/completions"
            case .deepseek: "https://api.deepseek.com/chat/completions"
            case .perplexity: "https://api.perplexity.ai/chat/completions"
            case .fireworks: "https://api.fireworks.ai/inference/v1/chat/completions"
            case .openai, .anthropic, .local: ""
            }
        }

        nonisolated var extraHeaders: [String: String] { [:] }

        nonisolated static func from(account: String) -> Provider? {
            Provider(rawValue: account.lowercased())
        }

        nonisolated static func from(displayName: String) -> Provider? {
            all.first { $0.displayName.caseInsensitiveCompare(displayName) == .orderedSame }
        }

        nonisolated static let all: [Provider] = [.openai, .anthropic, .together, .deepseek, .perplexity, .fireworks]
    }

    enum Status: String, Sendable {
        case connected
        case disconnected
        case localActive = "local-active"
    }

    var id: ModelId
    var name: String
    var provider: Provider
    var apiModel: String
    var description: String
    var latency: String
    var status: Status

    nonisolated var contextWindow: Int {
        switch id {
        case .gpt: 1_000_000
        case .claude: 200_000
        case .qwen: 32_768
        case .llama: 131_072
        case .together, .deepseek, .fireworks: 131_072
        case .perplexity: 127_072
        }
    }
}

enum ProjectIconColor: String, CaseIterable, Identifiable, Hashable {
    case white
    case red
    case orange
    case yellow
    case green
    case blue
    case purple
    case pink

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .white: .white
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        }
    }
}

struct Project: Identifiable, Hashable {
    var id: String
    var name: String
    var chatIds: [String]
    var agentIds: [String] = []
    var dashboardIds: [String] = []
    var symbol: String = "folder"
    var iconColor: ProjectIconColor = .white
    var isPinned: Bool = false
    var isArchived: Bool = false
}

enum WorkspaceAreaKind: String, CaseIterable, Identifiable, Hashable {
    case chat
    case nodes
    case terminal
    case agents
    case files
    case browser
    case marketplace
    case photoEditor
    case videoEditor
    case dashboard

    var id: String { rawValue }

    static let switchableKinds: [WorkspaceAreaKind] = [.chat, .nodes, .agents, .terminal, .browser, .marketplace, .photoEditor, .videoEditor, .dashboard]

    init(section: AppSection) {
        switch section {
        case .chat:
            self = .chat
        case .agents:
            self = .agents
        case .workflows:
            self = .nodes
        case .terminals:
            self = .terminal
        case .files:
            self = .files
        case .browser:
            self = .browser
        case .marketplace:
            self = .marketplace
        case .photoEditor:
            self = .photoEditor
        case .videoEditor:
            self = .videoEditor
        case .dashboard:
            self = .dashboard
        }
    }

    var section: AppSection {
        switch self {
        case .chat:
            .chat
        case .nodes:
            .workflows
        case .terminal:
            .terminals
        case .agents:
            .agents
        case .files:
            .files
        case .browser:
            .browser
        case .marketplace:
            .marketplace
        case .photoEditor:
            .photoEditor
        case .videoEditor:
            .videoEditor
        case .dashboard:
            .dashboard
        }
    }

    var title: String {
        switch self {
        case .chat:
            "Chat"
        case .nodes:
            "Nodes"
        case .terminal:
            "Terminal"
        case .agents:
            "Agentes"
        case .files:
            "Arquivos"
        case .browser:
            "Browser"
        case .marketplace:
            "Marketplace"
        case .photoEditor:
            "Editor de fotos"
        case .videoEditor:
            "Editor de vídeo"
        case .dashboard:
            "Dashboard"
        }
    }

    var symbol: String {
        switch self {
        case .chat:
            "message"
        case .nodes:
            "square.stack.3d.up"
        case .terminal:
            "terminal"
        case .agents:
            "person.3"
        case .files:
            "folder"
        case .browser:
            "globe"
        case .marketplace:
            "storefront"
        case .photoEditor:
            "photo.on.rectangle.angled"
        case .videoEditor:
            "film.stack"
        case .dashboard:
            "chart.xyaxis.line"
        }
    }
}

enum WorkspaceSplitAxis: String, Hashable {
    case horizontal
    case vertical
}

struct WorkspaceArea: Identifiable, Hashable {
    var id: String
    var kind: WorkspaceAreaKind
    var chatId: String? = nil
    var workflowId: String? = nil
    var terminalIds: [String] = []
    var projectId: String? = nil
    var dashboardId: String? = nil
    var documentURL: URL? = nil
}

struct WorkspaceSplit: Identifiable, Hashable {
    var id: String
    var axis: WorkspaceSplitAxis
    var fraction: CGFloat
    var first: WorkspaceLayoutNode
    var second: WorkspaceLayoutNode
}

indirect enum WorkspaceLayoutNode: Hashable {
    case leaf(WorkspaceArea)
    case split(WorkspaceSplit)

    var firstLeafId: String? {
        switch self {
        case .leaf(let area):
            area.id
        case .split(let split):
            split.first.firstLeafId ?? split.second.firstLeafId
        }
    }

    func area(id: String) -> WorkspaceArea? {
        switch self {
        case .leaf(let area):
            area.id == id ? area : nil
        case .split(let split):
            split.first.area(id: id) ?? split.second.area(id: id)
        }
    }

    var leafAreaIds: [String] {
        switch self {
        case .leaf(let area):
            [area.id]
        case .split(let split):
            split.first.leafAreaIds + split.second.leafAreaIds
        }
    }

    mutating func updateArea(id: String, kind: WorkspaceAreaKind) -> Bool {
        switch self {
        case .leaf(var area):
            guard area.id == id else { return false }
            area.kind = kind
            self = .leaf(area)
            return true
        case .split(var split):
            if split.first.updateArea(id: id, kind: kind) {
                self = .split(split)
                return true
            }
            if split.second.updateArea(id: id, kind: kind) {
                self = .split(split)
                return true
            }
            return false
        }
    }

    mutating func updateArea(_ updatedArea: WorkspaceArea) -> Bool {
        switch self {
        case .leaf(let area):
            guard area.id == updatedArea.id else { return false }
            self = .leaf(updatedArea)
            return true
        case .split(var split):
            if split.first.updateArea(updatedArea) {
                self = .split(split)
                return true
            }
            if split.second.updateArea(updatedArea) {
                self = .split(split)
                return true
            }
            return false
        }
    }

    mutating func splitArea(id: String, axis: WorkspaceSplitAxis, fraction: CGFloat, splitId: String, newArea: WorkspaceArea, newAreaFirst: Bool = false) -> Bool {
        switch self {
        case .leaf(let area):
            guard area.id == id else { return false }
            let existingNode = WorkspaceLayoutNode.leaf(area)
            let newNode = WorkspaceLayoutNode.leaf(newArea)
            self = .split(
                WorkspaceSplit(
                    id: splitId,
                    axis: axis,
                    fraction: min(max(fraction, 0.08), 0.92),
                    first: newAreaFirst ? newNode : existingNode,
                    second: newAreaFirst ? existingNode : newNode
                )
            )
            return true
        case .split(var split):
            if split.first.splitArea(id: id, axis: axis, fraction: fraction, splitId: splitId, newArea: newArea, newAreaFirst: newAreaFirst) {
                self = .split(split)
                return true
            }
            if split.second.splitArea(id: id, axis: axis, fraction: fraction, splitId: splitId, newArea: newArea, newAreaFirst: newAreaFirst) {
                self = .split(split)
                return true
            }
            return false
        }
    }

    mutating func updateSplitFraction(id: String, fraction: CGFloat) -> Bool {
        switch self {
        case .leaf:
            return false
        case .split(var split):
            if split.id == id {
                split.fraction = min(max(fraction, 0.16), 0.84)
                self = .split(split)
                return true
            }
            if split.first.updateSplitFraction(id: id, fraction: fraction) {
                self = .split(split)
                return true
            }
            if split.second.updateSplitFraction(id: id, fraction: fraction) {
                self = .split(split)
                return true
            }
            return false
        }
    }

    mutating func collapseSplit(id splitId: String, removeFirst: Bool) -> [String] {
        switch self {
        case .leaf:
            return []
        case .split(var split):
            if split.id == splitId {
                let removed = removeFirst ? split.first : split.second
                let kept = removeFirst ? split.second : split.first
                self = kept
                return removed.leafAreaIds
            }
            let removedFromFirst = split.first.collapseSplit(id: splitId, removeFirst: removeFirst)
            if !removedFromFirst.isEmpty {
                self = .split(split)
                return removedFromFirst
            }
            let removedFromSecond = split.second.collapseSplit(id: splitId, removeFirst: removeFirst)
            if !removedFromSecond.isEmpty {
                self = .split(split)
                return removedFromSecond
            }
            return []
        }
    }
}

enum MessageSender: String {
    case user
    case assistant
    case system
}

struct ActionStep: Identifiable, Hashable {
    var id = UUID()
    var title: String
    var description: String
    var done: Bool
}

struct DiffLine: Identifiable, Hashable {
    enum LineType: String {
        case add
        case remove
        case neutral
    }

    var id = UUID()
    var type: LineType
    var text: String
    var oldNumber: Int?
    var newNumber: Int?
}

struct DiffInfo: Hashable {
    var filePath: String
    var addedCount: Int
    var removedCount: Int
    var lines: [DiffLine]
}

enum BlockType: String {
    case code
    case fileDiff = "file-diff"
    case commandRun = "command-run"
    case actionPlan = "action-plan"
    case error
    case confirmation
    case dashboard
}

struct InteractiveBlock: Identifiable, Hashable {
    var id = UUID()
    var type: BlockType
    var title: String
    var language: String?
    var code: String?
    var previousCode: String?
    var filePath: String?
    var command: String?
    var diffInfo: DiffInfo?
    var steps: [ActionStep]?
    var errorDetails: String?
    var successDetails: String?
}

struct ProgressStep: Identifiable, Hashable {
    var id = UUID()
    enum StepType: String, Codable {
        case header
        case fileAnalysis
        case thought
        case fileEdit
        case textInfo
    }
    var type: StepType
    var title: String
    var subtitle: String?
    var value: String?
    var isExpanded: Bool = true
}

struct ChangesSummary: Hashable {
    var fileCount: Int
    var addedCount: Int
    var removedCount: Int
}

struct ChatMessage: Identifiable, Hashable {
    var id: String
    var sender: MessageSender
    var text: String
    var timestamp: String
    var modelUsed: String?
    var blocks: [InteractiveBlock] = []
    var isProgressMessage: Bool = false
    var progressSteps: [ProgressStep] = []
    var activeProgressStepIndex: Int? = nil
    var isProgressActive: Bool = false
    var finalChangesSummary: ChangesSummary? = nil
    var responseTime: String? = nil
    var visitedSites: [String]? = nil
    var generatedImagePath: String? = nil
    var isModelChange: Bool = false
    var modelChangeText: String? = nil
}

struct ChatSession: Identifiable, Hashable {
    var id: String
    var title: String
    var modelId: ModelId
    var date: String
    var messages: [ChatMessage]
    var isPinned: Bool = false
    var isArchived: Bool = false
}

enum AgentStatus: String, CaseIterable, Identifiable {
    case running
    case idle
    case paused
    case error
    case completed

    var id: String { rawValue }

    var title: String { rawValue }

    var tint: Color {
        switch self {
        case .running: .blue
        case .idle: .secondary
        case .paused: .yellow
        case .error: .red
        case .completed: .green
        }
    }

    var symbol: String {
        switch self {
        case .running: "play.fill"
        case .idle: "moon.zzz.fill"
        case .paused: "pause.fill"
        case .error: "exclamationmark.triangle.fill"
        case .completed: "checkmark.circle.fill"
        }
    }
}

struct Agent: Identifiable, Hashable {
    var id: String
    var name: String
    var role: String
    var modelId: ModelId
    var status: AgentStatus
    var lastActive: String
    var permissions: [String]
    var tools: [String]
    var prompt: String
    var isSystem: Bool = false
    var isPinned: Bool = false
    var isArchived: Bool = false
}

enum RuntimeComponent: String, CaseIterable, Identifiable, Codable, Hashable {
    case ollama
    case openClaw
    case mcpBridge

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ollama: "Ollama"
        case .openClaw: "OpenClaw"
        case .mcpBridge: "MCP Bridge"
        }
    }

    var symbol: String {
        switch self {
        case .ollama: "cpu"
        case .openClaw: "point.3.connected.trianglepath.dotted"
        case .mcpBridge: "cylinder.split.1x2"
        }
    }

    var defaultPort: Int? {
        switch self {
        case .ollama: 11434
        case .openClaw: 18789
        case .mcpBridge: nil
        }
    }
}

enum RuntimeInstallState: String, CaseIterable, Identifiable, Codable, Hashable {
    case notInstalled
    case installed
    case running
    case needsAttention
    case installing
    case error

    var id: String { rawValue }

    var title: String {
        switch self {
        case .notInstalled: "Nao instalado"
        case .installed: "Instalado"
        case .running: "Rodando"
        case .needsAttention: "Atencao"
        case .installing: "Instalando"
        case .error: "Erro"
        }
    }

    var tint: Color {
        switch self {
        case .notInstalled: .secondary
        case .installed: .blue
        case .running: .green
        case .needsAttention: .yellow
        case .installing: .blue
        case .error: .red
        }
    }

    var symbol: String {
        switch self {
        case .notInstalled: "xmark.circle"
        case .installed: "checkmark.circle"
        case .running: "play.circle.fill"
        case .needsAttention: "exclamationmark.triangle"
        case .installing: "arrow.down.circle"
        case .error: "xmark.octagon"
        }
    }
}

struct RuntimeStatus: Identifiable, Hashable, Codable {
    var component: RuntimeComponent
    var state: RuntimeInstallState
    var version: String?
    var binaryPath: String?
    var port: Int?
    var url: String?
    var models: [String]
    var error: String?
    var lastCheckedAt: Date?

    var id: RuntimeComponent { component }

    static func empty(_ component: RuntimeComponent) -> RuntimeStatus {
        RuntimeStatus(
            component: component,
            state: .notInstalled,
            version: nil,
            binaryPath: nil,
            port: component.defaultPort,
            url: nil,
            models: [],
            error: nil,
            lastCheckedAt: nil
        )
    }
}

enum RuntimeLogLevel: String, Codable, Hashable {
    case info
    case warning
    case error
    case success
    case command
}

struct RuntimeLogEntry: Identifiable, Hashable, Codable {
    var id = UUID()
    var timestamp: Date
    var level: RuntimeLogLevel
    var component: RuntimeComponent?
    var nodeId: String?
    var message: String
}

enum RuntimeInstallMode: String, CaseIterable, Identifiable, Codable, Hashable {
    case full
    case ollamaOnly
    case openClawOnly
    case repair

    var id: String { rawValue }

    var title: String {
        switch self {
        case .full: "Runtime local completo"
        case .ollamaOnly: "Ollama"
        case .openClawOnly: "OpenClaw"
        case .repair: "Reparar runtime"
        }
    }
}

enum RuntimeAction: String, CaseIterable, Identifiable, Codable, Hashable {
    case start
    case detectOS
    case checkArchitecture
    case checkDiskSpace
    case checkNetwork
    case checkExistingOllama
    case installOllama
    case startOllama
    case verifyOllamaAPI
    case pullDefaultModel
    case checkNodeJS
    case checkExistingOpenClaw
    case installOpenClaw
    case configureOpenClawWithOllama
    case startOpenClawGateway
    case verifyGateway
    case createMCPBridge
    case registerRuntimeState
    case healthCheck
    case finish
    case missingNode
    case lowDisk
    case portBusy
    case ollamaAPIError
    case openClawGatewayError
    case mcpBridgeWarning

    var id: String { rawValue }

    var title: String {
        switch self {
        case .start: "Start"
        case .detectOS: "Detect OS"
        case .checkArchitecture: "Check Architecture"
        case .checkDiskSpace: "Check Disk Space"
        case .checkNetwork: "Check Network"
        case .checkExistingOllama: "Check Existing Ollama"
        case .installOllama: "Install Ollama"
        case .startOllama: "Start Ollama"
        case .verifyOllamaAPI: "Verify Ollama API"
        case .pullDefaultModel: "Pull Default Model"
        case .checkNodeJS: "Check Node.js"
        case .checkExistingOpenClaw: "Check Existing OpenClaw"
        case .installOpenClaw: "Install OpenClaw"
        case .configureOpenClawWithOllama: "Configure OpenClaw"
        case .startOpenClawGateway: "Start OpenClaw Gateway"
        case .verifyGateway: "Verify Gateway"
        case .createMCPBridge: "Create MCP Bridge"
        case .registerRuntimeState: "Register Runtime State"
        case .healthCheck: "Health Check"
        case .finish: "Finish"
        case .missingNode: "Node.js Missing"
        case .lowDisk: "Low Disk"
        case .portBusy: "Port Busy"
        case .ollamaAPIError: "Ollama API Error"
        case .openClawGatewayError: "OpenClaw Gateway Error"
        case .mcpBridgeWarning: "MCP Bridge Warning"
        }
    }

    var description: String {
        switch self {
        case .start: "Prepara o System Setup Agent."
        case .detectOS: "Confirma que a instalacao esta rodando no macOS."
        case .checkArchitecture: "Detecta Apple Silicon ou Intel."
        case .checkDiskSpace: "Confirma espaco suficiente para runtime e modelo local."
        case .checkNetwork: "Verifica acesso a internet para downloads oficiais."
        case .checkExistingOllama: "Procura uma instalacao local existente do Ollama."
        case .installOllama: "Baixa e executa o instalador oficial do Ollama."
        case .startOllama: "Inicia o app ou servidor local do Ollama."
        case .verifyOllamaAPI: "Testa a API local em localhost:11434."
        case .pullDefaultModel: "Baixa o modelo local padrao configurado."
        case .checkNodeJS: "Confirma Node.js compativel para OpenClaw."
        case .checkExistingOpenClaw: "Procura uma instalacao local existente do OpenClaw."
        case .installOpenClaw: "Baixa e executa o instalador oficial do OpenClaw."
        case .configureOpenClawWithOllama: "Executa onboarding local usando Ollama como provider."
        case .startOpenClawGateway: "Inicia o Gateway local do OpenClaw."
        case .verifyGateway: "Testa o Gateway em 127.0.0.1:18789."
        case .createMCPBridge: "Registra as tools locais do Open Assistant via MCP."
        case .registerRuntimeState: "Persiste o estado do runtime local."
        case .healthCheck: "Executa uma checagem final do conjunto."
        case .finish: "Marca o runtime local como pronto."
        case .missingNode: "Pausa ate Node.js compativel estar disponivel."
        case .lowDisk: "Solicita liberar espaco ou escolher modelo menor."
        case .portBusy: "Mostra o processo ocupando a porta local."
        case .ollamaAPIError: "Orienta restart e retry do Ollama."
        case .openClawGatewayError: "Orienta diagnostico do Gateway."
        case .mcpBridgeWarning: "Permite concluir sem MCP Bridge."
        }
    }
}

enum TerminalLogType: String {
    case info
    case warning
    case error
    case success
    case input
}

struct TerminalLog: Identifiable, Hashable {
    var id = UUID()
    var timestamp: String
    var type: TerminalLogType
    var text: String
}

struct AgentTerminal: Identifiable, Hashable {
    var id: String
    var agentId: String
    var agentName: String
    var status: AgentStatus
    var logs: [TerminalLog]
    var lastUpdated: String
}

enum NodeType: String, CaseIterable, Identifiable {
    case trigger
    case watcher
    case reader
    case agent
    case executor
    case writer
    case decision
    case notifier
    case optimizer
    case folder
    case prompt
    case openProgram = "open_program"
    case gmail
    case googleDrive = "google_drive"
    case whatsapp
    case telegram
    case runtimeAction = "runtime_action"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .trigger: "Disparador"
        case .watcher: "Watch Dir"
        case .reader: "Arquivo Local"
        case .agent: "Agente IA"
        case .executor: "Executor"
        case .writer: "Salvar Arquivo"
        case .decision: "Decisor"
        case .notifier: "Notificar"
        case .optimizer: "Optimizer"
        case .folder: "Pasta Local"
        case .prompt: "Prompt de IA"
        case .openProgram: "Abrir App"
        case .gmail: "Gmail API"
        case .googleDrive: "Google Drive API"
        case .whatsapp: "WhatsApp API"
        case .telegram: "Telegram API"
        case .runtimeAction: "Runtime"
        }
    }

    var symbol: String {
        switch self {
        case .trigger: "bolt.circle"
        case .watcher, .folder: "folder"
        case .reader, .writer: "doc.text"
        case .agent: "sparkles"
        case .executor, .prompt: "terminal"
        case .decision: "arrow.triangle.branch"
        case .notifier: "bell"
        case .optimizer: "cpu"
        case .openProgram: "macwindow"
        case .gmail: "envelope"
        case .googleDrive: "cloud"
        case .whatsapp: "phone"
        case .telegram: "paperplane"
        case .runtimeAction: "gearshape.2"
        }
    }

    var tint: Color {
        switch self {
        case .trigger, .notifier: .orange
        case .watcher, .folder, .googleDrive: .cyan
        case .reader: .purple
        case .agent, .optimizer: .blue
        case .executor, .openProgram, .whatsapp: .green
        case .writer: .pink
        case .decision, .prompt: .indigo
        case .gmail: .red
        case .telegram: .teal
        case .runtimeAction: .mint
        }
    }
}

enum NodeStatus: String, CaseIterable, Identifiable {
    case idle
    case running
    case success
    case warning
    case error
    case skipped
    case cancelled

    var id: String { rawValue }

    var tint: Color {
        switch self {
        case .idle: .secondary
        case .running: .blue
        case .success: .green
        case .warning: .yellow
        case .error: .red
        case .skipped: .gray
        case .cancelled: .orange
        }
    }
}

struct WorkflowNode: Identifiable, Hashable {
    var id: String
    var name: String
    var type: NodeType
    var x: CGFloat
    var y: CGFloat
    var status: NodeStatus
    var description: String
    var config: [String: String]
    var temperature: Double?
    var allowSelfEdit: Bool
    var runtimeAction: RuntimeAction? = nil
    var progress: Double? = nil
    var lastLogLine: String? = nil
    var commandPreview: String? = nil
    var requiresApproval: Bool = false
    var startedAt: Date? = nil
    var finishedAt: Date? = nil
}

struct NodeConnection: Identifiable, Hashable {
    var id: String
    var fromId: String
    var toId: String
    var fromPort: Int = 0
    var toPort: Int = 0
}

struct WorkflowPortRef: Hashable {
    var nodeId: String
    var port: Int
}

enum WorkflowFrameKind: String, CaseIterable, Identifiable, Hashable {
    case schedule
    case folder
    case file
    case project
    case condition
    case approval
    case parallel

    var id: String { rawValue }

    var title: String {
        switch self {
        case .schedule: "Intervalo"
        case .folder: "Pasta"
        case .file: "Arquivo"
        case .project: "Projeto"
        case .condition: "Condição"
        case .approval: "Aprovação"
        case .parallel: "Execução paralela"
        }
    }

    var symbol: String {
        switch self {
        case .schedule: "clock.arrow.2.circlepath"
        case .folder: "folder"
        case .file: "doc.text"
        case .project: "shippingbox"
        case .condition: "arrow.triangle.branch"
        case .approval: "hand.raised"
        case .parallel: "arrow.trianglehead.branch"
        }
    }

    var tint: Color {
        switch self {
        case .schedule: .orange
        case .folder: .cyan
        case .file: .purple
        case .project: .blue
        case .condition: .indigo
        case .approval: .yellow
        case .parallel: .green
        }
    }
}

struct WorkflowFrame: Identifiable, Hashable {
    var id: String
    var name: String
    var kind: WorkflowFrameKind
    var x: CGFloat
    var y: CGFloat
    var width: CGFloat
    var height: CGFloat
    var config: [String: String]
    var nodeIds: [String] = []
    var isEnabled: Bool = true
    var lastRunAt: Date? = nil
}

struct Workflow: Identifiable, Hashable {
    var id: String
    var name: String
    var description: String
    var isActive: Bool
    var nodes: [WorkflowNode]
    var connections: [NodeConnection]
    var frames: [WorkflowFrame] = []
}

enum FileKind: String, CaseIterable, Identifiable {
    case txt = "TXT"
    case md = "MD"
    case json = "JSON"
    case html = "HTML"
    case css = "CSS"
    case log = "LOG"
    case report = "REPORT"

    var id: String { rawValue }
}

struct FileArtifact: Identifiable, Hashable {
    var id: String
    var name: String
    var type: FileKind
    var size: String
    var createdBy: String
    var date: String
    var path: String
    var content: String
    var previousContent: String?
}

struct CodeFileReference: Identifiable, Hashable {
    var id: String { path }
    var name: String
    var path: String
    var projectRootPath: String
    var line: Int?
    var content: String
    var previousContent: String? = nil
    var language: String? = nil
}

struct SkillSetting: Identifiable, Hashable {
    var id: String
    var name: String
    var description: String
    var permissions: [String]
    var enabled: Bool
}

struct AppSettings: Hashable {
    struct General: Hashable {
        var username: String
        var language: String
        var theme: String
        var defaultModel: ModelId
        var profileImagePath: String? = nil
    }

    struct APIKeys: Hashable {
        var openai: String
        var anthropic: String
        var google: String
        var groq: String
        var openrouter: String
        var customProvider: String
        var customUrl: String
    }

    struct LocalRuntime: Hashable {
        var status: String
        var port: String
        var modelsInstalled: [String]
        var ollamaPort: Int = 11434
        var openClawPort: Int = 18789
        var defaultLocalModelTag: String = "llama3.2:3b"
        var showVisualInstall: Bool = false
        var allowLocalMCPBridge: Bool = true
        var localOnlyMode: Bool = true
        var runtimeStatePath: String = "~/Library/Application Support/Open Assistant/runtime-state.json"
    }

    struct Appearance: Hashable {
        var accentColor: String
        var blurIntensity: String
        var density: String
        var floatingAssistantEnabled: Bool = false
        var floatingAssistantCompact: Bool = true
        var floatingAssistantAutoShow: Bool = true
        var floatingAssistantOpacity: Double = 0.94
    }

    struct Voice: Hashable {
        var language: String = "pt-BR"
        var ttsProvider: String = "native"
        var selectedProfile: AssistantVoiceProfile = .sol
        var automaticallySpeakReplies: Bool = false
    }

    struct FontSize: Hashable {
        var global: Double
        var chat: Double
        var terminal: Double
        var code: Double
    }

    struct Permissions: Hashable {
        var readFile: Bool
        var writeFile: Bool
        var executeCommand: Bool
        var alterWorkflow: Bool
        var accessNetwork: Bool
    }

    var general: General
    var apiKeys: APIKeys
    var localRuntime: LocalRuntime
    var skills: [SkillSetting]
    var appearance: Appearance
    var fontSize: FontSize
    var voice: Voice = Voice()
    var permissions: Permissions
}

enum AssistantVoiceProfile: String, CaseIterable, Identifiable, Hashable {
    case evee = "Evee"
    case sol = "Sol"
    case harvey = "Harvey"

    var id: String { rawValue }

    /// Installed macOS voices are used immediately. The Pocket TTS mapping is
    /// kept alongside the profile so the same identity survives a backend swap.
    var nativeVoiceCandidates: [String] {
        switch self {
        case .evee: ["Flo (Portuguese (Brazil))", "Flo", "Luciana"]
        case .sol: ["Luciana", "Sandy (Portuguese (Brazil))", "Sandy"]
        case .harvey: ["Reed (Portuguese (Brazil))", "Eddy (Portuguese (Brazil))", "Reed", "Eddy"]
        }
    }

    var pocketVoice: String {
        switch self {
        case .evee: "eve"
        case .sol: "rafael"
        case .harvey: "charles"
        }
    }

    var summary: String {
        switch self {
        case .evee: "Clara e acolhedora"
        case .sol: "Natural e equilibrada"
        case .harvey: "Grave e objetiva"
        }
    }
}

struct DashboardMetric: Identifiable, Hashable, Codable, Sendable {
    var id: String
    var title: String
    var value: Double
    var unit: String
    var change: Double?
}

struct DashboardPoint: Identifiable, Hashable, Codable, Sendable {
    var id: String { "\(label)-\(value)" }
    var label: String
    var value: Double
}

struct DashboardDocument: Identifiable, Hashable, Codable, Sendable {
    var id: String
    var projectId: String?
    var title: String
    var subtitle: String
    var metrics: [DashboardMetric]
    var points: [DashboardPoint]
    var updatedAt: Date
    var isPinned: Bool = false
    var isArchived: Bool = false
}

struct ProductSearchResult: Identifiable, Hashable, Codable, Sendable {
    var id: String
    var title: String
    var price: Double?
    var currency: String
    var source: String
    var imageURL: URL?
    var productURL: URL
    var rating: Double?
}

struct MCPServer: Identifiable, Hashable {
    var id: String
    var name: String
    var description: String
    var command: String
    var status: String
    var symbol: String
}

struct MarketplaceItem: Identifiable, Hashable {
    var id: String
    var name: String
    var description: String
    var price: String
    var downloads: String
    var rating: String
    var publisher: String
    var permissions: [String] = []
}

struct APIProviderItem: Identifiable, Hashable {
    var id: String
    var name: String
    var provider: String
    var description: String
    var price: String
    var latency: String
}

struct SavedAPIKey: Identifiable, Hashable {
    var id: String { account }
    var account: String
    var provider: String
    var symbol: String
    var preview: String

    var masked: String {
        preview
    }

    /// Identifica a empresa do modelo a partir do formato da chave colada.
    static func detectProvider(from key: String) -> (name: String, symbol: String) {
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if k.hasPrefix("sk-ant-") { return ("Anthropic", "a.circle.fill") }
        if k.hasPrefix("sk-or-") { return ("OpenRouter", "arrow.triangle.branch") }
        if k.hasPrefix("AIza") { return ("Google", "g.circle.fill") }
        if k.hasPrefix("gsk_") { return ("Groq", "bolt.circle.fill") }
        if k.hasPrefix("sk-proj-") || k.hasPrefix("sk-") { return ("OpenAI", "brain.head.profile") }
        if k.hasPrefix("xai-") { return ("xAI", "x.circle.fill") }
        if k.hasPrefix("pplx-") { return ("Perplexity", "magnifyingglass.circle.fill") }
        return ("Provedor Customizado", "key.horizontal.fill")
    }
}

enum TerminalTileAxis {
    case horizontal
    case vertical
}

enum RightSidebarContent: Equatable {
    case none
    case outputsAndSources
    case browser
    case projectFiles
    case codeFile
    case terminal
    case optionsMenu
}
