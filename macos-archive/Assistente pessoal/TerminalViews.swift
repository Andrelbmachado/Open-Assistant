import SwiftUI

struct TerminalGridView: View {
    @EnvironmentObject private var store: AssistantStore
    var terminalIds: [String]? = nil

    var body: some View {
            VStack(spacing: 0) {
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        Color.black.opacity(0.22)

                        // Janelas agrupadas ocupam toda a área, sem espaçamento.
                        let grouped = store.groupedTerminals(ids: terminalIds)
                        ForEach(Array(grouped.enumerated()), id: \.element.id) { index, shell in
                            let frame = tileFrame(index: index, count: grouped.count, in: geo.size)
                            ShellTerminalCard(shell: shell, tiled: true, canvasSize: geo.size, tiledOrigin: frame.origin)
                                .frame(width: frame.width, height: frame.height)
                                .offset(x: frame.minX, y: frame.minY)
                        }

                        // Janelas soltas: posicionadas livremente, arrastáveis.
                        ForEach(store.floatingTerminals(ids: terminalIds)) { shell in
                            if let frame = store.terminalFloatingFrames[shell.id] {
                                ShellTerminalCard(shell: shell, tiled: false, canvasSize: geo.size, tiledOrigin: frame.origin)
                                    .frame(width: frame.width, height: frame.height)
                                    .offset(x: frame.minX, y: frame.minY)
                                    .shadow(color: .black.opacity(0.45), radius: 18, y: 8)
                            }
                        }
                    }
                }

                if store.showBottomTerminal {
                    CollapsibleBottomTerminal(isPresented: $store.showBottomTerminal)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Calcula o frame de cada janela agrupada preenchendo toda a área sem gaps.
    private func tileFrame(index: Int, count: Int, in size: CGSize) -> CGRect {
        guard count > 0 else { return .zero }
        if store.terminalTileAxis == .horizontal {
            let w = size.width / CGFloat(count)
            return CGRect(x: w * CGFloat(index), y: 0, width: w, height: size.height)
        } else {
            let h = size.height / CGFloat(count)
            return CGRect(x: 0, y: h * CGFloat(index), width: size.width, height: h)
        }
    }
}

private struct ShellTerminalCard: View {
    @EnvironmentObject private var store: AssistantStore
    @ObservedObject var shell: ShellSession
    var tiled: Bool
    var canvasSize: CGSize
    /// Origem atual da janela na área (usada para calcular o destaque por drag).
    var tiledOrigin: CGPoint

    @State private var dragStartOrigin: CGPoint?

    var body: some View {
        VStack(spacing: 0) {
            titleBar
            ShellTerminalPane(shell: shell)
        }
        .clipShape(RoundedRectangle(cornerRadius: tiled ? 0 : 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: tiled ? 0 : 12, style: .continuous)
                .strokeBorder(Color.primary.opacity(tiled ? 0.14 : 0.28), lineWidth: tiled ? 0.5 : 1)
        }
        .contextMenu {
            if tiled {
                Button("Soltar Janela", systemImage: "rectangle.dashed") {
                    detach(startDelta: .zero)
                }
            } else {
                Button("Reagrupar", systemImage: "rectangle.grid.1x2") {
                    store.regroupTerminals(axis: store.terminalTileAxis)
                }
            }
            Divider()
            Button("Agrupar Horizontal", systemImage: "rectangle.split.3x1") {
                store.regroupTerminals(axis: .horizontal)
            }
            Button("Agrupar Vertical", systemImage: "rectangle.split.1x2") {
                store.regroupTerminals(axis: .vertical)
            }
            Divider()
            Button("Fechar", role: .destructive) { store.closeShellTerminal(shell.id) }
        }
    }

    private var titleBar: some View {
        HStack(spacing: 8) {
            // Só a área de nome/status arrasta a janela; os botões abaixo ficam
            // fora do gesture para não competir com o tap.
            HStack(spacing: 8) {
                Text(shell.title)
                    .font(.caption.monospaced().weight(.bold))
                    .textCase(.uppercase)
                    .lineLimit(1)
                    .padding(.leading, 70)
                StatusPill(title: shell.isRunning ? "ativo" : "encerrado", tint: shell.isRunning ? .green : .secondary)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 4, coordinateSpace: .local)
                    .onChanged { value in
                        if tiled {
                            // Ao começar a arrastar uma janela agrupada, ela se solta.
                            detach(startDelta: value.translation)
                        } else {
                            if dragStartOrigin == nil {
                                dragStartOrigin = store.terminalFloatingFrames[shell.id]?.origin
                            }
                            moveFloating(translation: value.translation)
                        }
                    }
                    .onEnded { _ in
                        dragStartOrigin = nil
                        if !tiled { snapIfAtEdge() }
                    }
            )

            Spacer()

            // Botões de agrupamento por janela.
            Button {
                store.regroupTerminals(axis: .horizontal)
            } label: {
                Image(systemName: "rectangle.split.3x1")
            }
            .buttonStyle(.borderless)
            .help("Agrupar horizontalmente")

            Button {
                store.regroupTerminals(axis: .vertical)
            } label: {
                Image(systemName: "rectangle.split.1x2")
            }
            .buttonStyle(.borderless)
            .help("Agrupar verticalmente")

            if !tiled {
                Button {
                    store.regroupTerminals(axis: store.terminalTileAxis)
                } label: {
                    Image(systemName: "arrow.down.right.and.arrow.up.left.rectangle")
                }
                .buttonStyle(.borderless)
                .help("Reagrupar")
            }

            Button(role: .destructive) {
                store.closeShellTerminal(shell.id)
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .padding(.trailing, 20)
            .help("Fechar")
        }
        .frame(height: 28)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
    }

    /// Se a janela solta encostar numa borda do app, reagrupa (prende de volta).
    private func snapIfAtEdge() {
        guard let frame = store.terminalFloatingFrames[shell.id] else { return }
        let margin: CGFloat = 24
        let atLeft = frame.minX <= margin
        let atRight = frame.maxX >= canvasSize.width - margin
        let atTop = frame.minY <= margin
        let atBottom = frame.maxY >= canvasSize.height - margin
        if atLeft || atRight {
            store.regroupTerminals(axis: .horizontal)
        } else if atTop || atBottom {
            store.regroupTerminals(axis: .vertical)
        }
    }

    /// Solta a janela em posição absoluta, tornando-a flutuante.
    private func detach(startDelta: CGSize) {
        let size = CGSize(
            width: min(max(canvasSize.width * 0.5, 320), canvasSize.width - 24),
            height: min(max(canvasSize.height * 0.55, 260), canvasSize.height - 24)
        )
        var origin = CGPoint(
            x: tiledOrigin.x + startDelta.width,
            y: tiledOrigin.y + startDelta.height
        )
        origin.x = min(max(0, origin.x), max(0, canvasSize.width - size.width))
        origin.y = min(max(0, origin.y), max(0, canvasSize.height - size.height))
        store.detachTerminal(shell.id, frame: CGRect(origin: origin, size: size))
    }

    private func moveFloating(translation: CGSize) {
        guard let frame = store.terminalFloatingFrames[shell.id],
              let start = dragStartOrigin else { return }
        var origin = CGPoint(x: start.x + translation.width, y: start.y + translation.height)
        origin.x = min(max(0, origin.x), max(0, canvasSize.width - frame.width))
        origin.y = min(max(0, origin.y), max(0, canvasSize.height - frame.height))
        store.moveFloatingTerminal(shell.id, to: origin)
    }
}

/// Shared interactive view over a live ShellSession: scrolling output plus an inline prompt.
struct ShellTerminalPane: View {
    @ObservedObject var shell: ShellSession
    var fontSize: CGFloat = 11

    @State private var input = ""
    @FocusState private var promptFocused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(shell.lines) { line in
                        Text(line.text)
                            .font(.system(size: fontSize, weight: line.isInput ? .bold : .regular, design: .monospaced))
                            .foregroundStyle(line.isInput ? Color.green : Color.green.opacity(0.85))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack(spacing: 6) {
                        Text(shell.pendingPrompt.isEmpty ? "$" : shell.pendingPrompt)
                            .font(.system(size: fontSize, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.green)
                            .lineLimit(1)
                        TextField("", text: $input)
                            .textFieldStyle(.plain)
                            .font(.system(size: fontSize, design: .monospaced))
                            .foregroundStyle(Color.green)
                            .tint(Color.green)
                            .focused($promptFocused)
                            .disabled(!shell.isRunning)
                            .onSubmit {
                                shell.send(input)
                                input = ""
                                promptFocused = true
                            }
                    }
                    .id("prompt-row")
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: shell.lines.count) { _, _ in
                proxy.scrollTo("prompt-row", anchor: .bottom)
            }
            .onChange(of: shell.pendingPrompt) { _, _ in
                proxy.scrollTo("prompt-row", anchor: .bottom)
            }
            .onAppear {
                proxy.scrollTo("prompt-row", anchor: .bottom)
            }
        }
        .background(Color.black.opacity(0.85))
        .contentShape(Rectangle())
        .onTapGesture {
            promptFocused = true
        }
    }
}
