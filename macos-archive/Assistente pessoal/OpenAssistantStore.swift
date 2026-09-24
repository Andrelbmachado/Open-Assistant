#if canImport(AppKit)
import AppKit
#endif
import Combine
import Foundation
import SwiftUI

struct PendingChange: Identifiable, Hashable {
    var id = UUID()
    var fileName: String
    var filePath: String
    var addedCount: Int
    var removedCount: Int
}

enum ApprovalMode: String, CaseIterable, Identifiable, Codable {
    case askForApproval = "Ask for approval"
    case approveForMe = "Approve for me"
    case fullAccess = "Total Access"
    
    var id: String { self.rawValue }
    
    var icon: String {
        switch self {
        case .askForApproval: return "hand.raised"
        case .approveForMe: return "clock"
        case .fullAccess: return "exclamationmark.shield"
        }
    }
    
    var description: String {
        switch self {
        case .askForApproval: return "Always ask to edit external files and use the internet"
        case .approveForMe: return "Only ask for actions detected as potentially unsafe"
        case .fullAccess: return "Unrestricted access to the internet and any file on your computer"
        }
    }
}

final class AssistantStore: ObservableObject {
    @Published var activeSection: AppSection = .chat {
        didSet {
            if oldValue != activeSection {
                syncActiveWorkspaceAreaToActiveSection()
            }
        }
    }
    @Published var sidebarCollapsed = false
    @Published var leftSidebarWidth: CGFloat = 270
    @Published var rightSidebarWidth: CGFloat = 300
    @Published var workspaceLayout: WorkspaceLayoutNode = .leaf(WorkspaceArea(id: "workspace-root", kind: .chat, chatId: "chat-1", workflowId: "wf-1"))
    @Published var activeWorkspaceAreaId = "workspace-root"
    @Published var pendingChanges: [PendingChange] = []
    @Published var approvalMode: ApprovalMode = .fullAccess
    @Published var chatDropdownOpen = true
    @Published var projectsDropdownOpen = true
    @Published var agentsDropdownOpen = true
    @Published var selectedChatSource = "chats"
    @Published var settingsOpen = false
    @Published var commandPaletteOpen = false
    @Published var selectedAgentIdForNodes: String?
    @Published var selectedAgentId: String? = "agent-1"
    @Published var selectedWorkflowNodeIds: Set<String> = ["node-4"]
    @Published var selectedWorkflowFrameIds: Set<String> = []
    @Published var selectedFileId: String = "file-1"
    @Published var fileDiffMode = true
    @Published var connectingFromPort: WorkflowPortRef?
    @Published var workflowPortCenters: [WorkflowPortID: CGPoint] = [:]
    @Published var connectionDragFrom: WorkflowPortID?
    @Published var connectionDragPoint: CGPoint?
    @Published var workflowZoom: CGFloat = 1
    @Published var workflowOffset = CGSize.zero
    /// Tamanhos medidos dos cards de node (por id), usados pelo auto-arrange
    /// para impedir que os nodes se encostem.
    @Published var workflowNodeSizes: [String: CGSize] = [:]
    @Published var workflowFrameDropTargetId: String?
    let workflowMapCenter = CGPoint(x: 720, y: 420)
    private let workflowDefaultNodeSize = CGSize(width: 260, height: 190)
    /// Tamanho do viewport de cada canvas de workflow (por id), para centralizar o mapa.
    var workflowViewportSizes: [String: CGSize] = [:]
    @Published var activeWorkflowId = "wf-1"
    @Published var contextProjectId: String?
    @Published var selectedCodeFile: CodeFileReference?
    @Published var codeEditorExpanded = false

    @Published var chats: [ChatSession]
    @Published var projects: [Project]
    @Published var activeChatId = "chat-1"
    @Published var models: [ModelConfig]
    @Published var agents: [Agent]
    @Published var terminals: [AgentTerminal]
    @Published var workflows: [Workflow]
    @Published var files: [FileArtifact]
    @Published var settings: AppSettings
    @Published var terminalInputs: [String: String] = [:]
    @Published var projectChatDraft = ""
    @Published var showBottomTerminal: Bool = false
    @Published var rightSidebar: RightSidebarContent = .none

    @Published var shellTerminals: [ShellSession] = []
    /// Eixo de empilhamento das janelas de terminal agrupadas (tiled).
    @Published var terminalTileAxis: TerminalTileAxis = .horizontal
    /// Frames absolutos das janelas soltas (destacadas) da grade.
    @Published var terminalFloatingFrames: [String: CGRect] = [:]
    /// Ordem manual das janelas agrupadas (permite reorganizar por drag).
    @Published var terminalOrder: [String] = []
    private var bottomShellSession: ShellSession?
    private var sidebarShellSession: ShellSession?
    private var browserModel: BrowserModel?
    private let localRuntimeManager = LocalRuntimeManager()
    private let runtimeLogStore = RuntimeLogStore()
    private let keychainStore = KeychainStore()
    private let aiProviderService = AIProviderService()
    private let marketplacePurchaseService = MarketplacePurchaseService()
    private var speechObservation: AnyCancellable?
    private var speechListeningObservation: AnyCancellable?
    private var frameSchedulerObservation: AnyCancellable?
#if os(macOS)
    let speechService = SpeechService()
#endif

    // Created on first use so the app does not spawn shells or load pages at launch.
    var bottomShell: ShellSession {
        if let bottomShellSession { return bottomShellSession }
        let session = ShellSession(title: "Terminal")
        bottomShellSession = session
        return session
    }

    var sidebarShell: ShellSession {
        if let sidebarShellSession { return sidebarShellSession }
        let session = ShellSession(title: "Terminal")
        sidebarShellSession = session
        return session
    }

    var browser: BrowserModel {
        if let browserModel { return browserModel }
        let model = BrowserModel()
        browserModel = model
        return model
    }

    @Published var connectedMCPs: [MCPServer]
    @Published var mcpMarketplace: [MarketplaceItem]
    @Published var skillsMarketplace: [MarketplaceItem]
    @Published var apiMarketplace: [APIProviderItem]

    @Published var localNotice: String?
    @Published var installingId: String?
    @Published var installProgress = 0.0
    @Published var savedAPIKeys: [SavedAPIKey] = []
    @Published var generatingChatIds: Set<String> = []
    @Published var isListeningForSpeech = false
    @Published var dashboards: [DashboardDocument] = []
    @Published var marketplaceResults: [ProductSearchResult] = []
    @Published var marketplaceQuery = ""
    @Published var marketplaceIsSearching = false
    @Published var voiceState: VoiceInteractionState = .idle
    @Published var voicePermissionIssue: SpeechPermissionKind?
    @Published var apiKeyVerificationStates: [ModelConfig.Provider: APIKeyVerificationState] = [:]
    @Published var tokenUsageByChat: [String: TokenUsage] = [:]
    @Published var runtimeStatuses: [RuntimeComponent: RuntimeStatus] = Dictionary(
        uniqueKeysWithValues: RuntimeComponent.allCases.map { ($0, RuntimeStatus.empty($0)) }
    )
    @Published var runtimeLogs: [RuntimeLogEntry] = []
    @Published var pendingRuntimePlan: RuntimeInstallPlan?
    @Published var runtimeInstallRunning = false

    init() {
        models = Self.makeModels()
        chats = Self.makeChats()
        projects = [
            Project(id: "proj-1", name: "Daily Design Trend", chatIds: ["chat-1"]),
            Project(id: "proj-2", name: "Workflow Optimization", chatIds: ["chat-2"])
        ]
        agents = Self.makeAgents()
        terminals = Self.makeTerminals()
        workflows = [Self.makeWorkflow()] + Self.makeDemoWorkflows()
        files = Self.makeFiles()
        settings = Self.makeSettings()
        connectedMCPs = [
            MCPServer(
                id: "fs-mcp",
                name: "Filesystem MCP",
                description: "Acesso de leitura/escrita seguro ao diretório de desenvolvimento local.",
                command: "npx @modelcontextprotocol/server-filesystem ~/Desktop/design-trends",
                status: "configured",
                symbol: "externaldrive"
            ),
            MCPServer(
                id: "postgres-mcp",
                name: "PostgreSQL Connector",
                description: "Leitor de esquemas e analisador de consultas SQL local.",
                command: "docker run -it mcp/postgres-server",
                status: "configured",
                symbol: "cylinder.split.1x2"
            ),
            MCPServer(
                id: "github-mcp",
                name: "GitHub API Sync",
                description: "Conexão para checkouts de arquivos e controle de branches por IA.",
                command: "npx @modelcontextprotocol/server-github",
                status: "configured",
                symbol: "cpu"
            )
        ]
        mcpMarketplace = [
            MarketplaceItem(id: "slack-mcp", name: "Slack Team Workspace", description: "Leia conversas, sincronize canais e publique relatórios diretamente no Slack.", price: "Grátis", downloads: "12k", rating: "4.8", publisher: "ModelContextProtocol"),
            MarketplaceItem(id: "gdrive-mcp", name: "Google Drive & Calendar", description: "Busque documentos de texto nas pastas de nuvem e agende compromissos de agentes.", price: "Grátis", downloads: "18k", rating: "4.9", publisher: "Google Workspace"),
            MarketplaceItem(id: "spotify-mcp", name: "Spotify Player Controls", description: "Agentes podem pausar, avançar, buscar músicas ou tocar playlists sugeridas.", price: "$1.99", downloads: "3.4k", rating: "4.5", publisher: "Spotify AB"),
            MarketplaceItem(id: "docker-mcp", name: "Docker Supervisor Daemon", description: "Gerencie containers, inspecione imagens e reinicie clusters via node workflows.", price: "Grátis", downloads: "8.1k", rating: "4.7", publisher: "Docker Inc."),
            MarketplaceItem(id: "jira-mcp", name: "Jira issue tracker sync", description: "Importação e encerramento automatizado de tickets de desenvolvimento.", price: "$4.99", downloads: "1.9k", rating: "4.2", publisher: "Atlassian")
        ]
        skillsMarketplace = [
            MarketplaceItem(id: "py-interpreter", name: "Python Code Sandbox", description: "Execução segura de fórmulas matemáticas complexas e manipulação de DataFrames com Pandas.", price: "Grátis", downloads: "24k", rating: "4.9", publisher: "Open Assistant", permissions: ["executeCommand", "writeFile"]),
            MarketplaceItem(id: "web-scraper", name: "Dynamic Browser Scraper", description: "Heurística avançada para baixar páginas web inteiras contornando proxies e processando JS.", price: "$3.50", downloads: "8.2k", rating: "4.7", publisher: "Open Assistant", permissions: ["accessNetwork", "writeFile"]),
            MarketplaceItem(id: "flux-image", name: "Flux-1 & Imagen-3 Generation", description: "Instancie gerações de ilustrações vetoriais e fotos realistas de alta fidelidade.", price: "$5.00", downloads: "15k", rating: "4.8", publisher: "Open Assistant", permissions: ["accessNetwork", "writeFile"]),
            MarketplaceItem(id: "git-automator", name: "Git conflict resolver", description: "Gera patches e resolve conflitos de merge automaticamente em commits locais.", price: "Grátis", downloads: "5.1k", rating: "4.6", publisher: "Open Assistant", permissions: ["executeCommand", "readFile", "writeFile"])
        ]
        apiMarketplace = [
            APIProviderItem(id: "together-api", name: "Together AI API", provider: "together", description: "Modelos Open Source rápidos (Llama, Mistral, Qwen) a preços baixos.", price: "$0.20 / 1M tokens", latency: "110ms"),
            APIProviderItem(id: "deepseek-api", name: "DeepSeek API", provider: "deepseek", description: "Raciocínio lógico matemático de ponta a 1/10 do custo normal.", price: "$0.14 / 1M tokens", latency: "240ms"),
            APIProviderItem(id: "perplexity-api", name: "Perplexity Search API", provider: "perplexity", description: "Acesso à API de busca em tempo real com referências estruturadas.", price: "$1.00 / 1K queries", latency: "450ms"),
            APIProviderItem(id: "fireworks-api", name: "Fireworks High-Speed API", provider: "fireworks", description: "Processamento rápido com menos de 50ms para primeiro token.", price: "$0.15 / 1M tokens", latency: "85ms")
        ]
        if let persisted = RuntimeStateStore().load(from: settings.localRuntime.runtimeStatePath) {
            runtimeStatuses = Dictionary(uniqueKeysWithValues: persisted.statuses.map { ($0.component, $0) })
            updateSettingsFromRuntimeStatuses()
        }
        reloadSavedAPIKeys()
        refreshRuntimeStatuses()
#if os(macOS)
        speechObservation = speechService.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        speechListeningObservation = speechService.$isListening.sink { [weak self] listening in
            self?.isListeningForSpeech = listening
            if !listening, self?.voiceState == .listening { self?.voiceState = .idle }
        }
        speechService.onSpeakingStateChange = { [weak self] speaking in
            self?.voiceState = speaking ? .speaking : .idle
        }
#endif
        frameSchedulerObservation = Timer.publish(every: 30, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] date in
                self?.runDueFrameWorkflows(at: date)
            }
    }

    var activeChat: ChatSession {
        chats.first(where: { $0.id == activeChatId }) ?? chats[0]
    }

    var activeProject: Project {
        if let contextProjectId, let project = projects.first(where: { $0.id == contextProjectId }) {
            return project
        }
        return projects.first(where: { $0.chatIds.contains(activeChat.id) }) ?? projects[0]
    }

    var contextProject: Project? {
        guard let contextProjectId else { return nil }
        return projects.first(where: { $0.id == contextProjectId })
    }

    func setContextProject(_ projectId: String) {
        contextProjectId = projectId
        if let project = projects.first(where: { $0.id == projectId }) {
            showNotice("Projeto \"\(project.name)\" definido como contexto.")
        }
    }

    func clearContextProject() {
        contextProjectId = nil
        showNotice("Projeto removido do contexto.")
    }

    var selectedAgent: Agent? {
        guard let selectedAgentId else { return nil }
        return agents.first(where: { $0.id == selectedAgentId })
    }

    var visibleAgents: [Agent] {
        agents
            .filter { !$0.isSystem && !$0.isArchived }
            .sorted { lhs, rhs in
                if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    var workflow: Workflow {
        workflow(id: activeWorkflowId)
    }

    func workflow(id workflowId: String?) -> Workflow {
        guard let workflowIndex = workflowIndex(for: workflowId) else {
            return workflows[0]
        }
        return workflows[workflowIndex]
    }

    private func workflowIndex(for workflowId: String?) -> Int? {
        guard let id = resolvedWorkflowId(workflowId) else { return nil }
        return workflows.firstIndex { $0.id == id }
    }

    private func resolvedWorkflowId(_ workflowId: String?) -> String? {
        if let workflowId, workflows.contains(where: { $0.id == workflowId }) {
            return workflowId
        }
        if workflows.contains(where: { $0.id == activeWorkflowId }) {
            return activeWorkflowId
        }
        return workflows.first?.id
    }

    var selectedWorkflowNode: WorkflowNode? {
        guard let id = selectedWorkflowNodeIds.first, selectedWorkflowNodeIds.count == 1 else { return nil }
        return workflow.nodes.first(where: { $0.id == id })
    }

    var selectedWorkflowFrame: WorkflowFrame? {
        guard let id = selectedWorkflowFrameIds.first, selectedWorkflowFrameIds.count == 1 else { return nil }
        return workflow.frames.first(where: { $0.id == id })
    }

    var selectedFile: FileArtifact {
        files.first(where: { $0.id == selectedFileId }) ?? files[0]
    }

    var projectRootURL: URL {
        Self.projectRootURL
    }

    var sourceRootURL: URL {
        Self.sourceRootURL
    }

    var activeModel: ModelConfig {
        models.first(where: { $0.id == activeChat.modelId }) ?? models[0]
    }

    private func syncActiveWorkspaceAreaToActiveSection() {
        let kind = WorkspaceAreaKind(section: activeSection)
        if workspaceLayout.area(id: activeWorkspaceAreaId) == nil,
           let firstLeafId = workspaceLayout.firstLeafId {
            activeWorkspaceAreaId = firstLeafId
        }
        guard var area = workspaceLayout.area(id: activeWorkspaceAreaId) else { return }
        area.kind = kind
        prepareWorkspaceAreaForCurrentMode(&area)
        _ = workspaceLayout.updateArea(area)
        activateWorkspaceAreaResources(area)
    }

    private func prepareWorkspaceAreaForCurrentMode(_ area: inout WorkspaceArea) {
        switch area.kind {
        case .chat:
            if area.chatId == nil {
                area.chatId = activeChatId
            }
        case .nodes:
            area.workflowId = resolvedWorkflowId(area.workflowId)
            if area.workflowId == nil {
                area.workflowId = createEmptyWorkflow()
            }
            if let workflowId = area.workflowId {
                activeWorkflowId = workflowId
            }
        case .terminal:
            if area.terminalIds.isEmpty {
                area.terminalIds = [addTerminal()]
            }
        case .agents, .files, .browser, .marketplace, .photoEditor, .videoEditor, .dashboard:
            break
        }
    }

    private func prepareWorkspaceAreaForNewMode(_ area: inout WorkspaceArea) {
        switch area.kind {
        case .chat:
            if area.chatId == nil {
                area.chatId = createEmptyChat(select: false)
            }
        case .nodes:
            area.workflowId = resolvedWorkflowId(area.workflowId) ?? createEmptyWorkflow()
            if let workflowId = area.workflowId {
                activeWorkflowId = workflowId
            }
        case .terminal:
            if area.terminalIds.isEmpty {
                area.terminalIds = [addTerminal()]
            }
        case .agents, .files, .browser, .marketplace, .photoEditor, .videoEditor, .dashboard:
            break
        }
    }

    private func activateWorkspaceAreaResources(_ area: WorkspaceArea) {
        switch area.kind {
        case .chat:
            if let chatId = area.chatId, chats.contains(where: { $0.id == chatId }) {
                activeChatId = chatId
            }
        case .nodes:
            if let workflowId = area.workflowId, workflows.contains(where: { $0.id == workflowId }) {
                activeWorkflowId = workflowId
            }
        case .terminal:
            if area.terminalIds.isEmpty {
                ensureTerminalExists()
            }
        case .agents, .files, .browser, .marketplace, .photoEditor, .videoEditor, .dashboard:
            break
        }
    }

    private func updateActiveWorkspaceAreaResource(_ update: (inout WorkspaceArea) -> Void) {
        guard var area = workspaceLayout.area(id: activeWorkspaceAreaId) else { return }
        update(&area)
        _ = workspaceLayout.updateArea(area)
    }

    func selectWorkspaceArea(_ areaId: String) {
        guard let area = workspaceLayout.area(id: areaId) else { return }
        activeWorkspaceAreaId = areaId
        activateWorkspaceAreaResources(area)
        selectSection(area.kind.section)
    }

    func setWorkspaceAreaKind(_ areaId: String, kind: WorkspaceAreaKind) {
        activeWorkspaceAreaId = areaId
        guard var area = workspaceLayout.area(id: areaId) else { return }
        area.kind = kind
        prepareWorkspaceAreaForNewMode(&area)
        _ = workspaceLayout.updateArea(area)
        activateWorkspaceAreaResources(area)
        selectSection(kind.section)
    }

    func splitWorkspaceArea(_ areaId: String, axis: WorkspaceSplitAxis, fraction: CGFloat, newAreaFirst: Bool = false) {
        let newAreaId = "workspace-area-\(UUID().uuidString)"
        let splitId = "workspace-split-\(UUID().uuidString)"
        guard let sourceArea = workspaceLayout.area(id: areaId) else { return }
        var newArea = WorkspaceArea(id: newAreaId, kind: sourceArea.kind)
        prepareWorkspaceAreaForNewMode(&newArea)
        guard workspaceLayout.splitArea(
            id: areaId,
            axis: axis,
            fraction: fraction,
            splitId: splitId,
            newArea: newArea,
            newAreaFirst: newAreaFirst
        ) else { return }

        activeWorkspaceAreaId = newAreaId
        activateWorkspaceAreaResources(newArea)
        selectSection(newArea.kind.section)
    }

    func updateWorkspaceSplitFraction(_ splitId: String, fraction: CGFloat) {
        _ = workspaceLayout.updateSplitFraction(id: splitId, fraction: fraction)
    }

    func collapseWorkspaceSplit(_ splitId: String, removeFirst: Bool) {
        let removedAreaIds = workspaceLayout.collapseSplit(id: splitId, removeFirst: removeFirst)
        guard !removedAreaIds.isEmpty else { return }
        cleanupWorkspaceAreas(removedAreaIds)
        if workspaceLayout.area(id: activeWorkspaceAreaId) == nil,
           let firstLeafId = workspaceLayout.firstLeafId {
            activeWorkspaceAreaId = firstLeafId
            if let area = workspaceLayout.area(id: firstLeafId) {
                activateWorkspaceAreaResources(area)
                selectSection(area.kind.section)
            }
        }
    }

    private func cleanupWorkspaceAreas(_ areaIds: [String]) {
        _ = areaIds
    }

    func selectSection(_ section: AppSection) {
        activeSection = section
        if section != .workflows {
            selectedAgentIdForNodes = nil
        }
        if section == .terminals {
            ensureTerminalExists()
        }
    }

    func openWorkspace(kind: WorkspaceAreaKind, projectId: String? = nil) {
        activeSection = kind.section
        updateActiveWorkspaceAreaResource { area in
            area.kind = kind
            area.projectId = projectId
            area.chatId = nil
            area.workflowId = nil
            area.terminalIds = []
            area.documentURL = nil
            if kind != .dashboard { area.dashboardId = nil }
            prepareWorkspaceAreaForNewMode(&area)
        }
    }

    @discardableResult
    func createDashboard(in projectId: String? = nil, title: String = "Novo Dashboard") -> String {
        let id = "dashboard-\(UUID().uuidString)"
        let dashboard = DashboardDocument(
            id: id,
            projectId: projectId,
            title: title,
            subtitle: "Adicione dados pelo chat ou pelos filtros do dashboard.",
            metrics: [],
            points: [],
            updatedAt: Date()
        )
        dashboards.insert(dashboard, at: 0)
        if let projectId, let index = projects.firstIndex(where: { $0.id == projectId }) {
            projects[index].dashboardIds.append(id)
        }
        activeSection = .dashboard
        updateActiveWorkspaceAreaResource { area in
            area.kind = .dashboard
            area.projectId = projectId
            area.dashboardId = id
        }
        return id
    }

    func openMarketplace() {
        openWorkspace(kind: .marketplace)
    }

    func openDashboard(id: String) {
        guard let dashboard = dashboards.first(where: { $0.id == id }) else { return }
        activeSection = .dashboard
        updateActiveWorkspaceAreaResource { area in
            area.kind = .dashboard
            area.projectId = dashboard.projectId
            area.dashboardId = id
        }
    }

    func toggleDashboardPinned(_ dashboardId: String) {
        guard let index = dashboards.firstIndex(where: { $0.id == dashboardId }) else { return }
        dashboards[index].isPinned.toggle()
    }

    func archiveDashboard(_ dashboardId: String) {
        guard let index = dashboards.firstIndex(where: { $0.id == dashboardId }) else { return }
        dashboards[index].isArchived = true
    }

    func deleteDashboard(_ dashboardId: String) {
        projects.indices.forEach { projects[$0].dashboardIds.removeAll { $0 == dashboardId } }
        dashboards.removeAll { $0.id == dashboardId }
    }

    func selectChat(_ chatId: String, source: String = "chats") {
        activeChatId = chatId
        activeSection = .chat
        selectedChatSource = source
        updateActiveWorkspaceAreaResource { area in
            area.kind = .chat
            area.chatId = chatId
        }
    }

    func selectProject(_ projectId: String) {
        contextProjectId = projectId
        activeSection = .chat
        selectedChatSource = "projects"
        if let project = projects.first(where: { $0.id == projectId }), let firstChatId = project.chatIds.first {
            activeChatId = firstChatId
            updateActiveWorkspaceAreaResource { area in
                area.kind = .chat
                area.chatId = firstChatId
            }
        }
    }

    func selectProjectChat(_ chatId: String, projectId: String) {
        contextProjectId = projectId
        selectChat(chatId, source: "projects")
    }

    func startNewChat(title: String? = nil) {
        let newChatId = createEmptyChat(title: title, select: false)
        activeChatId = newChatId
        activeSection = .chat
        selectedChatSource = "chats"
        updateActiveWorkspaceAreaResource { area in
            area.kind = .chat
            area.chatId = newChatId
        }
    }

    func toggleChatPinned(_ chatId: String) {
        guard let index = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[index].isPinned.toggle()
    }

    func archiveChat(_ chatId: String) {
        guard let index = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[index].isArchived = true
        if activeChatId == chatId { selectFirstAvailableChat(excluding: chatId) }
    }

    func deleteChat(_ chatId: String) {
        projects.indices.forEach { projects[$0].chatIds.removeAll { $0 == chatId } }
        chats.removeAll { $0.id == chatId }
        if chats.isEmpty {
            _ = createEmptyChat(title: "Nova Conversa", select: true)
        } else if activeChatId == chatId {
            selectFirstAvailableChat(excluding: chatId)
        }
    }

    private func selectFirstAvailableChat(excluding chatId: String) {
        guard let next = chats.first(where: { !$0.isArchived && $0.id != chatId }) ?? chats.first(where: { $0.id != chatId }) else {
            _ = createEmptyChat(title: "Nova Conversa", select: true)
            return
        }
        selectChat(next.id)
    }

    @discardableResult
    private func createEmptyChat(title: String? = nil, select: Bool = true) -> String {
        let newChatId = "chat-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(5))"
        let newChat = ChatSession(
            id: newChatId,
            title: title ?? "Nova Conversa #\(chats.count + 1)",
            modelId: settings.general.defaultModel,
            date: "Hoje, \(Self.shortTime())",
            messages: []
        )
        chats.insert(newChat, at: 0)
        if select {
            activeChatId = newChatId
            activeSection = .chat
            selectedChatSource = "chats"
        }
        return newChatId
    }

    func addProjectChat(title: String, to projectId: String? = nil) {
        let newChatId = "chat-\(Int(Date().timeIntervalSince1970 * 1000))"
        chats.insert(
            ChatSession(id: newChatId, title: title, modelId: settings.general.defaultModel, date: "Hoje, \(Self.shortTime())", messages: []),
            at: 0
        )

        let targetProjectId: String
        if projects.isEmpty {
            targetProjectId = "proj-\(Int(Date().timeIntervalSince1970))"
            projects = [Project(id: targetProjectId, name: "Geral", chatIds: [newChatId])]
        } else if let projectId, let index = projects.firstIndex(where: { $0.id == projectId }) {
            targetProjectId = projectId
            projects[index].chatIds.append(newChatId)
        } else if let contextProjectId, let index = projects.firstIndex(where: { $0.id == contextProjectId }) {
            targetProjectId = contextProjectId
            projects[index].chatIds.append(newChatId)
        } else {
            targetProjectId = projects[0].id
            projects[0].chatIds.append(newChatId)
        }

        contextProjectId = targetProjectId
        projectsDropdownOpen = true
        selectChat(newChatId, source: "projects")
    }

    @discardableResult
    func createProject() -> String {
        let newId = "proj-\(Int(Date().timeIntervalSince1970 * 1000))"
        projects.insert(Project(id: newId, name: "Novo Projeto \(projects.count + 1)", chatIds: []), at: 0)
        contextProjectId = newId
        projectsDropdownOpen = true
        activeSection = .chat
        selectedChatSource = "projects"
        return newId
    }

    func renameProject(_ projectId: String, to name: String) {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        projects[index].name = name
    }

    func updateProjectIcon(_ projectId: String, symbol: String? = nil, color: ProjectIconColor? = nil) {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        if let symbol {
            projects[index].symbol = symbol
        }
        if let color {
            projects[index].iconColor = color
        }
    }

    func toggleProjectPinned(_ projectId: String) {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        projects[index].isPinned.toggle()
    }

    func archiveProject(_ projectId: String) {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        projects[index].isArchived = true
        if contextProjectId == projectId { contextProjectId = nil }
    }

    func deleteProject(_ projectId: String) {
        projects.removeAll { $0.id == projectId }
        if contextProjectId == projectId { contextProjectId = nil }
    }

    func addProjectChatFromDraft() {
        let title = projectChatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        addProjectChat(title: title)
        projectChatDraft = ""
    }

    func changeActiveChatModel(_ id: ModelId) {
        guard let index = chats.firstIndex(where: { $0.id == activeChatId }) else { return }
        let oldModelId = chats[index].modelId
        guard oldModelId != id else { return }
        
        chats[index].modelId = id
        
        let oldName = models.first(where: { $0.id == oldModelId })?.name ?? oldModelId.rawValue
        let newName = models.first(where: { $0.id == id })?.name ?? id.rawValue
        
        let systemMessage = ChatMessage(
            id: "msg-system-\(UUID().uuidString)",
            sender: .system,
            text: "",
            timestamp: Self.shortTime(),
            isModelChange: true,
            modelChangeText: "Model changed from \(oldName) to \(newName)."
        )
        chats[index].messages.append(systemMessage)
    }

    func chat(id chatId: String?) -> ChatSession {
        if let chatId, let chat = chats.first(where: { $0.id == chatId }) {
            return chat
        }
        return activeChat
    }

    func sendMessage(_ text: String, chatId: String? = nil) {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let targetChatId = chatId ?? activeChatId
        guard !cleaned.isEmpty, let index = chats.firstIndex(where: { $0.id == targetChatId }) else { return }
        chats[index].messages.append(
            ChatMessage(
                id: "msg-user-\(UUID().uuidString)",
                sender: .user,
                text: cleaned,
                timestamp: Self.shortTime()
            )
        )

        let chatId = targetChatId
        let modelId = chats[index].modelId
        guard let model = models.first(where: { $0.id == modelId }) else { return }
        let history = chats[index].messages
            .filter { !$0.isModelChange && !$0.text.isEmpty }
            .suffix(30)
            .map { AIConversationMessage(role: $0.sender.rawValue, content: $0.text) }
        tokenUsageByChat[chatId] = estimatedTokenUsage(messages: Array(history), model: model)
        let credential = try? keychainStore.secret(account: model.provider.keychainAccount)
        let startedAt = Date()
        generatingChatIds.insert(chatId)
        let progressMessageId = "msg-progress-\(UUID().uuidString)"
        let plannedProgressSteps = contextualProgressSteps(for: cleaned)
        chats[index].messages.append(
            ChatMessage(
                id: progressMessageId,
                sender: .assistant,
                text: "",
                timestamp: Self.shortTime(),
                isProgressMessage: true,
                progressSteps: [],
                activeProgressStepIndex: nil,
                isProgressActive: true
            )
        )
        if voiceState == .listening { voiceState = .processing }

        Task {
            let progressTask = Task { @MainActor [weak self] in
                guard let self else { return }
                try? await Task.sleep(for: .milliseconds(520))
                guard !Task.isCancelled,
                      let initialChatIndex = self.chats.firstIndex(where: { $0.id == chatId }),
                      let initialMessageIndex = self.chats[initialChatIndex].messages.firstIndex(where: { $0.id == progressMessageId }) else { return }
                self.chats[initialChatIndex].messages[initialMessageIndex].progressSteps = plannedProgressSteps
                self.chats[initialChatIndex].messages[initialMessageIndex].activeProgressStepIndex = 0

                var nextIndex = 1
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(850))
                    guard !Task.isCancelled,
                          let chatIndex = self.chats.firstIndex(where: { $0.id == chatId }),
                          let messageIndex = self.chats[chatIndex].messages.firstIndex(where: { $0.id == progressMessageId }) else { return }
                    let count = self.chats[chatIndex].messages[messageIndex].progressSteps.filter { $0.type != .header }.count
                    guard count > 0 else { return }
                    self.chats[chatIndex].messages[messageIndex].activeProgressStepIndex = min(nextIndex, count - 1)
                    nextIndex += 1
                }
            }
            do {
                let reply = try await aiProviderService.reply(
                    model: model,
                    messages: Array(history),
                    credential: credential,
                    localPort: settings.localRuntime.ollamaPort
                )
                guard let targetIndex = chats.firstIndex(where: { $0.id == chatId }) else { return }
                progressTask.cancel()
                chats[targetIndex].messages.removeAll { $0.id == progressMessageId }
                let rendered = makeInteractiveContent(from: reply)
                let generatedImagePath = reply.generatedImageData.flatMap {
                    persistGeneratedImage($0, mimeType: reply.generatedImageMimeType)
                }
                chats[targetIndex].messages.append(
                    ChatMessage(
                        id: "msg-ai-\(UUID().uuidString)",
                        sender: .assistant,
                        text: reply.text,
                        timestamp: Self.shortTime(),
                        modelUsed: model.name,
                        blocks: rendered.blocks,
                        responseTime: String(format: "%.1fs", Date().timeIntervalSince(startedAt)),
                        generatedImagePath: generatedImagePath
                    )
                )
                if let dashboard = rendered.dashboard {
                    dashboards.insert(dashboard, at: 0)
                }
                if let usage = reply.usage {
                    tokenUsageByChat[chatId] = usage
                } else {
                    tokenUsageByChat[chatId] = estimatedTokenUsage(
                        messages: Array(history) + [AIConversationMessage(role: "assistant", content: reply.text)],
                        model: model
                    )
                }
#if os(macOS)
                if settings.voice.automaticallySpeakReplies || voiceState == .processing {
                    voiceState = .speaking
                    speechService.speak(reply.voiceText ?? reply.text, profile: settings.voice.selectedProfile)
                } else {
                    voiceState = .idle
                }
#endif
            } catch {
                guard let targetIndex = chats.firstIndex(where: { $0.id == chatId }) else { return }
                progressTask.cancel()
                chats[targetIndex].messages.removeAll { $0.id == progressMessageId }
                chats[targetIndex].messages.append(
                    ChatMessage(
                        id: "msg-error-\(UUID().uuidString)",
                        sender: .assistant,
                        text: "Não foi possível obter uma resposta real de **\(model.name)**.\n\n\(error.localizedDescription)",
                        timestamp: Self.shortTime(),
                        modelUsed: model.name
                    )
                )
                showNotice(error.localizedDescription)
                voiceState = .error
            }
            generatingChatIds.remove(chatId)
        }
    }

    private func contextualProgressSteps(for prompt: String) -> [ProgressStep] {
        let normalized = prompt.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        let titles: [(ProgressStep.StepType, String, String?)]
        if AIProviderService.looksLikeImageGenerationRequest(prompt) {
            titles = [
                (.thought, "Interpretando direção visual", nil),
                (.textInfo, "Preparando geração da imagem", "OpenAI Images"),
                (.textInfo, "Renderizando resultado", nil)
            ]
        } else if normalized.contains("codigo") || normalized.contains("swift") || normalized.contains("arquivo") || normalized.contains("implemente") {
            titles = [
                (.fileAnalysis, "Analisando o contexto do projeto", nil),
                (.thought, "Planejando as alterações", nil),
                (.fileEdit, "Preparando a resposta e os trechos alterados", nil)
            ]
        } else if normalized.contains("pesquis") || normalized.contains("internet") || normalized.contains("noticia") {
            titles = [
                (.textInfo, "Definindo fontes relevantes", nil),
                (.thought, "Pesquisando e comparando resultados", nil),
                (.textInfo, "Organizando a resposta", nil)
            ]
        } else {
            titles = [
                (.thought, "Interpretando o pedido", nil),
                (.textInfo, "Consultando o contexto da conversa", nil),
                (.textInfo, "Gerando a resposta", nil)
            ]
        }
        return titles.map { type, title, value in
            ProgressStep(type: type, title: title, subtitle: nil, value: value)
        }
    }

    func resendMessage(_ message: ChatMessage, chatId: String? = nil) {
        guard message.sender == .user else { return }
        sendMessage(message.text, chatId: chatId)
    }

    private func persistGeneratedImage(_ data: Data, mimeType: String?) -> String? {
        let fileManager = FileManager.default
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        let directory = support
            .appendingPathComponent("Assistente pessoal", isDirectory: true)
            .appendingPathComponent("Generated Images", isDirectory: true)
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let fileExtension = mimeType == "image/jpeg" ? "jpg" : (mimeType == "image/webp" ? "webp" : "png")
            let url = directory.appendingPathComponent("image-\(UUID().uuidString).\(fileExtension)")
            try data.write(to: url, options: .atomic)
            return url.path
        } catch {
            showNotice("A imagem foi gerada, mas não pôde ser salva: \(error.localizedDescription)")
            return nil
        }
    }

    func tokenUsage(for chatId: String?, draft: String = "") -> TokenUsage {
        let chat = self.chat(id: chatId)
        guard let model = models.first(where: { $0.id == chat.modelId }) else { return .empty(limit: 128_000) }
        let history = chat.messages
            .filter { !$0.isModelChange && !$0.text.isEmpty }
            .suffix(30)
            .map { AIConversationMessage(role: $0.sender.rawValue, content: $0.text) }
        var usage = tokenUsageByChat[chat.id] ?? estimatedTokenUsage(messages: Array(history), model: model)
        if !draft.isEmpty {
            usage.inputTokens += Self.estimateTokens(in: draft)
            usage.isEstimated = true
        }
        usage.contextLimit = model.contextWindow
        return usage
    }

    private func estimatedTokenUsage(messages: [AIConversationMessage], model: ModelConfig) -> TokenUsage {
        let input = messages.reduce(0) { $0 + Self.estimateTokens(in: $1.content) + 4 }
        return TokenUsage(inputTokens: input, outputTokens: 0, contextLimit: model.contextWindow, isEstimated: true)
    }

    nonisolated static func estimateTokens(in text: String) -> Int {
        guard !text.isEmpty else { return 0 }
        let words = text.split(whereSeparator: { $0.isWhitespace || $0.isPunctuation }).count
        let scalarEstimate = Int(ceil(Double(text.unicodeScalars.count) / 4.0))
        return max(words, scalarEstimate)
    }

    private func makeInteractiveContent(from reply: AIProviderReply) -> (blocks: [InteractiveBlock], dashboard: DashboardDocument?) {
        var blocks: [InteractiveBlock] = []
        var createdDashboard: DashboardDocument?
        for raw in reply.blocks {
            switch raw.type {
            case "code":
                guard let code = raw.code, !code.isEmpty else { continue }
                blocks.append(InteractiveBlock(
                    type: .code,
                    title: raw.title ?? "Código",
                    language: raw.language,
                    code: code,
                    previousCode: raw.previousCode,
                    filePath: raw.filePath
                ))
            case "action-plan":
                let steps = (raw.steps ?? []).map { ActionStep(title: $0, description: $0, done: false) }
                guard !steps.isEmpty else { continue }
                blocks.append(InteractiveBlock(type: .actionPlan, title: raw.title ?? "Plano", steps: steps))
            case "command-run":
                guard let command = raw.command, !command.isEmpty else { continue }
                blocks.append(InteractiveBlock(type: .commandRun, title: raw.title ?? "Comando sugerido", command: command))
            case "dashboard":
                guard let rawDashboard = raw.dashboard else { continue }
                let id = "dashboard-\(UUID().uuidString)"
                let dashboard = DashboardDocument(
                    id: id,
                    projectId: contextProjectId,
                    title: rawDashboard.title,
                    subtitle: rawDashboard.subtitle ?? "Gerado a partir desta conversa.",
                    metrics: (rawDashboard.metrics ?? []).enumerated().map { index, metric in
                        DashboardMetric(id: "metric-\(index)", title: metric.title, value: metric.value, unit: metric.unit ?? "", change: metric.change)
                    },
                    points: (rawDashboard.points ?? []).map { DashboardPoint(label: $0.label, value: $0.value) },
                    updatedAt: Date()
                )
                createdDashboard = dashboard
                blocks.append(InteractiveBlock(type: .dashboard, title: raw.title ?? rawDashboard.title, successDetails: id))
            default:
                continue
            }
        }
        return (blocks, createdDashboard)
    }

    func openDiffView(filePath: String) {
        let target = files.first(where: { filePath.contains($0.name) || $0.path == filePath }) ?? selectedFile
        openSandboxFile(target, focusChange: true)
    }

    /// Abre um sandbox file no painel lateral de código (IDE).
    /// Com focusChange, posiciona o scroll na primeira linha alterada do arquivo.
    func openSandboxFile(_ file: FileArtifact, focusChange: Bool = false) {
        selectedFileId = file.id
        var line: Int?
        if focusChange, file.previousContent != nil {
            line = generatedDiffLines(for: file)
                .first(where: { $0.type != .neutral })
                .flatMap { $0.newNumber ?? $0.oldNumber }
        }
        selectedCodeFile = CodeFileReference(
            name: file.name,
            path: file.path,
            projectRootPath: Self.projectRootURL.path,
            line: line,
            content: file.content,
            previousContent: file.previousContent,
            language: URL(fileURLWithPath: file.name).pathExtension
        )
        rightSidebar = .codeFile
        rightSidebarWidth = max(rightSidebarWidth, 740)
    }

    func openCodeReference(filePath: String, line: Int?) {
        guard let url = resolveSourceFileURL(filePath) else {
            showNotice("Arquivo não encontrado: \(filePath)")
            return
        }

        let content = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        selectedCodeFile = CodeFileReference(
            name: url.lastPathComponent,
            path: url.path,
            projectRootPath: Self.projectRootURL.path,
            line: line,
            content: content
        )
        rightSidebar = .codeFile
        rightSidebarWidth = max(rightSidebarWidth, 740)
    }

    /// Review de um bloco de código avulso de uma resposta: abre o snippet no painel IDE.
    func openCodeSnippetReview(language: String?, code: String, previousCode: String? = nil, filePath: String? = nil) {
        let name = (language?.isEmpty == false ? language! : "code").lowercased()
        let localOriginal = filePath
            .flatMap(resolveSourceFileURL)
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        selectedCodeFile = CodeFileReference(
            name: filePath.map { URL(fileURLWithPath: $0).lastPathComponent } ?? name,
            path: filePath ?? "snippet://\(name)/\(code.hashValue)",
            projectRootPath: Self.projectRootURL.path,
            line: nil,
            content: code,
            previousContent: previousCode ?? localOriginal,
            language: language
        )
        rightSidebar = .codeFile
        rightSidebarWidth = max(rightSidebarWidth, 740)
    }

    @discardableResult
    func saveSelectedCodeFile(content: String) throws -> String {
        guard var selected = selectedCodeFile else {
            throw NSError(domain: "AssistentePessoal.CodeEditor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Nenhum arquivo está aberto."])
        }

        selected.content = content
        selectedCodeFile = selected
        if let index = files.firstIndex(where: { $0.path == selected.path || $0.name == selected.name }) {
            files[index].content = content
        }

        guard !selected.path.hasPrefix("snippet://") else {
            return "Snippet atualizado nesta sessão."
        }

        let url = URL(fileURLWithPath: selected.path)
        guard url.isFileURL, !selected.path.isEmpty else {
            throw NSError(domain: "AssistentePessoal.CodeEditor", code: 2, userInfo: [NSLocalizedDescriptionKey: "O caminho do arquivo é inválido."])
        }
        try content.write(to: url, atomically: true, encoding: .utf8)
        return "Salvo em \(url.lastPathComponent)"
    }

    /// Review de um bloco de terminal de uma resposta: abre o painel lateral de terminal.
    func openTerminalReview() {
        rightSidebar = .terminal
        rightSidebarWidth = max(rightSidebarWidth, 520)
    }

    func handleCodeReferenceURL(_ url: URL) -> Bool {
        guard url.scheme == "openassistant-code",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let filePath = components.queryItems?.first(where: { $0.name == "file" })?.value
        else { return false }

        let line = components.queryItems?
            .first(where: { $0.name == "line" })?
            .value
            .flatMap(Int.init)
        openCodeReference(filePath: filePath, line: line)
        return true
    }

    func acceptAllPendingChanges() {
        guard let index = chats.firstIndex(where: { $0.id == activeChatId }) else { return }
        if let msgIndex = chats[index].messages.firstIndex(where: { $0.isProgressMessage }) {
            chats[index].messages[msgIndex].isProgressMessage = false
            chats[index].messages[msgIndex].text = "Todas as alterações foram aplicadas com sucesso no arquivo `OpenAssistantStore.swift`. A seleção de chats e projetos foi desacoplada e as transições do painel de controle funcionam independentemente."
            chats[index].messages[msgIndex].finalChangesSummary = ChangesSummary(fileCount: 1, addedCount: 16, removedCount: 8)
            chats[index].messages[msgIndex].responseTime = "3.2s"
        }
        pendingChanges.removeAll()
        showNotice("Alterações aceitas e aplicadas.")
    }

    func rejectAllPendingChanges() {
        guard let index = chats.firstIndex(where: { $0.id == activeChatId }) else { return }
        if let msgIndex = chats[index].messages.firstIndex(where: { $0.isProgressMessage }) {
            chats[index].messages[msgIndex].isProgressMessage = false
            chats[index].messages[msgIndex].text = "As alterações de código propostas foram rejeitadas e o arquivo original foi mantido."
            chats[index].messages[msgIndex].finalChangesSummary = nil
            chats[index].messages[msgIndex].responseTime = "2.4s"
        }
        pendingChanges.removeAll()
        showNotice("Alterações rejeitadas.")
    }

    func copyToClipboard(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private static var sourceRootURL: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    }

    private static var projectRootURL: URL {
        sourceRootURL.deletingLastPathComponent()
    }

    private func resolveSourceFileURL(_ rawPath: String) -> URL? {
        let cleaned = rawPath
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "`"))
        guard !cleaned.isEmpty else { return nil }

        let expandedPath = (cleaned as NSString).expandingTildeInPath
        let absoluteURL = URL(fileURLWithPath: expandedPath)
        if absoluteURL.path.hasPrefix("/"),
           FileManager.default.fileExists(atPath: absoluteURL.path) {
            return absoluteURL
        }

        let candidates = [
            Self.projectRootURL.appendingPathComponent(cleaned),
            Self.sourceRootURL.appendingPathComponent(cleaned)
        ]
        if let direct = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) {
            return direct
        }

        let targetName = URL(fileURLWithPath: cleaned).lastPathComponent
        let normalizedSuffix = cleaned.replacingOccurrences(of: "\\", with: "/")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.projectRootURL,
            includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return nil }

        for case let url as URL in enumerator {
            if url.lastPathComponent == "DerivedData" || url.lastPathComponent == "Build" {
                enumerator.skipDescendants()
                continue
            }

            let resourceValues = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey])
            if resourceValues?.isDirectory == true {
                continue
            }

            if url.lastPathComponent == targetName || url.path.replacingOccurrences(of: "\\", with: "/").hasSuffix(normalizedSuffix) {
                return url
            }
        }

        return nil
    }

    @discardableResult
    func createAgent(in projectId: String? = nil) -> String {
        let id = "agent-\(Int(Date().timeIntervalSince1970 * 1000))"
        let newAgent = Agent(
            id: id,
            name: "Security Auditing Agent",
            role: "Inspecionador de Código e Portas",
            modelId: .llama,
            status: .idle,
            lastActive: "Criado agora",
            permissions: ["Ler Arquivos", "Garantir Sandbox"],
            tools: ["CVE_DB_Search", "SecurityScanner"],
            prompt: "Você inspeciona o código e arquivos buscando por falhas de injeção ou APIs expostas."
        )
        agents.append(newAgent)
        selectedAgentId = id
        if let projectId, let index = projects.firstIndex(where: { $0.id == projectId }) {
            projects[index].agentIds.append(id)
            contextProjectId = projectId
        }
        activeSection = .agents
        updateActiveWorkspaceAreaResource { area in
            area.kind = .agents
            area.projectId = projectId
        }
        return id
    }

    func updateAgent(_ agent: Agent) {
        guard let index = agents.firstIndex(where: { $0.id == agent.id }) else { return }
        agents[index] = agent
    }

    func duplicateSelectedAgent() {
        guard let agent = selectedAgent else { return }
        var duplicate = agent
        duplicate.id = "agent-\(Int(Date().timeIntervalSince1970 * 1000))"
        duplicate.name = "\(agent.name) Cópia"
        duplicate.status = .idle
        agents.append(duplicate)
        selectedAgentId = duplicate.id
    }

    func deleteSelectedAgent() {
        guard let selectedAgentId else { return }
        agents.removeAll { $0.id == selectedAgentId }
        self.selectedAgentId = agents.first?.id
    }

    func toggleAgentPinned(_ agentId: String) {
        guard let index = agents.firstIndex(where: { $0.id == agentId }) else { return }
        agents[index].isPinned.toggle()
    }

    func archiveAgent(_ agentId: String) {
        guard let index = agents.firstIndex(where: { $0.id == agentId }) else { return }
        agents[index].isArchived = true
        if selectedAgentId == agentId { selectedAgentId = visibleAgents.first?.id }
    }

    func deleteAgent(_ agentId: String) {
        projects.indices.forEach { projects[$0].agentIds.removeAll { $0 == agentId } }
        agents.removeAll { $0.id == agentId }
        if selectedAgentId == agentId { selectedAgentId = visibleAgents.first?.id }
        if selectedAgentIdForNodes == agentId { selectedAgentIdForNodes = nil }
    }

    func toggleAgentStatus(_ agentId: String) {
        guard let index = agents.firstIndex(where: { $0.id == agentId }) else { return }
        agents[index].status = agents[index].status == .running ? .paused : .running
    }

    func showWorkflow(for agentId: String) {
        let workflowId = ensureWorkflowForAgent(agentId)
        selectedAgentIdForNodes = agentId
        openWorkflow(workflowId)
    }

    func openWorkflow(_ workflowId: String, inWorkspaceArea areaId: String? = nil) {
        guard workflows.contains(where: { $0.id == workflowId }) else { return }
        activeWorkflowId = workflowId
        selectedWorkflowNodeIds = []
        selectedWorkflowFrameIds = []
        if let areaId, var area = workspaceLayout.area(id: areaId) {
            area.kind = .nodes
            area.workflowId = workflowId
            _ = workspaceLayout.updateArea(area)
            activeWorkspaceAreaId = areaId
        } else {
            updateActiveWorkspaceAreaResource { area in
                area.kind = .nodes
                area.workflowId = workflowId
            }
        }
        activeSection = .workflows
        fitWorkflowToView(workflowId)
    }

    private func workflowIdForAgent(_ agentId: String) -> String {
        "wf-agent-\(agentId)"
    }

    @discardableResult
    private func ensureWorkflowForAgent(_ agentId: String) -> String {
        let workflowId = workflowIdForAgent(agentId)
        if let existingAgentWorkflow = workflows.first(where: { $0.id == workflowId }),
           !existingAgentWorkflow.nodes.isEmpty || !existingAgentWorkflow.connections.isEmpty {
            return workflowId
        }

        if let existingWorkflow = workflows.first(where: { workflow in
            workflow.nodes.contains { $0.config["agentId"] == agentId }
        }) {
            return existingWorkflow.id
        }

        if workflows.contains(where: { $0.id == workflowId }) {
            return workflowId
        }

        let agentName = agents.first(where: { $0.id == agentId })?.name ?? "Agente"
        workflows.insert(
            Workflow(
                id: workflowId,
                name: "\(agentName) Nodes",
                description: "Canvas de nodes do agente.",
                isActive: true,
                nodes: [],
                connections: []
            ),
            at: 0
        )
        return workflowId
    }

    private func bindActiveNodesArea(to workflowId: String) {
        updateActiveWorkspaceAreaResource { area in
            if area.kind == .nodes {
                area.workflowId = workflowId
            }
        }
    }

    @discardableResult
    func addTerminal(toWorkspaceArea areaId: String? = nil) -> String {
        let session = ShellSession(title: "zsh \(shellTerminals.count + 1)")
        shellTerminals.append(session)
        terminalOrder.append(session.id)
        if let areaId, var area = workspaceLayout.area(id: areaId) {
            area.kind = .terminal
            if !area.terminalIds.contains(session.id) {
                area.terminalIds.append(session.id)
            }
            _ = workspaceLayout.updateArea(area)
        }
        return session.id
    }

    /// Garante que exista ao menos um terminal ao abrir a seção.
    func ensureTerminalExists() {
        if shellTerminals.isEmpty {
            _ = addTerminal()
        }
    }

    func closeShellTerminal(_ id: String) {
        guard let index = shellTerminals.firstIndex(where: { $0.id == id }) else { return }
        shellTerminals[index].terminate()
        shellTerminals.remove(at: index)
        terminalOrder.removeAll { $0 == id }
        terminalFloatingFrames[id] = nil
    }

    /// Ordem efetiva das janelas agrupadas (respeita reordenação manual).
    var groupedTerminals: [ShellSession] {
        let floating = Set(terminalFloatingFrames.keys)
        let grouped = shellTerminals.filter { !floating.contains($0.id) }
        return grouped.sorted { a, b in
            let ia = terminalOrder.firstIndex(of: a.id) ?? Int.max
            let ib = terminalOrder.firstIndex(of: b.id) ?? Int.max
            return ia < ib
        }
    }

    func groupedTerminals(ids: [String]?) -> [ShellSession] {
        let allowed = ids.map(Set.init)
        return groupedTerminals.filter { shell in
            allowed?.contains(shell.id) ?? true
        }
    }

    var floatingTerminals: [ShellSession] {
        shellTerminals.filter { terminalFloatingFrames[$0.id] != nil }
    }

    func floatingTerminals(ids: [String]?) -> [ShellSession] {
        let allowed = ids.map(Set.init)
        return floatingTerminals.filter { shell in
            allowed?.contains(shell.id) ?? true
        }
    }

    /// Solta a janela da grade em uma posição absoluta.
    func detachTerminal(_ id: String, frame: CGRect) {
        terminalFloatingFrames[id] = frame
    }

    func moveFloatingTerminal(_ id: String, to origin: CGPoint) {
        guard var frame = terminalFloatingFrames[id] else { return }
        frame.origin = origin
        terminalFloatingFrames[id] = frame
    }

    /// Reagrupa todas as janelas soltas de volta à grade no eixo indicado.
    func regroupTerminals(axis: TerminalTileAxis) {
        terminalTileAxis = axis
        terminalFloatingFrames.removeAll()
        // Mantém na ordem original quaisquer que faltarem.
        for shell in shellTerminals where !terminalOrder.contains(shell.id) {
            terminalOrder.append(shell.id)
        }
    }

    /// Reordena janelas agrupadas via drag.
    func reorderGroupedTerminal(_ id: String, before targetId: String) {
        guard id != targetId,
              let from = terminalOrder.firstIndex(of: id),
              let to = terminalOrder.firstIndex(of: targetId) else { return }
        let item = terminalOrder.remove(at: from)
        let insertAt = to > from ? to - 1 : to
        terminalOrder.insert(item, at: insertAt)
    }

    func openFile(_ fileId: String) {
        guard let file = files.first(where: { $0.id == fileId }) else { return }
        selectedFileId = file.id
        fileDiffMode = file.previousContent != nil
        activeSection = .files
    }

    func terminalAction(_ terminalId: String, action: String) {
        guard let index = terminals.firstIndex(where: { $0.id == terminalId }) else { return }
        switch action {
        case "pause":
            terminals[index].status = .paused
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .warning, text: "Process paused by system administrator directive."))
        case "play":
            terminals[index].status = .running
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .success, text: "Resuming process stream. Subscribing to thread context..."))
        case "restart":
            terminals[index].status = .running
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .info, text: "Rebooting terminal environment. Clearing heap allocation..."))
        case "close":
            terminals.remove(at: index)
        default:
            break
        }
    }

    func sendTerminalCommand(_ terminalId: String) {
        let text = terminalInputs[terminalId, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let index = terminals.firstIndex(where: { $0.id == terminalId }) else { return }
        terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .input, text: text))

        let command = text.lowercased()
        if command == "clear" {
            terminals[index].logs = []
        } else if command == "help" {
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .info, text: "Comandos disponíveis: help, status, clear, run."))
        } else if command == "status" {
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .success, text: "Runtime connected on port 3000. Sandbox integrity: OK. LLM temperature: 0.4."))
        } else if command.hasPrefix("run") {
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .success, text: "Forçando novo ciclo de varredura. Iniciando pipeline..."))
        } else {
            terminals[index].logs.append(TerminalLog(timestamp: Self.fullTime(), type: .info, text: "Comando '\(text)' executado localmente. Sem retornos registrados."))
        }
        terminalInputs[terminalId] = ""
    }

    @discardableResult
    private func createEmptyWorkflow() -> String {
        let id = "wf-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(5))"
        workflows.insert(
            Workflow(
                id: id,
                name: "Novo Workflow",
                description: "Canvas vazio para uma nova automação.",
                isActive: true,
                nodes: [],
                connections: []
            ),
            at: 0
        )
        activeWorkflowId = id
        selectedWorkflowNodeIds = []
        selectedWorkflowFrameIds = []
        workflowOffset = .zero
        workflowZoom = 1
        return id
    }

    func runWorkflow(_ workflowId: String? = nil) {
        runWorkflow(workflowId, triggeredByFrameId: nil, at: Date())
    }

    private func runWorkflow(_ workflowId: String?, triggeredByFrameId: String?, at date: Date) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        applyFrameExecutionContext(workflowIndex: workflowIndex)
        let snapshot = workflows[workflowIndex]
        let allowedNodeIds = executableNodeIds(in: snapshot, triggeredByFrameId: triggeredByFrameId, at: date)
        for index in workflows[workflowIndex].nodes.indices {
            let nodeId = workflows[workflowIndex].nodes[index].id
            workflows[workflowIndex].nodes[index].status = allowedNodeIds.contains(nodeId) ? .idle : .skipped
        }
        let id = workflows[workflowIndex].id
        let sequence = workflowExecutionSequence(workflowId: id).filter(allowedNodeIds.contains)
        guard !sequence.isEmpty else { return }
        if let triggeredByFrameId,
           let frameIndex = workflows[workflowIndex].frames.firstIndex(where: { $0.id == triggeredByFrameId }) {
            workflows[workflowIndex].frames[frameIndex].lastRunAt = date
        } else {
            for frameIndex in workflows[workflowIndex].frames.indices
            where workflows[workflowIndex].frames[frameIndex].kind == .schedule
                && !Set(workflows[workflowIndex].frames[frameIndex].nodeIds).isDisjoint(with: allowedNodeIds) {
                workflows[workflowIndex].frames[frameIndex].lastRunAt = date
            }
        }
        if id == "workflow-example-3" {
            Task { await runDailyDogImageWorkflow(workflowId: id, sequence: sequence) }
            return
        }
        for (offset, nodeId) in sequence.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(offset + 1) * 0.55) { [weak self] in
                guard let self, let currentWorkflowIndex = self.workflowIndex(for: id) else { return }
                for nodeIndex in self.workflows[currentWorkflowIndex].nodes.indices {
                    let current = self.workflows[currentWorkflowIndex].nodes[nodeIndex].id
                    if current == nodeId {
                        self.workflows[currentWorkflowIndex].nodes[nodeIndex].status = offset == sequence.count - 1 ? .success : .running
                    } else if let previousIndex = sequence.firstIndex(of: current), previousIndex < offset {
                        self.workflows[currentWorkflowIndex].nodes[nodeIndex].status = .success
                    }
                }
            }
        }
    }

    func addWorkflowNode(_ type: NodeType, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        let targetWorkflowId = workflows[workflowIndex].id
        let id = "node-\(UUID().uuidString)"
        let defaults = defaultNodeData(for: type)
        let origin = workflowNodeOriginAtMapCenter()
        var workflow = workflows[workflowIndex]
        workflow.nodes.append(
            WorkflowNode(
                id: id,
                name: defaults.name,
                type: type,
                x: origin.x,
                y: origin.y,
                status: .idle,
                description: defaults.description,
                config: defaults.config,
                temperature: defaults.temperature,
                allowSelfEdit: defaults.allowSelfEdit
            )
        )
        withAnimation(.snappy(duration: 0.2)) {
            workflows[workflowIndex] = workflow
            activeWorkflowId = targetWorkflowId
            bindActiveNodesArea(to: targetWorkflowId)
            selectedWorkflowNodeIds = [id]
            selectedWorkflowFrameIds = []
        }
        centerWorkflowMap(targetWorkflowId)
    }

    func addWorkflowFrame(_ kind: WorkflowFrameKind, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        let targetWorkflowId = workflows[workflowIndex].id
        let center = workflowNodeOriginAtMapCenter()
        let id = "frame-\(UUID().uuidString)"
        let frame = WorkflowFrame(
            id: id,
            name: kind.title,
            kind: kind,
            x: max(center.x - 110, 0),
            y: max(center.y - 70, 0),
            width: 560,
            height: 320,
            config: defaultFrameConfig(for: kind)
        )
        workflows[workflowIndex].frames.append(frame)
        activeWorkflowId = targetWorkflowId
        bindActiveNodesArea(to: targetWorkflowId)
        selectedWorkflowNodeIds = []
        selectedWorkflowFrameIds = [id]
        fitWorkflowToView(targetWorkflowId)
    }

    func updateWorkflowFrame(_ frame: WorkflowFrame, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let frameIndex = workflows[workflowIndex].frames.firstIndex(where: { $0.id == frame.id }) else { return }
        workflows[workflowIndex].frames[frameIndex] = frame
    }

    func selectWorkflowFrame(_ id: String, extend: Bool = false) {
        selectedWorkflowNodeIds = []
        if extend {
            if selectedWorkflowFrameIds.contains(id) {
                selectedWorkflowFrameIds.remove(id)
            } else {
                selectedWorkflowFrameIds.insert(id)
            }
        } else {
            selectedWorkflowFrameIds = [id]
        }
    }

    func moveWorkflowFrame(id: String, by translation: CGSize, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let frameIndex = workflows[workflowIndex].frames.firstIndex(where: { $0.id == id }) else { return }
        let dx = translation.width / max(workflowZoom, 0.2)
        let dy = translation.height / max(workflowZoom, 0.2)
        let memberIds = Set(workflows[workflowIndex].frames[frameIndex].nodeIds)
        workflows[workflowIndex].frames[frameIndex].x += dx
        workflows[workflowIndex].frames[frameIndex].y += dy
        for nodeIndex in workflows[workflowIndex].nodes.indices where memberIds.contains(workflows[workflowIndex].nodes[nodeIndex].id) {
            workflows[workflowIndex].nodes[nodeIndex].x += dx
            workflows[workflowIndex].nodes[nodeIndex].y += dy
        }
    }

    func resizeWorkflowFrame(id: String, by translation: CGSize, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let frameIndex = workflows[workflowIndex].frames.firstIndex(where: { $0.id == id }) else { return }
        workflows[workflowIndex].frames[frameIndex].width = max(300, workflows[workflowIndex].frames[frameIndex].width + translation.width / max(workflowZoom, 0.2))
        workflows[workflowIndex].frames[frameIndex].height = max(190, workflows[workflowIndex].frames[frameIndex].height + translation.height / max(workflowZoom, 0.2))
    }

    func assignWorkflowNodeToContainingFrame(_ nodeId: String, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let node = workflows[workflowIndex].nodes.first(where: { $0.id == nodeId }) else { return }
        let targetId = workflowFrameDropTargetId ?? containingFrameId(for: node, workflowIndex: workflowIndex)
        for frameIndex in workflows[workflowIndex].frames.indices {
            workflows[workflowIndex].frames[frameIndex].nodeIds.removeAll { $0 == nodeId }
            if workflows[workflowIndex].frames[frameIndex].id == targetId {
                workflows[workflowIndex].frames[frameIndex].nodeIds.append(nodeId)
                arrangeWorkflowFrameContents(workflowIndex: workflowIndex, frameIndex: frameIndex)
                fitWorkflowFrameToContents(workflowIndex: workflowIndex, frameIndex: frameIndex)
            }
        }
        workflowFrameDropTargetId = nil
    }

    func updateWorkflowFrameDropTarget(for nodeId: String, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let node = workflows[workflowIndex].nodes.first(where: { $0.id == nodeId }) else {
            workflowFrameDropTargetId = nil
            return
        }
        workflowFrameDropTargetId = containingFrameId(for: node, workflowIndex: workflowIndex)
    }

    private func containingFrameId(for node: WorkflowNode, workflowIndex: Int) -> String? {
        let size = workflowNodeSizes[node.id] ?? workflowDefaultNodeSize
        let center = CGPoint(x: node.x + size.width / 2, y: node.y + size.height / 2)
        return workflows[workflowIndex].frames
            .filter { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height).contains(center) }
            .min { $0.width * $0.height < $1.width * $1.height }?
            .id
    }

    private func fitWorkflowFrameToContents(workflowIndex: Int, frameIndex: Int) {
        let nodeIds = Set(workflows[workflowIndex].frames[frameIndex].nodeIds)
        let memberNodes = workflows[workflowIndex].nodes.filter { nodeIds.contains($0.id) }
        guard !memberNodes.isEmpty else { return }

        var contentBounds: CGRect?
        for node in memberNodes {
            let size = workflowNodeSizes[node.id] ?? workflowDefaultNodeSize
            let rect = CGRect(x: node.x, y: node.y, width: size.width, height: size.height)
            contentBounds = contentBounds?.union(rect) ?? rect
        }
        guard let contentBounds else { return }

        let current = workflows[workflowIndex].frames[frameIndex]
        let desiredX = min(current.x, contentBounds.minX - 24)
        let desiredY = min(current.y, contentBounds.minY - 54)
        let desiredMaxX = max(current.x + current.width, contentBounds.maxX + 24)
        let desiredMaxY = max(current.y + current.height, contentBounds.maxY + 24)
        workflows[workflowIndex].frames[frameIndex].x = desiredX
        workflows[workflowIndex].frames[frameIndex].y = desiredY
        workflows[workflowIndex].frames[frameIndex].width = max(300, desiredMaxX - desiredX)
        workflows[workflowIndex].frames[frameIndex].height = max(190, desiredMaxY - desiredY)
    }

    /// Once a frame has multiple members, give every node a stable lane with
    /// enough clearance for ports and connections. The frame keeps its origin
    /// and expands through `fitWorkflowFrameToContents` after this layout pass.
    private func arrangeWorkflowFrameContents(workflowIndex: Int, frameIndex: Int) {
        let nodeIds = workflows[workflowIndex].frames[frameIndex].nodeIds
        guard nodeIds.count > 1 else { return }

        let frame = workflows[workflowIndex].frames[frameIndex]
        let horizontalPadding: CGFloat = 28
        let topPadding: CGFloat = 58
        let nodeSpacing: CGFloat = 48
        var nextX = frame.x + horizontalPadding

        for nodeId in nodeIds {
            guard let nodeIndex = workflows[workflowIndex].nodes.firstIndex(where: { $0.id == nodeId }) else { continue }
            let nodeSize = workflowNodeSizes[nodeId] ?? workflowDefaultNodeSize
            workflows[workflowIndex].nodes[nodeIndex].x = nextX
            workflows[workflowIndex].nodes[nodeIndex].y = frame.y + topPadding
            nextX += nodeSize.width + nodeSpacing
        }
    }

    func deleteWorkflowFrame(_ id: String, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        workflows[workflowIndex].frames.removeAll { $0.id == id }
        selectedWorkflowFrameIds.remove(id)
    }

    func duplicateWorkflowFrame(_ frame: WorkflowFrame, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        var duplicate = frame
        duplicate.id = "frame-\(UUID().uuidString)"
        duplicate.name = "\(frame.name) (Cópia)"
        duplicate.x += 36
        duplicate.y += 36
        duplicate.nodeIds = []
        duplicate.lastRunAt = nil
        workflows[workflowIndex].frames.append(duplicate)
        selectedWorkflowNodeIds = []
        selectedWorkflowFrameIds = [duplicate.id]
    }

    func convertWorkflowNodeToFrame(_ node: WorkflowNode, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let nodeIndex = workflows[workflowIndex].nodes.firstIndex(where: { $0.id == node.id }) else { return }
        let kind = frameKind(for: node.type)
        let size = workflowNodeSizes[node.id] ?? workflowDefaultNodeSize
        let frame = WorkflowFrame(
            id: "frame-\(UUID().uuidString)",
            name: node.name,
            kind: kind,
            x: node.x,
            y: node.y,
            width: max(size.width + 120, 420),
            height: max(size.height + 110, 260),
            config: node.config
        )
        workflows[workflowIndex].nodes.remove(at: nodeIndex)
        workflows[workflowIndex].connections.removeAll { $0.fromId == node.id || $0.toId == node.id }
        for frameIndex in workflows[workflowIndex].frames.indices {
            workflows[workflowIndex].frames[frameIndex].nodeIds.removeAll { $0 == node.id }
        }
        workflows[workflowIndex].frames.append(frame)
        selectedWorkflowNodeIds = []
        selectedWorkflowFrameIds = [frame.id]
    }

    func convertWorkflowFrameToNode(_ frame: WorkflowFrame, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              workflows[workflowIndex].frames.contains(where: { $0.id == frame.id }) else { return }
        let type = nodeType(for: frame.kind)
        let defaults = defaultNodeData(for: type)
        let node = WorkflowNode(
            id: "node-\(UUID().uuidString)",
            name: frame.name,
            type: type,
            x: frame.x + 24,
            y: frame.y + 48,
            status: .idle,
            description: defaults.description,
            config: frame.config.isEmpty ? defaults.config : frame.config,
            temperature: defaults.temperature,
            allowSelfEdit: defaults.allowSelfEdit
        )
        workflows[workflowIndex].frames.removeAll { $0.id == frame.id }
        workflows[workflowIndex].nodes.append(node)
        selectedWorkflowFrameIds = []
        selectedWorkflowNodeIds = [node.id]
    }

    func workflowFrameSummary(_ frame: WorkflowFrame) -> String {
        switch frame.kind {
        case .schedule:
            if frame.config["scheduleMode"] == "daily" {
                return "Todos os dias às \(frame.config["time", default: "09:00"])"
            }
            return "A cada \(frame.config["intervalHours", default: "24"])h"
        case .folder, .file:
            return frame.config["path", default: "Escolha um caminho"]
        case .project:
            let projectId = frame.config["projectId"]
            return projects.first(where: { $0.id == projectId })?.name ?? "Escolha um projeto"
        case .condition:
            return frame.config["expression", default: "enabled == true"]
        case .approval:
            return frame.config["approved"] == "true" ? "Aprovado" : "Aguardando aprovação"
        case .parallel:
            return "Até \(frame.config["maxConcurrency", default: "3"]) tarefas simultâneas"
        }
    }

    func centerWorkflowMap(_ workflowId: String? = nil) {
        let id = workflow(id: workflowId).id
        let viewport = workflowViewportSizes[id] ?? .zero
        let viewportCenter = CGPoint(
            x: viewport == .zero ? 420 : viewport.width / 2,
            y: viewport == .zero ? 280 : viewport.height / 2
        )
        workflowZoom = 1
        workflowOffset = CGSize(
            width: viewportCenter.x - workflowMapCenter.x,
            height: viewportCenter.y - workflowMapCenter.y
        )
    }

    /// Ajusta zoom e offset para que todos os nodes do workflow caibam no viewport visível.
    func fitWorkflowToView(_ workflowId: String? = nil) {
        let target = workflow(id: workflowId)
        let viewport = workflowViewportSizes[target.id] ?? .zero
        guard (!target.nodes.isEmpty || !target.frames.isEmpty), viewport.width > 0, viewport.height > 0 else {
            centerWorkflowMap(workflowId)
            return
        }

        var bounds: CGRect?
        for node in target.nodes {
            let size = workflowNodeSizes[node.id] ?? workflowDefaultNodeSize
            let frame = CGRect(x: node.x, y: node.y, width: size.width, height: size.height)
            bounds = bounds?.union(frame) ?? frame
        }
        for workflowFrame in target.frames {
            let frame = CGRect(x: workflowFrame.x, y: workflowFrame.y, width: workflowFrame.width, height: workflowFrame.height)
            bounds = bounds?.union(frame) ?? frame
        }
        guard let bounds else { return }

        let padding: CGFloat = 80
        let paddedWidth = max(bounds.width + padding * 2, 1)
        let paddedHeight = max(bounds.height + padding * 2, 1)
        let zoom = min(min(viewport.width / paddedWidth, viewport.height / paddedHeight), 1.5)
        let clampedZoom = min(2.0, max(0.4, zoom))

        withAnimation(.snappy(duration: 0.22)) {
            workflowZoom = clampedZoom
            workflowOffset = CGSize(
                width: viewport.width / 2 - bounds.midX * clampedZoom,
                height: viewport.height / 2 - bounds.midY * clampedZoom
            )
        }
    }

    private func workflowNodeOriginAtMapCenter() -> CGPoint {
        CGPoint(
            x: max(workflowMapCenter.x - workflowDefaultNodeSize.width / 2, 0),
            y: max(workflowMapCenter.y - workflowDefaultNodeSize.height / 2, 0)
        )
    }

    func updateWorkflowNode(_ node: WorkflowNode, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId),
              let index = workflows[workflowIndex].nodes.firstIndex(where: { $0.id == node.id }) else { return }
        var workflow = workflows[workflowIndex]
        workflow.nodes[index] = node
        workflows[workflowIndex] = workflow
    }

    func moveWorkflowNode(id: String, by translation: CGSize, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        let dx = translation.width / max(workflowZoom, 0.2)
        let dy = translation.height / max(workflowZoom, 0.2)
        let ids: Set<String> = selectedWorkflowNodeIds.contains(id) ? selectedWorkflowNodeIds : [id]
        var workflow = workflows[workflowIndex]
        for index in workflow.nodes.indices where ids.contains(workflow.nodes[index].id) {
            workflow.nodes[index].x += dx
            workflow.nodes[index].y += dy
        }
        workflows[workflowIndex] = workflow
    }

    func selectWorkflowNode(_ id: String, extend: Bool = false) {
        selectedWorkflowFrameIds = []
        if extend {
            if selectedWorkflowNodeIds.contains(id) {
                selectedWorkflowNodeIds.remove(id)
            } else {
                selectedWorkflowNodeIds.insert(id)
            }
        } else {
            selectedWorkflowNodeIds = [id]
        }
    }

    func deleteWorkflowNode(_ id: String, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        var workflow = workflows[workflowIndex]
        workflow.nodes.removeAll { $0.id == id }
        workflow.connections.removeAll { $0.fromId == id || $0.toId == id }
        for frameIndex in workflow.frames.indices {
            workflow.frames[frameIndex].nodeIds.removeAll { $0 == id }
        }
        workflows[workflowIndex] = workflow
        selectedWorkflowNodeIds.remove(id)
    }

    func duplicateWorkflowNode(_ node: WorkflowNode, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        let targetWorkflowId = workflows[workflowIndex].id
        var duplicate = node
        duplicate.id = "node-\(Int(Date().timeIntervalSince1970 * 1000))"
        duplicate.name = "\(node.name) (Cópia)"
        let origin = workflowNodeOriginAtMapCenter()
        duplicate.x = origin.x
        duplicate.y = origin.y
        duplicate.status = .idle
        var workflow = workflows[workflowIndex]
        workflow.nodes.append(duplicate)
        workflows[workflowIndex] = workflow
        activeWorkflowId = targetWorkflowId
        bindActiveNodesArea(to: targetWorkflowId)
        selectedWorkflowNodeIds = [duplicate.id]
        selectedWorkflowFrameIds = []
        centerWorkflowMap(targetWorkflowId)
    }

    func autoArrangeWorkflow(_ workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        var workflow = workflows[workflowIndex]
        guard !workflow.nodes.isEmpty else { return }

        // Ordem cronológica pelas conexões: node que só tem conexões de saída
        // (lado direito) fica na primeira coluna; cada conexão empurra o destino
        // para a direita do seu antecessor mais profundo, então o node que só
        // recebe conexões (lado esquerdo) termina na última coluna.
        let nodeIds = Set(workflow.nodes.map(\.id))
        let edges = workflow.connections.filter {
            nodeIds.contains($0.fromId) && nodeIds.contains($0.toId) && $0.fromId != $0.toId
        }
        var incomingCount: [String: Int] = [:]
        var adjacency: [String: [String]] = [:]
        for edge in edges {
            incomingCount[edge.toId, default: 0] += 1
            adjacency[edge.fromId, default: []].append(edge.toId)
        }
        let connected = Set(edges.flatMap { [$0.fromId, $0.toId] })

        var layer: [String: Int] = [:]
        var queue = workflow.nodes.map(\.id).filter { connected.contains($0) && incomingCount[$0, default: 0] == 0 }
        for id in queue { layer[id] = 0 }
        var remaining = incomingCount
        var head = 0
        while head < queue.count {
            let id = queue[head]
            head += 1
            for next in adjacency[id, default: []] {
                layer[next] = max(layer[next, default: 0], (layer[id] ?? 0) + 1)
                remaining[next, default: 0] -= 1
                if remaining[next] == 0 {
                    queue.append(next)
                }
            }
        }
        // Nodes presos em ciclo (nunca zeram o incoming) vão depois das camadas resolvidas.
        let maxResolved = layer.values.max() ?? 0
        for node in workflow.nodes where connected.contains(node.id) && layer[node.id] == nil {
            layer[node.id] = maxResolved + 1
        }
        // Nodes sem nenhuma conexão ficam numa coluna final à parte.
        let maxLayer = layer.values.max().map { $0 + 1 } ?? 0
        for node in workflow.nodes where layer[node.id] == nil {
            layer[node.id] = maxLayer
        }

        // Posiciona coluna por coluna usando os tamanhos medidos dos cards.
        let gap: CGFloat = 60
        var x: CGFloat = 80
        let columns = Dictionary(grouping: workflow.nodes.indices) { layer[workflow.nodes[$0].id] ?? 0 }
        for column in columns.keys.sorted() {
            var y: CGFloat = 120
            var columnWidth = workflowDefaultNodeSize.width
            for index in columns[column] ?? [] {
                let size = workflowNodeSizes[workflow.nodes[index].id] ?? workflowDefaultNodeSize
                workflow.nodes[index].x = x
                workflow.nodes[index].y = y
                y += size.height + gap
                columnWidth = max(columnWidth, size.width)
            }
            x += columnWidth + gap
        }
        fitFramesAroundMembers(in: &workflow)
        workflows[workflowIndex] = workflow
    }

    private func fitFramesAroundMembers(in workflow: inout Workflow) {
        let padding: CGFloat = 34
        let headerHeight: CGFloat = 42
        for frameIndex in workflow.frames.indices {
            let memberIds = Set(workflow.frames[frameIndex].nodeIds)
            var bounds: CGRect?
            for node in workflow.nodes where memberIds.contains(node.id) {
                let size = workflowNodeSizes[node.id] ?? workflowDefaultNodeSize
                let nodeFrame = CGRect(x: node.x, y: node.y, width: size.width, height: size.height)
                bounds = bounds?.union(nodeFrame) ?? nodeFrame
            }
            guard let bounds else { continue }
            workflow.frames[frameIndex].x = max(bounds.minX - padding, 0)
            workflow.frames[frameIndex].y = max(bounds.minY - padding - headerHeight, 0)
            workflow.frames[frameIndex].width = max(bounds.width + padding * 2, 300)
            workflow.frames[frameIndex].height = max(bounds.height + padding * 2 + headerHeight, 190)
        }
    }

    func handlePortTap(nodeId: String, port: Int, isOutput: Bool, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        if isOutput {
            let ref = WorkflowPortRef(nodeId: nodeId, port: port)
            connectingFromPort = connectingFromPort == ref ? nil : ref
            return
        }
        guard let source = connectingFromPort, source.nodeId != nodeId else {
            connectingFromPort = nil
            return
        }
        var workflow = workflows[workflowIndex]
        workflow.connections.append(
            NodeConnection(
                id: "conn-\(Int(Date().timeIntervalSince1970 * 1000))",
                fromId: source.nodeId,
                toId: nodeId,
                fromPort: source.port,
                toPort: port
            )
        )
        workflows[workflowIndex] = workflow
        connectingFromPort = nil
    }

    func removeConnection(_ id: String, workflowId: String? = nil) {
        guard let workflowIndex = workflowIndex(for: workflowId) else { return }
        var workflow = workflows[workflowIndex]
        workflow.connections.removeAll { $0.id == id }
        workflows[workflowIndex] = workflow
    }

    func completeConnectionDrag(at point: CGPoint, workflowId: String? = nil) {
        defer {
            connectionDragFrom = nil
            connectionDragPoint = nil
        }
        guard let from = connectionDragFrom,
              let workflowIndex = workflowIndex(for: workflowId) else { return }

        let candidates = workflowPortCenters.filter {
            $0.key.isOutput != from.isOutput && $0.key.nodeId != from.nodeId
        }
        guard let target = candidates.min(by: {
            hypot($0.value.x - point.x, $0.value.y - point.y) < hypot($1.value.x - point.x, $1.value.y - point.y)
        }) else { return }
        guard hypot(target.value.x - point.x, target.value.y - point.y) <= 36 else { return }

        let output = from.isOutput ? from : target.key
        let input = from.isOutput ? target.key : from
        let alreadyExists = workflows[workflowIndex].connections.contains {
            $0.fromId == output.nodeId && $0.toId == input.nodeId
                && max($0.fromPort, 1) == output.port && max($0.toPort, 1) == input.port
        }
        guard !alreadyExists else { return }

        var workflow = workflows[workflowIndex]
        workflow.connections.append(
            NodeConnection(
                id: "conn-\(Int(Date().timeIntervalSince1970 * 1000))",
                fromId: output.nodeId,
                toId: input.nodeId,
                fromPort: output.port,
                toPort: input.port
            )
        )
        workflows[workflowIndex] = workflow
    }

    func generatedDiffLines(for file: FileArtifact) -> [DiffLine] {
        guard let previous = file.previousContent else { return [] }
        let oldLines = previous.components(separatedBy: "\n")
        let newLines = file.content.components(separatedBy: "\n")
        var lines: [DiffLine] = []
        var oldIndex = 0
        var newIndex = 0

        while oldIndex < oldLines.count || newIndex < newLines.count {
            let oldLine = oldIndex < oldLines.count ? oldLines[oldIndex] : nil
            let newLine = newIndex < newLines.count ? newLines[newIndex] : nil
            if oldLine == newLine {
                if let oldLine {
                    lines.append(DiffLine(type: .neutral, text: oldLine, oldNumber: oldIndex + 1, newNumber: newIndex + 1))
                }
                oldIndex += 1
                newIndex += 1
            } else {
                if let oldLine {
                    lines.append(DiffLine(type: .remove, text: "-\(oldLine)", oldNumber: oldIndex + 1, newNumber: nil))
                    oldIndex += 1
                }
                if let newLine {
                    lines.append(DiffLine(type: .add, text: "+\(newLine)", oldNumber: nil, newNumber: newIndex + 1))
                    newIndex += 1
                }
            }
        }
        return lines
    }

    func connectAPIProvider(_ provider: APIProviderItem) {
        showNotice("Cole e verifique sua chave de \(provider.name) para concluir a conexão.")
    }

    func installMCP(_ item: MarketplaceItem) {
        guard !connectedMCPs.contains(where: { $0.id == item.id }) else { return }
        connectedMCPs.append(
            MCPServer(
                id: item.id,
                name: item.name,
                description: item.description,
                command: "npx --yes @modelcontextprotocol/server-\(item.id.replacingOccurrences(of: "-mcp", with: ""))",
                status: "configured",
                symbol: "cpu"
            )
        )
        mcpMarketplace.removeAll { $0.id == item.id }
        showNotice("MCP \(item.name) configurado. A conexão ficará ativa após autenticar o servidor.")
    }

    func addCustomMCP(name: String, command: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, !cleanCommand.isEmpty else {
            showNotice("Preencha o nome e o comando do MCP.")
            return
        }
        connectedMCPs.append(
            MCPServer(
                id: "custom-mcp-\(Int(Date().timeIntervalSince1970))",
                name: cleanName,
                description: "Servidor MCP configurado manualmente pelo administrador.",
                command: cleanCommand,
                status: "configured",
                symbol: "cpu"
            )
        )
    }

    func verifyMCP(_ server: MCPServer) {
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                MCPCommandVerifier.verify(server.command)
            }.value
            guard let index = connectedMCPs.firstIndex(where: { $0.id == server.id }) else { return }
            switch result {
            case .success(let detail):
                connectedMCPs[index].status = "available"
                showNotice("\(server.name) disponível: \(detail)")
            case .failure(let error):
                connectedMCPs[index].status = "error"
                showNotice("Falha ao verificar \(server.name): \(error.localizedDescription)")
            }
        }
    }

    func installSkill(_ item: MarketplaceItem) {
        guard !settings.skills.contains(where: { $0.id == item.id }) else { return }
        settings.skills.append(
            SkillSetting(id: item.id, name: item.name, description: item.description, permissions: item.permissions, enabled: true)
        )
        skillsMarketplace.removeAll { $0.id == item.id }
        showNotice("Skill '\(item.name)' instalada e ativada.")
    }

    func purchaseMarketplaceItem(_ item: MarketplaceItem, kind: MarketplaceKind) async throws {
        try await marketplacePurchaseService.purchase(item, kind: kind)
        if kind == .mcp { installMCP(item) } else { installSkill(item) }
    }

    func marketplaceProductID(_ item: MarketplaceItem, kind: MarketplaceKind) -> String {
        marketplacePurchaseService.productID(for: item, kind: kind)
    }

    func refreshRuntimeStatuses() {
        Task {
            let statuses = await localRuntimeManager.refreshStatuses(settings: settings.localRuntime)
            runtimeStatuses = statuses
            updateSettingsFromRuntimeStatuses()
        }
    }

    func prepareRuntimeInstall(_ mode: RuntimeInstallMode) {
        Task {
            let statuses = await localRuntimeManager.refreshStatuses(settings: settings.localRuntime)
            runtimeStatuses = statuses
            updateSettingsFromRuntimeStatuses()

            let workflow = localRuntimeManager.makeInstallWorkflow(settings: settings.localRuntime, mode: mode)
            upsertRuntimeWorkflow(workflow)
            ensureSystemSetupAgent(status: .idle)
            pendingRuntimePlan = localRuntimeManager.makeInstallPlan(mode: mode, settings: settings.localRuntime, statuses: statuses)

            if settings.localRuntime.showVisualInstall {
                showRuntimeInstallWorkflow()
            }
        }
    }

    func approveRuntimeInstall() {
        guard let plan = pendingRuntimePlan, !runtimeInstallRunning else { return }
        pendingRuntimePlan = nil
        runtimeInstallRunning = true
        ensureSystemSetupAgent(status: .running)
        showRuntimeInstallWorkflow()

        Task {
            let finalStatuses = await localRuntimeManager.workflowRunner.run(
                plan: plan,
                settings: settings.localRuntime,
                initialStatuses: runtimeStatuses,
                onLog: { [weak self] entry in
                    Task { @MainActor in
                        self?.appendRuntimeLog(entry)
                    }
                },
                onNodeUpdate: { [weak self] update in
                    Task { @MainActor in
                        self?.applyRuntimeNodeUpdate(update)
                    }
                },
                onRegisterMCPBridge: { [weak self] in
                    Task { @MainActor in
                        self?.registerRuntimeMCPBridge()
                    }
                }
            )
            runtimeStatuses = finalStatuses
            updateSettingsFromRuntimeStatuses()
            runtimeInstallRunning = false
            ensureSystemSetupAgent(status: finalStatuses[.ollama]?.state == .error || finalStatuses[.openClaw]?.state == .error ? .error : .completed)
        }
    }

    func cancelRuntimeInstallApproval() {
        pendingRuntimePlan = nil
    }

    func showRuntimeInstallWorkflow() {
        ensureSystemSetupAgent(status: runtimeInstallRunning ? .running : .idle)
        selectedAgentIdForNodes = RuntimeWorkflowTemplateFactory.systemAgentId
        selectedAgentId = RuntimeWorkflowTemplateFactory.systemAgentId
        activeWorkflowId = RuntimeWorkflowTemplateFactory.workflowId
        updateActiveWorkspaceAreaResource { area in
            area.kind = .nodes
            area.workflowId = RuntimeWorkflowTemplateFactory.workflowId
        }
        activeSection = .workflows
        selectedWorkflowNodeIds = [RuntimeWorkflowTemplateFactory.nodeId(for: .start)]
    }

    func retryRuntimeNode(_ node: WorkflowNode) {
        guard node.type == .runtimeAction else { return }
        prepareRuntimeInstall(.repair)
    }

    func skipRuntimeNode(_ node: WorkflowNode) {
        guard node.type == .runtimeAction, let action = node.runtimeAction else { return }
        applyRuntimeNodeUpdate(
            RuntimeNodeUpdate(
                action: action,
                status: .skipped,
                progress: 1,
                lastLogLine: "Node ignorado manualmente.",
                commandPreview: nil,
                startedAt: nil,
                finishedAt: Date()
            )
        )
    }

    func openRuntimeNodeTerminal(_ node: WorkflowNode) {
        guard node.type == .runtimeAction else { return }
        ensureTerminalExists()
        selectSection(.terminals)
    }

    func copyRuntimeLogs() {
        let formatter = ISO8601DateFormatter()
        let text = runtimeLogs.map { entry in
            "[\(formatter.string(from: entry.timestamp))] \(entry.level.rawValue.uppercased()) \(entry.nodeId ?? "-"): \(entry.message)"
        }.joined(separator: "\n")
        copyToClipboard(text)
    }

    private func upsertRuntimeWorkflow(_ workflow: Workflow) {
        workflows.removeAll { $0.id == RuntimeWorkflowTemplateFactory.workflowId }
        workflows.insert(workflow, at: 0)
        activeWorkflowId = workflow.id
        workflowZoom = 0.82
        workflowOffset = CGSize(width: 20, height: 20)
        selectedWorkflowNodeIds = [RuntimeWorkflowTemplateFactory.nodeId(for: .start)]
    }

    private func ensureSystemSetupAgent(status: AgentStatus) {
        let agent = Agent(
            id: RuntimeWorkflowTemplateFactory.systemAgentId,
            name: "System Setup Agent",
            role: "Instalador interno de runtime local",
            modelId: .llama,
            status: status,
            lastActive: "Sistema",
            permissions: ["Instalar runtimes com aprovacao", "Configurar loopback", "Registrar MCP local"],
            tools: ["RuntimeInstaller", "HealthChecker", "MCPBridge"],
            prompt: "Agente interno responsavel por instalar Ollama, OpenClaw e MCP Bridge com logs e aprovacao explicita.",
            isSystem: true
        )

        if let index = agents.firstIndex(where: { $0.id == agent.id }) {
            agents[index] = agent
        } else {
            agents.append(agent)
        }
    }

    private func applyRuntimeNodeUpdate(_ update: RuntimeNodeUpdate) {
        guard let workflowIndex = workflows.firstIndex(where: { $0.id == RuntimeWorkflowTemplateFactory.workflowId }),
              let nodeIndex = workflows[workflowIndex].nodes.firstIndex(where: { $0.runtimeAction == update.action }) else { return }
        workflows[workflowIndex].nodes[nodeIndex].status = update.status
        if let progress = update.progress {
            workflows[workflowIndex].nodes[nodeIndex].progress = progress
        }
        if let lastLogLine = update.lastLogLine {
            workflows[workflowIndex].nodes[nodeIndex].lastLogLine = lastLogLine
        }
        if let commandPreview = update.commandPreview {
            workflows[workflowIndex].nodes[nodeIndex].commandPreview = commandPreview
        }
        if let startedAt = update.startedAt {
            workflows[workflowIndex].nodes[nodeIndex].startedAt = startedAt
        }
        if let finishedAt = update.finishedAt {
            workflows[workflowIndex].nodes[nodeIndex].finishedAt = finishedAt
        }
    }

    private func appendRuntimeLog(_ entry: RuntimeLogEntry) {
        runtimeLogStore.append(entry)
        runtimeLogs = runtimeLogStore.all()
    }

    private func registerRuntimeMCPBridge() {
        let id = "openassistant-runtime-mcp"
        guard !connectedMCPs.contains(where: { $0.id == id }) else { return }
        connectedMCPs.append(
            MCPServer(
                id: id,
                name: "Open Assistant Runtime MCP",
                description: "Tools locais allowlistadas para status, logs, modelos, reparo e execucao controlada de workflows.",
                command: "openassistant.runtime.mcp --stdio",
                status: "active",
                symbol: "cylinder.split.1x2"
            )
        )
    }

    private func updateSettingsFromRuntimeStatuses() {
        settings.localRuntime.port = "\(settings.localRuntime.ollamaPort)"
        if let models = runtimeStatuses[.ollama]?.models, !models.isEmpty {
            settings.localRuntime.modelsInstalled = models
        }
        let ollamaState = runtimeStatuses[.ollama]?.state ?? .notInstalled
        let openClawState = runtimeStatuses[.openClaw]?.state ?? .notInstalled
        if ollamaState == .running && openClawState == .running {
            settings.localRuntime.status = "running"
        } else if ollamaState == .error || openClawState == .error {
            settings.localRuntime.status = "error"
        } else if ollamaState == .notInstalled && openClawState == .notInstalled {
            settings.localRuntime.status = "notInstalled"
        } else {
            settings.localRuntime.status = "needsAttention"
        }
        for index in models.indices where models[index].provider == .local {
            let installedModels = runtimeStatuses[.ollama]?.models ?? []
            let tag = models[index].apiModel
            let isInstalled = installedModels.contains(tag) || installedModels.contains(where: { $0.hasPrefix(tag.split(separator: ":").first.map(String.init) ?? tag) })
            models[index].status = ollamaState == .running && isInstalled ? .localActive : .disconnected
        }
    }

    func showNotice(_ text: String) {
        localNotice = text
        Task {
            try? await Task.sleep(for: .seconds(4))
            if localNotice == text { localNotice = nil }
        }
    }

    @discardableResult
    func addSavedAPIKey(_ key: String, provider explicitProvider: ModelConfig.Provider? = nil) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let detected = SavedAPIKey.detectProvider(from: trimmed)
        guard let provider = explicitProvider ?? ModelConfig.Provider.from(displayName: detected.name) else {
            showNotice("Selecione o provedor desta chave antes de salvar.")
            return false
        }

        apiKeyVerificationStates[provider] = .verifying
        Task {
            do {
                try await aiProviderService.verify(provider: provider, credential: trimmed)
                try keychainStore.save(trimmed, account: provider.keychainAccount)
                reloadSavedAPIKeys()
                apiKeyVerificationStates[provider] = .verified
                showNotice("Chave de \(provider.displayName) verificada e salva no Keychain.")
            } catch {
                apiKeyVerificationStates[provider] = .failed(error.localizedDescription)
                showNotice("A chave não foi salva: \(error.localizedDescription)")
            }
        }
        return true
    }

    func removeSavedAPIKey(_ item: SavedAPIKey) {
        do {
            try keychainStore.delete(account: item.account)
            if let provider = ModelConfig.Provider.from(account: item.account) {
                apiKeyVerificationStates[provider] = .idle
            }
            reloadSavedAPIKeys()
        } catch {
            showNotice("Não foi possível remover a chave: \(error.localizedDescription)")
        }
    }

    func reloadSavedAPIKeys() {
        do {
            savedAPIKeys = try keychainStore.allCredentials().compactMap { credential in
                guard let provider = ModelConfig.Provider.from(account: credential.account) else { return nil }
                return SavedAPIKey(
                    account: credential.account,
                    provider: provider.displayName,
                    symbol: Self.symbol(for: provider),
                    preview: Self.credentialPreview(credential.secret)
                )
            }
            for index in models.indices where models[index].provider != .local {
                models[index].status = savedAPIKeys.contains(where: { $0.account == models[index].provider.keychainAccount }) ? .connected : .disconnected
            }
        } catch {
            showNotice("Não foi possível ler o Keychain: \(error.localizedDescription)")
        }
    }

#if os(macOS)
    func prepareVoiceActivation() -> Bool {
        // Never short-circuit the capture attempt. SpeechService asks TCC on every
        // click; if macOS has already recorded a denial it then opens the exact
        // Privacy pane so the user can enable this bundle.
        voicePermissionIssue = speechService.currentPermissionIssue()
        return true
    }

    func toggleSpeechInput(onTranscript: @escaping @MainActor (String) -> Void, onFinal: (@MainActor (String) -> Void)? = nil) {
        Task {
            voicePermissionIssue = nil
            voiceState = speechService.isListening ? .idle : .listening
            await speechService.toggleListening(onTranscript: onTranscript, onFinal: onFinal)
            isListeningForSpeech = speechService.isListening
            if let error = speechService.lastError {
                voicePermissionIssue = speechService.permissionIssue
                voiceState = .error
                if let issue = speechService.permissionIssue {
                    speechService.openSystemSettings(for: issue)
                } else {
                    showNotice(error)
                }
            } else if !speechService.isListening {
                voiceState = .idle
            }
        }
    }

    func openVoicePrivacySettings() {
        guard let issue = voicePermissionIssue else { return }
        speechService.openSystemSettings(for: issue)
    }

    func speak(_ text: String) {
        voiceState = .speaking
        speechService.speak(text, profile: settings.voice.selectedProfile)
    }
#endif

    private static func credentialPreview(_ secret: String) -> String {
        guard secret.count > 8 else { return String(repeating: "•", count: max(secret.count, 4)) }
        return "\(secret.prefix(4))••••••••\(secret.suffix(4))"
    }

    private static func symbol(for provider: ModelConfig.Provider) -> String {
        switch provider {
        case .openai: "brain.head.profile"
        case .anthropic: "a.circle.fill"
        case .local: "externaldrive"
        case .together: "person.2.wave.2"
        case .deepseek: "point.3.connected.trianglepath.dotted"
        case .perplexity: "magnifyingglass.circle.fill"
        case .fireworks: "sparkles"
        }
    }

    func executePaletteAction(_ action: String, payload: ModelId? = nil) {
        if action == "nav-chat-new" {
            startNewChat()
        } else if action == "nav-chat" {
            selectSection(.chat)
        } else if action == "nav-agents" {
            selectSection(.agents)
        } else if action == "nav-workflows" || action == "run-workflow" {
            selectSection(.workflows)
            if action == "run-workflow" { runWorkflow() }
        } else if action == "nav-terminals" {
            selectSection(.terminals)
        } else if action == "nav-files" {
            selectSection(.files)
        } else if action == "nav-settings" {
            settingsOpen = true
        } else if action == "model", let payload {
            changeActiveChatModel(payload)
        }
    }

    private func runDueFrameWorkflows(at date: Date) {
        let due: [(String, String)] = workflows.flatMap { workflow -> [(String, String)] in
            guard workflow.isActive else { return [] }
            return workflow.frames.compactMap { frame -> (String, String)? in
                guard frame.kind == .schedule,
                      !frame.nodeIds.isEmpty,
                      frameIsEligible(frame, at: date) else { return nil }
                return (workflow.id, frame.id)
            }
        }
        for (workflowId, frameId) in due {
            runWorkflow(workflowId, triggeredByFrameId: frameId, at: date)
        }
    }

    private func runDailyDogImageWorkflow(workflowId: String, sequence: [String]) async {
        guard let initialWorkflowIndex = workflowIndex(for: workflowId) else { return }
        func setStatus(_ nodeId: String, _ status: NodeStatus) {
            guard let currentWorkflowIndex = workflowIndex(for: workflowId),
                  let nodeIndex = workflows[currentWorkflowIndex].nodes.firstIndex(where: { $0.id == nodeId }) else { return }
            workflows[currentWorkflowIndex].nodes[nodeIndex].status = status
        }

        do {
            let directory = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Desktop/Cachorro do Dia", isDirectory: true)
            setStatus("ex3-folder", .running)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            setStatus("ex3-folder", .success)

            guard let model = models.first(where: { $0.provider == .openai }),
                  let key = try keychainStore.secret(account: ModelConfig.Provider.openai.keychainAccount),
                  !key.isEmpty else {
                setStatus("ex3-image", .warning)
                showNotice("Exemplo 3: adicione uma chave OpenAI antes de gerar a imagem diária.")
                return
            }

            setStatus("ex3-image", .running)
            let reply = try await aiProviderService.reply(
                model: model,
                messages: [AIConversationMessage(role: "user", content: "Gere uma fotografia inédita, simpática e realista de um cachorro em um cenário diferente.")],
                credential: key,
                localPort: settings.localRuntime.ollamaPort
            )
            guard let imageData = reply.generatedImageData else { throw AIProviderError.invalidResponse }
            setStatus("ex3-image", .success)

            setStatus("ex3-save", .running)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd-HHmmss"
            let destination = directory.appendingPathComponent("cachorro-\(formatter.string(from: Date())).png")
            try imageData.write(to: destination, options: .atomic)
            setStatus("ex3-save", .success)
            setStatus("ex3-end", .success)
            showNotice("Imagem diária salva em \(destination.path).")
        } catch {
            for nodeId in sequence where workflows[initialWorkflowIndex].nodes.first(where: { $0.id == nodeId })?.status == .running {
                setStatus(nodeId, .error)
            }
            showNotice("Exemplo 3 falhou: \(error.localizedDescription)")
        }
    }

    private func executableNodeIds(in workflow: Workflow, triggeredByFrameId: String?, at date: Date) -> Set<String> {
        let targetIds: Set<String>
        if let triggeredByFrameId,
           let triggerFrame = workflow.frames.first(where: { $0.id == triggeredByFrameId }) {
            guard frameIsEligible(triggerFrame, at: date) else { return [] }
            targetIds = Set(triggerFrame.nodeIds)
        } else {
            targetIds = Set(workflow.nodes.map(\.id))
        }

        return Set(targetIds.filter { nodeId in
            let containingFrames = workflow.frames.filter { $0.nodeIds.contains(nodeId) }
            return containingFrames.allSatisfy { frameIsEligible($0, at: date) }
        })
    }

    private func applyFrameExecutionContext(workflowIndex: Int) {
        let frames = workflows[workflowIndex].frames
        for nodeIndex in workflows[workflowIndex].nodes.indices {
            for key in ["frameScopeDirectory", "frameScopeFile", "frameScopeProjectId", "frameSchedule", "frameCondition", "frameApproval", "frameMaxConcurrency"] {
                workflows[workflowIndex].nodes[nodeIndex].config.removeValue(forKey: key)
            }
            let nodeId = workflows[workflowIndex].nodes[nodeIndex].id
            for frame in frames where frame.nodeIds.contains(nodeId) {
                switch frame.kind {
                case .schedule:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameSchedule"] = workflowFrameSummary(frame)
                case .folder:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameScopeDirectory"] = frame.config["path"]
                case .file:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameScopeFile"] = frame.config["path"]
                case .project:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameScopeProjectId"] = frame.config["projectId"]
                case .condition:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameCondition"] = frame.config["expression"]
                case .approval:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameApproval"] = frame.config["approved"]
                case .parallel:
                    workflows[workflowIndex].nodes[nodeIndex].config["frameMaxConcurrency"] = frame.config["maxConcurrency"]
                }
            }
        }
    }

    private func frameIsEligible(_ frame: WorkflowFrame, at date: Date) -> Bool {
        guard frame.isEnabled else { return false }
        switch frame.kind {
        case .schedule:
            if frame.config["scheduleMode"] == "daily" {
                let pieces = frame.config["time", default: "09:00"].split(separator: ":").compactMap { Int($0) }
                let hour = pieces.first ?? 9
                let minute = pieces.count > 1 ? pieces[1] : 0
                let calendar = Calendar.current
                guard let dueToday = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: date), date >= dueToday else { return false }
                return frame.lastRunAt.map { !calendar.isDate($0, inSameDayAs: date) } ?? true
            }
            let hours = max(Double(frame.config["intervalHours", default: "24"]) ?? 24, 0.01)
            return frame.lastRunAt.map { date.timeIntervalSince($0) >= hours * 3600 } ?? true
        case .folder:
            let path = (frame.config["path", default: ""] as NSString).expandingTildeInPath
            var isDirectory: ObjCBool = false
            return FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue
        case .file:
            let path = (frame.config["path", default: ""] as NSString).expandingTildeInPath
            var isDirectory: ObjCBool = false
            return FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && !isDirectory.boolValue
        case .project:
            guard let projectId = frame.config["projectId"] else { return false }
            return projects.contains(where: { $0.id == projectId && !$0.isArchived })
        case .condition:
            return frame.config["result", default: "true"].lowercased() == "true"
        case .approval:
            return frame.config["approved", default: "false"].lowercased() == "true"
        case .parallel:
            return true
        }
    }

    private func defaultFrameConfig(for kind: WorkflowFrameKind) -> [String: String] {
        switch kind {
        case .schedule: ["scheduleMode": "interval", "intervalHours": "24", "time": "09:00"]
        case .folder: ["path": "~/Desktop/projetos", "recursive": "true"]
        case .file: ["path": "~/Desktop/arquivo.txt"]
        case .project: ["projectId": projects.first?.id ?? ""]
        case .condition: ["expression": "enabled == true", "result": "true"]
        case .approval: ["approved": "false"]
        case .parallel: ["maxConcurrency": "3"]
        }
    }

    private func frameKind(for nodeType: NodeType) -> WorkflowFrameKind {
        switch nodeType {
        case .trigger: .schedule
        case .folder, .watcher: .folder
        case .reader, .writer: .file
        case .decision: .condition
        case .optimizer, .executor: .parallel
        default: .project
        }
    }

    private func nodeType(for frameKind: WorkflowFrameKind) -> NodeType {
        switch frameKind {
        case .schedule: .trigger
        case .folder: .folder
        case .file: .reader
        case .project: .agent
        case .condition, .approval: .decision
        case .parallel: .optimizer
        }
    }

    private func workflowExecutionSequence(workflowId: String? = nil) -> [String] {
        let workflow = workflow(id: workflowId)
        let roots = workflow.nodes.filter { node in
            node.type == .trigger || !workflow.connections.contains(where: { $0.toId == node.id })
        }
        var queue = roots.map(\.id)
        var visited = Set<String>()
        var sequence: [String] = []

        while !queue.isEmpty {
            let current = queue.removeFirst()
            guard !visited.contains(current) else { continue }
            visited.insert(current)
            sequence.append(current)
            let children = workflow.connections.filter { $0.fromId == current }.map(\.toId)
            queue.append(contentsOf: children)
        }

        return sequence.isEmpty ? workflow.nodes.map(\.id) : sequence
    }

    private func defaultNodeData(for type: NodeType) -> (name: String, description: String, config: [String: String], temperature: Double?, allowSelfEdit: Bool) {
        switch type {
        case .folder:
            return ("Pasta Local", "Acessa arquivos de um diretório do computador", ["title": "Monitorar Pasta", "path": "~/Desktop/projetos", "action": "monitorar"], nil, false)
        case .reader:
            return ("Arquivo Local", "Lê o conteúdo de um arquivo para o próximo node", ["title": "Ler Arquivo", "path": "~/Desktop/arquivo.txt", "encoding": "utf-8"], nil, false)
        case .writer:
            return ("Salvar Arquivo", "Grava o resultado recebido em um arquivo local", ["title": "Salvar Resultado", "outputPath": "~/Desktop/resultado.txt"], nil, false)
        case .prompt:
            return ("Prompt de IA", "Executa instruções e gera texto ou formata dados", ["title": "Processar Entrada", "systemPrompt": "Você é um assistente de automação.", "userPrompt": "Analise os arquivos e resuma as informações."], 0.5, false)
        case .openProgram:
            return ("Abrir App macOS", "Inicia um aplicativo instalado localmente", ["title": "Executar App", "programPath": "/Applications/TextEdit.app", "arguments": ""], nil, false)
        case .notifier:
            return ("Notificar", "Envia mensagens visuais ou alertas de sistema", ["title": "Alerta Local", "method": "Toast", "messageText": "Tarefa de automação finalizada com sucesso."], nil, false)
        case .trigger:
            return ("Disparador", "Inicia o fluxo em momentos específicos", ["title": "Agendamento Cron", "schedule": "0 * * * *"], nil, false)
        case .gmail:
            return ("Gmail API", "Envia e monitora emails corporativos", ["title": "Gmail OpenClaw", "apiAction": "send_email", "recipient": "cliente@empresa.com", "subject": "Relatório de Automação", "body": "Olá, segue o resultado do processamento."], nil, false)
        case .googleDrive:
            return ("Google Drive API", "Sincroniza arquivos locais com o Drive", ["title": "Drive Sincronizador", "apiAction": "upload_file", "driveFolder": "Automações OpenClaw", "fileName": "resultado.txt"], nil, false)
        case .whatsapp:
            return ("WhatsApp API", "Envia notificações e alertas diretamente", ["title": "WhatsApp Notificador", "apiAction": "send_message", "phoneNumber": "+5511999999999", "messageText": "Olá! O processo foi executado com sucesso."], nil, false)
        case .telegram:
            return ("Telegram API", "Integra com robôs e canais de chat", ["title": "Telegram Bot", "apiAction": "send_message", "chatId": "-10029384920", "botToken": ""], nil, false)
        case .agent:
            return ("Agente Geral", "Agente de IA autônomo com modelo avançado", ["title": "Agente IA", "agentId": "agent-1", "model": ModelId.claude.rawValue], 0.4, false)
        default:
            return ("Nó de Automação", "Ação genérica do workflow", ["title": "Ação"], nil, false)
        }
    }

    static func shortTime() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date())
    }

    static func fullTime() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: Date())
    }
}
