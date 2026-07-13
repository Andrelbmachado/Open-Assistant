import Foundation
import SwiftUI

struct RuntimeWorkflowTemplateFactory {
    static let workflowId = "system-install-local-runtime"
    static let systemAgentId = "system-setup-agent"

    static let mainInstallActions: [RuntimeAction] = [
        .start,
        .detectOS,
        .checkArchitecture,
        .checkDiskSpace,
        .checkNetwork,
        .checkExistingOllama,
        .installOllama,
        .startOllama,
        .verifyOllamaAPI,
        .pullDefaultModel,
        .checkNodeJS,
        .checkExistingOpenClaw,
        .installOpenClaw,
        .configureOpenClawWithOllama,
        .startOpenClawGateway,
        .verifyGateway,
        .createMCPBridge,
        .registerRuntimeState,
        .healthCheck,
        .finish
    ]

    static let recoverableErrorActions: [RuntimeAction] = [
        .missingNode,
        .lowDisk,
        .portBusy,
        .ollamaAPIError,
        .openClawGatewayError,
        .mcpBridgeWarning
    ]

    func makeInstallWorkflow(settings: AppSettings.LocalRuntime, mode: RuntimeInstallMode) -> Workflow {
        let installer = RuntimeInstaller()
        var nodes = Self.mainInstallActions.enumerated().map { index, action in
            let command = installer.command(for: action, settings: settings)
            return WorkflowNode(
                id: RuntimeWorkflowTemplateFactory.nodeId(for: action),
                name: action.title,
                type: .runtimeAction,
                x: 80 + CGFloat(index % 5) * 310,
                y: 90 + CGFloat(index / 5) * 245,
                status: .idle,
                description: action.description,
                config: [
                    "title": action.title,
                    "runtimeAction": action.rawValue,
                    "mode": mode.rawValue
                ],
                temperature: nil,
                allowSelfEdit: false,
                runtimeAction: action,
                progress: 0,
                lastLogLine: nil,
                commandPreview: command?.displayCommand,
                requiresApproval: command?.requiresApproval ?? false
            )
        }

        nodes.append(contentsOf: Self.recoverableErrorActions.enumerated().map { index, action in
            WorkflowNode(
                id: RuntimeWorkflowTemplateFactory.nodeId(for: action),
                name: action.title,
                type: .runtimeAction,
                x: 80 + CGFloat(index) * 310,
                y: 1120,
                status: .idle,
                description: action.description,
                config: [
                    "title": action.title,
                    "runtimeAction": action.rawValue,
                    "mode": mode.rawValue,
                    "recoverable": "true"
                ],
                temperature: nil,
                allowSelfEdit: false,
                runtimeAction: action,
                progress: 0,
                lastLogLine: nil,
                commandPreview: nil,
                requiresApproval: false
            )
        })

        var connections: [NodeConnection] = []
        for pair in zip(Self.mainInstallActions, Self.mainInstallActions.dropFirst()) {
            connections.append(NodeConnection(id: "conn-\(pair.0.rawValue)-\(pair.1.rawValue)", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: pair.0), toId: RuntimeWorkflowTemplateFactory.nodeId(for: pair.1), fromPort: 2, toPort: 1))
        }

        connections.append(NodeConnection(id: "conn-check-node-missing", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .checkNodeJS), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .missingNode), fromPort: 3, toPort: 1))
        connections.append(NodeConnection(id: "conn-disk-low", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .checkDiskSpace), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .lowDisk), fromPort: 3, toPort: 1))
        connections.append(NodeConnection(id: "conn-ollama-port-busy", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .verifyOllamaAPI), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .portBusy), fromPort: 3, toPort: 1))
        connections.append(NodeConnection(id: "conn-ollama-api-error", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .verifyOllamaAPI), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .ollamaAPIError), fromPort: 4, toPort: 1))
        connections.append(NodeConnection(id: "conn-gateway-error", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .verifyGateway), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .openClawGatewayError), fromPort: 3, toPort: 1))
        connections.append(NodeConnection(id: "conn-mcp-warning", fromId: RuntimeWorkflowTemplateFactory.nodeId(for: .createMCPBridge), toId: RuntimeWorkflowTemplateFactory.nodeId(for: .mcpBridgeWarning), fromPort: 3, toPort: 1))

        return Workflow(
            id: Self.workflowId,
            name: "Install Local Runtime",
            description: "Workflow automatico do System Setup Agent para instalar Ollama, OpenClaw e MCP Bridge local.",
            isActive: true,
            nodes: nodes,
            connections: connections
        )
    }

    static func nodeId(for action: RuntimeAction) -> String {
        "runtime-\(action.rawValue)"
    }
}
