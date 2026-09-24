import SwiftUI
import AppKit

// MARK: - Port / row plumbing

struct WorkflowPortID: Hashable {
    var nodeId: String
    var port: Int
    var isOutput: Bool
}

private struct WorkflowRowKey: Hashable {
    var nodeId: String
    var index: Int
}

private struct WorkflowRowAnchorsKey: PreferenceKey {
    static var defaultValue: [WorkflowRowKey: Anchor<CGRect>] = [:]
    static func reduce(value: inout [WorkflowRowKey: Anchor<CGRect>], nextValue: () -> [WorkflowRowKey: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

private struct WorkflowPortCentersKey: PreferenceKey {
    static var defaultValue: [WorkflowPortID: Anchor<CGPoint>] = [:]
    static func reduce(value: inout [WorkflowPortID: Anchor<CGPoint>], nextValue: () -> [WorkflowPortID: Anchor<CGPoint>]) {
        value.merge(nextValue()) { $1 }
    }
}

private struct WorkflowNodeSizesKey: PreferenceKey {
    static var defaultValue: [String: CGSize] = [:]
    static func reduce(value: inout [String: CGSize], nextValue: () -> [String: CGSize]) {
        value.merge(nextValue()) { $1 }
    }
}

private struct WorkspaceWorkflowIdKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

extension EnvironmentValues {
    var workspaceWorkflowId: String? {
        get { self[WorkspaceWorkflowIdKey.self] }
        set { self[WorkspaceWorkflowIdKey.self] = newValue }
    }
}

// MARK: - Canvas

/// Single source of truth for the workflow canvas gray, shared with the
/// surrounding chrome (topbar strip and app sidebar) so they match exactly.
struct WorkflowCanvasBackground: View {
    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
            Color.black.opacity(0.16)
        }
    }
}

struct WorkflowCanvasView: View {
    @EnvironmentObject private var store: AssistantStore
    var workflowId: String? = nil
    @State private var nodeSizes: [String: CGSize] = [:]
    @State private var marqueeRect: CGRect?
    @State private var hoverPoint: CGPoint?

    // Keep the stage below the maximum Metal texture dimension. The viewport
    // frames it explicitly, so this large surface never participates in layout.
    private let stageSize = CGSize(width: 4096, height: 4096)
    private var workflow: Workflow {
        store.workflow(id: workflowId)
    }

    var body: some View {
        VStack(spacing: 0) {
            canvasViewport

            if store.showBottomTerminal {
                CollapsibleBottomTerminal(isPresented: $store.showBottomTerminal)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            let id = workflow.id
            // Preserva as posições salvas; auto grade é uma ação explícita.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                store.fitWorkflowToView(id)
            }
        }
        .coordinateSpace(name: "workflowViewport")
        .background(WorkflowCanvasBackground())
        .onPreferenceChange(WorkflowNodeSizesKey.self) {
            nodeSizes = $0
            store.workflowNodeSizes = $0
        }
    }

    private var canvasViewport: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                GridBackground(offset: store.workflowOffset, zoom: store.workflowZoom, hoverPoint: hoverPoint)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .gesture(marqueeGesture)
                    .onTapGesture {
                        store.selectedWorkflowNodeIds = []
                        store.selectedWorkflowFrameIds = []
                        store.connectingFromPort = nil
                    }
                    .onContinuousHover { phase in
                        switch phase {
                        case .active(let point): hoverPoint = point
                        case .ended: hoverPoint = nil
                        }
                    }

                workflowStage
                    .scaleEffect(store.workflowZoom, anchor: .topLeading)
                    .offset(store.workflowOffset)
                    .frame(
                        width: geometry.size.width,
                        height: geometry.size.height,
                        alignment: .topLeading
                    )
                    .clipped()

                workflowControls
                    .padding(18)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

                if let marqueeRect {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.1))
                        .overlay {
                            Rectangle()
                                .strokeBorder(Color.accentColor.opacity(0.65), lineWidth: 1)
                        }
                        .frame(width: max(marqueeRect.width, 1), height: max(marqueeRect.height, 1))
                        .offset(x: marqueeRect.minX, y: marqueeRect.minY)
                        .allowsHitTesting(false)
                        .zIndex(5)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
            .onAppear {
                store.workflowViewportSizes[workflow.id] = geometry.size
            }
            .onChange(of: geometry.size) { _, newSize in
                store.workflowViewportSizes[workflow.id] = newSize
            }
            .background {
                TrackpadPanZoomCatcher(
                    onPan: { delta in
                        var transaction = Transaction()
                        transaction.disablesAnimations = true
                        withTransaction(transaction) {
                            store.workflowOffset.width += delta.width
                            store.workflowOffset.height += delta.height
                        }
                    },
                    onMagnify: { magnification, location in
                        let oldZoom = store.workflowZoom
                        let newZoom = min(2.0, max(0.4, oldZoom * (1 + magnification)))
                        guard newZoom != oldZoom else { return }
                        // Keep the point under the cursor fixed while zooming.
                        let stageX = (location.x - store.workflowOffset.width) / oldZoom
                        let stageY = (location.y - store.workflowOffset.height) / oldZoom
                        var transaction = Transaction()
                        transaction.disablesAnimations = true
                        withTransaction(transaction) {
                            store.workflowOffset.width = location.x - stageX * newZoom
                            store.workflowOffset.height = location.y - stageY * newZoom
                            store.workflowZoom = newZoom
                        }
                    }
                )
            }
        }
    }

    private var workflowStage: some View {
        ZStack(alignment: .topLeading) {
            ForEach(workflow.frames) { frame in
                WorkflowFrameView(frame: frame)
                    .environment(\.workspaceWorkflowId, workflowId)
                    .offset(x: frame.x, y: frame.y)
                    .zIndex(0)
                    .transition(.scale(scale: 0.97, anchor: .topLeading).combined(with: .opacity))
            }

            workflowNodeLayer
                .zIndex(10)

            WorkflowMapCenterPoint()
                .position(x: store.workflowMapCenter.x, y: store.workflowMapCenter.y)
                .allowsHitTesting(false)
                .zIndex(20)
        }
        .frame(width: stageSize.width, height: stageSize.height, alignment: .topLeading)
        .coordinateSpace(name: "workflowStage")
    }

    private var workflowNodeLayer: some View {
        ZStack(alignment: .topLeading) {
            ForEach(workflow.nodes) { node in
                WorkflowNodeCard(node: node)
                    .environment(\.workspaceWorkflowId, workflowId)
                    .offset(x: node.x, y: node.y)
                    .zIndex(store.selectedWorkflowNodeIds.contains(node.id) ? 2 : 1)
                    .transition(.scale(scale: 0.94, anchor: .center).combined(with: .opacity))
            }
        }
        .frame(width: stageSize.width, height: stageSize.height, alignment: .topLeading)
        .backgroundPreferenceValue(WorkflowPortCentersKey.self) { anchors in
            GeometryReader { geo in
                let points = anchors.mapValues { geo[$0] }
                ConnectionsCanvas(points: points)
                    .environment(\.workspaceWorkflowId, workflowId)
                    .onChange(of: points, initial: true) { _, newValue in
                        store.workflowPortCenters = newValue
                    }
            }
        }
    }

    // Mouse click-and-drag on empty canvas = rubber-band selection (never pans the canvas).
    private var marqueeGesture: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named("workflowViewport"))
            .onChanged { value in
                let rect = CGRect(
                    x: min(value.startLocation.x, value.location.x),
                    y: min(value.startLocation.y, value.location.y),
                    width: abs(value.translation.width),
                    height: abs(value.translation.height)
                )
                marqueeRect = rect
                updateMarqueeSelection(rect)
            }
            .onEnded { _ in
                marqueeRect = nil
            }
    }

    private func updateMarqueeSelection(_ screenRect: CGRect) {
        let zoom = max(store.workflowZoom, 0.2)
        let stageRect = CGRect(
            x: (screenRect.minX - store.workflowOffset.width) / zoom,
            y: (screenRect.minY - store.workflowOffset.height) / zoom,
            width: screenRect.width / zoom,
            height: screenRect.height / zoom
        )

        var selected: Set<String> = []
        for node in workflow.nodes {
            let size = nodeSizes[node.id] ?? CGSize(width: 260, height: 200)
            let frame = CGRect(x: node.x, y: node.y, width: size.width, height: size.height)
            if frame.intersects(stageRect) {
                selected.insert(node.id)
            }
        }
        if store.selectedWorkflowNodeIds != selected {
            store.selectedWorkflowNodeIds = selected
            store.selectedWorkflowFrameIds = []
        }
    }

    private var workflowControls: some View {
        HStack(spacing: 12) {
            Button {
                store.workflowZoom = max(0.4, store.workflowZoom - 0.1)
            } label: {
                Image(systemName: "minus.magnifyingglass")
            }
            .help("Diminuir zoom")

            Text("\(Int(store.workflowZoom * 100))%")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .frame(width: 44)

            Button {
                store.workflowZoom = min(2.0, store.workflowZoom + 0.1)
            } label: {
                Image(systemName: "plus.magnifyingglass")
            }
            .help("Aumentar zoom")

            Divider().frame(height: 18)

            Button {
                store.fitWorkflowToView(workflowId)
            } label: {
                Image(systemName: "rectangle.center.inset.filled")
            }
            .help("Ver todos os nodes")

            Button {
                store.autoArrangeWorkflow(workflowId)
            } label: {
                Label("Auto Grade", systemImage: "rectangle.3.group")
            }

            Text("Workflow Otimizado por IA")
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .liquidGlass(cornerRadius: 14, interactive: false)
    }

}

private struct WorkflowMapCenterPoint: View {
    var body: some View {
        Circle()
            .fill(Color.red)
            .frame(width: 7, height: 7)
            .shadow(color: Color.red.opacity(0.45), radius: 4)
    }
}

// MARK: - Trackpad pan & pinch zoom (NSEvent based)

private struct TrackpadPanZoomCatcher: NSViewRepresentable {
    var onPan: (CGSize) -> Void
    var onMagnify: (CGFloat, CGPoint) -> Void

    func makeNSView(context: Context) -> CatcherNSView {
        let view = CatcherNSView()
        view.onPan = onPan
        view.onMagnify = onMagnify
        return view
    }

    func updateNSView(_ nsView: CatcherNSView, context: Context) {
        nsView.onPan = onPan
        nsView.onMagnify = onMagnify
    }

    final class CatcherNSView: NSView {
        var onPan: ((CGSize) -> Void)?
        var onMagnify: ((CGFloat, CGPoint) -> Void)?
        private var monitors: [Any] = []

        // Match SwiftUI's top-left coordinate system so locations map 1:1.
        override var isFlipped: Bool { true }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            removeMonitors()
            guard window != nil else { return }

            if let monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel, handler: { [weak self] event in
                guard let self, self.shouldHandle(event) else { return event }
                guard event.momentumPhase.isEmpty else { return nil }
                let scale: CGFloat = event.hasPreciseScrollingDeltas ? 1 : 6
                let delta = CGSize(width: event.scrollingDeltaX * scale, height: event.scrollingDeltaY * scale)
                guard abs(delta.width) > 0.01 || abs(delta.height) > 0.01 else { return nil }
                self.onPan?(delta)
                return nil
            }) {
                monitors.append(monitor)
            }

            if let monitor = NSEvent.addLocalMonitorForEvents(matching: .magnify, handler: { [weak self] event in
                guard let self, self.shouldHandle(event) else { return event }
                let location = self.convert(event.locationInWindow, from: nil)
                self.onMagnify?(event.magnification, location)
                return nil
            }) {
                monitors.append(monitor)
            }
        }

        private func shouldHandle(_ event: NSEvent) -> Bool {
            guard let window, event.window === window else { return false }
            let point = convert(event.locationInWindow, from: nil)
            return bounds.contains(point)
        }

        private func removeMonitors() {
            for monitor in monitors {
                NSEvent.removeMonitor(monitor)
            }
            monitors.removeAll()
        }

        deinit {
            removeMonitors()
        }
    }
}

// MARK: - Connections

private struct ConnectionsCanvas: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.workspaceWorkflowId) private var workflowId
    var points: [WorkflowPortID: CGPoint]

    private var workflow: Workflow {
        store.workflow(id: workflowId)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(workflow.connections) { connection in
                // Ports start at 1 now (headers have no ports); legacy connections stored port 0.
                if
                    let start = points[WorkflowPortID(nodeId: connection.fromId, port: max(connection.fromPort, 1), isOutput: true)],
                    let end = points[WorkflowPortID(nodeId: connection.toId, port: max(connection.toPort, 1), isOutput: false)]
                {
                    let fromNode = workflow.nodes.first(where: { $0.id == connection.fromId })
                    let active = fromNode?.status == .success || fromNode?.status == .running
                    let wireColor = Color(white: 0.78)
                    WorkflowWire(
                        start: start,
                        end: end,
                        color: wireColor.opacity(active ? 1.0 : 0.85),
                        lineWidth: active ? 2.8 : 2.1
                    )
                }
            }

            if let from = store.connectionDragFrom,
               let dragPoint = store.connectionDragPoint,
               let anchor = points[from] {
                let start = from.isOutput ? anchor : dragPoint
                let end = from.isOutput ? dragPoint : anchor
                WorkflowWire(
                    start: start,
                    end: end,
                    color: Color(white: 0.85).opacity(0.9),
                    lineWidth: 2,
                    isDraft: true
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

private struct WorkflowWire: View {
    var start: CGPoint
    var end: CGPoint
    var color: Color
    var lineWidth: CGFloat
    var isDraft = false

    var body: some View {
        let tangent = max(72, min(220, abs(end.x - start.x) * 0.46))
        let control1 = CGPoint(x: start.x + tangent, y: start.y)
        let control2 = CGPoint(x: end.x - tangent, y: end.y)
        let padding: CGFloat = 8
        let minX = min(start.x, end.x, control1.x, control2.x) - padding
        let maxX = max(start.x, end.x, control1.x, control2.x) + padding
        let minY = min(start.y, end.y, control1.y, control2.y) - padding
        let maxY = max(start.y, end.y, control1.y, control2.y) + padding
        let bounds = CGRect(x: minX, y: minY, width: max(maxX - minX, 1), height: max(maxY - minY, 1))

        var path = Path()
        path.move(to: local(start, in: bounds))
        path.addCurve(
            to: local(end, in: bounds),
            control1: local(control1, in: bounds),
            control2: local(control2, in: bounds)
        )

        return ZStack {
            if !isDraft {
                path.stroke(.black.opacity(0.38), lineWidth: lineWidth + 2.4)
            }
            path.stroke(
                color,
                style: StrokeStyle(
                    lineWidth: lineWidth,
                    lineCap: .round,
                    dash: isDraft ? [6, 4] : []
                )
            )
        }
        .frame(width: bounds.width, height: bounds.height)
        .position(x: bounds.midX, y: bounds.midY)
    }

    private func local(_ point: CGPoint, in bounds: CGRect) -> CGPoint {
        CGPoint(x: point.x - bounds.minX, y: point.y - bounds.minY)
    }
}

// MARK: - Node card

private struct WorkflowFrameView: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.workspaceWorkflowId) private var workflowId
    var frame: WorkflowFrame
    @State private var dragRemainder = CGSize.zero
    @State private var resizeRemainder = CGSize.zero
    @State private var showsSettings = false

    private var currentFrame: WorkflowFrame {
        store.workflow(id: workflowId).frames.first(where: { $0.id == frame.id }) ?? frame
    }

    private var isSelected: Bool {
        store.selectedWorkflowFrameIds.contains(frame.id)
    }

    var body: some View {
        VStack(spacing: 0) {
            frameHeader

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 7) {
                    Image(systemName: currentFrame.kind.symbol)
                    Text(store.workflowFrameSummary(currentFrame))
                        .lineLimit(1)
                    Spacer()
                    Text("\(currentFrame.nodeIds.count) node\(currentFrame.nodeIds.count == 1 ? "" : "s")")
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)

                if currentFrame.nodeIds.isEmpty {
                    Spacer()
                    Label("Arraste nodes para dentro deste frame", systemImage: "arrow.down.to.line.compact")
                        .font(.caption)
                        .foregroundStyle(.secondary.opacity(0.72))
                        .frame(maxWidth: .infinity, alignment: .center)
                    Spacer()
                } else {
                    Spacer(minLength: 0)
                }
            }
            .padding(12)
        }
        .frame(width: currentFrame.width, height: currentFrame.height, alignment: .topLeading)
        .background(currentFrame.kind.tint.opacity(currentFrame.isEnabled ? 0.09 : 0.035), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .strokeBorder(
                    frameBorderColor,
                    style: StrokeStyle(lineWidth: isDropTarget || isSelected ? 2 : 1, dash: currentFrame.isEnabled ? [] : [6, 4])
                )
        }
        .overlay(alignment: .bottomTrailing) {
            frameResizeHandle
        }
        .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .onTapGesture { store.selectWorkflowFrame(frame.id) }
        .contextMenu {
            if currentFrame.kind != .file {
                Button("Configurar Frame") { showsSettings = true }
            }
            Button("Transformar em Node") { store.convertWorkflowFrameToNode(currentFrame, workflowId: workflowId) }
            Button("Duplicar") { store.duplicateWorkflowFrame(currentFrame, workflowId: workflowId) }
            Divider()
            Button("Excluir Frame", role: .destructive) { store.deleteWorkflowFrame(frame.id, workflowId: workflowId) }
        }
        .popover(isPresented: $showsSettings, arrowEdge: .top) {
            WorkflowFrameSettingsPopover(frameId: frame.id)
                .environment(\.workspaceWorkflowId, workflowId)
                .environmentObject(store)
        }
    }

    private var frameHeader: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: currentFrame.kind.symbol)
                    .foregroundStyle(currentFrame.kind.tint)
                Text(currentFrame.name)
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
                if !currentFrame.isEnabled {
                    Text("PAUSADO")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
            }
            .contentShape(Rectangle())
            .gesture(frameDragGesture)

            Button {
                store.convertWorkflowFrameToNode(currentFrame, workflowId: workflowId)
            } label: {
                Image(systemName: "square")
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .help("Transformar Frame em Node")
            .accessibilityLabel("Transformar Frame em Node")

            if currentFrame.kind == .file {
                Button(action: chooseFrameFile) {
                    Image(systemName: "folder")
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .help("Escolher arquivo")
                .accessibilityLabel("Escolher arquivo do frame")
            }
        }
        .padding(.horizontal, 11)
        .frame(height: 36)
        .background(
            currentFrame.kind.tint.opacity(0.16),
            in: UnevenRoundedRectangle(topLeadingRadius: 15, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 15)
        )
    }

    private var isDropTarget: Bool {
        store.workflowFrameDropTargetId == frame.id
    }

    private var frameBorderColor: Color {
        if isDropTarget { return Color.white.opacity(0.82) }
        return isSelected ? currentFrame.kind.tint.opacity(0.9) : currentFrame.kind.tint.opacity(0.38)
    }

    private func chooseFrameFile() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        var updated = currentFrame
        updated.config["path"] = url.path
        if updated.name == frame.name || updated.name.isEmpty {
            updated.name = url.lastPathComponent
        }
        store.updateWorkflowFrame(updated, workflowId: workflowId)
    }

    private var frameDragGesture: some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .named("workflowViewport"))
            .onChanged { value in
                if dragRemainder == .zero, !isSelected { store.selectWorkflowFrame(frame.id) }
                let delta = CGSize(
                    width: value.translation.width - dragRemainder.width,
                    height: value.translation.height - dragRemainder.height
                )
                store.moveWorkflowFrame(id: frame.id, by: delta, workflowId: workflowId)
                dragRemainder = value.translation
            }
            .onEnded { _ in dragRemainder = .zero }
    }

    private var frameResizeHandle: some View {
        Image(systemName: "arrow.down.right")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(currentFrame.kind.tint.opacity(0.9))
            .frame(width: 28, height: 28)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 1, coordinateSpace: .named("workflowViewport"))
                    .onChanged { value in
                        let delta = CGSize(
                            width: value.translation.width - resizeRemainder.width,
                            height: value.translation.height - resizeRemainder.height
                        )
                        store.resizeWorkflowFrame(id: frame.id, by: delta, workflowId: workflowId)
                        resizeRemainder = value.translation
                    }
                    .onEnded { _ in resizeRemainder = .zero }
            )
            .help("Redimensionar Frame")
    }
}

private struct WorkflowFrameSettingsPopover: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.workspaceWorkflowId) private var workflowId
    var frameId: String

    private var frame: WorkflowFrame? {
        store.workflow(id: workflowId).frames.first(where: { $0.id == frameId })
    }

    var body: some View {
        if let frame {
            VStack(alignment: .leading, spacing: 13) {
                HStack {
                    Label("Configurar Frame", systemImage: frame.kind.symbol)
                        .font(.headline)
                    Spacer()
                    Toggle("Ativo", isOn: binding(\.isEnabled, fallback: false))
                        .toggleStyle(.switch)
                        .labelsHidden()
                }

                TextField("Nome do frame", text: binding(\.name, fallback: ""))
                    .textFieldStyle(.roundedBorder)

                Picker("Tipo", selection: binding(\.kind, fallback: .project)) {
                    ForEach(WorkflowFrameKind.allCases) { kind in
                        Label(kind.title, systemImage: kind.symbol).tag(kind)
                    }
                }

                Divider()
                frameSpecificControls(frame)

                HStack {
                    Text("\(frame.nodeIds.count) nodes neste escopo")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Transformar em Node") {
                        store.convertWorkflowFrameToNode(frame, workflowId: workflowId)
                    }
                }
            }
            .padding(16)
            .frame(width: 340)
        }
    }

    @ViewBuilder
    private func frameSpecificControls(_ frame: WorkflowFrame) -> some View {
        switch frame.kind {
        case .schedule:
            Picker("Agendamento", selection: configBinding("scheduleMode", fallback: "interval")) {
                Text("Intervalo").tag("interval")
                Text("Horário diário").tag("daily")
            }
            .pickerStyle(.segmented)
            if frame.config["scheduleMode"] == "daily" {
                TextField("Horário (HH:mm)", text: configBinding("time", fallback: "09:00"))
                    .textFieldStyle(.roundedBorder)
            } else {
                HStack {
                    Text("Executar a cada")
                    TextField("24", text: configBinding("intervalHours", fallback: "24"))
                        .frame(width: 62)
                    Text("horas")
                }
            }
        case .folder:
            pathSelector(title: "Pasta", directoriesOnly: true)
            Toggle("Incluir subpastas", isOn: boolConfigBinding("recursive", fallback: true))
        case .file:
            pathSelector(title: "Arquivo", directoriesOnly: false)
        case .project:
            Picker("Projeto", selection: configBinding("projectId", fallback: store.projects.first?.id ?? "")) {
                ForEach(store.projects.filter { !$0.isArchived }) { project in
                    Text(project.name).tag(project.id)
                }
            }
        case .condition:
            TextField("Expressão", text: configBinding("expression", fallback: "enabled == true"))
                .textFieldStyle(.roundedBorder)
            Toggle("Condição satisfeita", isOn: boolConfigBinding("result", fallback: true))
        case .approval:
            Toggle("Execução aprovada", isOn: boolConfigBinding("approved", fallback: false))
            Text("Os nodes ficam aguardando até este frame ser aprovado.")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .parallel:
            HStack {
                Text("Concorrência máxima")
                TextField("3", text: configBinding("maxConcurrency", fallback: "3"))
                    .frame(width: 58)
            }
        }
    }

    private func pathSelector(title: String, directoriesOnly: Bool) -> some View {
        HStack(spacing: 8) {
            TextField(title, text: configBinding("path", fallback: ""))
                .textFieldStyle(.roundedBorder)
            Button("Escolher…") {
                let panel = NSOpenPanel()
                panel.canChooseDirectories = directoriesOnly
                panel.canChooseFiles = !directoriesOnly
                panel.allowsMultipleSelection = false
                guard panel.runModal() == .OK, let url = panel.url else { return }
                var updated = frame
                updated?.config["path"] = url.path
                if let updated { store.updateWorkflowFrame(updated, workflowId: workflowId) }
            }
        }
    }

    private func binding<T>(_ keyPath: WritableKeyPath<WorkflowFrame, T>, fallback: T) -> Binding<T> {
        Binding {
            frame?[keyPath: keyPath] ?? fallback
        } set: { value in
            guard var updated = frame else { return }
            updated[keyPath: keyPath] = value
            store.updateWorkflowFrame(updated, workflowId: workflowId)
        }
    }

    private func configBinding(_ key: String, fallback: String) -> Binding<String> {
        Binding {
            frame?.config[key] ?? fallback
        } set: { value in
            guard var updated = frame else { return }
            updated.config[key] = value
            store.updateWorkflowFrame(updated, workflowId: workflowId)
        }
    }

    private func boolConfigBinding(_ key: String, fallback: Bool) -> Binding<Bool> {
        Binding {
            guard let value = frame?.config[key] else { return fallback }
            return value.lowercased() == "true"
        } set: { value in
            guard var updated = frame else { return }
            updated.config[key] = value ? "true" : "false"
            store.updateWorkflowFrame(updated, workflowId: workflowId)
        }
    }

}

private struct WorkflowNodeCard: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.workspaceWorkflowId) private var workflowId
    var node: WorkflowNode
    @State private var dragRemainder = CGSize.zero

    private var workflow: Workflow {
        store.workflow(id: workflowId)
    }

    private var isSelected: Bool {
        store.selectedWorkflowNodeIds.contains(node.id)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 9) {
                portRow(1, label: "Nome do Nó") {
                    nodeTextField("Nome do Nó", value: binding(\.name))
                }
                portRow(2, label: "Descrição") {
                    TextEditor(text: binding(\.description))
                        .font(.caption2)
                        .scrollContentBackground(.hidden)
                        .frame(height: 46)
                        .padding(4)
                        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
                }

                Divider()
                nodeSpecificControls
            }
            .padding(12)
        }
        .frame(width: 260)
        .frame(minHeight: 190)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(borderColor, lineWidth: isSelected ? 2 : 1)
        }
        .shadow(color: .black.opacity(0.16), radius: 12, y: 6)
        .aiProcessingGlow(isActive: node.status == .running, cornerRadius: 13, style: .border)
        .overlayPreferenceValue(WorkflowRowAnchorsKey.self) { anchors in
            GeometryReader { geo in
                // Ports only on inner rows (index >= 1); the colored header never carries ports.
                let keys = anchors.keys
                    .filter { $0.nodeId == node.id && $0.index >= 1 }
                    .sorted { $0.index < $1.index }
                ForEach(keys, id: \.self) { key in
                    if let anchor = anchors[key] {
                        let rect = geo[anchor]
                        portCircle(index: key.index, isOutput: false)
                            .position(x: 0, y: rect.midY)
                        portCircle(index: key.index, isOutput: true)
                            .position(x: geo.size.width, y: rect.midY)
                    }
                }
            }
        }
        .background {
            GeometryReader { geo in
                Color.clear
                    .preference(key: WorkflowNodeSizesKey.self, value: [node.id: geo.size])
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .onTapGesture {
            store.selectWorkflowNode(node.id)
        }
        .contextMenu {
            Button("Transformar em Frame") { store.convertWorkflowNodeToFrame(node, workflowId: workflowId) }
            Button("Duplicar") { store.duplicateWorkflowNode(node, workflowId: workflowId) }
            Button("Excluir", role: .destructive) { store.deleteWorkflowNode(node.id, workflowId: workflowId) }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: node.type.symbol)
                    .foregroundStyle(node.type.tint)
                Text(node.name)
                    .font(.caption.weight(.bold))
                    .textCase(.uppercase)
                    .lineLimit(1)
                Spacer(minLength: 6)
            }
            .contentShape(Rectangle())
            .gesture(dragGesture)

            Button {
                store.convertWorkflowNodeToFrame(node, workflowId: workflowId)
            } label: {
                Image(systemName: "rectangle.3.group")
                    .font(.system(size: 10, weight: .semibold))
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .help("Transformar Node em Frame")
            .accessibilityLabel("Transformar Node em Frame")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            node.type.tint.opacity(0.16),
            in: UnevenRoundedRectangle(
                topLeadingRadius: 13,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 13,
                style: .continuous
            )
        )
    }

    // Node drag lives on the header only, so text fields and controls never fight it.
    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .named("workflowViewport"))
            .onChanged { value in
                if dragRemainder == .zero, !isSelected {
                    store.selectWorkflowNode(node.id)
                }
                let delta = CGSize(
                    width: value.translation.width - dragRemainder.width,
                    height: value.translation.height - dragRemainder.height
                )
                store.moveWorkflowNode(id: node.id, by: delta, workflowId: workflowId)
                store.updateWorkflowFrameDropTarget(for: node.id, workflowId: workflowId)
                dragRemainder = value.translation
            }
            .onEnded { _ in
                dragRemainder = .zero
                store.assignWorkflowNodeToContainingFrame(node.id, workflowId: workflowId)
            }
    }

    private var borderColor: Color {
        isSelected ? .accentColor : Color.primary.opacity(0.12)
    }

    @ViewBuilder private var nodeSpecificControls: some View {
        switch node.type {
        case .trigger:
            pickerConfig("Intervalo Rápido", key: "schedule", values: ["*/1 * * * *", "*/5 * * * *", "0 * * * *", "0 0 * * *"], port: 3)
            configText("Expressão Cron Custom", key: "schedule", port: 4)
        case .watcher, .folder:
            pathConfig("Diretório de Monitoramento", key: "path", port: 3, directoriesOnly: true)
            if node.type == .folder {
                pickerConfig("Ação do Agente", key: "action", values: ["monitorar", "listar", "limpar"], port: 4)
            }
        case .agent:
            pickerConfig("Modelo LLM", key: "model", values: ModelId.allCases.map(\.rawValue), port: 3)
            portRow(4) {
                BlenderSlider(
                    label: "Temperatura",
                    value: doubleBinding(\.temperature, fallback: 0.4),
                    range: 0...1,
                    step: 0.1,
                    format: "%.1f"
                )
            }
        case .optimizer:
            portRow(3) {
                Toggle("Auto-Otimização", isOn: boolBinding(\.allowSelfEdit))
                    .font(.caption)
            }
            portRow(4) {
                Text("Permite ao agente alterar conexões subsequentes dinamicamente.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        case .reader:
            pathConfig("Arquivo de Entrada", key: "path", port: 3)
            pickerConfig("Codificação", key: "encoding", values: ["utf-8", "utf-16", "iso-8859-1"], port: 4)
        case .writer:
            pathConfig("Arquivo de Saída", key: "outputPath", port: 3)
        case .notifier:
            configText("Webhook de Notificação", key: "webhookUrl", port: 3)
            configText("Mensagem", key: "messageText", port: 4)
        case .prompt:
            configText("Prompt de Sistema", key: "systemPrompt", port: 3)
            configText("Template do Prompt", key: "userPrompt", port: 4)
        case .openProgram:
            pathConfig("Executável ou App", key: "programPath", port: 3)
            configText("Argumentos", key: "arguments", port: 4)
        case .gmail:
            pickerConfig("Ação Gmail", key: "apiAction", values: ["send_email", "get_emails", "mark_read"], port: 3)
            configText("Destinatário", key: "recipient", port: 4)
            configText("Assunto", key: "subject", port: 5)
        case .googleDrive:
            pickerConfig("Ação Drive", key: "apiAction", values: ["upload_file", "create_folder", "get_file"], port: 3)
            configText("Pasta de Destino", key: "driveFolder", port: 4)
        case .whatsapp:
            configText("Número WhatsApp", key: "phoneNumber", port: 3)
            configText("Mensagem", key: "messageText", port: 4)
        case .telegram:
            configText("ID do Chat", key: "chatId", port: 3)
            configText("Bot Token", key: "botToken", port: 4)
        case .runtimeAction:
            runtimeActionControls
        default:
            configText("Título", key: "title", port: 3)
        }
    }

    private var runtimeActionControls: some View {
        VStack(alignment: .leading, spacing: 9) {
            portRow(3) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(currentNode.runtimeAction?.title ?? "Runtime")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                        Spacer()
                        if currentNode.requiresApproval {
                            Image(systemName: "hand.raised.fill")
                                .foregroundStyle(.orange)
                                .help("Exige aprovacao antes de executar")
                        }
                    }
                    ProgressView(value: currentNode.progress ?? 0, total: 1)
                    Text(currentNode.lastLogLine ?? "Aguardando execucao.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
            }

            if let command = currentNode.commandPreview {
                portRow(4) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Comando")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                        Text(command)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                            .lineLimit(4)
                            .padding(7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
                    }
                }
            }

            portRow(5) {
                HStack(spacing: 6) {
                    Button {
                        store.retryRuntimeNode(currentNode)
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .help("Repetir via reparo")

                    Button {
                        store.skipRuntimeNode(currentNode)
                    } label: {
                        Image(systemName: "forward.end")
                    }
                    .buttonStyle(.borderless)
                    .help("Pular node")

                    Button {
                        store.openRuntimeNodeTerminal(currentNode)
                    } label: {
                        Image(systemName: "terminal")
                    }
                    .buttonStyle(.borderless)
                    .help("Abrir terminal")

                    Button {
                        store.copyRuntimeLogs()
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.borderless)
                    .help("Copiar logs do runtime")

                    Spacer()
                }
            }
        }
    }

    // A âncora da bolinha de conexão fica só no controle (não no label acima),
    // então a bolinha centraliza com o item que ela representa.
    private func portRow<Content: View>(_ index: Int, label: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            if let label {
                Text(label)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
            }
            content()
                .anchorPreference(key: WorkflowRowAnchorsKey.self, value: .bounds) {
                    [WorkflowRowKey(nodeId: node.id, index: index): $0]
                }
        }
    }

    private func portCircle(index: Int, isOutput: Bool) -> some View {
        let portId = WorkflowPortID(nodeId: node.id, port: index, isOutput: isOutput)
        let isActiveSource = store.connectionDragFrom == portId
            || (isOutput && store.connectingFromPort == WorkflowPortRef(nodeId: node.id, port: index))
        let tapCandidate = !isOutput && store.connectingFromPort != nil && store.connectingFromPort?.nodeId != node.id
        let dragCandidate = store.connectionDragFrom.map { $0.isOutput != isOutput && $0.nodeId != node.id } ?? false
        let isTargetCandidate = tapCandidate || dragCandidate

        return Circle()
            .fill(Color.white)
            .frame(width: 9, height: 9)
            .overlay {
                Circle()
                    .strokeBorder(
                        isActiveSource ? Color.accentColor : (isTargetCandidate ? Color.accentColor.opacity(0.9) : Color.black.opacity(0.5)),
                        lineWidth: isActiveSource || isTargetCandidate ? 2 : 1
                    )
            }
            .frame(width: 18, height: 18)
            .contentShape(Circle())
            .onTapGesture {
                store.handlePortTap(nodeId: node.id, port: index, isOutput: isOutput, workflowId: workflowId)
            }
            .gesture(
                DragGesture(minimumDistance: 3, coordinateSpace: .named("workflowStage"))
                    .onChanged { value in
                        store.connectionDragFrom = portId
                        store.connectionDragPoint = value.location
                    }
                    .onEnded { value in
                        store.completeConnectionDrag(at: value.location, workflowId: workflowId)
                    }
            )
            .anchorPreference(key: WorkflowPortCentersKey.self, value: .center) {
                [portId: $0]
            }
            .help(isOutput ? "Porta de saída — arraste até uma porta de entrada" : "Porta de entrada")
            .accessibilityLabel(isOutput ? "Saída \(index) de \(node.name)" : "Entrada \(index) de \(node.name)")
    }

    private var currentNode: WorkflowNode {
        workflow.nodes.first(where: { $0.id == node.id }) ?? node
    }

    private func nodeTextField(_ placeholder: String, value: Binding<String>) -> some View {
        TextField(placeholder, text: value)
            .font(.caption2.weight(.semibold))
            .textFieldStyle(.plain)
            .padding(6)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
    }

    private func configText(_ label: String, key: String, port: Int) -> some View {
        portRow(port, label: label) {
            nodeTextField(label, value: configBinding(key))
        }
    }

    private func pathConfig(_ label: String, key: String, port: Int, directoriesOnly: Bool = false) -> some View {
        portRow(port, label: label) {
            HStack(spacing: 6) {
                nodeTextField(label, value: configBinding(key))
                Button {
                    pickPath(key: key, directoriesOnly: directoriesOnly)
                } label: {
                    Image(systemName: directoriesOnly ? "folder" : "doc.badge.ellipsis")
                        .font(.system(size: 10, weight: .semibold))
                        .frame(width: 24, height: 24)
                        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 7))
                }
                .buttonStyle(.plain)
                .help(directoriesOnly ? "Escolher pasta" : "Escolher arquivo")
            }
        }
    }

    private func pickPath(key: String, directoriesOnly: Bool) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = directoriesOnly
        panel.canChooseFiles = !directoriesOnly
        panel.allowsMultipleSelection = false
        panel.treatsFilePackagesAsDirectories = false
        panel.prompt = "Escolher"
        if panel.runModal() == .OK, let url = panel.url {
            var updated = currentNode
            updated.config[key] = url.path
            store.updateWorkflowNode(updated, workflowId: workflowId)
        }
    }

    private func pickerConfig(_ label: String, key: String, values: [String], port: Int) -> some View {
        portRow(port, label: label) {
            NodeDropdown(values: values, selection: configBinding(key))
        }
    }

    private func binding(_ keyPath: WritableKeyPath<WorkflowNode, String>) -> Binding<String> {
        Binding {
            currentNode[keyPath: keyPath]
        } set: { value in
            var updated = currentNode
            updated[keyPath: keyPath] = value
            store.updateWorkflowNode(updated, workflowId: workflowId)
        }
    }

    private func configBinding(_ key: String) -> Binding<String> {
        Binding {
            currentNode.config[key, default: ""]
        } set: { value in
            var updated = currentNode
            updated.config[key] = value
            store.updateWorkflowNode(updated, workflowId: workflowId)
        }
    }

    private func doubleBinding(_ keyPath: WritableKeyPath<WorkflowNode, Double?>, fallback: Double) -> Binding<Double> {
        Binding {
            currentNode[keyPath: keyPath] ?? fallback
        } set: { value in
            var updated = currentNode
            updated[keyPath: keyPath] = value
            store.updateWorkflowNode(updated, workflowId: workflowId)
        }
    }

    private func boolBinding(_ keyPath: WritableKeyPath<WorkflowNode, Bool>) -> Binding<Bool> {
        Binding {
            currentNode[keyPath: keyPath]
        } set: { value in
            var updated = currentNode
            updated[keyPath: keyPath] = value
            store.updateWorkflowNode(updated, workflowId: workflowId)
        }
    }
}

// MARK: - Node dropdown

/// Dropdown com o mesmo visual dos outros campos do node: fundo igual,
/// largura total e seta para baixo na extrema direita.
private struct NodeDropdown: View {
    var values: [String]
    @Binding var selection: String
    @State private var isOpen = false

    private var currentValue: String {
        selection.isEmpty ? (values.first ?? "") : selection
    }

    var body: some View {
        Button {
            isOpen.toggle()
        } label: {
            HStack(spacing: 6) {
                Text(currentValue)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(6)
            .frame(maxWidth: .infinity)
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.primary.opacity(0.1)))
            .contentShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .help("Selecionar opção")
        .popover(isPresented: $isOpen, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(values, id: \.self) { value in
                    Button {
                        selection = value
                        isOpen = false
                    } label: {
                        HStack {
                            Text(value)
                                .font(.caption2.weight(.semibold))
                            Spacer(minLength: 12)
                            if value == currentValue {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 9, weight: .bold))
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(value == currentValue ? Color.accentColor.opacity(0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .frame(minWidth: 190, alignment: .leading)
        }
    }
}

// MARK: - Blender-style slider

/// Slider no estilo Blender: barra arredondada com preenchimento proporcional,
/// label à esquerda e valor à direita; arrastar horizontalmente altera o valor.
private struct BlenderSlider: View {
    var label: String
    @Binding var value: Double
    var range: ClosedRange<Double> = 0...1
    var step: Double = 0.1
    var format: String = "%.3f"
    @State private var dragStartValue: Double?

    private var span: Double {
        max(range.upperBound - range.lowerBound, .ulpOfOne)
    }

    var body: some View {
        GeometryReader { geo in
            let fraction = CGFloat((value - range.lowerBound) / span)
            ZStack(alignment: .leading) {
                Color.primary.opacity(0.09)
                Color.accentColor
                    .frame(width: max(0, min(geo.size.width, geo.size.width * fraction)))
                HStack {
                    Text(label)
                    Spacer(minLength: 8)
                    Text(String(format: format, value))
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity)
            }
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        if dragStartValue == nil {
                            dragStartValue = value
                        }
                        let start = dragStartValue ?? value
                        let delta = Double(drag.translation.width / max(geo.size.width, 1)) * span
                        let raw = start + delta
                        let stepped = step > 0 ? (raw / step).rounded() * step : raw
                        value = min(range.upperBound, max(range.lowerBound, stepped))
                    }
                    .onEnded { _ in
                        dragStartValue = nil
                    }
            )
        }
        .frame(height: 22)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Background grid

private struct GridBackground: View {
    var offset: CGSize
    var zoom: CGFloat
    var hoverPoint: CGPoint?

    var body: some View {
        Canvas { context, size in
            let spacing = max(10, 22 * max(zoom, 0.4))
            // The grid follows canvas zoom, while each dot remains the same
            // physical size on screen so it never becomes visually heavy.
            let dotSize: CGFloat = 1.2
            let startX = wrapped(offset.width, by: spacing) - spacing
            let startY = wrapped(offset.height, by: spacing) - spacing
            var base = Path()
            var glowPaths = [Path(), Path(), Path(), Path()]
            var x = startX
            while x < size.width + spacing {
                var y = startY
                while y < size.height + spacing {
                    let rect = CGRect(x: x, y: y, width: dotSize, height: dotSize)
                    base.addEllipse(in: rect)
                    if let hoverPoint {
                        let distance = hypot(x - hoverPoint.x, y - hoverPoint.y)
                        if distance < 88 {
                            let band = min(3, max(0, Int((88 - distance) / 22)))
                            glowPaths[band].addEllipse(in: rect.insetBy(dx: -CGFloat(band) * 0.08, dy: -CGFloat(band) * 0.08))
                        }
                    }
                    y += spacing
                }
                x += spacing
            }
            context.fill(base, with: .color(.white.opacity(0.1)))
            let opacity: [Double] = [0.14, 0.2, 0.29, 0.43]
            for index in glowPaths.indices {
                context.fill(glowPaths[index], with: .color(.white.opacity(opacity[index])))
            }
        }
        .animation(.easeOut(duration: 0.12), value: hoverPoint)
    }

    private func wrapped(_ value: CGFloat, by spacing: CGFloat) -> CGFloat {
        let remainder = value.truncatingRemainder(dividingBy: spacing)
        return remainder >= 0 ? remainder : remainder + spacing
    }
}
