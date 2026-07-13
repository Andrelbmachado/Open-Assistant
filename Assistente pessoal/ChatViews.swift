import SwiftUI
import Combine
import AppKit

struct ChatView: View {
    @EnvironmentObject private var store: AssistantStore
    var chatId: String? = nil
    @State private var inputText = ""

    private var chat: ChatSession {
        store.chat(id: chatId)
    }

    var body: some View {
        VStack(spacing: 0) {
            if chat.messages.isEmpty {
                emptyChat
            } else {
                VStack(spacing: 0) {
                    messageStream
                    PendingChangesBar()
                        .environmentObject(store)
                    ChatComposer(inputText: $inputText, chatId: chat.id)
                        .environmentObject(store)
                    .padding(.bottom, 18)
                }
                .frame(maxWidth: 950)
                .frame(maxWidth: .infinity)
            }

            if store.showBottomTerminal {
                CollapsibleBottomTerminal(isPresented: $store.showBottomTerminal)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.58))
    }

    private var emptyChat: some View {
        VStack(spacing: 22) {
            Spacer()

            Text("What should we get done?")
                .font(.system(size: 24, weight: .bold))

            VStack(spacing: 12) {
                ChatComposer(inputText: $inputText, chatId: chat.id, expanded: true)
                    .environmentObject(store)
                .padding(.bottom, 18)

                VStack(spacing: 6) {
                    SuggestionButton(symbol: "bolt.fill", text: "Analise a pasta de design por tendências brutalistas.") {
                        inputText = "Analise a pasta de design por tendências brutalistas."
                    }
                    SuggestionButton(symbol: "bolt.fill", text: "Como configuro o Workflow Modifier Node no Canvas?") {
                        inputText = "Como configuro o Workflow Modifier Node no Canvas?"
                    }
                    SuggestionButton(symbol: "terminal", text: "Execute npm run test:all no Sandbox.") {
                        inputText = "Execute npm run test:all no Sandbox."
                    }
                    SuggestionButton(symbol: "gearshape", text: "Conecte seus apps favoritos ao Codex") {
                        store.settingsOpen = true
                    }
                }
            }
            .frame(maxWidth: 950)

            Spacer()
        }
        .padding(32)
    }

    private var messageStream: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 18) {
                    ForEach(chat.messages) { message in
                        MessageRow(message: message, chatId: chat.id)
                            .id(message.id)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .scrollIndicators(.hidden)
            .frame(maxWidth: .infinity)
            .onChange(of: chat.messages.count) { _, _ in
                if let last = chat.messages.last {
                    withAnimation(.snappy) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }
}

struct HeaderBar<Trailing: View>: View {
    var leading: String
    var title: String
    var symbol: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.system(size: 24, weight: .light))
                .lineLimit(1)
            Spacer()
            trailing()
        }
        .padding(.horizontal, 24)
        .frame(height: 58)
        .background(Color.clear)
    }
}

struct ApprovalModePopoverContent: View {
    @EnvironmentObject var store: AssistantStore
    @Binding var isPresented: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("How should Codex actions be approved?")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Link("Learn more", destination: URL(string: "https://example.com")!)
                    .font(.system(size: 13))
            }
            .padding(.bottom, 4)
            
            ForEach(ApprovalMode.allCases) { mode in
                Button {
                    store.approvalMode = mode
                    isPresented = false
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: mode.icon)
                            .font(.system(size: 16))
                            .foregroundStyle(store.approvalMode == mode ? Color.orange : .secondary)
                            .frame(width: 20, height: 20)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mode.rawValue)
                                .font(.system(size: 12.5, weight: .semibold))
                                .foregroundStyle(.primary)
                            Text(mode.description)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.leading)
                        }
                        
                        Spacer()
                        
                        if store.approvalMode == mode {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .padding(8)
                    .background(store.approvalMode == mode ? Color.primary.opacity(0.04) : Color.clear)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(width: 320)
    }
}

struct ContextWindowPopoverContent: View {
    var usage: TokenUsage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Context window")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(formatted(usage.totalTokens)) / \(formatted(usage.contextLimit)) (\(Int(usage.fraction * 100))%)")
                    .font(.system(size: 13, weight: .medium))
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.primary.opacity(0.08))
                        .frame(height: 6)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.accentColor)
                        .frame(width: geo.size.width * CGFloat(usage.fraction), height: 6)
                }
            }
            .frame(height: 6)
            .padding(.bottom, 8)
            
            Divider()
            limitItem(title: "Entrada", subtitle: usage.isEstimated ? "Estimativa local" : "Informado pelo provedor", valueText: formatted(usage.inputTokens), fillProgress: Double(usage.inputTokens) / Double(max(usage.contextLimit, 1)))
            limitItem(title: "Saída", subtitle: nil, valueText: formatted(usage.outputTokens), fillProgress: Double(usage.outputTokens) / Double(max(usage.contextLimit, 1)))
            limitItem(title: "Restante", subtitle: nil, valueText: formatted(usage.remainingTokens), fillProgress: Double(usage.remainingTokens) / Double(max(usage.contextLimit, 1)))
        }
        .padding(16)
        .frame(width: 320)
    }

    private func formatted(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }
    
    private func limitItem(title: String, subtitle: String?, valueText: String, fillProgress: Double) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(valueText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.primary.opacity(0.08))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.accentColor)
                        .frame(width: geo.size.width * CGFloat(min(max(fillProgress, 0), 1)), height: 4)
                }
            }
            .frame(height: 4)
        }
    }
}

struct AttachmentPopoverContent: View {
    @EnvironmentObject var store: AssistantStore
    @Binding var isPresented: Bool
    @State private var showModelChooser = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { showModelChooser.toggle() } label: {
                HStack {
                    Image(systemName: "cpu")
                        .frame(width: 16)
                    Text("Escolher modelo de IA")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                .font(.system(size: 13))
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showModelChooser, arrowEdge: .trailing) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Modelo").font(.headline).padding(.horizontal, 8).padding(.vertical, 6)
                    ForEach(store.models) { model in
                        Button {
                            store.changeActiveChatModel(model.id)
                            showModelChooser = false
                            isPresented = false
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(model.name).font(.callout)
                                    Text(model.provider.displayName).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if store.activeModel.id == model.id { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                            }
                            .padding(.horizontal, 9).frame(height: 44)
                            .background(store.activeModel.id == model.id ? Color.accentColor.opacity(0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(7).frame(width: 280)
                .background(Color(nsColor: .windowBackgroundColor))
            }
            
            Divider()
                .padding(.vertical, 2)
            
            Button {
                isPresented = false
                store.showNotice("Documento anexado.")
            } label: {
                Label("Anexar documento", systemImage: "doc.text")
                    .font(.system(size: 13))
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            
            Button {
                isPresented = false
                store.showNotice("Foto anexada.")
            } label: {
                Label("Anexar foto", systemImage: "photo")
                    .font(.system(size: 13))
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            
            Button {
                isPresented = false
                store.showNotice("Modo Planejamento ativado.")
            } label: {
                Label("Ativar modo planejamento", systemImage: "pencil.and.outline")
                    .font(.system(size: 13))
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            
            Divider()
                .padding(.vertical, 2)
            
            Button {
                isPresented = false
                store.showNotice("Deep Research ativado.")
            } label: {
                Label("Deep research", systemImage: "sparkles")
                    .font(.system(size: 13))
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            
            Button {
                isPresented = false
                store.showNotice("Web Research ativado.")
            } label: {
                Label("Web research", systemImage: "globe")
                    .font(.system(size: 13))
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(width: 220)
    }
}

struct AnthropicLogo: View {
    var body: some View {
        ZStack {
            ForEach(0..<9) { i in
                Capsule()
                    .fill(Color(red: 217/255, green: 119/255, blue: 86/255))
                    .frame(width: 3, height: 9)
                    .offset(y: -3.5)
                    .rotationEffect(.degrees(Double(i) * (360.0 / 9.0)))
            }
            Circle()
                .fill(Color(red: 217/255, green: 119/255, blue: 86/255))
                .frame(width: 4, height: 4)
        }
        .frame(width: 18, height: 18)
    }
}

struct OpenAILogo: View {
    var body: some View {
        ZStack {
            ForEach(0..<6) { i in
                Capsule()
                    .stroke(Color(red: 16/255, green: 163/255, blue: 127/255), lineWidth: 1.5)
                    .frame(width: 5, height: 10)
                    .offset(y: -3)
                    .rotationEffect(.degrees(Double(i) * 60.0))
            }
        }
        .frame(width: 18, height: 18)
    }
}

private struct ChatInputBlurBand: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            Rectangle()
                .fill(reduceTransparency ? Color(nsColor: .windowBackgroundColor).opacity(0.88) : Color.clear)
            if !reduceTransparency {
                Rectangle()
                    .fill(.regularMaterial)
                Rectangle()
                    .fill(Color(nsColor: .windowBackgroundColor).opacity(0.52))
            }
        }
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black.opacity(0.74), location: 0.42),
                    .init(color: .black, location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .frame(height: 24)
        .allowsHitTesting(false)
    }
}

struct ProjectSelectionBar: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var showProjectBar: Bool
    @State private var showPicker = false
    @State private var isProjectButtonHovered = false

    var body: some View {
        HStack {
            // Chip do projeto com botão de fechar sobreposto no canto sup. direito.
            ZStack(alignment: .topTrailing) {
                Button {
                    showPicker.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: store.activeProject.symbol)
                            .font(.system(size: 11))
                            .foregroundStyle(store.activeProject.iconColor.color)
                        Text(store.activeProject.name)
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.8)
                    }
                    .foregroundStyle(Color.primary.opacity(0.84))
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showPicker, arrowEdge: .bottom) {
                    ProjectPickerPopover(isPresented: $showPicker)
                        .environmentObject(store)
                }

                if isProjectButtonHovered {
                    Button {
                        showProjectBar = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .background(Circle().fill(Color(nsColor: .windowBackgroundColor)))
                    }
                    .buttonStyle(.plain)
                    .offset(x: 6, y: -7)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
                    .help("Ocultar barra de projeto")
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .onHover { isProjectButtonHovered = $0 }
            .animation(.snappy(duration: 0.14), value: isProjectButtonHovered)

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 2)
    }
}

/// Lista de projetos existentes para troca rápida (estilo Codex "Choose project").
private struct ProjectPickerPopover: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var isPresented: Bool
    @State private var search = ""

    private var filtered: [Project] {
        store.projects.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                TextField("Buscar projetos", text: $search)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(filtered) { project in
                        Button {
                            store.setContextProject(project.id)
                            isPresented = false
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: project.symbol)
                                    .font(.system(size: 13))
                                    .foregroundStyle(project.iconColor.color)
                                Text(project.name)
                                    .font(.system(size: 14))
                                Spacer()
                                if store.contextProject?.id == project.id {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
            }
            .frame(maxHeight: 260)

            Divider()

            Button {
                store.createProject()
                if let newest = store.projects.first {
                    store.setContextProject(newest.id)
                }
                isPresented = false
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("Novo projeto")
                        .font(.system(size: 14))
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(width: 320)
    }
}

private struct ChatComposer: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var inputText: String
    var chatId: String? = nil
    var expanded = false
    
    @State private var showApprovalPopover = false
    @State private var showContextPopover = false
    @State private var showAttachmentPopover = false
    @State private var showProjectPicker = false
    @State private var isProjectButtonHovered = false

    private let composerFontSize: CGFloat = 16
    private let composerControlGray = Color.secondary.opacity(0.78)
    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var usage: TokenUsage { store.tokenUsage(for: chatId, draft: inputText) }
    private var voiceIsActive: Bool { store.voiceState == .listening || store.voiceState == .speaking }

    var body: some View {
        VStack(spacing: 6) {
            ZStack(alignment: .topLeading) {
                if voiceIsActive {
                    VoiceWaveform(
                        level: store.speechService.audioLevel,
                        isActive: true,
                        color: store.voiceState == .listening ? .accentColor : Color(red: 0.22, green: 0.48, blue: 0.98)
                    )
                    .padding(.horizontal, 8)
                    .padding(.top, 5)
                    .opacity(inputText.isEmpty ? 0.9 : 0.28)
                    .allowsHitTesting(false)
                }

                ComposerTextView(text: $inputText, fontSize: composerFontSize, onCommit: send)
                    .frame(minHeight: expanded ? 42 : 34, maxHeight: expanded ? 62 : 48)
                    .padding(.top, 4)

                if inputText.isEmpty {
                    Text(voiceIsActive ? "Ouvindo…" : "Ask anything")
                        .font(.system(size: composerFontSize))
                        .foregroundStyle(voiceIsActive ? Color.accentColor : composerControlGray)
                        .padding(.top, 13)
                        .padding(.leading, 4)
                        .allowsHitTesting(false)
                }
            }

            HStack(alignment: .center, spacing: 12) {
                Button {
                    showAttachmentPopover.toggle()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(composerControlGray)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .help("Adicionar anexo")
                .popover(isPresented: $showAttachmentPopover, arrowEdge: .top) {
                    AttachmentPopoverContent(isPresented: $showAttachmentPopover)
                        .environmentObject(store)
                }

                ZStack(alignment: .topTrailing) {
                    Button {
                        showProjectPicker.toggle()
                    } label: {
                        projectButtonLabel
                    }
                    .buttonStyle(.plain)

                    if isProjectButtonHovered, store.contextProject != nil {
                        Button {
                            store.clearContextProject()
                            showProjectPicker = false
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                                .background(Circle().fill(Color(nsColor: .windowBackgroundColor)))
                        }
                        .buttonStyle(.plain)
                        .offset(x: 6, y: -7)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                        .help("Remover projeto do contexto")
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .onHover { isProjectButtonHovered = $0 }
                .popover(isPresented: $showProjectPicker, arrowEdge: .top) {
                    ProjectPickerPopover(isPresented: $showProjectPicker)
                        .environmentObject(store)
                }
                .help("Escolher projeto de contexto")

                Button {
                    showApprovalPopover.toggle()
                } label: {
                    // Com pouco espaço, o texto some e fica só ícone + chevron;
                    // nunca quebra na vertical.
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 6) {
                            Image(systemName: store.approvalMode.icon)
                                .font(.system(size: 13))
                            Text(store.approvalMode.rawValue)
                                .font(.system(size: 13, weight: .regular))
                                .lineLimit(1)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                        }
                        .fixedSize()

                        HStack(spacing: 6) {
                            Image(systemName: store.approvalMode.icon)
                                .font(.system(size: 13))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                        }
                        .fixedSize()
                    }
                    .foregroundStyle(.orange)
                    .frame(height: 28, alignment: .center)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showApprovalPopover, arrowEdge: .top) {
                    ApprovalModePopoverContent(isPresented: $showApprovalPopover)
                        .environmentObject(store)
                }
                .help("Modo de aprovação")

                Spacer()

                Button {
                    showContextPopover.toggle()
                } label: {
                    TokenUsageIndicator(usage: usage)
                }
                .buttonStyle(.plain)
                .help("Ver limites de uso do contexto")
                .popover(isPresented: $showContextPopover, arrowEdge: .top) {
                    ContextWindowPopoverContent(usage: usage)
                }

                Button {
                    activateVoiceMode(autoSend: false)
                } label: {
                    Image(systemName: voiceMicrophoneSymbol)
                        .font(.system(size: 14))
                        .foregroundStyle(voiceMicrophoneColor)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .help(voiceMicrophoneHelp)

                sendOrVoiceButton
            }
            .frame(height: 32, alignment: .center)
        }
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .liquidGlass(cornerRadius: 14)
        .padding(.horizontal, expanded ? 0 : 12)
        .padding(.vertical, expanded ? 0 : 6)
        .onReceive(store.speechService.$transcript.removeDuplicates()) { transcript in
            guard store.speechService.isListening, !transcript.isEmpty else { return }
            inputText = transcript
        }
    }

    @ViewBuilder
    private var projectButtonLabel: some View {
        if let project = store.contextProject {
            HStack(spacing: 6) {
                Image(systemName: project.symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(project.iconColor.color)
                Text(project.name)
                    .font(.system(size: 13, weight: .regular))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(composerControlGray)
            }
            .foregroundStyle(composerControlGray)
            .padding(.horizontal, 9)
            .frame(height: 28)
            .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            Image(systemName: "folder")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(composerControlGray)
                .frame(width: 28, height: 28)
                .background(Color.primary.opacity(0.035), in: Circle())
        }
    }

    @ViewBuilder private var sendOrVoiceButton: some View {
        if canSend {
            Button {
                send()
            } label: {
                SendArrowIcon(color: .white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.accentColor))
            }
            .buttonStyle(.plain)
            .help("Enviar")
        } else {
            Button {
                activateVoiceMode(autoSend: true)
            } label: {
                Image(systemName: "waveform")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.accentColor))
            }
            .buttonStyle(.plain)
            .help("Ativar modo voz")
        }
    }

    private func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        store.sendMessage(text, chatId: chatId)
    }

    private func activateVoiceMode(autoSend: Bool) {
        if store.voiceState == .speaking {
            store.speechService.stopSpeaking()
            return
        }
        guard store.prepareVoiceActivation() else { return }
        store.toggleSpeechInput { transcript in
            inputText = transcript
        } onFinal: { transcript in
            inputText = transcript
            guard autoSend else { return }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(280))
                guard inputText == transcript else { return }
                inputText = ""
                store.sendMessage(transcript, chatId: chatId)
            }
        }
    }

    private var voiceMicrophoneSymbol: String {
        if store.voicePermissionIssue != nil { return "mic.slash" }
        return voiceIsActive ? "stop.fill" : "mic"
    }

    private var voiceMicrophoneColor: Color {
        if store.voicePermissionIssue != nil { return .yellow }
        return voiceIsActive ? Color.accentColor : composerControlGray
    }

    private var voiceMicrophoneHelp: String {
        guard let issue = store.voicePermissionIssue else { return "Comando de voz" }
        return "Autorize \(issue.rawValue) nos Ajustes do Sistema. Clique para abrir a tela de permissão."
    }
}

private struct SendArrowIcon: View {
    var color: Color

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height

            Path { path in
                path.move(to: CGPoint(x: width * 0.5, y: height * 0.82))
                path.addLine(to: CGPoint(x: width * 0.5, y: height * 0.18))
                path.move(to: CGPoint(x: width * 0.2, y: height * 0.46))
                path.addLine(to: CGPoint(x: width * 0.5, y: height * 0.16))
                path.addLine(to: CGPoint(x: width * 0.8, y: height * 0.46))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
        }
        .frame(width: 14, height: 14)
    }
}

private struct SuggestionButton: View {
    var symbol: String
    var text: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundStyle(.green)
                    .frame(width: 20)
                Text(text)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct PendingChangesBar: View {
    @EnvironmentObject private var store: AssistantStore

    var body: some View {
        if store.pendingChanges.isEmpty {
            EmptyView()
        } else {
            VStack(spacing: 8) {
                ForEach(store.pendingChanges) { change in
                    HStack(spacing: 12) {
                        Image(systemName: "doc.text")
                            .foregroundStyle(.orange)
                        
                        HStack(spacing: 4) {
                            Text("+\(change.addedCount)")
                                .foregroundStyle(.green)
                            Text("-\(change.removedCount)")
                                .foregroundStyle(.red)
                        }
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        
                        Text(change.fileName)
                            .font(.system(size: 13, weight: .semibold))
                        
                        Text(change.filePath)
                            .font(.system(size: 16))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 6)
                }

                HStack(spacing: 16) {
                    Button {
                        store.pendingChanges.removeAll()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .help("Voltar")

                    Image(systemName: "doc.on.doc")
                        .foregroundStyle(.secondary)

                    Text("\(store.pendingChanges.count) \(store.pendingChanges.count == 1 ? "file" : "files") changed")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button {
                        store.rejectAllPendingChanges()
                    } label: {
                        Text("Reject all")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)

                    Button {
                        store.acceptAllPendingChanges()
                    } label: {
                        Text("Accept all")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
            }
            .padding(.vertical, 4)
        }
    }
}

struct ProgressStepsView: View {
    var steps: [ProgressStep]
    var activeIndex: Int? = nil
    var isActive = false
    @State private var expandedThoughts: Set<UUID> = []
    @State private var headerExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if steps.isEmpty, isActive {
                TaskLoadingText(text: "Thinking", isActive: true)
                    .font(.system(size: 16, weight: .regular))
                    .accessibilityLabel("Thinking")
                    .padding(.leading, 12)
                    .padding(.vertical, 4)
            }

            if let header = steps.first(where: { $0.type == .header }) {
                Button {
                    withAnimation(.snappy) {
                        headerExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(header.title)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.primary)
                        Image(systemName: headerExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
                .padding(.vertical, 4)
            }

            if headerExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    let visibleSteps = steps.filter { $0.type != .header }
                    ForEach(Array(visibleSteps.enumerated()), id: \.element.id) { index, step in
                        switch step.type {
                        case .fileAnalysis:
                            HStack(spacing: 8) {
                                Image(systemName: "swift")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.orange)
                                
                                Text("Analyzed")
                                    .foregroundStyle(.secondary)
                                TaskLoadingText(text: step.title, isActive: isActive && activeIndex == index)
                                    .fontWeight(.medium)
                                if let sub = step.subtitle {
                                    Text(sub)
                                        .font(.system(size: 13, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .font(.system(size: 16))
                            .padding(.leading, 12)

                        case .fileEdit:
                            HStack(spacing: 8) {
                                Image(systemName: "swift")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.orange)
                                
                                Text("Edited")
                                    .foregroundStyle(.secondary)
                                TaskLoadingText(text: step.title, isActive: isActive && activeIndex == index)
                                    .fontWeight(.medium)
                                if let sub = step.subtitle {
                                    Text(sub)
                                        .font(.system(size: 13, design: .monospaced))
                                        .foregroundStyle(.green)
                                }
                            }
                            .font(.system(size: 16))
                            .padding(.leading, 12)

                        case .thought:
                            let isExpanded = expandedThoughts.contains(step.id)
                            VStack(alignment: .leading, spacing: 6) {
                                Button {
                                    withAnimation(.snappy) {
                                        if isExpanded {
                                            expandedThoughts.remove(step.id)
                                        } else {
                                            expandedThoughts.insert(step.id)
                                        }
                                    }
                                } label: {
                                    HStack(spacing: 6) {
                                        TaskLoadingText(
                                            text: isExpanded ? "Thinking for 1s" : step.title,
                                            isActive: isActive && activeIndex == index
                                        )
                                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                            .font(.system(size: 9, weight: .bold))
                                            .foregroundStyle(.secondary)
                                    }
                                    .font(.system(size: 16))
                                }
                                .buttonStyle(.plain)

                                if isExpanded, let value = step.value {
                                    Text(value)
                                        .font(.system(size: 16))
                                        .foregroundStyle(.secondary)
                                        .padding(.leading, 12)
                                        .padding(.vertical, 4)
                                        .transition(.opacity)
                                }
                            }
                            .padding(.leading, 12)

                        case .textInfo:
                            HStack(spacing: 6) {
                                TaskLoadingText(text: step.title, isActive: isActive && activeIndex == index)
                                if let value = step.value {
                                    Text(value)
                                        .font(.system(size: 12, weight: .semibold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                                }
                            }
                            .font(.system(size: 16))
                            .padding(.leading, 12)

                        default:
                            EmptyView()
                        }
                    }
                    
                }
            }
        }
        .padding(.vertical, 8)
    }
}

private struct TaskLoadingText: View {
    var text: String
    var isActive: Bool

    var body: some View {
        if isActive {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                let duration = 1.45
                let phase = timeline.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: duration) / duration
                Text(text)
                    .foregroundStyle(Color.secondary)
                    .overlay {
                        GeometryReader { proxy in
                            let glowWidth = max(proxy.size.width * 0.42, 42)
                            LinearGradient(
                                colors: [.clear, Color.white.opacity(0.25), .white, Color.white.opacity(0.25), .clear],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: glowWidth)
                            .offset(x: -glowWidth + (proxy.size.width + glowWidth) * phase)
                        }
                        .mask(Text(text))
                    }
            }
        } else {
            Text(text).foregroundStyle(.secondary)
        }
    }
}

struct WorkingAnimationView: View {
    @State private var dotCount = 0
    let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 0) {
            Text("Working")
            Text(dotsString)
                .frame(width: 20, alignment: .leading)
        }
        .font(.system(size: 16))
        .foregroundStyle(.secondary)
        .padding(.leading, 12)
        .onReceive(timer) { _ in
            dotCount = (dotCount + 1) % 4
        }
    }

    private var dotsString: String {
        switch dotCount {
        case 1: return "."
        case 2: return ".."
        case 3: return "..."
        default: return ""
        }
    }
}

struct FinalChangesSummaryView: View {
    var summary: ChangesSummary

    var body: some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: "doc.on.doc")
                    .foregroundStyle(.secondary)
                
                Text("\(summary.fileCount) \(summary.fileCount == 1 ? "file" : "files") changed")
                    .font(.system(size: 14, weight: .medium))
                
                HStack(spacing: 4) {
                    Text("+\(summary.addedCount)")
                        .foregroundStyle(.green)
                    Text("-\(summary.removedCount)")
                        .foregroundStyle(.red)
                }
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Button {
                // Review
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text.magnifyingglass")
                    Text("Review")
                }
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8)
        }
        .padding(.top, 4)
    }
}

private struct VisitedSitesOverlay: View {
    var sites: [String]
    
    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: -6) {
                ForEach(sites, id: \.self) { site in
                    siteCircle(for: site)
                }
            }
            
            Text("Sources")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
        }
    }
    
    private func siteCircle(for site: String) -> some View {
        let iconColor = iconColor(for: site)
        let iconName = iconName(for: site)
        
        return ZStack {
            Circle()
                .fill(Color.primary.opacity(0.04))
            Circle()
                .stroke(Color(nsColor: .windowBackgroundColor), lineWidth: 1.5)
            Image(systemName: iconName)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(iconColor)
        }
        .frame(width: 18, height: 18)
    }
    
    private func iconColor(for site: String) -> Color {
        if site.contains("youtube") || site.contains("play") { return .red }
        if site.contains("google") || site.contains("g.circle") { return .blue }
        if site.contains("wikipedia") || site.contains("w.circle") { return .secondary }
        if site.contains("amazon") || site.contains("a.circle") { return .orange }
        if site.contains("github") || site.contains("terminal") { return .black }
        return .accentColor
    }
    
    private func iconName(for site: String) -> String {
        if site.contains("play") { return "play.fill" }
        if site.contains("google") || site.contains("g.circle") { return "g.circle.fill" }
        if site.contains("wikipedia") || site.contains("w.circle") { return "w.circle.fill" }
        if site.contains("amazon") || site.contains("a.circle") { return "a.circle.fill" }
        if site.contains("github") || site.contains("terminal") { return "terminal.fill" }
        return "link"
    }
}
struct MessageOptionsPopoverContent: View {
    var message: ChatMessage
    @Binding var isPresented: Bool
    @EnvironmentObject var store: AssistantStore

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Hoje, \(message.timestamp)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            Button {
                isPresented = false
                store.showNotice("Branching in new chat...")
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.branch")
                        .frame(width: 16)
                    Text("Branch in new chat")
                }
                .font(.system(size: 13))
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Divider()
                .padding(.vertical, 2)

            Text("Used \(message.modelUsed?.contains("3.7") == true ? "3.7" : "5.5") Thinking")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            Button {
                isPresented = false
                store.showNotice("Retrying message generation...")
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 16)
                    Text("Retry")
                }
                .font(.system(size: 13))
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            Button {
                isPresented = false
                store.showNotice("Searching the web...")
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "globe")
                        .frame(width: 16)
                    Text("Search the web")
                }
                .font(.system(size: 13))
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(width: 210)
    }
}

private struct CodeReferenceTextView: View {
    @EnvironmentObject private var store: AssistantStore
    var text: String
    var fontSize: CGFloat
    var alignment: Alignment
    var expands = true

    var body: some View {
        Text(attributedText)
            .textSelection(.enabled)
            .font(.system(size: fontSize))
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: expands ? .infinity : nil, alignment: alignment)
            .environment(\.openURL, OpenURLAction { url in
                store.handleCodeReferenceURL(url) ? .handled : .systemAction
            })
    }

    private var attributedText: AttributedString {
        let fullRange = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = Self.referenceRegex.matches(in: text, options: [], range: fullRange)
        guard !matches.isEmpty else { return AttributedString(text) }

        var result = AttributedString()
        var cursor = text.startIndex

        for match in matches {
            guard let matchRange = Range(match.range(at: 0), in: text),
                  let fileRange = Range(match.range(at: 1), in: text) else { continue }

            if cursor < matchRange.lowerBound {
                result.append(AttributedString(String(text[cursor..<matchRange.lowerBound])))
            }

            let filePath = String(text[fileRange])
            let line = Range(match.range(at: 2), in: text).flatMap { Int(text[$0]) }
            var display = "</> \(URL(fileURLWithPath: filePath).lastPathComponent)"
            if let line {
                display += " (line\(line))"
            }

            var linked = AttributedString(display)
            linked.foregroundColor = .accentColor
            linked.link = Self.url(for: filePath, line: line)
            result.append(linked)
            cursor = matchRange.upperBound
        }

        if cursor < text.endIndex {
            result.append(AttributedString(String(text[cursor..<text.endIndex])))
        }

        return result
    }

    private static let referenceRegex = try! NSRegularExpression(
        pattern: #"((?:[A-Za-z0-9_+.-]+/)*[A-Za-z0-9_+.-]+\.(?:swift|js|jsx|ts|tsx|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|m|mm|cs|html|css|scss|json|yaml|yml|md|sh|zsh|toml|xml))(?:\s*\((?:line|linha)\s*#?\s*(\d+)\))?"#,
        options: [.caseInsensitive]
    )

    private static func url(for filePath: String, line: Int?) -> URL? {
        var components = URLComponents()
        components.scheme = "openassistant-code"
        components.host = "open"
        components.queryItems = [
            URLQueryItem(name: "file", value: filePath),
            URLQueryItem(name: "line", value: line.map(String.init))
        ].compactMap { $0.value == nil ? nil : $0 }
        return components.url
    }
}

private struct MessageRow: View {
    @EnvironmentObject private var store: AssistantStore
    var message: ChatMessage
    var chatId: String
    @State private var showOptionsPopover = false

    var body: some View {
        if message.isModelChange {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(Color.primary.opacity(0.1))
                    .frame(height: 0.8)
                
                HStack(spacing: 6) {
                    Image(systemName: "cpu")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    
                    Text(message.modelChangeText ?? "")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                    
                    Image(systemName: "info.circle")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                
                Rectangle()
                    .fill(Color.primary.opacity(0.1))
                    .frame(height: 0.8)
            }
            .padding(.vertical, 8)
        } else {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: message.sender == .user ? .trailing : .leading, spacing: 9) {
                    if message.sender != .user {
                        HStack(spacing: 6) {
                            Text(message.modelUsed ?? "Open Assistant Core")
                                .font(.system(size: 14, weight: .semibold))
                            Text("•")
                                .font(.system(size: 12.5))
                            Text(message.timestamp)
                                .font(.system(size: 12.5))
                            Text("•")
                                .font(.system(size: 12.5))
                            Rectangle()
                                .fill(Color.primary.opacity(0.12))
                                .frame(height: 0.8)
                        }
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if message.isProgressMessage {
                        ProgressStepsView(
                            steps: message.progressSteps,
                            activeIndex: message.activeProgressStepIndex,
                            isActive: message.isProgressActive
                        )
                    } else {
                        CodeReferenceTextView(
                            text: message.text,
                            fontSize: store.settings.fontSize.chat,
                            alignment: message.sender == .user ? .trailing : .leading,
                            expands: message.sender != .user
                        )
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(message.sender == .user ? Color.gray.opacity(0.15) : Color.clear, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                            .overlay {
                                if message.sender == .user {
                                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                                        .strokeBorder(Color.gray.opacity(0.25), lineWidth: 0.8)
                                }
                            }
                            .frame(maxWidth: message.sender == .user ? 620 : .infinity, alignment: message.sender == .user ? .trailing : .leading)
                    }

                    if let summary = message.finalChangesSummary {
                        FinalChangesSummaryView(summary: summary)
                    }

                    if let path = message.generatedImagePath,
                       let image = NSImage(contentsOfFile: path) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 620, maxHeight: 620)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.8)
                            }
                            .contextMenu {
                                Button("Abrir imagem") {
                                    NSWorkspace.shared.open(URL(fileURLWithPath: path))
                                }
                                Button("Mostrar no Finder") {
                                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
                                }
                            }
                    }

                    ForEach(message.blocks) { block in
                        MessageBlockView(block: block)
                    }

                    if message.sender != .user && !message.isProgressMessage {
                        HStack(spacing: 16) {
                            HStack(spacing: 12) {
                                Button {
                                    store.copyToClipboard(message.text)
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                        .font(.system(size: 13))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(.secondary)
                                .help("Copiar resposta")
                                
                                Button {
                                    store.speak(message.text)
                                } label: {
                                    Image(systemName: "speaker.wave.2")
                                        .font(.system(size: 13))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(.secondary)
                                .help("Falar resposta")
                                
                                Button {
                                    store.showNotice("Feedback positivo registrado.")
                                } label: {
                                    Image(systemName: "hand.thumbsup")
                                        .font(.system(size: 13))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(.secondary)
                                .help("Gostei da resposta")
                                
                                Button {
                                    store.showNotice("Feedback negativo registrado.")
                                } label: {
                                    Image(systemName: "hand.thumbsdown")
                                        .font(.system(size: 13))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(.secondary)
                                .help("Não gostei da resposta")
                                
                                Button {
                                    showOptionsPopover.toggle()
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .font(.system(size: 13))
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(.secondary)
                                .popover(isPresented: $showOptionsPopover, arrowEdge: .top) {
                                    MessageOptionsPopoverContent(message: message, isPresented: $showOptionsPopover)
                                        .environmentObject(store)
                                }
                                .help("Mais opções")

                                if let sites = message.visitedSites, !sites.isEmpty {
                                    VisitedSitesOverlay(sites: sites)
                                }

                                HStack(spacing: 4) {
                                    Image(systemName: "timer")
                                        .font(.system(size: 10))
                                    Text(message.responseTime ?? "1.2s")
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.top, 4)
                    }

                    if message.sender == .user {
                        HStack(spacing: 12) {
                            Button {
                                store.copyToClipboard(message.text)
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.secondary)
                            .help("Copiar mensagem")

                            Button {
                                store.speak(message.text)
                            } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.secondary)
                            .help("Ler mensagem em voz alta")

                            Button {
                                store.resendMessage(message, chatId: chatId)
                            } label: {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.secondary)
                            .help("Reenviar prompt")
                        }
                        .padding(.top, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: message.sender == .user ? .trailing : .leading)
            }
            .frame(maxWidth: .infinity, alignment: message.sender == .user ? .trailing : .leading)
        }
    }

    private func avatar(symbol: String?, text: String?, tint: Color, modelUsed: String? = nil) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(tint.opacity(0.13))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(tint.opacity(0.24), lineWidth: 0.8)
                }
            
            if let text {
                Text(text)
                    .font(.caption.weight(.bold))
            } else if let model = modelUsed {
                if model.contains("Claude") || model.contains("Anthropic") {
                    AnthropicLogo()
                } else if model.contains("GPT") || model.contains("OpenAI") {
                    OpenAILogo()
                } else {
                    Image(systemName: "sparkles")
                        .foregroundStyle(tint)
                }
            } else if let symbol {
                Image(systemName: symbol)
                    .foregroundStyle(tint)
            }
        }
        .frame(width: 34, height: 34)
    }
}

private struct MessageBlockView: View {
    @EnvironmentObject private var store: AssistantStore
    var block: InteractiveBlock
    @State private var isHovered = false
    @State private var codeExpanded = false

    var body: some View {
        blockContent
        .animation(.snappy(duration: 0.16), value: isHovered)
    }

    @ViewBuilder
    private var blockContent: some View {
        switch block.type {
        case .actionPlan: actionPlan
        case .commandRun: commandRun
        case .fileDiff: fileDiff
        case .code: codeBlock
        case .error: errorBlock
        case .confirmation: confirmationBlock
        case .dashboard: dashboardBlock
        }
    }

    private var copyText: String {
        switch block.type {
        case .actionPlan:
            return (block.steps ?? [])
                .map(\.description)
                .joined(separator: "\n")
        case .commandRun:
            return block.command ?? ""
        case .fileDiff:
            let header = block.diffInfo?.filePath ?? block.title
            let lines = block.diffInfo?.lines.map(\.text).joined(separator: "\n") ?? ""
            return [header, lines].filter { !$0.isEmpty }.joined(separator: "\n")
        case .code:
            return block.code ?? ""
        case .error:
            return [block.title, block.errorDetails ?? ""].filter { !$0.isEmpty }.joined(separator: "\n")
        case .confirmation:
            return [block.title, block.successDetails ?? ""].filter { !$0.isEmpty }.joined(separator: "\n")
        case .dashboard:
            return block.title
        }
    }

    private var dashboardBlock: some View {
        Button {
            if let id = block.successDetails { store.openDashboard(id: id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "chart.xyaxis.line")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 3) {
                    Text(block.title).font(.headline)
                    Text("Abrir relatório visual").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .background(Color.primary.opacity(isHovered ? 0.08 : 0.045), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .accessibilityLabel("Abrir dashboard \(block.title)")
    }

    private var actionPlan: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(block.steps ?? []) { step in
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: step.done ? "checkmark.square.fill" : "square")
                        .foregroundStyle(step.done ? .green : .secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.description)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(step.done ? .secondary : .primary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .subtlePanel(cornerRadius: 14)
    }

    private var commandRun: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label(block.title, systemImage: "terminal")
                    .font(.caption.weight(.semibold))
                Spacer()
                Button {
                    store.openTerminalReview()
                } label: {
                    Label("Review", systemImage: "cursorarrow.click")
                }
                .controlSize(.small)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Color.primary.opacity(0.045))

            HStack(spacing: 8) {
                Text("$")
                    .foregroundStyle(.secondary)
                Text(block.command ?? "")
                    .textSelection(.enabled)
            }
            .font(.caption.monospaced())
            .foregroundStyle(.green)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.76))
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8)
        }
    }

    private var fileDiff: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label(block.title, systemImage: "doc.text")
                    .font(.caption.weight(.semibold))
                Spacer()
                Button {
                    store.openDiffView(filePath: block.diffInfo?.filePath ?? "")
                } label: {
                    Label("Review", systemImage: "cursorarrow.click")
                }
                .controlSize(.small)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Color.primary.opacity(0.045))

            VStack(alignment: .leading, spacing: 4) {
                ForEach(block.diffInfo?.lines ?? []) { line in
                    Text(line.text)
                        .font(.caption.monospaced())
                        .foregroundStyle(color(for: line.type))
                        .strikethrough(line.type == .remove)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 1)
                        .background(color(for: line.type).opacity(line.type == .neutral ? 0 : 0.08))
                }
            }
            .padding(12)
            .background(Color.black.opacity(0.72))
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8)
        }
    }

    private var codeBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(block.language ?? "code")
                        .font(.caption.monospaced().weight(.semibold))
                    if block.title != "Código" { Text(block.title).font(.caption2).foregroundStyle(.secondary) }
                }
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    store.openCodeSnippetReview(
                        language: block.language,
                        code: block.code ?? "",
                        previousCode: block.previousCode,
                        filePath: block.filePath
                    )
                } label: {
                    Label("Review", systemImage: "cursorarrow.click")
                }
                .controlSize(.small)

                Button {
                    store.copyToClipboard(block.code ?? "")
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .controlSize(.small)
                .help("Copiar código")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Color.primary.opacity(0.045))

            ScrollView([.horizontal, .vertical]) {
                HighlightedCodeText(code: block.code ?? "", fontSize: store.settings.fontSize.code)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: codeExpanded ? .infinity : 420)
            .background(Color.black.opacity(0.72))

            if (block.code ?? "").split(separator: "\n").count > 18 {
                Button(codeExpanded ? "Recolher" : "Expandir código") { codeExpanded.toggle() }
                    .buttonStyle(.plain).font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity).padding(.vertical, 7)
                    .background(Color.primary.opacity(0.04))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8)
        }
    }

    private var errorBlock: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 4) {
                Text(block.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.red)
                Text(block.errorDetails ?? "")
                    .font(.caption.monospaced())
                    .foregroundStyle(.red.opacity(0.82))
            }
            Spacer()
        }
        .padding(14)
        .background(.red.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.red.opacity(0.25), lineWidth: 0.8))
    }

    private var confirmationBlock: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 4) {
                Text(block.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
                Text(block.successDetails ?? "")
                    .font(.caption)
                    .foregroundStyle(.green.opacity(0.84))
            }
            Spacer()
        }
        .padding(14)
        .background(.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.green.opacity(0.22), lineWidth: 0.8))
    }

    private func color(for type: DiffLine.LineType) -> Color {
        switch type {
        case .add: .green
        case .remove: .red
        case .neutral: .secondary
        }
    }
}


struct CollapsibleBottomTerminal: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var isPresented: Bool

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            // Terminal Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "terminal")
                        .font(.system(size: 11))
                        .foregroundStyle(.green)
                    Text("Assistente pessoal")
                        .font(.system(size: 11, weight: .bold).monospaced())
                        .textCase(.uppercase)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))

                Spacer()

                Button {
                    withAnimation(.snappy) {
                        isPresented = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Fechar")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.primary.opacity(0.03))

            // Terminal Body — real zsh session shared across sections
            ShellTerminalPane(shell: store.bottomShell)
                .frame(height: 200)
        }
    }
}

struct FloatingOutputsAndSourcesPanel: View {
    @Binding var content: RightSidebarContent

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text("Outputs & Sources")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)

                Spacer()

                Button {
                    withAnimation(.snappy) {
                        content = .none
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Fechar")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            OutputsAndSourcesContent()
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.8)
        }
        .shadow(color: Color.black.opacity(0.18), radius: 18, x: 0, y: 12)
    }
}

private struct CodeFileSidePanel: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var content: RightSidebarContent
    @State private var wordWrap = true
    @State private var showProjectTree = false

    private var file: CodeFileReference? {
        store.selectedCodeFile
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            fileToolbar
            Divider()
            codeWorkspace
        }
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.92))
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            // Sandbox files como abas de navegador na parte superior do painel.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(store.files) { sandboxFile in
                        sandboxTab(for: sandboxFile)
                    }
                }
            }

            Spacer(minLength: 0)

            Button {
                store.codeEditorExpanded = true
            } label: {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Expandir")

            Button {
                showProjectTree = false
            } label: {
                Image(systemName: "minus.rectangle")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Ocultar árvore")

            Button {
                withAnimation(.snappy) {
                    content = .none
                }
            } label: {
                Image(systemName: "sidebar.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 34, height: 34)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .help("Fechar painel")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func sandboxTab(for sandboxFile: FileArtifact) -> some View {
        let isActive = file?.path == sandboxFile.path
        return Button {
            store.openSandboxFile(sandboxFile)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isActive ? Color.primary : Color.secondary)
                Text(sandboxFile.name)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(isActive ? Color.primary : Color.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                isActive ? Color.primary.opacity(0.13) : Color.primary.opacity(0.045),
                in: UnevenRoundedRectangle(
                    topLeadingRadius: 9,
                    bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0,
                    topTrailingRadius: 9,
                    style: .continuous
                )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(sandboxFile.path)
    }

    private var fileToolbar: some View {
        HStack(spacing: 10) {
            Text(URL(fileURLWithPath: file?.projectRootPath ?? "").lastPathComponent)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.tertiary)

            Text(file?.name ?? "Arquivo")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer()

            Menu {
                Button {
                    store.copyToClipboard(file?.path ?? "")
                } label: {
                    Label("Copy path", systemImage: "doc.on.doc")
                }

                Button {
                    store.copyToClipboard(file?.content ?? "")
                } label: {
                    Label("Copy file contents", systemImage: "doc.on.doc")
                }

                Button {
                    wordWrap.toggle()
                } label: {
                    Label(wordWrap ? "Disable word wrap" : "Enable word wrap", systemImage: "return")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 34, height: 34)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .help("Mais opções")

            Menu {
                Button {
                    openInApp(bundleIdentifier: "com.microsoft.VSCode", fallbackNames: ["Visual Studio Code"])
                } label: {
                    Label("VS Code", systemImage: "shippingbox")
                }

                Button {
                    openInApp(bundleIdentifier: "com.todesktop.230313mzl4w4u92", fallbackNames: ["Cursor"])
                } label: {
                    Label("Cursor", systemImage: "cube.box")
                }

                Button {
                    openDefault()
                } label: {
                    Label("Default app", systemImage: "folder.badge.gearshape")
                }

                Button {
                    openInTerminal()
                } label: {
                    Label("Terminal", systemImage: "terminal")
                }

                Button {
                    openInApp(bundleIdentifier: "com.apple.dt.Xcode", fallbackNames: ["Xcode"])
                } label: {
                    Label("Xcode", systemImage: "hammer.fill")
                }

                Button {
                    openInApp(bundleIdentifier: "com.jetbrains.pycharm", fallbackNames: ["PyCharm"])
                } label: {
                    Label("PyCharm", systemImage: "pc")
                }

                Divider()

                Button {
                    revealInFinder()
                } label: {
                    Label("Open in folder", systemImage: "folder")
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "terminal")
                    Text("Open")
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(height: 34)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.8)
                }
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .help("Abrir arquivo")

            Button {
                withAnimation(.snappy) {
                    showProjectTree.toggle()
                }
            } label: {
                Image(systemName: "folder")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(showProjectTree ? Color.white : Color.secondary)
                    .frame(width: 34, height: 34)
                    .background(showProjectTree ? Color.accentColor : Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .help("Mostrar pasta do projeto")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var codeWorkspace: some View {
        GeometryReader { geometry in
            ZStack(alignment: .trailing) {
                if let file {
                    if let previousContent = file.previousContent, previousContent != file.content {
                        SideBySideCodeReview(file: file, previousContent: previousContent, wordWrap: wordWrap)
                    } else {
                        CodeLineViewer(file: file, wordWrap: wordWrap)
                    }
                } else {
                    ContentUnavailableView("Nenhum arquivo selecionado", systemImage: "doc.text.magnifyingglass")
                }

                if showProjectTree {
                    ProjectFolderDrawer(
                        rootURL: store.projectRootURL,
                        selectedPath: file?.path
                    )
                    .frame(width: min(max(geometry.size.width * 0.46, 300), 390))
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                    .shadow(color: .black.opacity(0.22), radius: 16, x: -8, y: 0)
                }
            }
        }
    }

    private func fileURL() -> URL? {
        guard let file else { return nil }
        return URL(fileURLWithPath: file.path)
    }

    private func openDefault() {
        guard let url = fileURL() else { return }
        NSWorkspace.shared.open(url)
    }

    private func revealInFinder() {
        guard let url = fileURL() else { return }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    private func openInTerminal() {
        guard let url = fileURL(),
              let terminalURL = appURL(bundleIdentifier: "com.apple.Terminal", fallbackNames: ["Terminal"], utility: true)
        else { return }
        NSWorkspace.shared.open([url.deletingLastPathComponent()], withApplicationAt: terminalURL, configuration: NSWorkspace.OpenConfiguration())
    }

    private func openInApp(bundleIdentifier: String, fallbackNames: [String]) {
        guard let url = fileURL() else { return }
        guard let applicationURL = appURL(bundleIdentifier: bundleIdentifier, fallbackNames: fallbackNames) else {
            openDefault()
            return
        }
        NSWorkspace.shared.open([url], withApplicationAt: applicationURL, configuration: NSWorkspace.OpenConfiguration())
    }

    private func appURL(bundleIdentifier: String, fallbackNames: [String], utility: Bool = false) -> URL? {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleIdentifier) {
            return url
        }

        let basePaths = utility
            ? ["/System/Applications/Utilities", "/Applications/Utilities", "/Applications"]
            : ["/Applications", "/System/Applications", NSHomeDirectory() + "/Applications"]

        for base in basePaths {
            for name in fallbackNames {
                let url = URL(fileURLWithPath: base).appendingPathComponent("\(name).app")
                if FileManager.default.fileExists(atPath: url.path) {
                    return url
                }
            }
        }
        return nil
    }
}

private struct SideBySideCodeReview: View {
    var file: CodeFileReference
    var previousContent: String
    var wordWrap: Bool

    private var rows: [SideBySideDiffRow] {
        SideBySideDiffRow.make(old: previousContent, new: file.content)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                reviewHeader("Código original", symbol: "clock.arrow.circlepath", tint: .red)
                Divider()
                reviewHeader("Alterado pela IA", symbol: "sparkles", tint: .green)
            }
            .frame(height: 38)
            .background(Color.primary.opacity(0.055))

            ScrollView(wordWrap ? .vertical : [.vertical, .horizontal]) {
                LazyVStack(spacing: 0) {
                    ForEach(rows) { row in
                        HStack(alignment: .top, spacing: 0) {
                            reviewLine(number: row.oldNumber, text: row.oldText, changed: row.oldChanged, tint: .red)
                            Divider()
                            reviewLine(number: row.newNumber, text: row.newText, changed: row.newChanged, tint: .green)
                        }
                    }
                }
                .frame(minWidth: wordWrap ? nil : 760, maxWidth: wordWrap ? .infinity : nil, alignment: .leading)
            }
            .background(Color.black.opacity(0.82))
        }
        .accessibilityLabel("Review lado a lado de \(file.name)")
    }

    private func reviewHeader(_ title: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: 7) {
            Image(systemName: symbol).foregroundStyle(tint)
            Text(title).font(.system(size: 12, weight: .semibold))
            Spacer()
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
    }

    private func reviewLine(number: Int?, text: String?, changed: Bool, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Text(number.map(String.init) ?? "")
                .font(.system(size: 11.5, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.42))
                .frame(width: 44, alignment: .trailing)
                .padding(.trailing, 10)

            Text(HighlightedCodeText.attributed(text ?? " "))
                .font(.system(size: 12.5, design: .monospaced))
                .textSelection(.enabled)
                .fixedSize(horizontal: !wordWrap, vertical: true)
                .frame(maxWidth: wordWrap ? .infinity : nil, alignment: .leading)
        }
        .padding(.vertical, 2.5)
        .padding(.trailing, 12)
        .frame(maxWidth: .infinity, minHeight: 22, alignment: .topLeading)
        .background(changed ? tint.opacity(0.17) : Color.clear)
    }
}

private struct SideBySideDiffRow: Identifiable {
    var id: Int
    var oldNumber: Int?
    var oldText: String?
    var newNumber: Int?
    var newText: String?
    var oldChanged: Bool
    var newChanged: Bool

    static func make(old: String, new: String) -> [SideBySideDiffRow] {
        let oldLines = old.components(separatedBy: .newlines)
        let newLines = new.components(separatedBy: .newlines)
        guard oldLines.count * newLines.count <= 1_500_000 else {
            return indexAligned(oldLines: oldLines, newLines: newLines)
        }

        var lcs = Array(repeating: Array(repeating: 0, count: newLines.count + 1), count: oldLines.count + 1)
        if !oldLines.isEmpty, !newLines.isEmpty {
            for oldIndex in stride(from: oldLines.count - 1, through: 0, by: -1) {
                for newIndex in stride(from: newLines.count - 1, through: 0, by: -1) {
                    lcs[oldIndex][newIndex] = oldLines[oldIndex] == newLines[newIndex]
                        ? lcs[oldIndex + 1][newIndex + 1] + 1
                        : max(lcs[oldIndex + 1][newIndex], lcs[oldIndex][newIndex + 1])
                }
            }
        }

        var result: [SideBySideDiffRow] = []
        var oldIndex = 0
        var newIndex = 0
        while oldIndex < oldLines.count || newIndex < newLines.count {
            if oldIndex < oldLines.count, newIndex < newLines.count, oldLines[oldIndex] == newLines[newIndex] {
                result.append(row(result.count, oldIndex, oldLines[oldIndex], newIndex, newLines[newIndex], false, false))
                oldIndex += 1
                newIndex += 1
            } else if oldIndex < oldLines.count, newIndex < newLines.count,
                      lcs[oldIndex + 1][newIndex] == lcs[oldIndex][newIndex + 1] {
                result.append(row(result.count, oldIndex, oldLines[oldIndex], newIndex, newLines[newIndex], true, true))
                oldIndex += 1
                newIndex += 1
            } else if newIndex < newLines.count, oldIndex == oldLines.count || lcs[oldIndex][newIndex + 1] > lcs[oldIndex + 1][newIndex] {
                result.append(row(result.count, nil, nil, newIndex, newLines[newIndex], false, true))
                newIndex += 1
            } else {
                result.append(row(result.count, oldIndex, oldLines[oldIndex], nil, nil, true, false))
                oldIndex += 1
            }
        }
        return result
    }

    private static func indexAligned(oldLines: [String], newLines: [String]) -> [SideBySideDiffRow] {
        (0..<max(oldLines.count, newLines.count)).map { index in
            let oldText = index < oldLines.count ? oldLines[index] : nil
            let newText = index < newLines.count ? newLines[index] : nil
            let changed = oldText != newText
            return row(index, oldText == nil ? nil : index, oldText, newText == nil ? nil : index, newText, changed && oldText != nil, changed && newText != nil)
        }
    }

    private static func row(_ id: Int, _ oldIndex: Int?, _ oldText: String?, _ newIndex: Int?, _ newText: String?, _ oldChanged: Bool, _ newChanged: Bool) -> SideBySideDiffRow {
        SideBySideDiffRow(
            id: id,
            oldNumber: oldIndex.map { $0 + 1 },
            oldText: oldText,
            newNumber: newIndex.map { $0 + 1 },
            newText: newText,
            oldChanged: oldChanged,
            newChanged: newChanged
        )
    }
}

private struct CodeLineViewer: View {
    var file: CodeFileReference
    var wordWrap: Bool

    private var lines: [String] {
        file.content.components(separatedBy: .newlines)
    }

    private var scrollAxes: Axis.Set {
        wordWrap ? .vertical : [.vertical, .horizontal]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(scrollAxes) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        codeLine(number: index + 1, text: line)
                            .id(index + 1)
                    }
                }
                .frame(maxWidth: wordWrap ? .infinity : nil, alignment: .leading)
            }
            .background(Color.black.opacity(0.76))
            .onAppear {
                scrollToTarget(proxy)
            }
            .onChange(of: file.path) { _, _ in
                scrollToTarget(proxy)
            }
            .onChange(of: file.line) { _, _ in
                scrollToTarget(proxy)
            }
        }
    }

    private func codeLine(number: Int, text: String) -> some View {
        let isTarget = file.line == number
        let isNearby = file.line.map { abs($0 - number) <= 3 } ?? false

        return HStack(alignment: .top, spacing: 0) {
            Text("\(number)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(isTarget ? Color.white : Color.white.opacity(0.48))
                .frame(width: 52, alignment: .trailing)
                .padding(.trailing, 12)
                .textSelection(.disabled)

            Text(HighlightedCodeText.attributed(text.isEmpty ? " " : text))
                .font(.system(size: 12.5, design: .monospaced))
                .textSelection(.enabled)
                .fixedSize(horizontal: !wordWrap, vertical: true)
                .frame(maxWidth: wordWrap ? .infinity : nil, alignment: .leading)
        }
        .padding(.vertical, 2.5)
        .padding(.trailing, 16)
        .background(
            isTarget
                ? Color.accentColor.opacity(0.28)
                : (isNearby ? Color.accentColor.opacity(0.08) : Color.clear)
        )
    }

    private func scrollToTarget(_ proxy: ScrollViewProxy) {
        guard let line = file.line else { return }
        DispatchQueue.main.async {
            withAnimation(.snappy(duration: 0.22)) {
                proxy.scrollTo(max(line - 2, 1), anchor: .top)
            }
        }
    }
}

private struct ProjectFolderDrawer: View {
    @EnvironmentObject private var store: AssistantStore
    var rootURL: URL
    var selectedPath: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Text("Filter files...")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal, 12)
            .frame(height: 42)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(12)

            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ProjectTreeRow(url: rootURL, level: 0, selectedPath: selectedPath)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(.regularMaterial)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.primary.opacity(0.1))
                .frame(width: 1)
        }
    }
}

private struct ProjectTreeRow: View {
    @EnvironmentObject private var store: AssistantStore
    var url: URL
    var level: Int
    var selectedPath: String?
    @State private var isExpanded = true

    private var isDirectory: Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    private var isSelected: Bool {
        selectedPath == url.path
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                if isDirectory {
                    withAnimation(.snappy(duration: 0.16)) {
                        isExpanded.toggle()
                    }
                } else {
                    store.openCodeReference(filePath: url.path, line: nil)
                }
            } label: {
                HStack(spacing: 8) {
                    Spacer().frame(width: CGFloat(level) * 18)

                    if isDirectory {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 14)
                    } else {
                        Spacer().frame(width: 14)
                    }

                    Image(systemName: symbol)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(symbolColor)
                        .frame(width: 18)

                    Text(url.lastPathComponent)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(isSelected ? Color.primary.opacity(0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isDirectory && isExpanded {
                ForEach(children, id: \.path) { child in
                    ProjectTreeRow(url: child, level: level + 1, selectedPath: selectedPath)
                }
            }
        }
    }

    private var children: [URL] {
        guard isDirectory, url.lastPathComponent != ".git" else { return [] }
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsPackageDescendants]
        )) ?? []

        return urls
            .filter { ![".DS_Store", "DerivedData", "Build"].contains($0.lastPathComponent) }
            .sorted { lhs, rhs in
                let lhsDirectory = (try? lhs.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
                let rhsDirectory = (try? rhs.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
                if lhsDirectory != rhsDirectory { return lhsDirectory && !rhsDirectory }
                return lhs.lastPathComponent.localizedCaseInsensitiveCompare(rhs.lastPathComponent) == .orderedAscending
            }
            .prefix(180)
            .map { $0 }
    }

    private var symbol: String {
        if isDirectory { return "folder" }
        if url.pathExtension.lowercased() == "swift" { return "swift" }
        return "chevron.left.forwardslash.chevron.right"
    }

    private var symbolColor: Color {
        if isDirectory { return .secondary }
        if url.pathExtension.lowercased() == "swift" { return .orange }
        return .accentColor
    }
}

struct RightSidebarPanel: View {
    @Binding var content: RightSidebarContent
    @EnvironmentObject var store: AssistantStore

    var body: some View {
        if content == .codeFile {
            CodeFileSidePanel(content: $content)
                .environmentObject(store)
        } else {
            standardPanel
        }
    }

    private var standardPanel: some View {
        VStack(spacing: 0) {
            // Header of the Right Sidebar
            HStack {
                Text(title(for: content))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(content == .outputsAndSources ? Color.white : Color.secondary)
                
                Spacer()
                
                if content != .optionsMenu {
                    Button {
                        withAnimation(.snappy) {
                            content = .optionsMenu
                        }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .padding(.trailing, 8)
                    .help("Voltar")
                }

                Button {
                    withAnimation(.snappy) {
                        content = .none
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Fechar")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.primary.opacity(0.03))
            
            Divider()
            
            // Body content
            Group {
                switch content {
                case .none:
                    EmptyView()
                case .outputsAndSources:
                    outputsAndSourcesBody
                case .browser:
                    browserBody
                case .projectFiles:
                    projectFilesBody
                case .codeFile:
                    EmptyView()
                case .terminal:
                    terminalBody
                case .optionsMenu:
                    optionsMenuBody
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.8))
    }

    private func title(for section: RightSidebarContent) -> String {
        switch section {
        case .none: return ""
        case .outputsAndSources: return "Outputs & Sources"
        case .browser: return "Browser"
        case .projectFiles: return "Files"
        case .codeFile: return store.selectedCodeFile?.name ?? "Code"
        case .terminal: return "Terminal"
        case .optionsMenu: return "Navigation"
        }
    }

    private var outputsAndSourcesBody: some View {
        OutputsAndSourcesContent()
    }

    private var browserBody: some View {
        BrowserPane(model: store.browser)
    }

    private var projectFilesBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: "folder.fill")
                        .foregroundStyle(.secondary)
                    Text("Sandbox Files")
                        .font(.system(size: 13, weight: .semibold))
                }
                .padding(.bottom, 6)

                ForEach(store.files) { file in
                    Button {
                        store.openFile(file.id)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                            Text(file.name)
                                .font(.system(size: 12))
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(
                            store.selectedFileId == file.id ? Color.accentColor.opacity(0.14) : Color.clear,
                            in: RoundedRectangle(cornerRadius: 8)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var terminalBody: some View {
        ShellTerminalPane(shell: store.sidebarShell)
    }

    private var optionsMenuBody: some View {
        VStack(spacing: 12) {
            Button {
                withAnimation(.snappy) {
                    content = .projectFiles
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "folder")
                        .frame(width: 18)
                    Text("Files")
                    Spacer()
                    Text("⌘P")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            
            Button {
                withAnimation(.snappy) {
                    content = .browser
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .frame(width: 18)
                    Text("Browser")
                    Spacer()
                    Text("⌘T")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.snappy) {
                    content = .terminal
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "terminal")
                        .frame(width: 18)
                    Text("Terminal")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)

            if store.selectedCodeFile != nil {
                Button {
                    withAnimation(.snappy) {
                        content = .codeFile
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                            .frame(width: 18)
                        Text("Code")
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
    }
}

private struct OutputsAndSourcesContent: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Outputs")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                    
                    Text("No artifacts yet")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                        .padding(.vertical, 4)
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sources")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                    
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "globe")
                                .font(.system(size: 11))
                                .foregroundStyle(.tint)
                            Text("developer.apple.com")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                        HStack(spacing: 8) {
                            Image(systemName: "globe")
                                .font(.system(size: 11))
                                .foregroundStyle(.tint)
                            Text("stackoverflow.com")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
