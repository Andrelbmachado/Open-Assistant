import SwiftUI

struct AgentsView: View {
    @EnvironmentObject private var store: AssistantStore

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 310), spacing: 16)], spacing: 16) {
                    ForEach(store.visibleAgents) { agent in
                        AgentCard(agent: agent)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 102)
                .padding(.bottom, 24)
            }

            if store.showBottomTerminal {
                CollapsibleBottomTerminal(isPresented: $store.showBottomTerminal)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.58))
    }
}

private struct AgentCard: View {
    @EnvironmentObject private var store: AssistantStore
    var agent: Agent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 7) {
                    Label(agent.name, systemImage: "sparkles")
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(agent.role.isEmpty ? agent.prompt : agent.role)
                        .font(.system(size: 12.5))
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
                AgentStatusActionButton(agent: agent)
            }

            Divider()

            HStack(spacing: 10) {
                Button {
                    store.showWorkflow(for: agent.id)
                } label: {
                    Label("Nodes", systemImage: "square.stack.3d.up")
                        .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity)

                Button {
                    store.selectSection(.terminals)
                } label: {
                    Label("Terminal", systemImage: "terminal")
                        .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.regular)
        }
        .padding(18)
        .frame(minHeight: 132, alignment: .topLeading)
        .liquidGlass(cornerRadius: 18)
        .aiProcessingGlow(
            isActive: agent.status == .running,
            cornerRadius: 18,
            style: .border
        )
        .overlay {
            if store.selectedAgentId == agent.id {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Color.accentColor.opacity(0.55), lineWidth: 1.2)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onTapGesture(count: 2) {
            store.showWorkflow(for: agent.id)
        }
        .onTapGesture {
            store.selectedAgentId = agent.id
        }
        .contextMenu {
            Button("Selecionar") { store.selectedAgentId = agent.id }
            Button("Abrir Terminal") { store.selectSection(.terminals) }
            Button("Ver Workflow Nodes") { store.showWorkflow(for: agent.id) }
            Divider()
            Button(agent.status == .running ? "Pausar" : "Iniciar") { store.toggleAgentStatus(agent.id) }
        }
    }

    private var editSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            editableText("Nome do Agente", text: binding(\.name))
            editableText("Role/Função", text: binding(\.role))

            VStack(alignment: .leading, spacing: 6) {
                Text("Modelo de LLM Atribuído")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Picker("Modelo", selection: binding(\.modelId)) {
                    ForEach(store.models) { model in
                        Text(model.name).tag(model.id)
                    }
                }
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Prompt Base de Instruções")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextEditor(text: binding(\.prompt))
                    .font(.caption)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 10))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Ferramentas / Tools")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(["FolderWatcher", "FileReader", "LLMReasoning", "FileWriter", "BashRuntime", "NPMInstaller"], id: \.self) { tool in
                    Toggle(tool, isOn: toolBinding(tool))
                        .font(.caption)
                }
            }

            HStack(spacing: 8) {
                Button {
                    store.selectedAgentId = agent.id
                    store.duplicateSelectedAgent()
                } label: {
                    Label("Duplicar", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }

                Button(role: .destructive) {
                    store.selectedAgentId = agent.id
                    store.deleteSelectedAgent()
                } label: {
                    Label("Excluir", systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 12))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private var currentAgent: Agent {
        store.agents.first(where: { $0.id == agent.id }) ?? agent
    }

    private func binding<T>(_ keyPath: WritableKeyPath<Agent, T>) -> Binding<T> {
        Binding {
            currentAgent[keyPath: keyPath]
        } set: { value in
            var updated = currentAgent
            updated[keyPath: keyPath] = value
            store.updateAgent(updated)
        }
    }

    private func toolBinding(_ tool: String) -> Binding<Bool> {
        Binding {
            currentAgent.tools.contains(tool)
        } set: { isOn in
            var updated = currentAgent
            if isOn {
                if !updated.tools.contains(tool) { updated.tools.append(tool) }
            } else {
                updated.tools.removeAll { $0 == tool }
            }
            store.updateAgent(updated)
        }
    }

    private func editableText(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField(label, text: text)
                .textFieldStyle(.roundedBorder)
        }
    }

    private var modelName: String {
        store.models.first(where: { $0.id == agent.modelId })?.name ?? agent.modelId.rawValue
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct AgentStatusActionButton: View {
    @EnvironmentObject private var store: AssistantStore
    var agent: Agent
    @State private var isHovered = false

    private var isRunning: Bool { agent.status == .running }
    private var actionTitle: String { isRunning ? "Pausar" : "Iniciar" }
    private var actionSymbol: String { isRunning ? "pause.fill" : "play.fill" }
    private var displayTint: Color { isHovered ? (isRunning ? .yellow : .green) : agent.status.tint }

    var body: some View {
        Button {
            store.toggleAgentStatus(agent.id)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isHovered ? actionSymbol : agent.status.symbol)
                    .font(.system(size: 8, weight: .bold))
                Text(isHovered ? actionTitle : agent.status.rawValue.capitalized)
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(displayTint)
            .padding(.horizontal, 9)
            .frame(height: 24)
            .background(displayTint.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(displayTint.opacity(0.25), lineWidth: 0.7))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.13)) {
                isHovered = hovering
            }
        }
        .animation(.snappy(duration: 0.18), value: isHovered)
        .help(isRunning ? "Passe o mouse e clique para pausar" : "Passe o mouse e clique para iniciar")
        .accessibilityLabel(isRunning ? "Agente em execução. Pausar" : "Agente \(agent.status.rawValue). Iniciar")
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
