import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var leftResizeStartWidth: CGFloat?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(nsColor: .windowBackgroundColor)
                .ignoresSafeArea()

            HStack(spacing: 0) {
                if !store.sidebarCollapsed {
                    SidebarView()
                        .frame(width: store.leftSidebarWidth)
                        .transition(.move(edge: .leading).combined(with: .opacity))

                    SidebarResizeHandle(isVisible: false) {
                        leftResizeStartWidth = store.leftSidebarWidth
                    } onChanged: { translation in
                        let start = leftResizeStartWidth ?? store.leftSidebarWidth
                        store.leftSidebarWidth = min(max(start + translation.width, 220), 420)
                    } onEnded: {
                        leftResizeStartWidth = nil
                    }
                }

                WorkspaceWithAuxiliaryPanels()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }


            if store.commandPaletteOpen {
                CommandPaletteView()
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }

            if store.codeEditorExpanded {
                ExpandedCodeEditorView()
                    .environmentObject(store)
                    .transition(.opacity.combined(with: .scale(scale: 0.985)))
                    .zIndex(40)
            }

            if let notice = store.localNotice {
                PointerAnchoredNotice(text: notice)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(100)
            }

        }
        .background(WindowChromeConfigurator())
        .toolbar {
            ToolbarItem(placement: .navigation) {
                SidebarCollapseButton(isCollapsed: store.sidebarCollapsed) {
                    withAnimation(.snappy) {
                        store.sidebarCollapsed.toggle()
                    }
                }
            }
        }
        .toolbarBackground(.hidden, for: .windowToolbar)
        .sheet(isPresented: $store.settingsOpen) {
            SettingsView()
                .environmentObject(store)
                .frame(width: 920, height: 640)
        }
        .onKeyPress(.escape) {
            if store.codeEditorExpanded {
                withAnimation(.snappy(duration: 0.18)) {
                    store.codeEditorExpanded = false
                }
                return .handled
            }
            if store.commandPaletteOpen {
                store.commandPaletteOpen = false
                return .handled
            }
            return .ignored
        }
        .onAppear {
            DynamicAssistantPanelController.shared.update(store: store)
        }
        .onChange(of: store.settings.appearance) { _, _ in
            DynamicAssistantPanelController.shared.update(store: store)
        }
    }
}

private struct WindowChromeConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async { configure(view.window) }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async { configure(nsView.window) }
    }

    private func configure(_ window: NSWindow?) {
        guard let window else { return }
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.styleMask.insert(.fullSizeContentView)
        window.isMovableByWindowBackground = false
    }
}

/// Keeps transient feedback close to the control the user just clicked. The mouse
/// location is the most reliable common anchor for actions spread across the app.
private struct PointerAnchoredNotice: View {
    var text: String
    @State private var anchor = CGPoint(x: 320, y: 80)

    var body: some View {
        GeometryReader { proxy in
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .liquidGlass(cornerRadius: 12)
                .frame(maxWidth: 520)
                .position(
                    x: min(max(anchor.x, 120), max(proxy.size.width - 120, 120)),
                    y: min(max(anchor.y + 34, 28), max(proxy.size.height - 28, 28))
                )
        }
        .allowsHitTesting(false)
        .onAppear(perform: updateAnchor)
        .onChange(of: text) { _, _ in updateAnchor() }
    }

    private func updateAnchor() {
        guard let window = NSApp.keyWindow ?? NSApp.mainWindow else { return }
        let mouse = NSEvent.mouseLocation
        anchor = CGPoint(
            x: mouse.x - window.frame.minX,
            y: window.frame.maxY - mouse.y
        )
    }
}

private struct SidebarCollapseButton: View {
    var isCollapsed: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "sidebar.left")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(0.82))
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(isCollapsed ? "Expandir Sidebar" : "Recolher Sidebar")
    }
}

private struct WorkspaceWithAuxiliaryPanels: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var rightResizeStartWidth: CGFloat?

    private var showsRightSidebar: Bool {
        store.rightSidebar != .none && store.rightSidebar != .outputsAndSources
    }

    var body: some View {
        HStack(spacing: 0) {
            WorkspaceSplitCanvas()
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if showsRightSidebar {
                SidebarResizeHandle(isVisible: false) {
                    rightResizeStartWidth = store.rightSidebarWidth
                } onChanged: { translation in
                    let start = rightResizeStartWidth ?? store.rightSidebarWidth
                    let proposedWidth = start - translation.width
                    if proposedWidth < 170 {
                        withAnimation(.snappy(duration: 0.16)) {
                            store.rightSidebar = .none
                        }
                        rightResizeStartWidth = nil
                    } else {
                        store.rightSidebarWidth = min(max(proposedWidth, 170), 860)
                    }
                } onEnded: {
                    rightResizeStartWidth = nil
                }

                RightSidebarPanel(content: $store.rightSidebar)
                    .frame(width: store.rightSidebarWidth)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
    }
}

private struct WorkspaceSplitCanvas: View {
    @EnvironmentObject private var store: AssistantStore

    var body: some View {
        WorkspaceSplitNodeView(node: store.workspaceLayout)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor).opacity(0.35))
    }
}

private struct WorkspaceSplitNodeView: View {
    @EnvironmentObject private var store: AssistantStore
    var node: WorkspaceLayoutNode
    @State private var resizeStartFraction: CGFloat?

    private let dividerHitThickness: CGFloat = 10
    private let collapseThreshold: CGFloat = 50

    var body: some View {
        switch node {
        case .leaf(let area):
            WorkspaceAreaShell(area: area)
        case .split(let split):
            GeometryReader { proxy in
                if split.axis == .horizontal {
                    let primaryWidth = primaryLength(total: proxy.size.width, fraction: split.fraction)
                    ZStack(alignment: .topLeading) {
                        HStack(spacing: 0) {
                            WorkspaceSplitNodeView(node: split.first)
                                .frame(width: primaryWidth)

                            WorkspaceSplitNodeView(node: split.second)
                                .frame(maxWidth: .infinity)
                        }

                        WorkspaceSplitDivider(axis: .horizontal)
                            .frame(width: dividerHitThickness, height: proxy.size.height)
                            .offset(x: primaryWidth - dividerHitThickness / 2)
                            .gesture(resizeDrag(for: split, totalLength: proxy.size.width))
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                } else {
                    let primaryHeight = primaryLength(total: proxy.size.height, fraction: split.fraction)
                    ZStack(alignment: .topLeading) {
                        VStack(spacing: 0) {
                            WorkspaceSplitNodeView(node: split.first)
                                .frame(height: primaryHeight)

                            WorkspaceSplitNodeView(node: split.second)
                                .frame(maxHeight: .infinity)
                        }

                        WorkspaceSplitDivider(axis: .vertical)
                            .frame(width: proxy.size.width, height: dividerHitThickness)
                            .offset(y: primaryHeight - dividerHitThickness / 2)
                            .gesture(resizeDrag(for: split, totalLength: proxy.size.height))
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
        }
    }

    private func primaryLength(total: CGFloat, fraction: CGFloat) -> CGFloat {
        let available = max(total, 0)
        guard available > 1 else { return available }
        return min(max(1, available * fraction), available - 1)
    }

    private func resizeDrag(for split: WorkspaceSplit, totalLength: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                if resizeStartFraction == nil {
                    resizeStartFraction = split.fraction
                }
                let start = resizeStartFraction ?? split.fraction
                let delta = split.axis == .horizontal ? value.translation.width : value.translation.height
                let proposedPrimaryLength = start * totalLength + delta
                let proposedSecondaryLength = totalLength - proposedPrimaryLength
                if proposedPrimaryLength < collapseThreshold {
                    store.collapseWorkspaceSplit(split.id, removeFirst: true)
                    resizeStartFraction = nil
                    return
                }
                if proposedSecondaryLength < collapseThreshold {
                    store.collapseWorkspaceSplit(split.id, removeFirst: false)
                    resizeStartFraction = nil
                    return
                }
                let next = proposedPrimaryLength / max(totalLength, 1)
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    store.updateWorkspaceSplitFraction(split.id, fraction: next)
                }
            }
            .onEnded { _ in
                resizeStartFraction = nil
            }
    }
}

private struct WorkspaceAreaShell: View {
    @EnvironmentObject private var store: AssistantStore
    var area: WorkspaceArea
    @State private var dragTranslation: CGSize?
    @State private var activeCorner: WorkspaceCorner?
    @State private var hoveredCorner: WorkspaceCorner?

    private let splitThreshold: CGFloat = 3
    private let cornerHandleSize: CGFloat = 44

    var body: some View {
        GeometryReader { proxy in
            let intent = activeCorner.flatMap { splitIntent(for: dragTranslation ?? .zero, from: $0, in: proxy.size) }
            ZStack(alignment: .topTrailing) {
                WorkspaceAreaContent(area: area)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                .background {
                    if area.kind == .nodes {
                        // Extends the canvas gray up into the titlebar strip so the
                        // topbar matches the workflow canvas exactly.
                        WorkflowCanvasBackground().ignoresSafeArea()
                    } else {
                        Color(nsColor: .windowBackgroundColor).opacity(0.58)
                    }
                }
                .overlay {
                    if store.activeWorkspaceAreaId == area.id {
                        Rectangle()
                            .strokeBorder(Color(nsColor: .windowBackgroundColor).opacity(0.95), lineWidth: 2)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    store.selectWorkspaceArea(area.id)
                }

                if let intent {
                    WorkspaceSplitPreview(intent: intent)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }

                ForEach(WorkspaceCorner.allCases) { corner in
                    WorkspaceCornerSplitHandle(
                        corner: corner,
                        isActive: activeCorner == corner,
                        isHovered: hoveredCorner == corner
                    )
                    .frame(width: cornerHandleSize, height: cornerHandleSize)
                    .position(corner.point(in: proxy.size, inset: cornerHandleSize / 2))
                    .highPriorityGesture(splitDrag(from: corner, in: proxy.size))
                    .help("Arrastar para dividir esta área")
                    .zIndex(6)
                }

                WorkspaceAreaTopControls(area: area)
                    .padding(.top, 14)
                    .padding(.trailing, 58)
                    .zIndex(8)

                HStack(spacing: 7) {
                    WorkspaceAreaKindControl(area: area)
                    if area.kind == .nodes {
                        WorkspaceWorkflowSwitcher(area: area)
                    }
                }
                    .padding(.top, 4)
                    .padding(.leading, 38)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .zIndex(8)

                if area.kind == .chat, store.rightSidebar == .outputsAndSources {
                    FloatingOutputsAndSourcesPanel(content: $store.rightSidebar)
                        .frame(width: 320, height: 300)
                        .padding(.top, 52)
                        .padding(.trailing, 16)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                        .zIndex(10)
                }
            }
            .onAppear {
                hoveredCorner = nil
            }
            .onContinuousHover { phase in
                switch phase {
                case .active(let point):
                    let nextCorner = hoverCorner(at: point, in: proxy.size)
                    if hoveredCorner != nextCorner {
                        hoveredCorner = nextCorner
                    }
                case .ended:
                    hoveredCorner = nil
                }
            }
        }
    }

    // Área sensível de cada canto é um triângulo (metade do quadrado), com a
    // hipotenusa virada para dentro da área — o cateto reto fica colado nas
    // duas bordas do canto, e a diagonal corta o quadrado ao meio.
    private func hoverCorner(at point: CGPoint, in size: CGSize) -> WorkspaceCorner? {
        guard point.x >= 0, point.y >= 0, point.x <= size.width, point.y <= size.height else {
            return nil
        }

        let hit = cornerHandleSize
        if point.x <= hit, point.y <= hit, point.x + point.y <= hit {
            return .topLeading
        }
        if point.x >= size.width - hit, point.y <= hit, (size.width - point.x) + point.y <= hit {
            return .topTrailing
        }
        if point.x <= hit, point.y >= size.height - hit, point.x + (size.height - point.y) <= hit {
            return .bottomLeading
        }
        if point.x >= size.width - hit, point.y >= size.height - hit, (size.width - point.x) + (size.height - point.y) <= hit {
            return .bottomTrailing
        }
        return nil
    }

    private func splitDrag(from corner: WorkspaceCorner, in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 3)
            .onChanged { value in
                activeCorner = corner
                dragTranslation = value.translation
            }
            .onEnded { value in
                defer {
                    activeCorner = nil
                    dragTranslation = nil
                }
                guard let intent = splitIntent(for: value.translation, from: corner, in: size) else { return }
                withAnimation(.snappy(duration: 0.18)) {
                    store.splitWorkspaceArea(area.id, axis: intent.axis, fraction: intent.fraction, newAreaFirst: intent.newAreaFirst)
                }
            }
    }

    private func splitIntent(for translation: CGSize, from corner: WorkspaceCorner, in size: CGSize) -> WorkspaceSplitIntent? {
        let horizontalDistance = corner.isLeading ? max(translation.width, 0) : max(-translation.width, 0)
        let verticalDistance = corner.isTop ? max(translation.height, 0) : max(-translation.height, 0)
        guard max(horizontalDistance, verticalDistance) >= splitThreshold else { return nil }

        if horizontalDistance >= verticalDistance {
            let newShare = min(max(horizontalDistance / max(size.width, 1), 0.01), 0.99)
            let newAreaFirst = corner.isLeading
            return WorkspaceSplitIntent(axis: .horizontal, fraction: newAreaFirst ? newShare : 1 - newShare, newAreaFirst: newAreaFirst)
        } else {
            let newShare = min(max(verticalDistance / max(size.height, 1), 0.01), 0.99)
            let newAreaFirst = corner.isTop
            return WorkspaceSplitIntent(axis: .vertical, fraction: newAreaFirst ? newShare : 1 - newShare, newAreaFirst: newAreaFirst)
        }
    }
}

private struct WorkspaceAreaTopControls: View {
    @EnvironmentObject private var store: AssistantStore
    var area: WorkspaceArea
    @State private var showNodePalette = false

    var body: some View {
        HStack(spacing: 6) {
            areaActions
            panelToggles
        }
        .fixedSize()
    }

    @ViewBuilder
    private var panelToggles: some View {
        if area.kind == .chat {
            Button {
                withAnimation(.snappy) {
                    store.rightSidebar = store.rightSidebar == .outputsAndSources ? .none : .outputsAndSources
                }
            } label: {
                WorkspaceFloatingAreaButton(symbol: "list.bullet.rectangle.portrait", isActive: store.rightSidebar == .outputsAndSources)
            }
            .buttonStyle(.plain)
            .frame(width: 34, height: 34)
            .background(.regularMaterial, in: Circle())
            .overlay(Circle().strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.7))
            .help("Outputs e Sources")
        }
    }

    @ViewBuilder
    private var areaActions: some View {
        switch area.kind {
        case .agents:
            Button {
                store.createAgent()
            } label: {
                WorkspaceFloatingAreaButton(symbol: "plus", isProminent: true)
            }
            .buttonStyle(.plain)
            .help("Criar Novo Agente")
        case .nodes:
            Button {
                showNodePalette.toggle()
            } label: {
                WorkspaceFloatingAreaButton(symbol: "plus")
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showNodePalette, arrowEdge: .top) {
                WorkflowAddPalette(isPresented: $showNodePalette, workflowId: area.workflowId)
                    .environmentObject(store)
            }
            .help("Adicionar Node ou Frame")

            Button {
                store.runWorkflow(area.workflowId)
            } label: {
                WorkspaceFloatingAreaButton(symbol: "play.fill")
            }
            .buttonStyle(.plain)
            .help("Executar Workflow")
        case .terminal:
            EmptyView()
        case .chat, .files, .browser, .marketplace, .photoEditor, .videoEditor, .dashboard:
            EmptyView()
        }
    }

    private func workflowNodeMenuItem(_ type: NodeType) -> some View {
        Button {
            store.addWorkflowNode(type, workflowId: area.workflowId)
        } label: {
            Label(type.title, systemImage: type.symbol)
        }
    }

    private func workflowFrameMenuItem(_ kind: WorkflowFrameKind) -> some View {
        Button {
            store.addWorkflowFrame(kind, workflowId: area.workflowId)
        } label: {
            Label(kind.title, systemImage: kind.symbol)
        }
    }
}

private struct WorkspaceAreaKindControl: View {
    @EnvironmentObject private var store: AssistantStore
    var area: WorkspaceArea

    var body: some View {
        Menu {
            ForEach(WorkspaceAreaKind.switchableKinds) { kind in
                Button {
                    store.setWorkspaceAreaKind(area.id, kind: kind)
                } label: {
                    if area.kind == kind {
                        Label(kind.title, systemImage: "checkmark")
                    } else {
                        Label(kind.title, systemImage: kind.symbol)
                    }
                }
            }
        } label: {
            ZStack(alignment: .bottomTrailing) {
                Image(systemName: area.kind.symbol)
                    .font(.system(size: 10.5, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 5.5, weight: .bold))
                    .offset(x: 2, y: 1)
            }
            .foregroundStyle(Color.primary.opacity(0.82))
            .frame(width: 22, height: 22)
            .padding(4)
            .contentShape(Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .frame(width: 34, height: 34)
        .background(Color.primary.opacity(0.075), in: Circle())
        .overlay(Circle().strokeBorder(Color.primary.opacity(0.13), lineWidth: 0.8))
        .help("Escolher tipo da área")
    }
}

private struct WorkspaceWorkflowSwitcher: View {
    @EnvironmentObject private var store: AssistantStore
    var area: WorkspaceArea

    private var workflow: Workflow {
        store.workflow(id: area.workflowId)
    }

    var body: some View {
        Menu {
            Section("Workflows") {
                ForEach(store.workflows) { item in
                    Button {
                        store.openWorkflow(item.id, inWorkspaceArea: area.id)
                    } label: {
                        if item.id == workflow.id {
                            Label(item.name, systemImage: "checkmark")
                        } else {
                            Label(item.name, systemImage: "point.3.connected.trianglepath.dotted")
                        }
                    }
                }
            }

            Section("Agentes") {
                ForEach(store.visibleAgents) { agent in
                    Button {
                        store.selectWorkspaceArea(area.id)
                        store.showWorkflow(for: agent.id)
                    } label: {
                        Label(agent.name, systemImage: "person.crop.circle.badge.gearshape")
                    }
                }
            }
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "point.3.connected.trianglepath.dotted")
                    .font(.system(size: 10.5, weight: .semibold))
                Text(workflow.name)
                    .font(.system(size: 11.5, weight: .semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .foregroundStyle(Color.primary.opacity(0.86))
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.7))
            .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .frame(maxWidth: 260)
        .help("Trocar workflow ou agente")
    }
}

private struct WorkspaceFloatingAreaButton: View {
    var symbol: String
    var isProminent = false
    var isActive = false

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(isProminent ? Color.white : (isActive ? Color.accentColor : Color.primary.opacity(0.82)))
            .frame(width: 34, height: 34)
            .background(isProminent ? Color.accentColor.opacity(0.86) : Color.primary.opacity(isActive ? 0.13 : 0.075), in: Circle())
            .overlay(Circle().strokeBorder(Color.primary.opacity(0.13), lineWidth: 0.8))
    }
}

private struct WorkflowAddPalette: View {
    @EnvironmentObject private var store: AssistantStore
    @Binding var isPresented: Bool
    var workflowId: String?

    private let localNodes: [NodeType] = [.folder, .reader, .writer, .prompt, .openProgram, .notifier, .trigger]
    private let apiNodes: [NodeType] = [.gmail, .googleDrive, .whatsapp, .telegram]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            paletteSection("Nodes locais", nodes: localNodes)
            Divider()
            paletteSection("Integrações", nodes: apiNodes)
            Divider()
            paletteSection("IA", nodes: [.agent])
            Divider()
            Text("Frames")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(WorkflowFrameKind.allCases) { kind in
                    flatItem(title: kind.title, symbol: kind.symbol) {
                        store.addWorkflowFrame(kind, workflowId: workflowId)
                    }
                }
            }
        }
        .padding(12)
        .frame(width: 340)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private func paletteSection(_ title: String, nodes: [NodeType]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(nodes) { type in
                    flatItem(title: type.title, symbol: type.symbol) {
                        store.addWorkflowNode(type, workflowId: workflowId)
                    }
                }
            }
        }
    }

    private func flatItem(title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            isPresented = false
        } label: {
            Label(title, systemImage: symbol)
                .font(.system(size: 11.5, weight: .medium))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 9)
                .frame(height: 30)
                .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.7))
        }
        .buttonStyle(.plain)
    }
}

private struct WorkspaceAreaContent: View {
    @EnvironmentObject private var store: AssistantStore
    var area: WorkspaceArea

    var body: some View {
        Group {
            switch area.kind {
            case .chat:
                ChatView(chatId: area.chatId)
            case .nodes:
                WorkflowCanvasView(workflowId: area.workflowId)
            case .terminal:
                TerminalGridView(terminalIds: area.terminalIds)
                    .onAppear {
                        if area.terminalIds.isEmpty {
                            _ = store.addTerminal(toWorkspaceArea: area.id)
                        }
                    }
            case .agents:
                AgentsView()
            case .files:
                FilesView()
            case .browser:
                BrowserPane(model: store.browser)
            case .marketplace:
                MarketplaceView()
            case .photoEditor:
                PhotoEditorView()
            case .videoEditor:
                VideoEditorView()
            case .dashboard:
                DashboardWorkspaceView(dashboardId: area.dashboardId)
            }
        }
    }
}

private struct WorkspaceSplitIntent {
    var axis: WorkspaceSplitAxis
    var fraction: CGFloat
    var newAreaFirst: Bool
}

private enum WorkspaceCorner: CaseIterable, Identifiable {
    case topLeading
    case topTrailing
    case bottomLeading
    case bottomTrailing

    var id: String {
        switch self {
        case .topLeading: "top-leading"
        case .topTrailing: "top-trailing"
        case .bottomLeading: "bottom-leading"
        case .bottomTrailing: "bottom-trailing"
        }
    }

    var alignment: Alignment {
        switch self {
        case .topLeading: .topLeading
        case .topTrailing: .topTrailing
        case .bottomLeading: .bottomLeading
        case .bottomTrailing: .bottomTrailing
        }
    }

    var gradientCenter: UnitPoint {
        switch self {
        case .topLeading: .topLeading
        case .topTrailing: .topTrailing
        case .bottomLeading: .bottomLeading
        case .bottomTrailing: .bottomTrailing
        }
    }

    var isLeading: Bool {
        self == .topLeading || self == .bottomLeading
    }

    var isTop: Bool {
        self == .topLeading || self == .topTrailing
    }

    func point(in size: CGSize, inset: CGFloat) -> CGPoint {
        switch self {
        case .topLeading:
            CGPoint(x: inset, y: inset)
        case .topTrailing:
            CGPoint(x: max(size.width - inset, inset), y: inset)
        case .bottomLeading:
            CGPoint(x: inset, y: max(size.height - inset, inset))
        case .bottomTrailing:
            CGPoint(x: max(size.width - inset, inset), y: max(size.height - inset, inset))
        }
    }
}

private struct WorkspaceSplitPreview: View {
    var intent: WorkspaceSplitIntent

    var body: some View {
        GeometryReader { proxy in
            let lineColor = Color.white.opacity(0.86)
            let fillColor = Color.white.opacity(0.18)

            ZStack(alignment: .topLeading) {
                if intent.axis == .horizontal {
                    if intent.newAreaFirst {
                        previewPane(fillColor)
                            .frame(width: proxy.size.width * intent.fraction, height: proxy.size.height)
                    } else {
                        previewPane(fillColor)
                            .frame(width: proxy.size.width * (1 - intent.fraction), height: proxy.size.height)
                            .offset(x: proxy.size.width * intent.fraction)
                    }
                    Rectangle()
                        .fill(lineColor)
                        .frame(width: 2.5, height: proxy.size.height)
                        .blur(radius: 0.6)
                        .offset(x: proxy.size.width * intent.fraction)
                } else {
                    if intent.newAreaFirst {
                        previewPane(fillColor)
                            .frame(width: proxy.size.width, height: proxy.size.height * intent.fraction)
                    } else {
                        previewPane(fillColor)
                            .frame(width: proxy.size.width, height: proxy.size.height * (1 - intent.fraction))
                            .offset(y: proxy.size.height * intent.fraction)
                    }
                    Rectangle()
                        .fill(lineColor)
                        .frame(width: proxy.size.width, height: 2.5)
                        .blur(radius: 0.6)
                        .offset(y: proxy.size.height * intent.fraction)
                }
            }
        }
    }

    private func previewPane(_ fillColor: Color) -> some View {
        ZStack {
            Rectangle()
                .fill(Color.white.opacity(0.24))
                .blur(radius: 22)
            Rectangle()
                .fill(fillColor)
                .background(.regularMaterial)
                .blur(radius: 8)
            Rectangle()
                .strokeBorder(Color.white.opacity(0.32), lineWidth: 1)
        }
        .compositingGroup()
    }
}

private struct WorkspaceCornerSplitHandle: View {
    var corner: WorkspaceCorner
    var isActive: Bool
    var isHovered: Bool

    private var isVisible: Bool { isHovered || isActive }

    var body: some View {
        ZStack {
            // Mantém a área sensível a hover mesmo sem o indicador visível.
            Color.clear
                .contentShape(CornerTriangle(corner: corner))

            if isVisible {
                WorkspaceCornerLShape(corner: corner)
                    .fill(Color.white.opacity(isActive ? 0.92 : 0.82))
                    .frame(width: 22, height: 22)
                    .blur(radius: 0.85)
                    .shadow(color: .white.opacity(isActive ? 0.2 : 0.1), radius: 5)
                    .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: corner.gradientCenter)))
            }
        }
        .animation(.easeOut(duration: 0.16), value: isVisible)
        .contentShape(CornerTriangle(corner: corner))
        .accessibilityLabel("Criar nova janela neste canto")
    }
}

/// Indicador em forma de L, baseado no affordance de divisão do macOS.
/// O desenho base fica no canto superior esquerdo e é espelhado para os demais.
private struct WorkspaceCornerLShape: Shape {
    var corner: WorkspaceCorner

    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(
                x: (corner.isLeading ? x : 1 - x) * rect.width,
                y: (corner.isTop ? y : 1 - y) * rect.height
            )
        }

        var path = Path()
        path.move(to: point(0, 0))
        path.addLine(to: point(0.83, 0))
        path.addCurve(to: point(1, 0.18), control1: point(0.94, 0), control2: point(1, 0.08))
        path.addLine(to: point(1, 0.34))
        path.addLine(to: point(0.48, 0.34))
        path.addCurve(to: point(0.34, 0.48), control1: point(0.40, 0.34), control2: point(0.34, 0.40))
        path.addLine(to: point(0.34, 0.83))
        path.addCurve(to: point(0.17, 1), control1: point(0.34, 0.94), control2: point(0.26, 1))
        path.addLine(to: point(0, 1))
        path.closeSubpath()
        return path
    }
}

/// Triângulo reto no canto indicado, cateto colado nas duas bordas do canto e
/// hipotenusa virada para dentro da área (metade do quadrado que o contém).
private struct CornerTriangle: Shape {
    var corner: WorkspaceCorner

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch corner {
        case .topLeading:
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        case .topTrailing:
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        case .bottomLeading:
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        case .bottomTrailing:
            path.move(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        }
        path.closeSubpath()
        return path
    }
}

private struct WorkspaceSplitDivider: View {
    var axis: WorkspaceSplitAxis
    @State private var isHovered = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.clear

                if axis == .horizontal {
                    Rectangle()
                        .fill(isHovered ? Color.accentColor.opacity(0.72) : Color.primary.opacity(0.16))
                        .frame(width: 1, height: proxy.size.height)
                } else {
                    Rectangle()
                        .fill(isHovered ? Color.accentColor.opacity(0.72) : Color.primary.opacity(0.16))
                        .frame(width: proxy.size.width, height: 1)
                }
            }
        }
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
        .help(axis == .horizontal ? "Arrastar para redimensionar áreas" : "Arrastar para redimensionar áreas")
    }
}

private struct SidebarResizeHandle: View {
    var isVisible = true
    var onBegan: () -> Void
    var onChanged: (CGSize) -> Void
    var onEnded: () -> Void
    @State private var isHovering = false
    @State private var isDragging = false

    var body: some View {
        Rectangle()
            .fill(isVisible ? ((isHovering || isDragging) ? Color.accentColor.opacity(0.42) : Color.primary.opacity(0.08)) : Color.clear)
            .frame(width: 5)
            .background {
                // Fills the thin gap between sidebar and workspace with the same
                // canvas gray so no lighter stripe shows through.
                WorkflowCanvasBackground().ignoresSafeArea()
            }
            .contentShape(Rectangle())
            .onHover { isHovering = $0 }
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { value in
                        if !isDragging {
                            isDragging = true
                            onBegan()
                        }
                        onChanged(value.translation)
                    }
                    .onEnded { _ in
                        isDragging = false
                        onEnded()
                    }
            )
            .help("Arrastar para ajustar largura")
    }
}

private struct ProjectEditorSelection: Identifiable {
    let projectId: String
    var id: String { projectId }
}

struct SidebarView: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var sidebarSearchQuery = ""
    @State private var hoveredProjectId: String? = nil
    @State private var hoveredItemId: String? = nil
    @State private var editingProject: ProjectEditorSelection?
    @State private var showAllProjects = false
    @State private var showAllAgents = false
    @State private var showHelpNotice = false
    @State private var showUserMenu = false
    @State private var sidebarFooterNotice: String?
    private let sidebarTextColor = Color.white
    private let collapsedListLimit = 4

    private var normalizedSidebarSearchQuery: String {
        sidebarSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSidebarSearching: Bool {
        !normalizedSidebarSearchQuery.isEmpty
    }

    private var sidebarFilteredProjects: [Project] {
        store.projects
            .filter { !$0.isArchived }
            .filter { project in
                let projectMatches = projectMatchesSearch(project)
                return projectMatches || !filteredProjectChats(for: project, projectMatchesSearch: projectMatches).isEmpty
            }
            .sorted { lhs, rhs in
                if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    private var sidebarFilteredAgents: [Agent] {
        let projectAgentIds = Set(store.projects.flatMap(\.agentIds))
        return store.visibleAgents.filter { agent in
            !projectAgentIds.contains(agent.id) &&
            (!isSidebarSearching || agent.name.localizedCaseInsensitiveContains(normalizedSidebarSearchQuery))
        }
    }

    private var sidebarRecentDashboards: [DashboardDocument] {
        store.dashboards
            .filter { dashboard in
                dashboard.projectId == nil &&
                !dashboard.isArchived &&
                (!isSidebarSearching || dashboard.title.localizedCaseInsensitiveContains(normalizedSidebarSearchQuery))
            }
            .sorted { lhs, rhs in
                if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 7) {
                    HStack(spacing: 5.6) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                            .font(.system(size: 12.6))

                        TextField("Buscar", text: $sidebarSearchQuery)
                            .textFieldStyle(.plain)
                            .font(.system(size: 12.6))
                            .foregroundStyle(sidebarTextColor)
                    }
                    .padding(.horizontal, 10.8)
                    .padding(.vertical, 5.6)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.8)
                    }

                    quickActions
                    projectDisclosure
                    chatDisclosure
                }
                .padding(10)
            }
            .scrollIndicators(.hidden)

            Divider().opacity(0.45)
            sidebarUserFooter
        }
        .background {
            WorkflowCanvasBackground()
                .ignoresSafeArea()
        }
        .sheet(item: $editingProject) { selection in
            ProjectEditorSheet(projectId: selection.projectId)
                .environmentObject(store)
        }
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 2.8) {
            SidebarActionButton(title: "Novo chat", symbol: "square.and.pencil") {
                store.startNewChat()
            }

            SidebarActionButton(title: "Novo Projeto", symbol: "folder.badge.plus") {
                let projectId = store.createProject()
                editingProject = ProjectEditorSelection(projectId: projectId)
            }

            SidebarActionButton(title: "Agentes", symbol: "person.3") {
                store.selectSection(.agents)
            }

            SidebarActionButton(title: "Terminal", symbol: "terminal") {
                store.selectSection(.terminals)
            }

            SidebarActionButton(title: "Marketplace", symbol: "storefront") {
                store.openMarketplace()
            }
        }
        .padding(.top, 1.4)
    }

    private var chatDisclosure: some View {
        VStack(alignment: .leading, spacing: 4.2) {
            HStack(spacing: 8) {
                Text("Recentes")
                    .font(.system(size: 10.8, weight: .bold))
                    .foregroundStyle(sidebarTextColor)
                    .textCase(.uppercase)
                    .padding(.leading, 8)

                Spacer()

                Button {
                    withAnimation(.snappy) {
                        store.chatDropdownOpen.toggle()
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .rotationEffect(.degrees(store.chatDropdownOpen ? 90 : 0))
                        .animation(.snappy(duration: 0.2), value: store.chatDropdownOpen)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.trailing, 8)
                .help(store.chatDropdownOpen ? "Recolher" : "Expandir")
            }
            .padding(.top, 2.8)

            let projectChatIds = Set(store.projects.flatMap(\.chatIds))
            let filteredChats = sortedChats(store.chats.filter {
                !projectChatIds.contains($0.id) &&
                !$0.isArchived &&
                (!isSidebarSearching || $0.title.localizedCaseInsensitiveContains(normalizedSidebarSearchQuery))
            })
            SidebarDisclosureReveal(isOpen: store.chatDropdownOpen) {
                ForEach(filteredChats) { chat in
                    sidebarChatRow(chat, projectId: nil)
                }

                ForEach(sidebarFilteredAgents) { agent in
                    agentItem(agent)
                }

                ForEach(sidebarRecentDashboards) { dashboard in
                    sidebarDashboardRow(dashboard)
                }
            }
        }
    }

    private var projectDisclosure: some View {
        VStack(alignment: .leading, spacing: 4.2) {
            HStack(spacing: 8) {
                Text("Projetos")
                    .font(.system(size: 10.8, weight: .bold))
                    .foregroundStyle(sidebarTextColor)
                    .textCase(.uppercase)
                    .padding(.leading, 8)

                Spacer()

                Button {
                    withAnimation(.snappy) {
                        store.projectsDropdownOpen.toggle()
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .rotationEffect(.degrees(store.projectsDropdownOpen ? 90 : 0))
                        .animation(.snappy(duration: 0.2), value: store.projectsDropdownOpen)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.trailing, 8)
                .help(store.projectsDropdownOpen ? "Recolher" : "Expandir")
            }
            .padding(.top, 2.8)

            let matchingProjects = sidebarFilteredProjects
            let visibleProjects = shouldLimitProjects(matchingProjects) ? Array(matchingProjects.prefix(collapsedListLimit)) : matchingProjects
            SidebarDisclosureReveal(isOpen: store.projectsDropdownOpen) {
                ForEach(visibleProjects) { project in
                    let projectMatchesSearch = projectMatchesSearch(project)
                    projectItem(project, filteredProjectChats: filteredProjectChats(for: project, projectMatchesSearch: projectMatchesSearch))
                }

                if shouldShowProjectsSeeMore(matchingProjects) {
                    SidebarSeeMoreButton {
                        withAnimation(.snappy) {
                            showAllProjects = true
                        }
                    }
                }
            }
        }
    }

    private var agentsDisclosure: some View {
        VStack(alignment: .leading, spacing: 4.2) {
            HStack(spacing: 8) {
                Text("Agentes")
                    .font(.system(size: 10.8, weight: .bold))
                    .foregroundStyle(sidebarTextColor)
                    .textCase(.uppercase)
                    .padding(.leading, 8)

                Spacer()

                Button {
                    withAnimation(.snappy) {
                        store.agentsDropdownOpen.toggle()
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .rotationEffect(.degrees(store.agentsDropdownOpen ? 90 : 0))
                        .animation(.snappy(duration: 0.2), value: store.agentsDropdownOpen)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.trailing, 8)
                .help(store.agentsDropdownOpen ? "Recolher" : "Expandir")
            }
            .padding(.top, 2.8)

            let matchingAgents = sidebarFilteredAgents
            let visibleAgents = shouldLimitAgents(matchingAgents) ? Array(matchingAgents.prefix(collapsedListLimit)) : matchingAgents
            SidebarDisclosureReveal(isOpen: store.agentsDropdownOpen) {
                ForEach(visibleAgents) { agent in
                    agentItem(agent)
                }

                if shouldShowAgentsSeeMore(matchingAgents) {
                    SidebarSeeMoreButton {
                        withAnimation(.snappy) {
                            showAllAgents = true
                        }
                    }
                }
            }
        }
    }

    private func projectMatchesSearch(_ project: Project) -> Bool {
        !isSidebarSearching || project.name.localizedCaseInsensitiveContains(normalizedSidebarSearchQuery)
    }

    private func filteredProjectChats(for project: Project, projectMatchesSearch: Bool) -> [ChatSession] {
        let projectChats = sortedChats(store.chats.filter { project.chatIds.contains($0.id) && !$0.isArchived })
        guard !projectMatchesSearch else { return projectChats }
        return projectChats.filter { $0.title.localizedCaseInsensitiveContains(normalizedSidebarSearchQuery) }
    }

    private func sortedChats(_ chats: [ChatSession]) -> [ChatSession] {
        chats.sorted { lhs, rhs in
            if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
            return lhs.date > rhs.date
        }
    }

    private func shouldLimitProjects(_ projects: [Project]) -> Bool {
        !isSidebarSearching && !showAllProjects && projects.count > collapsedListLimit
    }

    private func shouldShowProjectsSeeMore(_ projects: [Project]) -> Bool {
        !isSidebarSearching && !showAllProjects && projects.count > collapsedListLimit
    }

    private func shouldLimitAgents(_ agents: [Agent]) -> Bool {
        !isSidebarSearching && !showAllAgents && agents.count > collapsedListLimit
    }

    private func shouldShowAgentsSeeMore(_ agents: [Agent]) -> Bool {
        !isSidebarSearching && !showAllAgents && agents.count > collapsedListLimit
    }

    @ViewBuilder
    private func projectItem(_ project: Project, filteredProjectChats: [ChatSession]) -> some View {
        let projectIsActive = store.activeSection == .chat
            && (store.contextProjectId == project.id || (store.selectedChatSource == "projects" && project.chatIds.contains(store.activeChatId)))

        VStack(alignment: .leading, spacing: 2.1) {
            HStack(spacing: 7) {
                Image(systemName: project.symbol)
                    .font(.system(size: 15.3, weight: .regular))
                    .foregroundStyle(project.iconColor.color)
                    .frame(width: 19.8)

                Text(project.name)
                    .font(.system(size: 13.5, weight: .medium))
                    .lineLimit(1)
                    .foregroundStyle(sidebarTextColor)

                Spacer()

                if hoveredProjectId == project.id {
                    Button {
                        store.addProjectChat(title: "Nova Conversa #\(store.chats.count + 1)", to: project.id)
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 11.7))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(sidebarTextColor)
                    .help("Nova conversa")

                    Menu {
                        Button("Nova conversa") {
                            store.addProjectChat(title: "Nova Conversa #\(store.chats.count + 1)", to: project.id)
                        }
                        Button("Novo agente") {
                            store.createAgent(in: project.id)
                        }
                        Button("Novo dashboard") {
                            store.createDashboard(in: project.id)
                        }
                        Button("Configurações do projeto") {
                            editingProject = ProjectEditorSelection(projectId: project.id)
                        }
                        Button("Usar como contexto") {
                            store.setContextProject(project.id)
                        }
                        Divider()
                        Button(project.isPinned ? "Desafixar projeto" : "Fixar projeto") {
                            store.toggleProjectPinned(project.id)
                        }
                        Button("Arquivar projeto") {
                            store.archiveProject(project.id)
                        }
                        Button("Excluir projeto", role: .destructive) {
                            store.deleteProject(project.id)
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 12.6, weight: .semibold))
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .foregroundStyle(sidebarTextColor)
                    .fixedSize()
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .background(
                projectIsActive ? Color.primary.opacity(0.08) : (hoveredProjectId == project.id ? Color.primary.opacity(0.08) : Color.clear),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .onTapGesture {
                store.selectProject(project.id)
            }
            .onHover { isHovered in
                withAnimation(.snappy(duration: 0.12)) {
                    hoveredProjectId = isHovered ? project.id : nil
                }
            }
            .contextMenu {
                Button("Abrir") { store.selectProject(project.id) }
                Button("Nova conversa") {
                    store.addProjectChat(title: "Nova Conversa #\(store.chats.count + 1)", to: project.id)
                }
                Button("Configurações do projeto") {
                    editingProject = ProjectEditorSelection(projectId: project.id)
                }
                Button("Usar como contexto") {
                    store.setContextProject(project.id)
                }
                Divider()
                Button(project.isPinned ? "Desafixar projeto" : "Fixar projeto") { store.toggleProjectPinned(project.id) }
                Button("Arquivar projeto") { store.archiveProject(project.id) }
                Button("Excluir projeto", role: .destructive) { store.deleteProject(project.id) }
            }

            ForEach(filteredProjectChats) { chat in
                sidebarChatRow(chat, projectId: project.id, leadingIndent: 39.6)
            }

            ForEach(projectAgents(project)) { agent in
                agentItem(agent, leadingIndent: 39.6)
            }

            ForEach(projectDashboards(project)) { dashboard in
                sidebarDashboardRow(dashboard, leadingIndent: 39.6)
            }
        }
    }

    @ViewBuilder
    private func agentItem(_ agent: Agent, leadingIndent: CGFloat = 10) -> some View {
        let isActive = store.selectedAgentIdForNodes == agent.id && store.activeSection == .workflows
        HStack(spacing: 5.6) {
            Button {
                store.showWorkflow(for: agent.id)
            } label: {
                HStack(spacing: 7) {
                RobotHeadIcon()
                    .frame(width: 16.2, height: 16.2)
                Text(agent.name)
                    .lineLimit(1)
                if agent.isPinned {
                    Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(.secondary)
                }
                Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 6.3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if hoveredItemId == agent.id {
                agentActions(agent)
            }
        }
        .font(.system(size: 12.6, weight: .light))
        .foregroundStyle(sidebarTextColor)
        .padding(.leading, leadingIndent)
        .padding(.trailing, 10)
        .sidebarRowHover(isSelected: isActive)
        .onHover { hoveredItemId = $0 ? agent.id : nil }
        .contextMenu { agentActionItems(agent) }
    }

    @ViewBuilder
    private func sidebarChatRow(_ chat: ChatSession, projectId: String?, leadingIndent: CGFloat = 10) -> some View {
        let source = projectId == nil ? "chats" : "projects"
        let isActive = store.activeChatId == chat.id && store.activeSection == .chat && store.selectedChatSource == source
        HStack(spacing: 5.6) {
            Button {
                if let projectId {
                    store.selectProjectChat(chat.id, projectId: projectId)
                } else {
                    store.selectChat(chat.id, source: "chats")
                }
            } label: {
                HStack(spacing: 5) {
                    Text(chat.title).lineLimit(1)
                    if chat.isPinned {
                        Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 6.3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if hoveredItemId == chat.id {
                chatActions(chat)
            }
        }
        .font(.system(size: 12.6, weight: .light))
        .foregroundStyle(sidebarTextColor)
        .padding(.leading, leadingIndent)
        .padding(.trailing, 8)
        .sidebarRowHover(isSelected: isActive)
        .onHover { hoveredItemId = $0 ? chat.id : nil }
        .contextMenu { chatActionItems(chat) }
    }

    private func projectDashboards(_ project: Project) -> [DashboardDocument] {
        project.dashboardIds
            .compactMap { id in store.dashboards.first(where: { $0.id == id && !$0.isArchived }) }
            .sorted { lhs, rhs in
                if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    private func projectAgents(_ project: Project) -> [Agent] {
        project.agentIds
            .compactMap { id in store.agents.first(where: { $0.id == id && !$0.isArchived && !$0.isSystem }) }
            .sorted { lhs, rhs in
                if lhs.isPinned != rhs.isPinned { return lhs.isPinned && !rhs.isPinned }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    @ViewBuilder
    private func sidebarDashboardRow(_ dashboard: DashboardDocument, leadingIndent: CGFloat = 10) -> some View {
        HStack(spacing: 5.6) {
            Button { store.openDashboard(id: dashboard.id) } label: {
                HStack(spacing: 5) {
                    Image(systemName: "chart.xyaxis.line")
                    Text(dashboard.title).lineLimit(1)
                    if dashboard.isPinned {
                        Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 5.6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if hoveredItemId == dashboard.id {
                dashboardActions(dashboard)
            }
        }
        .font(.system(size: 12.6, weight: .light))
        .foregroundStyle(sidebarTextColor)
        .padding(.leading, leadingIndent)
        .padding(.trailing, 8)
        .sidebarRowHover()
        .onHover { hoveredItemId = $0 ? dashboard.id : nil }
        .contextMenu { dashboardActionItems(dashboard) }
    }

    private func chatActions(_ chat: ChatSession) -> some View {
        Menu { chatActionItems(chat) } label: {
            Image(systemName: "ellipsis").font(.system(size: 13, weight: .semibold)).frame(width: 20, height: 20)
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
    }

    @ViewBuilder
    private func chatActionItems(_ chat: ChatSession) -> some View {
        Button(chat.isPinned ? "Desafixar chat" : "Fixar chat") { store.toggleChatPinned(chat.id) }
        Button("Arquivar chat") { store.archiveChat(chat.id) }
        Divider()
        Button("Excluir chat", role: .destructive) { store.deleteChat(chat.id) }
    }

    private func agentActions(_ agent: Agent) -> some View {
        Menu { agentActionItems(agent) } label: {
            Image(systemName: "ellipsis").font(.system(size: 13, weight: .semibold)).frame(width: 20, height: 20)
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
    }

    @ViewBuilder
    private func agentActionItems(_ agent: Agent) -> some View {
        Button(agent.isPinned ? "Desafixar agente" : "Fixar agente") { store.toggleAgentPinned(agent.id) }
        Button("Arquivar agente") { store.archiveAgent(agent.id) }
        Divider()
        Button("Excluir agente", role: .destructive) { store.deleteAgent(agent.id) }
    }

    private func dashboardActions(_ dashboard: DashboardDocument) -> some View {
        Menu { dashboardActionItems(dashboard) } label: {
            Image(systemName: "ellipsis").font(.system(size: 13, weight: .semibold)).frame(width: 20, height: 20)
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
    }

    @ViewBuilder
    private func dashboardActionItems(_ dashboard: DashboardDocument) -> some View {
        Button(dashboard.isPinned ? "Desafixar dashboard" : "Fixar dashboard") { store.toggleDashboardPinned(dashboard.id) }
        Button("Arquivar dashboard") { store.archiveDashboard(dashboard.id) }
        Divider()
        Button("Excluir dashboard", role: .destructive) { store.deleteDashboard(dashboard.id) }
    }

    private var sidebarUserFooter: some View {
        HStack(spacing: 8) {
            Button {
                showUserMenu.toggle()
            } label: {
                HStack(spacing: 8) {
                    userAvatar
                    Text(store.settings.general.username)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(sidebarTextColor)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)
            .popover(isPresented: $showUserMenu, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        showUserMenu = false
                        store.settingsOpen = true
                    } label: {
                        Label("Configurações", systemImage: "gearshape")
                    }
                    Button {
                        showUserMenu = false
                        showUsageLimit()
                    } label: {
                        Label("Usage Limit", systemImage: "gauge.with.dots.needle.67percent")
                    }
                    Divider().padding(.vertical, 3)
                    Button(role: .destructive) {
                        showUserMenu = false
                        sidebarFooterNotice = "Nenhuma conta externa está autenticada neste dispositivo."
                    } label: {
                        Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                .buttonStyle(.plain)
                .padding(10)
                .frame(width: 220, alignment: .leading)
            }

            Button {
                showHelpNotice = true
            } label: {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 26, height: 26)
            }
            .buttonStyle(.plain)
            .help("Dicas de uso — em desenvolvimento")
            .popover(isPresented: $showHelpNotice, arrowEdge: .bottom) {
                Text("Em desenvolvimento")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(minHeight: 50)
        .popover(isPresented: footerNoticeIsPresented, arrowEdge: .bottom) {
            if let sidebarFooterNotice {
                Text(sidebarFooterNotice)
                    .font(.system(size: 12, weight: .medium))
                    .padding(12)
                    .frame(width: 270, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private var userAvatar: some View {
        if let path = store.settings.general.profileImagePath,
           let image = NSImage(contentsOfFile: path) {
            Image(nsImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 26, height: 26)
                .clipShape(Circle())
        } else {
            Text(userInitials)
                .font(.system(size: 10.5, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(Color(red: 0.36, green: 0.58, blue: 0.86), in: Circle())
        }
    }

    private var userInitials: String {
        let parts = store.settings.general.username.split(separator: " ")
        return parts.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    private func showUsageLimit() {
        let usage = store.tokenUsage(for: store.activeChatId)
        sidebarFooterNotice = "Uso do contexto: \(usage.totalTokens.formatted()) de \(usage.contextLimit.formatted()) tokens."
    }

    private var footerNoticeIsPresented: Binding<Bool> {
        Binding(
            get: { sidebarFooterNotice != nil },
            set: { if !$0 { sidebarFooterNotice = nil } }
        )
    }
}

/// Realça uma linha da sidebar com fundo cinza claro apenas sob hover do mouse.
/// `isSelected` mantém o destaque de item ativo sem depender do hover.
private struct SidebarRowHover: ViewModifier {
    var isSelected = false
    var cornerRadius: CGFloat = 10
    @State private var isHovered = false

    func body(content: Content) -> some View {
        content
            .background(
                (isSelected ? Color.primary.opacity(0.08) : (isHovered ? Color.primary.opacity(0.08) : Color.clear)),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .onHover { isHovered = $0 }
    }
}

private extension View {
    func sidebarRowHover(isSelected: Bool = false, cornerRadius: CGFloat = 10) -> some View {
        modifier(SidebarRowHover(isSelected: isSelected, cornerRadius: cornerRadius))
    }
}

/// Ícone de cabeça de robô desenhado em SwiftUI (SF Symbols não traz um equivalente).
struct RobotHeadIcon: View {
    var color: Color = .white

    var body: some View {
        GeometryReader { proxy in
            let s = min(proxy.size.width, proxy.size.height)
            let lw = s * 0.09
            ZStack {
                // Antena.
                Path { p in
                    p.move(to: CGPoint(x: s * 0.5, y: s * 0.02))
                    p.addLine(to: CGPoint(x: s * 0.5, y: s * 0.2))
                }
                .stroke(color, style: StrokeStyle(lineWidth: lw, lineCap: .round))
                Circle()
                    .fill(color)
                    .frame(width: s * 0.14, height: s * 0.14)
                    .position(x: s * 0.5, y: s * 0.04)

                // Cabeça.
                RoundedRectangle(cornerRadius: s * 0.24, style: .continuous)
                    .stroke(color, lineWidth: lw)
                    .frame(width: s * 0.78, height: s * 0.62)
                    .position(x: s * 0.5, y: s * 0.58)

                // Olhos.
                HStack(spacing: s * 0.18) {
                    Circle().fill(color).frame(width: s * 0.13, height: s * 0.13)
                    Circle().fill(color).frame(width: s * 0.13, height: s * 0.13)
                }
                .position(x: s * 0.5, y: s * 0.55)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

private struct SidebarActionButton: View {
    var title: String
    var symbol: String
    var action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 12.6, weight: .semibold))
                    .frame(width: 16.2)
                Text(title)
                    .font(.system(size: 12.6, weight: .regular))
                    .lineLimit(1)
                Spacer()
            }
            .foregroundStyle(Color.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6.3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isHovered ? Color.primary.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .help(title)
    }
}

private struct SidebarSeeMoreButton: View {
    var action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 12.6, weight: .bold))
                    .frame(width: 16.2)
                Text("See more")
                    .lineLimit(1)
                Spacer()
            }
            .font(.system(size: 12.6, weight: .semibold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6.3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isHovered ? Color.primary.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .help("Mostrar todos")
    }
}

private struct ProjectEditorSheet: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.dismiss) private var dismiss
    let projectId: String
    @State private var showIconChooser = false

    private var project: Project? {
        store.projects.first(where: { $0.id == projectId })
    }

    private var projectName: Binding<String> {
        Binding(
            get: { project?.name ?? "" },
            set: { store.renameProject(projectId, to: $0) }
        )
    }

    var body: some View {
        Group {
            if let project {
                VStack(alignment: .leading, spacing: 22) {
                    HStack {
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(width: 32, height: 32)
                                .background(Color.primary.opacity(0.06), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .help("Fechar")
                    }

                    HStack(spacing: 12) {
                        Button {
                            showIconChooser = true
                        } label: {
                            Image(systemName: project.symbol)
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(project.iconColor.color)
                                .frame(width: 36, height: 36)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .help("Escolher ícone do projeto")

                        TextField("Nome do projeto", text: projectName)
                            .textFieldStyle(.plain)
                            .font(.system(size: 18, weight: .semibold))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                    HStack {
                        Text("Cor e ícone")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(project.iconColor.rawValue.capitalized)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        let cleaned = project.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        store.renameProject(project.id, to: cleaned.isEmpty ? "Projeto sem nome" : cleaned)
                        dismiss()
                    } label: {
                        Text("Salvar")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .help("Salvar projeto")
                }
                .padding(24)
                .frame(width: 430)
                .sheet(isPresented: $showIconChooser) {
                    ProjectIconChooser(projectId: project.id)
                        .environmentObject(store)
                }
            } else {
                Text("Projeto não encontrado")
                    .padding(32)
            }
        }
    }
}

private struct ProjectIconChooser: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.dismiss) private var dismiss
    let projectId: String

    private let icons = [
        "folder", "dollarsign.circle", "book.closed", "graduationcap", "pencil", "signature", "curlybraces", "terminal",
        "music.note", "popcorn", "paintbrush", "paintpalette", "stethoscope", "asterisk", "leaf", "briefcase",
        "chart.bar", "figure.strengthtraining.traditional", "dumbbell", "note.text", "scalemass", "globe", "airplane", "network",
        "wrench.adjustable", "pawprint", "flask", "brain.head.profile", "heart", "gift"
    ]

    private var project: Project? {
        store.projects.first(where: { $0.id == projectId })
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 22), count: 8)
    }

    var body: some View {
        Group {
            if let project {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Choose icon")
                        .font(.system(size: 22, weight: .bold))

                    HStack {
                        Spacer()
                        Image(systemName: project.symbol)
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(project.iconColor.color)
                        Spacer()
                    }

                    HStack(spacing: 20) {
                        ForEach(ProjectIconColor.allCases) { iconColor in
                            Button {
                                store.updateProjectIcon(project.id, color: iconColor)
                            } label: {
                                ZStack {
                                    Circle()
                                        .fill(iconColor.color)
                                    if iconColor == .white {
                                        Circle()
                                            .strokeBorder(Color.primary.opacity(0.28), lineWidth: 1)
                                    }
                                    if project.iconColor == iconColor {
                                        Circle()
                                            .strokeBorder(Color.white, lineWidth: 4)
                                            .padding(-5)
                                    }
                                }
                                .frame(width: 36, height: 36)
                            }
                            .buttonStyle(.plain)
                            .help(iconColor.rawValue.capitalized)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)

                    Divider()

                    LazyVGrid(columns: columns, spacing: 24) {
                        ForEach(icons, id: \.self) { symbol in
                            Button {
                                store.updateProjectIcon(project.id, symbol: symbol)
                            } label: {
                                Image(systemName: symbol)
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundStyle(project.symbol == symbol ? project.iconColor.color : Color.white.opacity(0.9))
                                    .frame(width: 46, height: 46)
                                    .background(project.symbol == symbol ? project.iconColor.color.opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .help(symbol)
                        }
                    }

                    HStack {
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Text("Done")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 9)
                                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .help("Concluir")
                    }
                }
                .padding(26)
                .frame(width: 620)
            } else {
                Text("Projeto não encontrado")
                    .padding(32)
            }
        }
    }
}

/// Seção retrátil da sidebar: anima altura e opacidade em vez de inserir/remover
/// as linhas, evitando saltos quando há muitos itens.
private struct SidebarDisclosureReveal<Content: View>: View {
    var isOpen = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4.2) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(maxHeight: isOpen ? nil : 0, alignment: .top)
        .clipped()
        .opacity(isOpen ? 1 : 0)
        .allowsHitTesting(isOpen)
        .animation(.spring(response: 0.32, dampingFraction: 0.85), value: isOpen)
    }
}

private struct SidebarNavigationButton: View {
    @EnvironmentObject private var store: AssistantStore
    var section: AppSection

    var body: some View {
        Button {
            store.selectSection(section)
        } label: {
            HStack(spacing: 7) {
                Image(systemName: section.symbol)
                    .frame(width: 16.2)
                Text(section.title)
                Spacer()
            }
            .font(.system(size: 12.6, weight: .semibold))
            .foregroundStyle(store.activeSection == section ? Color.primary : Color.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6.3)
            .background(store.activeSection == section ? Color.primary.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Abrir \(section.title)") { store.selectSection(section) }
        }
    }
}

struct SidebarTopButton: View {
    var title: String
    var symbol: String
    var symbolWeight: Font.Weight = .regular
    var usesRobotIcon = false
    var isActive: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if usesRobotIcon {
                    RobotHeadIcon(color: isActive ? Color.primary : Color.secondary)
                        .frame(width: 16.2, height: 16.2)
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: 14.4, weight: symbolWeight))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(isActive ? Color.primary.opacity(0.08) : Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.primary.opacity(isActive ? 0.13 : 0.08), lineWidth: 0.8)
            }
            .foregroundStyle(isActive ? Color.primary : Color.secondary)
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .help(title)
    }
}

#Preview {
    ContentView()
        .environmentObject(AssistantStore())
}
