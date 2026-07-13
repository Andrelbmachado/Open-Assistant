import SwiftUI

struct CommandPaletteView: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var search = ""
    @FocusState private var focused: Bool

    private var commands: [PaletteCommand] {
        [
            PaletteCommand(id: "new-chat", category: "Chat", title: "Iniciar Novo Chat", shortcut: "⌘N", symbol: "message", action: "nav-chat-new"),
            PaletteCommand(id: "nav-chat", category: "Navegação", title: "Abrir Conversa Principal", shortcut: "⌘1", symbol: "message", action: "nav-chat"),
            PaletteCommand(id: "nav-agents", category: "Navegação", title: "Gerenciar Agentes de IA", shortcut: "⌘2", symbol: "person.3", action: "nav-agents"),
            PaletteCommand(id: "nav-wf", category: "Navegação", title: "Visualizar Workflow por Nodes", shortcut: "⌘3", symbol: "square.stack.3d.up", action: "nav-workflows"),
            PaletteCommand(id: "nav-term", category: "Navegação", title: "Abrir Terminais de Execução", shortcut: "⌘4", symbol: "terminal", action: "nav-terminals"),
            PaletteCommand(id: "nav-files", category: "Navegação", title: "Navegar por Arquivos e Diffs", shortcut: "⌘5", symbol: "folder", action: "nav-files"),
            PaletteCommand(id: "nav-set", category: "Configurações", title: "Abrir Ajustes do Sistema", shortcut: "⌘,", symbol: "gearshape", action: "nav-settings"),
            PaletteCommand(id: "switch-gpt", category: "Modelos", title: "Mudar para GPT-5.5 Ultra", shortcut: "⌥1", symbol: "sparkles", action: "model", modelId: .gpt),
            PaletteCommand(id: "switch-claude", category: "Modelos", title: "Mudar para Claude 3.7 Sonnet", shortcut: "⌥2", symbol: "sparkles", action: "model", modelId: .claude),
            PaletteCommand(id: "switch-qwen", category: "Modelos", title: "Mudar para Qwen 2.5 Local", shortcut: "⌥3", symbol: "sparkles", action: "model", modelId: .qwen),
            PaletteCommand(id: "run-wf", category: "Ações", title: "Executar Workflow Diário", shortcut: "⇧⌘R", symbol: "play", action: "run-workflow")
        ]
    }

    private var filtered: [PaletteCommand] {
        guard !search.isEmpty else { return commands }
        return commands.filter {
            $0.title.localizedCaseInsensitiveContains(search) || $0.category.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.opacity(0.42)
                .ignoresSafeArea()
                .onTapGesture {
                    store.commandPaletteOpen = false
                }

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Digite um comando ou navegação...", text: $search)
                        .textFieldStyle(.plain)
                        .font(.body)
                        .focused($focused)
                        .onSubmit {
                            if let first = filtered.first {
                                execute(first)
                            }
                        }
                    Text("ESC")
                        .font(.caption2.monospaced())
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 5))
                    Button {
                        store.commandPaletteOpen = false
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    .help("Fechar")
                }
                .padding(14)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.primary.opacity(0.08)).frame(height: 1)
                }

                ScrollView {
                    LazyVStack(spacing: 4) {
                        if filtered.isEmpty {
                            Text("Nenhum comando encontrado para \"\(search)\"")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(28)
                        } else {
                            ForEach(filtered) { command in
                                Button {
                                    execute(command)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: command.symbol)
                                            .foregroundStyle(.tint)
                                            .frame(width: 24)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(command.title)
                                                .font(.subheadline.weight(.medium))
                                            Text(command.category)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                                .textCase(.uppercase)
                                        }
                                        Spacer()
                                        Text(command.shortcut)
                                            .font(.caption.monospaced())
                                            .foregroundStyle(.secondary)
                                            .padding(.horizontal, 7)
                                            .padding(.vertical, 3)
                                            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 5))
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 9)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 10))
                            }
                        }
                    }
                    .padding(10)
                }
                .frame(maxHeight: 360)

                HStack {
                    Text("↑↓ para navegar")
                    Text("↵ para selecionar")
                    Spacer()
                    Text("Open Assistant Command Palette")
                }
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.035))
            }
            .frame(width: 620)
            .liquidGlass(cornerRadius: 18)
            .padding(.top, 90)
        }
        .onAppear {
            focused = true
        }
    }

    private func execute(_ command: PaletteCommand) {
        store.executePaletteAction(command.action, payload: command.modelId)
        store.commandPaletteOpen = false
    }
}

private struct PaletteCommand: Identifiable {
    var id: String
    var category: String
    var title: String
    var shortcut: String
    var symbol: String
    var action: String
    var modelId: ModelId?
}
