//
//  Assistente_pessoalTests.swift
//  Assistente pessoalTests
//
//  Created by André Machado on 08/07/26.
//

import Testing
import Foundation
@testable import Assistente_pessoal

struct Assistente_pessoalTests {

    @MainActor
    @Test func addingWorkflowNodePersistsInVisibleWorkflowAtMapCenter() async throws {
        let store = AssistantStore()
        store.selectSection(.workflows)

        let workflowId = store.activeWorkflowId
        let beforeCount = store.workflow(id: workflowId).nodes.count
        store.addWorkflowNode(.prompt, workflowId: workflowId)

        let workflow = store.workflow(id: workflowId)
        let node = try #require(workflow.nodes.last)
        #expect(workflow.nodes.count == beforeCount + 1)
        #expect(node.type == .prompt)
        #expect(node.x.isFinite && node.x >= 0)
        #expect(node.y.isFinite && node.y >= 0)
        #expect(store.selectedWorkflowNodeIds == [node.id])
        #expect(store.workspaceLayout.area(id: store.activeWorkspaceAreaId)?.workflowId == workflowId)
    }

    @MainActor
    @Test func newAgentWorkflowCanReceiveNodes() async throws {
        let store = AssistantStore()
        let agentId = store.createAgent()
        store.showWorkflow(for: agentId)

        let area = try #require(store.workspaceLayout.area(id: store.activeWorkspaceAreaId))
        let workflowId = try #require(area.workflowId)
        #expect(area.kind == .nodes)
        #expect(store.activeWorkflowId == workflowId)

        store.addWorkflowNode(.folder, workflowId: workflowId)

        let workflow = store.workflow(id: workflowId)
        #expect(workflow.nodes.count == 1)
        #expect(workflow.nodes.first?.type == .folder)
    }

    @MainActor
    @Test func workflowNodesCanBeConnectedFromFolderToPrompt() async throws {
        let store = AssistantStore()
        let agentId = store.createAgent()
        store.showWorkflow(for: agentId)
        let workflowId = store.activeWorkflowId

        store.addWorkflowNode(.folder, workflowId: workflowId)
        store.addWorkflowNode(.prompt, workflowId: workflowId)

        let nodes = store.workflow(id: workflowId).nodes
        let folder = try #require(nodes.first { $0.type == .folder })
        let prompt = try #require(nodes.first { $0.type == .prompt })
        let positionsBefore = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, CGPoint(x: $0.x, y: $0.y)) })
        store.handlePortTap(nodeId: folder.id, port: 1, isOutput: true, workflowId: workflowId)
        store.handlePortTap(nodeId: prompt.id, port: 1, isOutput: false, workflowId: workflowId)

        let connection = try #require(store.workflow(id: workflowId).connections.last)
        #expect(connection.fromId == folder.id)
        #expect(connection.toId == prompt.id)
        #expect(connection.fromPort == 1)
        #expect(connection.toPort == 1)
        let positionsAfter = Dictionary(uniqueKeysWithValues: store.workflow(id: workflowId).nodes.map { ($0.id, CGPoint(x: $0.x, y: $0.y)) })
        #expect(positionsAfter == positionsBefore)
    }

    @MainActor
    @Test func localFileNodesHaveExecutablePathDefaults() async throws {
        let store = AssistantStore()
        let workflowId = store.activeWorkflowId

        store.addWorkflowNode(.reader, workflowId: workflowId)
        store.addWorkflowNode(.writer, workflowId: workflowId)

        let nodes = store.workflow(id: workflowId).nodes
        let reader = try #require(nodes.last { $0.type == .reader })
        let writer = try #require(nodes.last { $0.type == .writer })
        #expect(reader.name == "Arquivo Local")
        #expect(reader.config["path"] == "~/Desktop/arquivo.txt")
        #expect(reader.config["encoding"] == "utf-8")
        #expect(writer.name == "Salvar Arquivo")
        #expect(writer.config["outputPath"] == "~/Desktop/resultado.txt")
    }

    @MainActor
    @Test func agentWorkflowOpensExistingWorkflowWithCreatedNodes() async throws {
        let store = AssistantStore()
        store.showWorkflow(for: "agent-1")

        let area = try #require(store.workspaceLayout.area(id: store.activeWorkspaceAreaId))
        let workflowId = try #require(area.workflowId)
        let workflow = store.workflow(id: workflowId)

        #expect(workflowId == "wf-1")
        #expect(area.kind == .nodes)
        #expect(workflow.nodes.contains { $0.config["agentId"] == "agent-1" })
        #expect(!workflow.nodes.isEmpty)
    }

    @MainActor
    @Test func workspaceTypeMenuIncludesNodes() async throws {
        #expect(WorkspaceAreaKind.switchableKinds.contains(.nodes))
    }

    @MainActor
    @Test func remoteProvidersHaveRealHTTPSConfiguration() async throws {
        for provider in ModelConfig.Provider.all {
            #expect(!provider.keychainAccount.isEmpty)
            if ![.openai, .anthropic].contains(provider) {
                #expect(provider.endpoint.hasPrefix("https://"))
            }
        }
        #expect(AssistantStore.makeModels().first(where: { $0.id == .gpt })?.apiModel == "gpt-5.5")
    }

    @MainActor
    @Test func marketplaceUsesStableStoreKitProductIdentifiers() async throws {
        let service = MarketplacePurchaseService()
        let item = MarketplaceItem(id: "spotify-mcp", name: "Spotify", description: "", price: "$1.99", downloads: "", rating: "", publisher: "")
        #expect(service.productID(for: item, kind: .mcp) == "Andre.Assistente-pessoal.marketplace.mcp.spotify-mcp")
    }

    @MainActor
    @Test func runtimeWorkflowTemplateContainsExpectedNodesAndConnections() async throws {
        let settings = AssistantStore.makeSettings().localRuntime
        let workflow = RuntimeWorkflowTemplateFactory().makeInstallWorkflow(settings: settings, mode: .full)
        let actions = Set(workflow.nodes.compactMap(\.runtimeAction))

        for action in RuntimeWorkflowTemplateFactory.mainInstallActions {
            #expect(actions.contains(action))
        }
        #expect(actions.contains(.missingNode))
        #expect(actions.contains(.lowDisk))
        #expect(workflow.connections.contains { $0.fromId == RuntimeWorkflowTemplateFactory.nodeId(for: .start) && $0.toId == RuntimeWorkflowTemplateFactory.nodeId(for: .detectOS) })
        #expect(workflow.connections.contains { $0.fromId == RuntimeWorkflowTemplateFactory.nodeId(for: .checkNodeJS) && $0.toId == RuntimeWorkflowTemplateFactory.nodeId(for: .missingNode) })
    }

    @MainActor
    @Test func runtimeCommandsRequireApprovalForSensitiveOperations() async throws {
        let settings = AssistantStore.makeSettings().localRuntime
        let installer = RuntimeInstaller()
        let sensitive: [RuntimeAction] = [.installOllama, .pullDefaultModel, .installOpenClaw, .configureOpenClawWithOllama]

        for action in sensitive {
            let command = installer.command(for: action, settings: settings)
            #expect(command?.requiresApproval == true)
            #expect(command?.displayCommand.localizedCaseInsensitiveContains("sudo") == false)
        }

        #expect(installer.command(for: .startOllama, settings: settings)?.requiresApproval == false)
        #expect(installer.command(for: .startOpenClawGateway, settings: settings)?.requiresApproval == false)
    }

    @Test func runtimeStatusParsersHandleProviderOutput() async throws {
        let data = #"{"models":[{"name":"llama3.2:3b"},{"model":"qwen2.5:7b"}]}"#.data(using: .utf8)!
        #expect(RuntimeStatusParsers.parseOllamaModels(from: data) == ["llama3.2:3b", "qwen2.5:7b"])
        #expect(RuntimeStatusParsers.parseVersion(from: "node v24.1.0") == "24.1.0")
        #expect(RuntimeStatusParsers.nodeVersionIsCompatible("v22.19.0"))
        #expect(RuntimeStatusParsers.nodeVersionIsCompatible("v24.0.0"))
        #expect(!RuntimeStatusParsers.nodeVersionIsCompatible("v22.18.0"))
        #expect(RuntimeStatusParsers.openClawGatewayIsRunning(from: "Gateway listening on port 18789"))
    }

    @MainActor
    @Test func installerWorkflowRunnerStopsWhenNodeIsMissing() async throws {
        let settings = AssistantStore.makeSettings().localRuntime
        let statusService = FakeRuntimeStatusService()
        statusService.statuses[.ollama] = RuntimeStatus(
            component: .ollama,
            state: .running,
            version: "0.1.0",
            binaryPath: "/usr/local/bin/ollama",
            port: 11434,
            url: "http://localhost:11434/api",
            models: ["llama3.2:3b"],
            error: nil,
            lastCheckedAt: Date()
        )
        statusService.statuses[.openClaw] = RuntimeStatus.empty(.openClaw)
        statusService.nodeStatus = RuntimeNodeStatus(installed: false, compatible: false, version: nil, binaryPath: nil)

        let processRunner = FakeProcessRunner()
        let runner = InstallerWorkflowRunner(
            statusService: statusService,
            installer: RuntimeInstaller(),
            processRunner: processRunner,
            stateStore: RuntimeStateStore()
        )
        let plan = RuntimePermissionBroker().makePlan(mode: .full, settings: settings, statuses: statusService.statuses)

        var updates: [RuntimeNodeUpdate] = []
        var logs: [RuntimeLogEntry] = []
        _ = await runner.run(
            plan: plan,
            settings: settings,
            initialStatuses: statusService.statuses,
            onLog: { logs.append($0) },
            onNodeUpdate: { updates.append($0) },
            onRegisterMCPBridge: {}
        )

        #expect(updates.contains { $0.action == .checkNodeJS && $0.status == .error })
        #expect(updates.contains { $0.action == .missingNode && $0.status == .warning })
        #expect(!updates.contains { $0.action == .installOpenClaw && $0.status == .running })
        #expect(logs.contains { $0.message.contains("Node.js nao encontrado") })
    }

    @Test func structuredAIReplyParsesContextualBlocksAndFallsBackToText() {
        let raw = #"{"text":"Resultado pronto","voiceText":"Pronto","blocks":[{"type":"code","title":"Trecho","language":"swift","filePath":"App.swift","previousCode":"let value = 0","code":"let value = 1"},{"type":"dashboard","dashboard":{"title":"Receita","metrics":[{"title":"Total","value":1200,"unit":"BRL"}],"points":[{"label":"Jan","value":900}]}}]}"#
        let reply = AIProviderService.parseReply(raw)
        #expect(reply.text == "Resultado pronto")
        #expect(reply.voiceText == "Pronto")
        #expect(reply.blocks.count == 2)
        #expect(reply.blocks.first?.code == "let value = 1")
        #expect(reply.blocks.first?.previousCode == "let value = 0")
        #expect(reply.blocks.first?.filePath == "App.swift")
        #expect(reply.blocks.last?.dashboard?.metrics?.first?.value == 1200)

        let fallback = AIProviderService.parseReply("Uma resposta comum.")
        #expect(fallback.text == "Uma resposta comum.")
        #expect(fallback.blocks.isEmpty)

        let markdown = AIProviderService.parseReply("Use este exemplo:\n```python\nprint(2 + 2)\n```")
        #expect(markdown.text == "Use este exemplo:")
        #expect(markdown.blocks.first?.type == "code")
        #expect(markdown.blocks.first?.language == "python")
        #expect(markdown.blocks.first?.code == "print(2 + 2)")
    }

    @MainActor
    @Test func tokenUsageUsesRealModelLimitAndIncludesDraft() {
        let store = AssistantStore()
        let base = store.tokenUsage(for: store.activeChatId)
        let withDraft = store.tokenUsage(for: store.activeChatId, draft: "Esta é uma mensagem adicional para estimar tokens.")
        #expect(base.contextLimit == store.activeModel.contextWindow)
        #expect(withDraft.inputTokens > base.inputTokens)
        #expect(withDraft.fraction >= base.fraction)
        #expect(withDraft.isEstimated)
    }

    @MainActor
    @Test func splitWorkspaceKeepsTypeButCreatesEmptyResource() throws {
        let store = AssistantStore()
        store.selectSection(.chat)
        let originalAreaId = store.activeWorkspaceAreaId
        let originalChatId = try #require(store.workspaceLayout.area(id: originalAreaId)?.chatId)

        store.splitWorkspaceArea(originalAreaId, axis: .horizontal, fraction: 0.5)

        let newArea = try #require(store.workspaceLayout.area(id: store.activeWorkspaceAreaId))
        #expect(newArea.kind == .chat)
        #expect(newArea.chatId != nil)
        #expect(newArea.chatId != originalChatId)
        #expect(store.chat(id: newArea.chatId).messages.isEmpty)
    }

    @MainActor
    @Test func dashboardAndAgentCanBelongToProjectAndOpenImmediately() throws {
        let store = AssistantStore()
        let projectId = store.createProject()
        let dashboardId = store.createDashboard(in: projectId, title: "Financeiro")
        #expect(store.projects.first(where: { $0.id == projectId })?.dashboardIds.contains(dashboardId) == true)
        #expect(store.workspaceLayout.area(id: store.activeWorkspaceAreaId)?.kind == .dashboard)

        let agentId = store.createAgent(in: projectId)
        #expect(store.projects.first(where: { $0.id == projectId })?.agentIds.contains(agentId) == true)
        #expect(store.workspaceLayout.area(id: store.activeWorkspaceAreaId)?.kind == .agents)
        #expect(store.selectedAgentId == agentId)
    }

    @MainActor
    @Test func sidebarItemsCanBePinnedArchivedAndDeleted() throws {
        let store = AssistantStore()
        let chatId = store.activeChatId
        store.toggleChatPinned(chatId)
        #expect(store.chats.first(where: { $0.id == chatId })?.isPinned == true)
        store.archiveChat(chatId)
        #expect(store.chats.first(where: { $0.id == chatId })?.isArchived == true)

        let agentId = store.createAgent()
        store.toggleAgentPinned(agentId)
        #expect(store.agents.first(where: { $0.id == agentId })?.isPinned == true)
        store.deleteAgent(agentId)
        #expect(!store.agents.contains(where: { $0.id == agentId }))
    }

    @MainActor
    @Test func expandedEditorCanPersistSnippetsAndRealFiles() throws {
        let store = AssistantStore()
        store.openCodeSnippetReview(language: "swift", code: "let value = 1")
        let snippetResult = try store.saveSelectedCodeFile(content: "let value = 2")
        #expect(store.selectedCodeFile?.content == "let value = 2")
        #expect(snippetResult.contains("sessão"))

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileURL = directory.appendingPathComponent("EditorSave.swift")
        try "let original = true".write(to: fileURL, atomically: true, encoding: .utf8)

        store.openCodeReference(filePath: fileURL.path, line: nil)
        _ = try store.saveSelectedCodeFile(content: "let edited = true")
        #expect(try String(contentsOf: fileURL, encoding: .utf8) == "let edited = true")
        #expect(store.selectedCodeFile?.content == "let edited = true")
    }

    @MainActor
    @Test func workflowFramesContainMoveAndConvertNodes() throws {
        let store = AssistantStore()
        let workflowId = store.activeWorkflowId
        store.addWorkflowNode(.prompt, workflowId: workflowId)
        var node = try #require(store.workflow(id: workflowId).nodes.last)
        store.addWorkflowFrame(.project, workflowId: workflowId)
        var frame = try #require(store.workflow(id: workflowId).frames.last)

        frame.x = 400
        frame.y = 300
        frame.width = 600
        frame.height = 420
        store.updateWorkflowFrame(frame, workflowId: workflowId)
        node.x = 500
        node.y = 400
        store.updateWorkflowNode(node, workflowId: workflowId)
        store.assignWorkflowNodeToContainingFrame(node.id, workflowId: workflowId)

        frame = try #require(store.workflow(id: workflowId).frames.first { $0.id == frame.id })
        #expect(frame.nodeIds == [node.id])
        let originalNode = try #require(store.workflow(id: workflowId).nodes.first { $0.id == node.id })
        store.moveWorkflowFrame(id: frame.id, by: CGSize(width: 40, height: 30), workflowId: workflowId)
        let movedNode = try #require(store.workflow(id: workflowId).nodes.first { $0.id == node.id })
        #expect(movedNode.x == originalNode.x + 40)
        #expect(movedNode.y == originalNode.y + 30)

        store.convertWorkflowFrameToNode(frame, workflowId: workflowId)
        #expect(!store.workflow(id: workflowId).frames.contains { $0.id == frame.id })
        #expect(store.workflow(id: workflowId).nodes.count >= 2)
    }

    @MainActor
    @Test func frameHighlightsDropTargetAndExpandsForContainedNodes() throws {
        let store = AssistantStore()
        let workflowId = store.activeWorkflowId
        store.addWorkflowFrame(.project, workflowId: workflowId)
        var frame = try #require(store.workflow(id: workflowId).frames.last)
        frame.x = 300
        frame.y = 220
        frame.width = 600
        frame.height = 360
        store.updateWorkflowFrame(frame, workflowId: workflowId)

        store.addWorkflowNode(.prompt, workflowId: workflowId)
        var node = try #require(store.workflow(id: workflowId).nodes.last)
        node.x = 750
        node.y = 320
        store.updateWorkflowNode(node, workflowId: workflowId)
        store.updateWorkflowFrameDropTarget(for: node.id, workflowId: workflowId)
        #expect(store.workflowFrameDropTargetId == frame.id)

        store.assignWorkflowNodeToContainingFrame(node.id, workflowId: workflowId)
        frame = try #require(store.workflow(id: workflowId).frames.first { $0.id == frame.id })
        #expect(frame.nodeIds.contains(node.id))
        #expect(frame.width >= 734)
        #expect(store.workflowFrameDropTargetId == nil)
    }

    @MainActor
    @Test func frameAutomaticallySpacesMultipleContainedNodes() throws {
        let store = AssistantStore()
        let workflowId = store.activeWorkflowId
        store.addWorkflowFrame(.project, workflowId: workflowId)
        var frame = try #require(store.workflow(id: workflowId).frames.last)
        frame.x = 280
        frame.y = 210
        frame.width = 620
        frame.height = 380
        store.updateWorkflowFrame(frame, workflowId: workflowId)

        store.addWorkflowNode(.prompt, workflowId: workflowId)
        var first = try #require(store.workflow(id: workflowId).nodes.last)
        first.x = 390
        first.y = 320
        store.updateWorkflowNode(first, workflowId: workflowId)
        store.assignWorkflowNodeToContainingFrame(first.id, workflowId: workflowId)

        store.addWorkflowNode(.reader, workflowId: workflowId)
        var second = try #require(store.workflow(id: workflowId).nodes.last)
        second.x = 650
        second.y = 320
        store.updateWorkflowNode(second, workflowId: workflowId)
        store.assignWorkflowNodeToContainingFrame(second.id, workflowId: workflowId)

        let updatedFrame = try #require(store.workflow(id: workflowId).frames.first { $0.id == frame.id })
        first = try #require(store.workflow(id: workflowId).nodes.first { $0.id == first.id })
        second = try #require(store.workflow(id: workflowId).nodes.first { $0.id == second.id })
        let firstWidth = store.workflowNodeSizes[first.id]?.width ?? 260

        #expect(updatedFrame.nodeIds == [first.id, second.id])
        #expect(second.x - (first.x + firstWidth) >= 48)
        #expect(first.y == second.y)
    }

    @MainActor
    @Test func invalidFileFrameSkipsContainedNodesAndAppliesScope() throws {
        let store = AssistantStore()
        let workflowId = store.activeWorkflowId
        store.addWorkflowNode(.reader, workflowId: workflowId)
        let node = try #require(store.workflow(id: workflowId).nodes.last)
        store.addWorkflowFrame(.file, workflowId: workflowId)
        var frame = try #require(store.workflow(id: workflowId).frames.last)
        frame.config["path"] = "/arquivo/que/nao/existe-\(UUID().uuidString)"
        frame.nodeIds = [node.id]
        store.updateWorkflowFrame(frame, workflowId: workflowId)

        store.runWorkflow(workflowId)

        let updatedNode = try #require(store.workflow(id: workflowId).nodes.first { $0.id == node.id })
        #expect(updatedNode.status == .skipped)
        #expect(updatedNode.config["frameScopeFile"] == frame.config["path"])
    }

    @Test func openAIImageIntentDetectionRequiresActionAndVisualMedium() {
        #expect(AIProviderService.looksLikeImageGenerationRequest("Gere uma imagem de uma casa moderna"))
        #expect(AIProviderService.looksLikeImageGenerationRequest("Create a photo of a mountain at sunrise"))
        #expect(!AIProviderService.looksLikeImageGenerationRequest("Explique como funciona a geração de imagens"))
        #expect(!AIProviderService.looksLikeImageGenerationRequest("Crie uma lista de tarefas"))
    }

    @MainActor
    @Test func demonstrationAgentsOwnConfiguredWorkflows() throws {
        let store = AssistantStore()
        for number in 1...3 {
            let agentId = "example-\(number)"
            let workflowId = "workflow-example-\(number)"
            #expect(store.agents.contains { $0.id == agentId })
            let workflow = try #require(store.workflows.first { $0.id == workflowId })
            #expect(workflow.nodes.contains { $0.config["agentId"] == agentId })
            #expect(!workflow.connections.isEmpty)
        }

        let dailyDog = try #require(store.workflows.first { $0.id == "workflow-example-3" })
        let schedule = try #require(dailyDog.frames.first { $0.kind == .schedule })
        #expect(schedule.config["time"] == "06:00")
        #expect(schedule.nodeIds.count == dailyDog.nodes.count)
        #expect(!dailyDog.isActive)
    }

    @Test func assistantVoiceProfilesHaveNativeAndPocketMappings() {
        #expect(AssistantVoiceProfile.allCases.map(\.rawValue) == ["Evee", "Sol", "Harvey"])
        for profile in AssistantVoiceProfile.allCases {
            #expect(!profile.nativeVoiceCandidates.isEmpty)
            #expect(!profile.pocketVoice.isEmpty)
        }
    }

}

@MainActor
private final class FakeRuntimeStatusService: RuntimeStatusProviding {
    var statuses: [RuntimeComponent: RuntimeStatus] = Dictionary(uniqueKeysWithValues: RuntimeComponent.allCases.map { ($0, RuntimeStatus.empty($0)) })
    var nodeStatus = RuntimeNodeStatus(installed: true, compatible: true, version: "24.0.0", binaryPath: "/usr/local/bin/node")

    func checkAll(settings: AppSettings.LocalRuntime) async -> [RuntimeComponent: RuntimeStatus] {
        statuses
    }

    func checkNodeJS() -> RuntimeNodeStatus {
        nodeStatus
    }

    func checkNetwork() async -> Bool {
        true
    }

    func binaryPath(for command: String) -> String? {
        "/usr/local/bin/\(command)"
    }

    func portOwner(port: Int) -> String? {
        nil
    }
}

@MainActor
private final class FakeProcessRunner: RuntimeProcessRunning {
    var commands: [RuntimeShellCommand] = []

    func run(_ command: RuntimeShellCommand, onOutput: @escaping (String) -> Void) async -> RuntimeCommandResult {
        commands.append(command)
        onOutput("fake output for \(command.action.title)")
        return RuntimeCommandResult(exitCode: 0, output: "ok", errorOutput: "")
    }
}
