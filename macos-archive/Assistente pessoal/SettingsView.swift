import AppKit
import SwiftUI
import UniformTypeIdentifiers

enum SettingsTab: String, CaseIterable, Identifiable {
    case general
    case models
    case apiKeys
    case mcpServers
    case skills
    case extensions
    case localRuntime
    case appearance
    case permissions
    case files

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general: "Geral"
        case .models: "Modelos LLM"
        case .apiKeys: "Chaves API"
        case .mcpServers: "MCP"
        case .skills: "Skills"
        case .extensions: "Extensões"
        case .localRuntime: "Local Runtime"
        case .appearance: "Aparência"
        case .permissions: "Permissões"
        case .files: "Sandbox Files"
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .models: "sparkles"
        case .apiKeys: "key"
        case .mcpServers: "cylinder.split.1x2"
        case .skills: "medal"
        case .extensions: "puzzlepiece.extension"
        case .localRuntime: "externaldrive"
        case .appearance: "slider.horizontal.3"
        case .permissions: "checkmark.shield"
        case .files: "folder"
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.dismiss) private var dismiss
    @State private var activeTab: SettingsTab = .general
    @State private var apiSubTab = 0
    @State private var mcpSubTab = 0
    @State private var skillsSubTab = 0
    @State private var marketSearch = ""
    @State private var newAPIKey = ""
    @State private var selectedAPIProvider: ModelConfig.Provider = .openai
    @State private var showNewKey = false
    @State private var customMCPName = ""
    @State private var customMCPCommand = ""
    @State private var checkoutItem: MarketplaceItem?
    @State private var checkoutType: MarketplaceKind = .mcp
    @State private var paymentProcessing = false
    @State private var checkoutError: String?

    var body: some View {
        HStack(spacing: 0) {
            settingsSidebar
                .frame(width: 230)

            VStack(spacing: 0) {
                HStack {
                    Text(activeTab.title)
                        .font(.headline)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.borderless)
                    .help("Fechar")
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 17)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.primary.opacity(0.07)).frame(height: 1)
                }

                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 18) {
                        switch activeTab {
                        case .general:
                            generalSettings
                        case .models:
                            modelSettings
                        case .apiKeys:
                            apiSettings
                        case .mcpServers:
                            mcpSettings
                        case .skills:
                            skillsSettings
                        case .extensions:
                            extensionsSettings
                        case .localRuntime:
                            runtimeSettings
                        case .appearance:
                            appearanceSettings
                        case .permissions:
                            permissionsSettings
                        case .files:
                            FilesView()
                                .frame(height: 420)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8))
                        }
                    }
                    .padding(24)
                }

                HStack {
                    Spacer()
                    Button("Cancelar") { dismiss() }
                    Button("Salvar Ajustes") { dismiss() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(.regularMaterial)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.primary.opacity(0.07)).frame(height: 1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay {
            if let plan = store.pendingRuntimePlan {
                runtimeApprovalOverlay(plan: plan)
            } else if let checkoutItem {
                checkoutOverlay(for: checkoutItem)
            }
        }
        // Base mínima de 12pt para todos os textos da tela de Settings.
        .environment(\.font, .system(size: 12))
    }

    private var settingsSidebar: some View {
        VStack {
            VStack(alignment: .leading, spacing: 5) {
                Text("Preferências")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 5)

                ForEach(SettingsTab.allCases) { tab in
                    Button {
                        activeTab = tab
                    } label: {
                        Label(tab.title, systemImage: tab.symbol)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(activeTab == tab ? Color.primary.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 10))
                            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .medium))
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Circle().fill(.green).frame(width: 8, height: 8)
                    Text("Core Node Active")
                        .font(.system(size: 12, weight: .semibold))
                }
                Text("v0.4.12-beta")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .liquidGlass(cornerRadius: 12, interactive: false)
        }
        .padding(14)
        .background(.regularMaterial)
        .overlay(alignment: .trailing) {
            Rectangle().fill(Color.primary.opacity(0.08)).frame(width: 1)
        }
    }

    private var generalSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            formField("Foto de perfil") {
                HStack(spacing: 12) {
                    if let path = store.settings.general.profileImagePath,
                       let image = NSImage(contentsOfFile: path) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 42, height: 42)
                            .clipShape(Circle())
                    } else {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(.secondary)
                    }
                    Button("Escolher foto…", action: chooseProfileImage)
                    if store.settings.general.profileImagePath != nil {
                        Button("Remover") { store.settings.general.profileImagePath = nil }
                            .foregroundStyle(.red)
                    }
                }
            }
            formField("Nome do Usuário") {
                TextField("Nome", text: $store.settings.general.username)
                    .textFieldStyle(.roundedBorder)
            }
            formField("Idioma do Sistema") {
                Picker("Idioma", selection: $store.settings.general.language) {
                    Text("Português (BR)").tag("Português (BR)")
                    Text("English (US)").tag("English (US)")
                    Text("Español").tag("Español")
                }
                .labelsHidden()
            }
            formField("Tema Visual") {
                Picker("Tema", selection: $store.settings.general.theme) {
                    Text("Dark Slate").tag("Dark Slate")
                    Text("Onyx Deep Black").tag("Onyx Deep Black")
                    Text("Cyberpunk Neon").tag("Cyberpunk Neon")
                }
                .labelsHidden()
            }
            formField("Modelo Padrão de Inicialização") {
                Picker("Modelo", selection: $store.settings.general.defaultModel) {
                    ForEach(store.models) { model in
                        Text("\(model.name) (\(model.provider.rawValue))").tag(model.id)
                    }
                }
                .labelsHidden()
            }
        }
    }

    private var modelSettings: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Conexão de modelos ativos locais e baseados em nuvem.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            ForEach(store.models) { model in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(model.name)
                                .font(.subheadline.weight(.semibold))
                            Text(model.provider.rawValue)
                                .font(.system(size: 12, design: .monospaced))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 5))
                        }
                        Text(model.description)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(model.latency)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                    StatusPill(title: model.status == .disconnected ? "Desconectado" : "Conectado", tint: model.status == .disconnected ? .red : .green)
                }
                .padding(14)
                .subtlePanel(cornerRadius: 12)
            }
        }
    }

    private var apiSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("", selection: $apiSubTab) {
                Text("Chaves API Salvas").tag(0)
                Text("API Marketplace").tag(1)
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if apiSubTab == 0 {
                Picker("Provedor", selection: $selectedAPIProvider) {
                    ForEach(ModelConfig.Provider.all, id: \.self) { provider in
                        Text(provider.displayName).tag(provider)
                    }
                }
                .pickerStyle(.menu)

                HStack {
                    if showNewKey {
                        TextField("Cole sua chave de API...", text: $newAPIKey)
                            .font(.system(size: 12, design: .monospaced))
                    } else {
                        SecureField("Cole sua chave de API...", text: $newAPIKey)
                            .font(.system(size: 12, design: .monospaced))
                    }
                    if store.apiKeyVerificationStates[selectedAPIProvider] == .verifying {
                        ProgressView().controlSize(.small).help("Verificando chave")
                    }
                    Button {
                        showNewKey.toggle()
                    } label: {
                        Image(systemName: showNewKey ? "eye.slash" : "eye")
                    }
                    .buttonStyle(.borderless)
                    .help(showNewKey ? "Ocultar chave" : "Mostrar chave")

                    Button {
                        if let clip = NSPasteboard.general.string(forType: .string) {
                            newAPIKey = clip
                        }
                    } label: {
                        Label("Colar", systemImage: "doc.on.clipboard")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        store.addSavedAPIKey(newAPIKey, provider: selectedAPIProvider)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(newAPIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.apiKeyVerificationStates[selectedAPIProvider] == .verifying)
                    .help("Adicionar chave")
                }
                .textFieldStyle(.roundedBorder)
                .onChange(of: store.apiKeyVerificationStates[selectedAPIProvider]) { _, state in
                    if state == .verified { newAPIKey = "" }
                }

                if case .failed(let message) = store.apiKeyVerificationStates[selectedAPIProvider] {
                    Label(message, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                ForEach(store.savedAPIKeys) { saved in
                    SavedAPIKeyCard(saved: saved).environmentObject(store)
                }
            } else {
                marketplaceSearch
                ForEach(store.apiMarketplace.filter { marketSearch.isEmpty || $0.name.localizedCaseInsensitiveContains(marketSearch) }) { provider in
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(provider.name)
                                    .font(.subheadline.weight(.bold))
                                Text(provider.latency)
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundStyle(.tint)
                            }
                            Text(provider.description)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            Text(provider.price)
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.tint)
                        }
                        Spacer()
                        Button("Configurar") {
                            if let selected = ModelConfig.Provider(rawValue: provider.provider) {
                                selectedAPIProvider = selected
                            }
                            store.connectAPIProvider(provider)
                            apiSubTab = 0
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(14)
                    .subtlePanel(cornerRadius: 12)
                }
            }
        }
    }

    private var mcpSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("MCP", selection: $mcpSubTab) {
                Text("MCPs Conectados").tag(0)
                Text("MCP Marketplace").tag(1)
            }
            .pickerStyle(.segmented)

            if store.installingId != nil {
                installProgressView(title: "Instalando dependências do MCP...")
            }

            if mcpSubTab == 0 {
                Text("Provedores de contexto que alimentam agentes com dados de sistemas de arquivos, bancos de dados e repositórios.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)

                ForEach(store.connectedMCPs) { mcp in
                    HStack {
                        Image(systemName: mcp.symbol)
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(mcp.name).font(.subheadline.weight(.bold))
                                StatusPill(title: mcp.status, tint: .green)
                            }
                            Text(mcp.description)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            Text(mcp.command)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(.tint)
                                .textSelection(.enabled)
                        }
                        Spacer()
                        Button("Verificar") {
                            store.verifyMCP(mcp)
                        }
                        Button(role: .destructive) {
                            store.connectedMCPs.removeAll { $0.id == mcp.id }
                        } label: {
                            Image(systemName: "trash")
                        }
                        .help("Remover servidor MCP")
                    }
                    .padding(14)
                    .subtlePanel(cornerRadius: 12)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Label("Adicionar Novo Servidor MCP Customizado", systemImage: "plus")
                        .font(.system(size: 12, weight: .bold))
                    HStack {
                        TextField("Nome do Protocolo", text: $customMCPName)
                        TextField("Comando", text: $customMCPCommand)
                            .font(.system(size: 12, design: .monospaced))
                        Button("Adicionar") {
                            store.addCustomMCP(name: customMCPName, command: customMCPCommand)
                            customMCPName = ""
                            customMCPCommand = ""
                        }
                    }
                    .textFieldStyle(.roundedBorder)
                }
                .padding(14)
                .liquidGlass(cornerRadius: 14, interactive: false)
            } else {
                marketplaceSearch
                ForEach(store.mcpMarketplace.filter { marketSearch.isEmpty || $0.name.localizedCaseInsensitiveContains(marketSearch) }) { item in
                    MarketplaceRow(item: item) {
                        if item.price == "Grátis" {
                            store.installMCP(item)
                        } else {
                            checkoutType = .mcp
                            checkoutItem = item
                        }
                    }
                }
            }
        }
    }

    private var skillsSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Skills", selection: $skillsSubTab) {
                Text("Skills Salvas").tag(0)
                Text("Skills Marketplace").tag(1)
            }
            .pickerStyle(.segmented)

            if store.installingId != nil {
                installProgressView(title: "Sincronizando skill com runtime...")
            }

            if skillsSubTab == 0 {
                Text("Skills acopladas concedem capacidades extras de raciocínio a seus agentes locais.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                ForEach($store.settings.skills) { $skill in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(skill.name)
                                    .font(.subheadline.weight(.bold))
                                if skill.enabled {
                                    StatusPill(title: "Ativo", tint: .green)
                                }
                            }
                            Text(skill.description)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            FlowLayout(spacing: 5) {
                                ForEach(skill.permissions, id: \.self) { permission in
                                    Text(permission)
                                        .font(.system(size: 12, design: .monospaced))
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 4)
                                        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
                                }
                            }
                        }
                        Spacer()
                        Toggle("", isOn: $skill.enabled)
                            .labelsHidden()
                    }
                    .padding(14)
                    .subtlePanel(cornerRadius: 12)
                }
            } else {
                marketplaceSearch
                ForEach(store.skillsMarketplace.filter { marketSearch.isEmpty || $0.name.localizedCaseInsensitiveContains(marketSearch) }) { item in
                    MarketplaceRow(item: item) {
                        if item.price == "Grátis" {
                            store.installSkill(item)
                        } else {
                            checkoutType = .skill
                            checkoutItem = item
                        }
                    }
                }
            }
        }
    }

    private var extensionsSettings: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Marketplace de Extensões", systemImage: "puzzlepiece.extension")
                    .font(.headline)
                    .foregroundStyle(.primary)

                Text("Aba destinada a futuro marketplace de extensões criadas pelos próprios usuários.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)

                Text("No futuro, qualquer pessoa poderá criar uma extensão dentro do Assistente Pessoal, publicá-la e permitir que outros usuários a baixem e acoplem ao app.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .liquidGlass(cornerRadius: 16, interactive: false)

            VStack(alignment: .leading, spacing: 10) {
                Text("Tipos de extensão previstos")
                    .font(.subheadline.weight(.semibold))

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    extensionCategory("Editor de fotos", symbol: "photo.on.rectangle")
                    extensionCategory("Editor de vídeos", symbol: "film")
                    extensionCategory("Produção musical", symbol: "music.note")
                    extensionCategory("Áudio e TTS", symbol: "waveform")
                    extensionCategory("Análise de solo", symbol: "leaf")
                    extensionCategory("Ferramentas personalizadas", symbol: "wrench.and.screwdriver")
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("Como as extensões funcionarão", systemImage: "arrow.triangle.2.circlepath")
                    .font(.subheadline.weight(.semibold))

                extensionCapability("Executadas dentro do Assistente Pessoal", symbol: "macwindow")
                extensionCapability("Conectadas aos modelos de IA configurados no app", symbol: "sparkles")
                extensionCapability("Acopladas ao Chat, Nodes, Agentes e Terminal", symbol: "square.stack.3d.up")
                extensionCapability("Instaladas com permissões, manifesto e versão verificáveis", symbol: "checkmark.shield")
            }
            .padding(18)
            .subtlePanel(cornerRadius: 14)

            Text("O marketplace será ativado quando o formato de extensão, a assinatura dos pacotes e o sistema de permissões estiverem definidos.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func extensionCategory(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 12, weight: .medium))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func extensionCapability(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
    }

    private var runtimeSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "externaldrive.connected.to.line.below")
                    .font(.largeTitle)
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Open Assistant Local Runtime")
                        .font(.headline)
                    Text("Ollama em localhost:\(store.settings.localRuntime.ollamaPort) e OpenClaw em 127.0.0.1:\(store.settings.localRuntime.openClawPort)")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusPill(title: store.settings.localRuntime.status, tint: runtimeOverallTint)
            }
            .padding(18)
            .liquidGlass(cornerRadius: 16, interactive: false)

            HStack(spacing: 10) {
                Button {
                    store.prepareRuntimeInstall(.full)
                } label: {
                    Label("Instalar runtime completo", systemImage: "arrow.down.circle")
                }
                .buttonStyle(.borderedProminent)
                .disabled(store.runtimeInstallRunning)

                Button {
                    store.prepareRuntimeInstall(.ollamaOnly)
                } label: {
                    Label("Ollama", systemImage: "cpu")
                }
                .buttonStyle(.bordered)
                .disabled(store.runtimeInstallRunning)

                Button {
                    store.prepareRuntimeInstall(.openClawOnly)
                } label: {
                    Label("OpenClaw", systemImage: "point.3.connected.trianglepath.dotted")
                }
                .buttonStyle(.bordered)
                .disabled(store.runtimeInstallRunning)

                Button {
                    store.prepareRuntimeInstall(.repair)
                } label: {
                    Label("Reparar", systemImage: "wrench.and.screwdriver")
                }
                .buttonStyle(.bordered)
                .disabled(store.runtimeInstallRunning)

                Spacer()

                Button {
                    store.refreshRuntimeStatuses()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .help("Atualizar status")
            }

            if store.runtimeInstallRunning {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                    Text("System Setup Agent executando workflow...")
                        .font(.system(size: 12, weight: .semibold))
                    Spacer()
                }
                .padding(14)
                .liquidGlass(cornerRadius: 14, interactive: false)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(RuntimeComponent.allCases) { component in
                    runtimeStatusCard(component)
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Preferencias Locais")
                    .font(.system(size: 12, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                HStack(alignment: .top, spacing: 14) {
                    formField("Modelo padrao") {
                        TextField("llama3.2:3b", text: $store.settings.localRuntime.defaultLocalModelTag)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12, design: .monospaced))
                    }

                    formField("Porta Ollama") {
                        TextField("11434", value: $store.settings.localRuntime.ollamaPort, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(width: 90)
                    }

                    formField("Porta OpenClaw") {
                        TextField("18789", value: $store.settings.localRuntime.openClawPort, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(width: 90)
                    }
                }

                Toggle("Mostrar workflow visual durante a instalacao", isOn: $store.settings.localRuntime.showVisualInstall)
                Toggle("Permitir MCP local allowlistado", isOn: $store.settings.localRuntime.allowLocalMCPBridge)
                Toggle("Preferir uso local-only", isOn: $store.settings.localRuntime.localOnlyMode)
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)

            HStack {
                Button {
                    store.showRuntimeInstallWorkflow()
                } label: {
                    Label("Ver workflow de instalacao", systemImage: "square.stack.3d.up")
                }
                .buttonStyle(.bordered)

                Button {
                    store.copyRuntimeLogs()
                } label: {
                    Label("Copiar logs", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)

                Spacer()
            }

            VStack(alignment: .leading, spacing: 0) {
                Text("Modelos Instalados Localmente")
                    .font(.system(size: 12, weight: .bold))
                    .padding(.bottom, 8)
                if store.settings.localRuntime.modelsInstalled.isEmpty {
                    Text("Nenhum modelo local detectado ainda.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(store.settings.localRuntime.modelsInstalled, id: \.self) { model in
                        HStack {
                            Text(model).font(.system(size: 12, design: .monospaced))
                            Spacer()
                            Text("Pronto")
                                .font(.system(size: 12))
                                .foregroundStyle(.tint)
                        }
                        .padding(.vertical, 8)
                        Divider()
                    }
                }
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)

            VStack(alignment: .leading, spacing: 8) {
                Text("Logs Recentes")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                if store.runtimeLogs.isEmpty {
                    Text("Os logs aparecem aqui quando o runtime for verificado ou instalado.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.runtimeLogs.suffix(8)) { entry in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(runtimeLogTint(entry.level))
                                .frame(width: 7, height: 7)
                                .padding(.top, 4)
                            Text(entry.message)
                                .font(.system(size: 12, design: .monospaced))
                                .lineLimit(2)
                            Spacer()
                        }
                    }
                }
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)
        }
        .onAppear {
            store.refreshRuntimeStatuses()
        }
    }

    private var runtimeOverallTint: Color {
        switch store.settings.localRuntime.status {
        case "running": .green
        case "error": .red
        case "notInstalled": .secondary
        default: .yellow
        }
    }

    private func runtimeStatusCard(_ component: RuntimeComponent) -> some View {
        let status = store.runtimeStatuses[component] ?? RuntimeStatus.empty(component)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: component.symbol)
                    .foregroundStyle(status.state.tint)
                Text(component.title)
                    .font(.system(size: 12, weight: .bold))
                Spacer()
                Image(systemName: status.state.symbol)
                    .foregroundStyle(status.state.tint)
            }
            Text(status.state.title)
                .font(.system(size: 18, weight: .semibold))
            if let version = status.version {
                Text("v\(version)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            if let url = status.url {
                Text(url)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            if let error = status.error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
        .subtlePanel(cornerRadius: 12)
    }

    private func runtimeLogTint(_ level: RuntimeLogLevel) -> Color {
        switch level {
        case .info: .blue
        case .warning: .yellow
        case .error: .red
        case .success: .green
        case .command: .purple
        }
    }

    private var appearanceSettings: some View {
        VStack(alignment: .leading, spacing: 20) {
            formField("Cor de Destaque (Accent Color)") {
                HStack {
                    ForEach(["#55FCFF", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"], id: \.self) { color in
                        Button {
                            store.settings.appearance.accentColor = color
                        } label: {
                            Circle()
                                .fill(colorFromHex(color))
                                .frame(width: 28, height: 28)
                                .overlay(Circle().strokeBorder(store.settings.appearance.accentColor == color ? Color.primary : Color.clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .help(color)
                    }
                }
            }

            formField("Densidade da Interface") {
                Picker("Densidade", selection: $store.settings.appearance.density) {
                    Text("Compacto (macOS vibes)").tag("compact")
                    Text("Padrão").tag("normal")
                    Text("Espaçoso").tag("spacious")
                }
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Dynamic Assistant")
                    .font(.system(size: 12, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Toggle("Mostrar respostas sobre outros apps", isOn: $store.settings.appearance.floatingAssistantEnabled)
                Toggle("Modo compacto", isOn: $store.settings.appearance.floatingAssistantCompact)
                    .disabled(!store.settings.appearance.floatingAssistantEnabled)
                Toggle("Abrir ao receber resposta", isOn: $store.settings.appearance.floatingAssistantAutoShow)
                    .disabled(!store.settings.appearance.floatingAssistantEnabled)
                HStack {
                    Text("Opacidade")
                    Slider(value: $store.settings.appearance.floatingAssistantOpacity, in: 0.65...1)
                }
                .disabled(!store.settings.appearance.floatingAssistantEnabled)
                Text("Usa o notch ou a barra de menus para exibir respostas sem cobrir o conteúdo da tela.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)

            VStack(alignment: .leading, spacing: 12) {
                Text("Voz")
                    .font(.system(size: 12, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Picker("Síntese de voz", selection: $store.settings.voice.ttsProvider) {
                    Text("Local no Mac").tag("native")
                    Text("Pocket TTS local").tag("pocket")
                }
                Picker("Voz da assistente", selection: $store.settings.voice.selectedProfile) {
                    ForEach(AssistantVoiceProfile.allCases) { profile in
                        Text("\(profile.rawValue) — \(profile.summary)").tag(profile)
                    }
                }
                Toggle("Ler automaticamente respostas da IA", isOn: $store.settings.voice.automaticallySpeakReplies)
                Text("Evee, Sol e Harvey funcionam imediatamente com vozes locais do macOS. O perfil também preserva o mapeamento para Pocket TTS quando o runtime estiver instalado.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)

            VStack(alignment: .leading, spacing: 14) {
                Text("Tamanho da Fonte")
                    .font(.system(size: 12, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                slider("Geral da Interface", value: $store.settings.fontSize.global, range: 11...16)
                slider("Fonte da Tela de Chat", value: $store.settings.fontSize.chat, range: 12...18)
                slider("Terminais dos Agentes", value: $store.settings.fontSize.terminal, range: 10...15)
                slider("Código", value: $store.settings.fontSize.code, range: 10...15)
            }
            .padding(14)
            .subtlePanel(cornerRadius: 12)
        }
    }

    private var permissionsSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Determine os limites operacionais das decisões de IA e conexões externas.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            permissionToggle("Autorizar Leitura de Arquivos", isOn: $store.settings.permissions.readFile)
            permissionToggle("Autorizar Escrita/Criação de Arquivos", isOn: $store.settings.permissions.writeFile)
            permissionToggle("Autorizar Execução de Comandos", isOn: $store.settings.permissions.executeCommand)
            permissionToggle("Autorizar Agente a Alterar Workflows", isOn: $store.settings.permissions.alterWorkflow)
            permissionToggle("Autorizar Acesso à Rede Externa", isOn: $store.settings.permissions.accessNetwork)
        }
    }

    private var marketplaceSearch: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Buscar provedores e integrações...", text: $marketSearch)
                .textFieldStyle(.plain)
        }
        .padding(10)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 10))
    }

    private func formField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            content()
        }
    }

    private func installProgressView(title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                Text("\(Int(store.installProgress))%")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tint)
            }
            ProgressView(value: store.installProgress, total: 100)
        }
        .padding(14)
        .liquidGlass(cornerRadius: 14, interactive: false)
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(spacing: 5) {
            HStack {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(value.wrappedValue))px")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tint)
            }
            Slider(value: value, in: range, step: 1)
        }
    }

    private func permissionToggle(_ title: String, isOn: Binding<Bool>) -> some View {
        Toggle(title, isOn: isOn)
            .font(.system(size: 12, weight: .medium))
            .padding(13)
            .subtlePanel(cornerRadius: 12)
    }

    private func checkoutOverlay(for item: MarketplaceItem) -> some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Finalizar Compra")
                            .font(.headline)
                        Text("A compra será processada e verificada pela App Store.")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        checkoutItem = nil
                        paymentProcessing = false
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    .help("Fechar")
                }

                HStack {
                    VStack(alignment: .leading) {
                        Text("Item Selecionado")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.secondary)
                        Text(item.name)
                            .font(.subheadline.weight(.bold))
                    }
                    Spacer()
                    Text(item.price)
                        .font(.headline.monospaced())
                        .foregroundStyle(.tint)
                }
                .padding(12)
                .subtlePanel(cornerRadius: 12)

                if paymentProcessing {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Processando Transação...")
                            .font(.system(size: 12, weight: .bold))
                        Text("Aguardando a confirmação da App Store.")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 170)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Pagamento seguro pela App Store", systemImage: "apple.logo")
                            .font(.system(size: 13, weight: .semibold))
                        Text("ID do produto: \(store.marketplaceProductID(item, kind: checkoutType))")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                        if let checkoutError {
                            Text(checkoutError)
                                .font(.system(size: 12))
                                .foregroundStyle(.red)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(12)
                    .subtlePanel(cornerRadius: 10)
                }

                HStack {
                    Button("Cancelar") { checkoutItem = nil }
                    Spacer()
                    Button("Comprar na App Store") {
                        paymentProcessing = true
                        checkoutError = nil
                        Task {
                            do {
                                try await store.purchaseMarketplaceItem(item, kind: checkoutType)
                                checkoutItem = nil
                            } catch {
                                checkoutError = error.localizedDescription
                            }
                            paymentProcessing = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(paymentProcessing)
                }
            }
            .padding(22)
            .frame(width: 520)
            .liquidGlass(cornerRadius: 20)
        }
    }

    private func runtimeApprovalOverlay(plan: RuntimeInstallPlan) -> some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Aprovar instalacao local")
                            .font(.headline)
                        Text(plan.summary)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        store.cancelRuntimeInstallApproval()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                    .help("Fechar")
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Avisos")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    ForEach(plan.warnings, id: \.self) { warning in
                        Label(warning, systemImage: "checkmark.shield")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(12)
                .subtlePanel(cornerRadius: 12)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Comandos planejados")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(plan.commands) { command in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(command.action.title)
                                            .font(.system(size: 12, weight: .semibold))
                                        if command.requiresApproval {
                                            StatusPill(title: "exige aprovacao", tint: .orange)
                                        }
                                        Spacer()
                                        if let source = command.sourceURL {
                                            Text(source.absoluteString)
                                                .font(.system(size: 10, design: .monospaced))
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                    }
                                    Text(command.displayCommand)
                                        .font(.system(size: 11, design: .monospaced))
                                        .textSelection(.enabled)
                                        .lineLimit(3)
                                    Text(command.impact)
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary)
                                }
                                .padding(10)
                                .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    .frame(maxHeight: 260)
                }

                HStack {
                    Button("Cancelar") {
                        store.cancelRuntimeInstallApproval()
                    }
                    .keyboardShortcut(.cancelAction)

                    Spacer()

                    Button {
                        store.showRuntimeInstallWorkflow()
                    } label: {
                        Label("Ver workflow", systemImage: "square.stack.3d.up")
                    }

                    Button {
                        store.approveRuntimeInstall()
                    } label: {
                        Label("Aprovar e executar", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                }
            }
            .padding(22)
            .frame(width: 720)
            .liquidGlass(cornerRadius: 20)
        }
    }

    private func colorFromHex(_ hex: String) -> Color {
        let scanner = Scanner(string: hex.replacingOccurrences(of: "#", with: ""))
        var value: UInt64 = 0
        scanner.scanHexInt64(&value)
        return Color(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }

    private func chooseProfileImage() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK else { return }
        store.settings.general.profileImagePath = panel.url?.path
    }
}

private struct SavedAPIKeyCard: View {
    @EnvironmentObject private var store: AssistantStore
    var saved: SavedAPIKey
    @State private var hovered = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: saved.symbol)
                .foregroundStyle(.tint)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(saved.provider)
                        .font(.subheadline.weight(.bold))
                    StatusPill(title: "Verificada", tint: .green)
                }
                Text("Credencial armazenada com segurança no Keychain.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Text(saved.masked)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tint)
                    .textSelection(.enabled)
            }
            Spacer()
            if hovered {
                Button(role: .destructive) { store.removeSavedAPIKey(saved) } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                .help("Remover chave")
                .accessibilityLabel("Remover chave de \(saved.provider)")
            }
        }
        .padding(14)
        .subtlePanel(cornerRadius: 12)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(hovered ? 0.14 : 0), lineWidth: 0.8))
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.13), value: hovered)
        .contextMenu {
            Button("Remover", role: .destructive) { store.removeSavedAPIKey(saved) }
        }
    }
}

private struct MarketplaceRow: View {
    var item: MarketplaceItem
    var action: () -> Void

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(item.name)
                        .font(.subheadline.weight(.bold))
                    Text("by \(item.publisher)")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Text("★ \(item.rating) (\(item.downloads))")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.yellow)
                }
                Text(item.description)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                if !item.permissions.isEmpty {
                    FlowLayout(spacing: 5) {
                        ForEach(item.permissions, id: \.self) { permission in
                            Text(permission)
                                .font(.system(size: 12, design: .monospaced))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
                        }
                    }
                }
            }
            Spacer()
            Button(item.price == "Grátis" ? "Instalar Grátis" : "Comprar por \(item.price)", action: action)
                .buttonStyle(.borderedProminent)
        }
        .padding(14)
        .subtlePanel(cornerRadius: 12)
    }
}
