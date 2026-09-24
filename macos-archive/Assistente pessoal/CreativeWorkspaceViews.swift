import AVFoundation
import AVKit
import AppKit
import Charts
import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

actor MarketplaceSearchService {
    private struct SearchResponse: Decodable { var results: [Item] }
    private struct Item: Decodable {
        var id: String
        var title: String
        var price: Double?
        var currency_id: String
        var thumbnail: String?
        var permalink: String
    }

    func search(_ query: String) async throws -> [ProductSearchResult] {
        guard var components = URLComponents(string: "https://api.mercadolibre.com/sites/MLB/search") else { return [] }
        components.queryItems = [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "24")]
        guard let url = components.url else { return [] }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return [] }
        let decoded = try JSONDecoder().decode(SearchResponse.self, from: data)
        return decoded.results.compactMap { item in
            guard let productURL = URL(string: item.permalink) else { return nil }
            return ProductSearchResult(
                id: item.id,
                title: item.title,
                price: item.price,
                currency: item.currency_id,
                source: "Mercado Livre",
                imageURL: item.thumbnail.flatMap(URL.init(string:)),
                productURL: productURL,
                rating: nil
            )
        }
    }
}

struct MarketplaceView: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var errorMessage: String?
    @State private var selectedCategory = "Todos"
    @State private var freeShippingOnly = false
    @State private var sortOrder = "Relevância"
    private let service = MarketplaceSearchService()

    private let externalStores: [(String, String, String)] = [
        ("Amazon", "shippingbox", "https://www.amazon.com.br/s?k="),
        ("KaBuM!", "desktopcomputer", "https://www.kabum.com.br/busca/"),
        ("Google Shopping", "cart", "https://www.google.com/search?tbm=shop&q=")
    ]
    private let categories = ["Todos", "Computadores", "Eletrônicos", "Casa", "Foto e vídeo", "Games", "Ferramentas", "Acessórios"]

    private var visibleResults: [ProductSearchResult] {
        var results = store.marketplaceResults
        if selectedCategory != "Todos" {
            let terms: [String: [String]] = [
                "Computadores": ["notebook", "computador", "monitor", "ssd"],
                "Eletrônicos": ["fone", "celular", "smart", "tv"],
                "Casa": ["casa", "cozinha", "cadeira", "mesa"],
                "Foto e vídeo": ["camera", "câmera", "lente", "tripé"],
                "Games": ["game", "console", "controle", "gamer"],
                "Ferramentas": ["furadeira", "ferramenta", "parafusadeira"],
                "Acessórios": ["cabo", "carregador", "suporte", "case"]
            ]
            let needles = terms[selectedCategory] ?? []
            results = results.filter { item in needles.contains { item.title.localizedCaseInsensitiveContains($0) } }
        }
        if sortOrder == "Menor preço" { results.sort { ($0.price ?? .greatestFiniteMagnitude) < ($1.price ?? .greatestFiniteMagnitude) } }
        if sortOrder == "Maior preço" { results.sort { ($0.price ?? 0) > ($1.price ?? 0) } }
        return results
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Categorias").font(.headline).padding(.horizontal, 14).padding(.top, 18)
                ForEach(categories, id: \.self) { category in
                    Button { selectedCategory = category } label: {
                        HStack {
                            Text(category)
                            Spacer()
                            if category == selectedCategory { Image(systemName: "checkmark").font(.caption) }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                        .background(category == selectedCategory ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain)
                }
                Divider().padding(.vertical, 8)
                Text("Lojas").font(.headline).padding(.horizontal, 14)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(externalStores, id: \.0) { storeInfo in
                        Button { openExternal(base: storeInfo.2) } label: {
                            Label(storeInfo.0, systemImage: storeInfo.1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 10)
                                .frame(height: 32)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Spacer()
            }
            .padding(8)
            .frame(width: 205)
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.55))

            Divider()

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Marketplace").font(.title2.weight(.semibold))
                        Text("Compare produtos e continue a compra na loja de origem.").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    TextField("Buscar no Marketplace", text: $store.marketplaceQuery)
                        .textFieldStyle(.roundedBorder).frame(maxWidth: 420).onSubmit { search() }
                    Button("Buscar", action: search).buttonStyle(.borderedProminent)
                        .disabled(store.marketplaceQuery.trimmingCharacters(in: .whitespaces).isEmpty || store.marketplaceIsSearching)
                }
                .padding(20)

                HStack(spacing: 10) {
                    FlatDropdown(title: "Ordenar", values: ["Relevância", "Menor preço", "Maior preço"], selection: $sortOrder, width: 210)
                    Toggle("Frete grátis", isOn: $freeShippingOnly).toggleStyle(.checkbox)
                        .disabled(true)
                        .help("Disponível quando a fonte retornar dados de frete")
                    Text("Mercado Livre").font(.caption).padding(.horizontal, 9).frame(height: 28)
                        .background(Color.primary.opacity(0.06), in: Capsule())
                    Spacer()
                    Text("\(visibleResults.count) itens").font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
                Divider()

                if store.marketplaceIsSearching {
                    ProgressView("Buscando ofertas…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if store.marketplaceResults.isEmpty {
                    ContentUnavailableView {
                        Label("Encontre o que precisa", systemImage: "storefront")
                    } description: {
                        Text(errorMessage ?? "Pesquise no Mercado Livre ou abra a busca nas demais lojas.")
                    }
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], spacing: 12) {
                            ForEach(visibleResults) { product in ProductResultView(product: product) }
                        }
                        .padding(20)
                    }
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var externalStoreButtons: some View {
        HStack(spacing: 8) {
            ForEach(externalStores, id: \.0) { storeInfo in
                Button {
                    openExternal(base: storeInfo.2)
                } label: {
                    Label(storeInfo.0, systemImage: storeInfo.1)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func search() {
        let query = store.marketplaceQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        errorMessage = nil
        store.marketplaceIsSearching = true
        Task {
            do {
                store.marketplaceResults = try await service.search(query)
                if store.marketplaceResults.isEmpty { errorMessage = "Nenhum produto encontrado." }
            } catch {
                errorMessage = "A busca está indisponível: \(error.localizedDescription)"
            }
            store.marketplaceIsSearching = false
        }
    }

    private func openExternal(base: String) {
        let encoded = store.marketplaceQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: base + encoded) else { return }
        NSWorkspace.shared.open(url)
    }
}

private struct ProductResultView: View {
    var product: ProductSearchResult
    @State private var hovered = false

    var body: some View {
        Button { NSWorkspace.shared.open(product.productURL) } label: {
            VStack(alignment: .leading, spacing: 10) {
                AsyncImage(url: product.imageURL) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFit()
                    } else {
                        Image(systemName: "photo").font(.largeTitle).foregroundStyle(.tertiary)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 150, maxHeight: 150)
                .background(Color(nsColor: .controlBackgroundColor))

                Text(product.source).font(.caption).foregroundStyle(.secondary)
                Text(product.title).font(.callout.weight(.medium)).lineLimit(2)
                if let price = product.price {
                    Text(price, format: .currency(code: product.currency))
                        .font(.headline)
                }
                Label("Abrir na loja", systemImage: "arrow.up.right")
                    .font(.caption).foregroundStyle(Color.accentColor)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 270, alignment: .topLeading)
            .background(Color(nsColor: .windowBackgroundColor))
            .overlay(alignment: .bottom) {
                if hovered { Rectangle().fill(Color.accentColor).frame(height: 2) }
            }
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}

struct DashboardWorkspaceView: View {
    @EnvironmentObject private var store: AssistantStore
    var dashboardId: String?
    @State private var selectedSection = "Visão geral"
    @State private var selectedPeriod = "1 ano"

    private var dashboard: DashboardDocument? {
        dashboardId.flatMap { id in store.dashboards.first(where: { $0.id == id }) }
    }

    var body: some View {
        if let dashboard {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Dashboard", systemImage: "square.grid.2x2").font(.headline).padding(12)
                    ForEach(["Visão geral", "Relatórios", "Financeiro", "Atividades", "Configurações"], id: \.self) { section in
                        Button { selectedSection = section } label: {
                            HStack {
                                Image(systemName: dashboardSymbol(section)).frame(width: 18)
                                Text(section)
                                Spacer()
                            }
                            .padding(.horizontal, 11).frame(height: 36)
                            .background(section == selectedSection ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    Text("Atualizado \(dashboard.updatedAt, style: .relative)").font(.caption).foregroundStyle(.secondary)
                }
                .padding(10).frame(width: 205)
                .background(Color(nsColor: .controlBackgroundColor).opacity(0.52))

                Divider()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(dashboard.title).font(.title.weight(.semibold))
                                Text(dashboard.subtitle).foregroundStyle(.secondary)
                            }
                            Spacer()
                            FlatDropdown(title: "Período", values: ["1 mês", "3 meses", "6 meses", "1 ano"], selection: $selectedPeriod, width: 180)
                        }

                        HStack(spacing: 12) {
                            ForEach(dashboard.metrics.prefix(4)) { metric in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack { Text(metric.title).font(.caption).foregroundStyle(.secondary); Spacer(); Image(systemName: "chart.line.uptrend.xyaxis").foregroundStyle(Color.accentColor) }
                                    Text(metric.value, format: .number.precision(.fractionLength(0...2))).font(.title2.monospacedDigit().weight(.semibold))
                                    HStack(spacing: 5) {
                                        Text(metric.unit).font(.caption).foregroundStyle(.secondary)
                                        if let change = metric.change {
                                            Text(change, format: .percent.precision(.fractionLength(1))).font(.caption.weight(.semibold)).foregroundStyle(change >= 0 ? Color.blue : Color.orange)
                                        }
                                    }
                                }
                                .padding(15).frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.06)))
                            }
                        }

                        if !dashboard.points.isEmpty {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text("Evolução").font(.headline)
                                    Chart(dashboard.points) { point in
                                        BarMark(x: .value("Período", point.label), y: .value("Valor", point.value))
                                            .foregroundStyle(Color.accentColor.gradient)
                                            .cornerRadius(4)
                                    }
                                    .frame(height: 290)
                                }
                                .padding(18).frame(maxWidth: .infinity)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))

                                VStack(alignment: .leading, spacing: 14) {
                                    Text("Distribuição").font(.headline)
                                    Chart(dashboard.points.prefix(6)) { point in
                                        SectorMark(angle: .value("Valor", point.value), innerRadius: .ratio(0.62), angularInset: 2)
                                            .foregroundStyle(by: .value("Período", point.label))
                                    }
                                    .frame(width: 230, height: 230)
                                    Text("\(dashboard.points.count) períodos analisados").font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(18).frame(width: 280, alignment: .topLeading).frame(minHeight: 350, alignment: .topLeading)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                            }

                            VStack(alignment: .leading, spacing: 12) {
                                Text("Dados recentes").font(.headline)
                                ForEach(dashboard.points.suffix(5)) { point in
                                    HStack { Text(point.label); Spacer(); Text(point.value, format: .number.precision(.fractionLength(0...2))).monospacedDigit() }
                                    Divider()
                                }
                            }
                            .padding(18).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                        } else {
                            ContentUnavailableView("Sem dados suficientes", systemImage: "chart.bar.xaxis", description: Text("Peça ao chat para atualizar este dashboard com uma série temporal real."))
                        }
                    }
                    .padding(24)
                }
            }
        } else {
            ContentUnavailableView {
                Label("Dashboard vazio", systemImage: "chart.xyaxis.line")
            } description: {
                Text("Peça um relatório visual no chat ou crie um dashboard dentro de um projeto.")
            } actions: {
                if let projectId = store.contextProjectId {
                    Button("Criar dashboard") { store.createDashboard(in: projectId) }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private func dashboardSymbol(_ section: String) -> String {
        switch section {
        case "Relatórios": "doc.text"
        case "Financeiro": "banknote"
        case "Atividades": "clock.arrow.circlepath"
        case "Configurações": "gearshape"
        default: "square.grid.2x2"
        }
    }
}

struct PhotoEditorView: View {
    @State private var sourceImage: NSImage?
    @State private var renderedImage: NSImage?
    @State private var exposure = 0.0
    @State private var contrast = 1.0
    @State private var saturation = 1.0
    @State private var rotation = 0.0
    @State private var selection: CGRect?
    @State private var selectionStart: CGPoint?
    @State private var canvasSize: CGSize = .zero
    @State private var applyingChange = false
    private let context = CIContext()

    var body: some View {
        HStack(spacing: 0) {
            GeometryReader { proxy in
                ZStack {
                    Color(nsColor: .underPageBackgroundColor)
                    if let image = renderedImage ?? sourceImage {
                        let imageRect = fittedRect(imageSize: image.size, canvasSize: proxy.size)
                        Image(nsImage: image).resizable().scaledToFit()
                            .frame(width: max(imageRect.width, 1), height: max(imageRect.height, 1))
                            .position(x: imageRect.midX, y: imageRect.midY)
                            .rotationEffect(.degrees(rotation))
                        if let selection {
                            Rectangle()
                                .fill(Color.accentColor.opacity(0.12))
                                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                                .frame(width: selection.width, height: selection.height)
                                .position(x: selection.midX, y: selection.midY)
                        }
                        Rectangle().fill(Color.clear).contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 2)
                                .onChanged { value in
                                    canvasSize = proxy.size
                                    let start = selectionStart ?? value.startLocation
                                    selectionStart = start
                                    selection = CGRect(
                                        x: min(start.x, value.location.x), y: min(start.y, value.location.y),
                                        width: abs(value.location.x - start.x), height: abs(value.location.y - start.y)
                                    ).intersection(imageRect)
                                }
                                .onEnded { _ in selectionStart = nil })
                    } else {
                        ContentUnavailableView("Abra uma foto", systemImage: "photo.badge.plus", description: Text("PNG, JPEG, HEIF ou TIFF"))
                    }
                }
                .onAppear { canvasSize = proxy.size }
                .onChange(of: proxy.size) { _, value in canvasSize = value }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .dropDestination(for: URL.self) { urls, _ in
                guard let url = urls.first, let image = NSImage(contentsOf: url) else { return false }
                sourceImage = image; applyFilters(); return true
            }
            .aiProcessingGlow(isActive: applyingChange, cornerRadius: 14, label: "Aplicando alteração")

            Divider()

            VStack(alignment: .leading, spacing: 18) {
                Text("Ajustes").font(.headline)
                editorSlider("Exposição", value: $exposure, range: -2...2)
                editorSlider("Contraste", value: $contrast, range: 0.25...2)
                editorSlider("Saturação", value: $saturation, range: 0...2)
                editorSlider("Rotação", value: $rotation, range: -180...180)
                Divider()
                Button("Abrir foto", action: openPhoto).keyboardShortcut("o", modifiers: .command)
                Button("Adicionar imagem…", action: addImage).disabled(sourceImage == nil)
                Button("Remover seleção", action: removeSelection).disabled(selection == nil)
                Button("Recortar para seleção", action: cropToSelection).disabled(selection == nil)
                Button("Redefinir") { exposure = 0; contrast = 1; saturation = 1; rotation = 0; applyFilters() }
                Spacer()
                Button("Exportar…", action: exportPhoto)
                    .buttonStyle(.borderedProminent)
                    .disabled(sourceImage == nil)
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
            .padding(20)
            .frame(width: 250)
            .onChange(of: exposure) { _, _ in applyFilters() }
            .onChange(of: contrast) { _, _ in applyFilters() }
            .onChange(of: saturation) { _, _ in applyFilters() }
        }
    }

    private func editorSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Text(title).font(.caption); Spacer(); Text(value.wrappedValue, format: .number.precision(.fractionLength(2))).font(.caption.monospacedDigit()) }
            Slider(value: value, in: range)
        }
    }

    private func openPhoto() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.image]
        guard panel.runModal() == .OK, let url = panel.url, let image = NSImage(contentsOf: url) else { return }
        sourceImage = image; applyFilters()
    }

    private func fittedRect(imageSize: CGSize, canvasSize: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return CGRect(origin: .zero, size: canvasSize) }
        let available = CGSize(width: max(canvasSize.width - 80, 1), height: max(canvasSize.height - 80, 1))
        let scale = min(available.width / imageSize.width, available.height / imageSize.height)
        let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        return CGRect(x: (canvasSize.width - size.width) / 2, y: (canvasSize.height - size.height) / 2, width: size.width, height: size.height)
    }

    private func imageSelectionRect(for image: NSImage) -> CGRect? {
        guard let selection else { return nil }
        let display = fittedRect(imageSize: image.size, canvasSize: canvasSize)
        guard display.width > 0, display.height > 0 else { return nil }
        let normalized = CGRect(
            x: max((selection.minX - display.minX) / display.width, 0),
            y: max((selection.minY - display.minY) / display.height, 0),
            width: min(selection.width / display.width, 1),
            height: min(selection.height / display.height, 1)
        )
        return CGRect(
            x: normalized.minX * image.size.width,
            y: (1 - normalized.maxY) * image.size.height,
            width: normalized.width * image.size.width,
            height: normalized.height * image.size.height
        )
    }

    private func removeSelection() {
        guard let image = renderedImage ?? sourceImage,
              let rect = imageSelectionRect(for: image),
              let copy = image.copy() as? NSImage else { return }
        copy.lockFocus()
        NSGraphicsContext.current?.compositingOperation = .clear
        NSBezierPath(rect: rect).fill()
        copy.unlockFocus()
        sourceImage = copy; renderedImage = copy; selection = nil
        showProcessingGlow()
    }

    private func cropToSelection() {
        guard let image = renderedImage ?? sourceImage,
              let rect = imageSelectionRect(for: image),
              let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let cropped = cg.cropping(to: rect) else { return }
        let result = NSImage(cgImage: cropped, size: rect.size)
        sourceImage = result; renderedImage = result; selection = nil
        showProcessingGlow()
    }

    private func addImage() {
        guard let base = renderedImage ?? sourceImage else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.image]
        guard panel.runModal() == .OK, let url = panel.url, let overlay = NSImage(contentsOf: url), let copy = base.copy() as? NSImage else { return }
        let maxWidth = base.size.width * 0.35
        let scale = min(maxWidth / max(overlay.size.width, 1), 1)
        let size = CGSize(width: overlay.size.width * scale, height: overlay.size.height * scale)
        let origin = CGPoint(x: (base.size.width - size.width) / 2, y: (base.size.height - size.height) / 2)
        copy.lockFocus(); overlay.draw(in: CGRect(origin: origin, size: size)); copy.unlockFocus()
        sourceImage = copy; renderedImage = copy
        showProcessingGlow()
    }

    private func applyFilters() {
        guard let sourceImage, let data = sourceImage.tiffRepresentation, let input = CIImage(data: data) else { return }
        let controls = CIFilter.colorControls()
        controls.inputImage = input
        controls.contrast = Float(contrast)
        controls.saturation = Float(saturation)
        let exposureFilter = CIFilter.exposureAdjust()
        exposureFilter.inputImage = controls.outputImage
        exposureFilter.ev = Float(exposure)
        guard let output = exposureFilter.outputImage, let cgImage = context.createCGImage(output, from: output.extent) else { return }
        renderedImage = NSImage(cgImage: cgImage, size: sourceImage.size)
    }

    private func exportPhoto() {
        guard let image = renderedImage ?? sourceImage,
              let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff) else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.png, .jpeg, .tiff]; panel.nameFieldStringValue = "foto-editada.png"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let type: NSBitmapImageRep.FileType = url.pathExtension.lowercased() == "jpg" || url.pathExtension.lowercased() == "jpeg" ? .jpeg : (url.pathExtension.lowercased() == "tiff" ? .tiff : .png)
        try? bitmap.representation(using: type, properties: [.compressionFactor: 0.92])?.write(to: url)
    }

    private func showProcessingGlow() {
        applyingChange = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(650))
            applyingChange = false
        }
    }
}

struct VideoEditorView: View {
    @State private var videoURL: URL?
    @State private var player: AVPlayer?
    @State private var duration = 1.0
    @State private var trimStart = 0.0
    @State private var trimEnd = 1.0
    @State private var exportPreset = AVAssetExportPreset1920x1080
    @State private var exporting = false
    @State private var preparingMedia = false
    @State private var status: String?
    @State private var thumbnails: [NSImage] = []
    @State private var waveform: [CGFloat] = []
    @State private var selectedInspectorTab = "Assets"
    @State private var timelineZoom = 1.0
    @State private var assetSearch = ""

    var body: some View {
        VStack(spacing: 0) {
            editorHeader

            HStack(spacing: 0) {
                preview

                Divider()

                inspector
                    .frame(width: 280)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            timeline
                .frame(height: 306)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var editorHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "line.3.horizontal.decrease")
                .foregroundStyle(.secondary)
            Divider().frame(height: 22)
            Text("AI Video Editor")
                .font(.headline)
            Spacer()
            TextField("Buscar assets, efeitos ou comandos…", text: $assetSearch)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 520)
            Spacer()
            Picker("Qualidade", selection: $exportPreset) {
                Text("720p").tag(AVAssetExportPreset1280x720)
                Text("1080p").tag(AVAssetExportPreset1920x1080)
                Text("4K").tag(AVAssetExportPreset3840x2160)
            }
            .labelsHidden()
            .frame(width: 112)
            Button(action: exportVideo) {
                Label(exporting ? "Exportando" : "Exportar", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.borderedProminent)
            .disabled(videoURL == nil || exporting)
        }
        .padding(.horizontal, 16)
        .frame(height: 50)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var preview: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                if let player {
                    VideoPlayer(player: player)
                        .padding(20)
                } else {
                    ContentUnavailableView(
                        "Abra um vídeo",
                        systemImage: "film.stack",
                        description: Text("Arraste um arquivo ou importe pela biblioteca")
                    )
                    .foregroundStyle(.secondary)
                }

                VStack {
                    HStack {
                        Text(format(trimStart, includeFrames: true))
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.66), in: RoundedRectangle(cornerRadius: 7))
                        Spacer()
                    }
                    Spacer()
                }
                .padding(30)
            }
            .aiProcessingGlow(
                isActive: preparingMedia || exporting,
                cornerRadius: 14,
                label: exporting ? "Exportando vídeo" : "Analisando mídia"
            )
            .padding(14)
            .dropDestination(for: URL.self) { urls, _ in
                guard let url = urls.first else { return false }
                load(url)
                return true
            }

            HStack(spacing: 18) {
                Button { seek(to: trimStart) } label: { Image(systemName: "backward.end.fill") }
                Button { togglePlayback() } label: { Image(systemName: "play.fill") }
                Button { seek(to: trimEnd) } label: { Image(systemName: "forward.end.fill") }
                Spacer()
                Text("1920 × 1080 · 60 fps")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Image(systemName: "speaker.wave.2")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .frame(height: 42)
        }
        .background(Color.black.opacity(0.92))
    }

    private var inspector: some View {
        VStack(spacing: 0) {
            HStack(spacing: 18) {
                ForEach(["Assets", "Efeitos", "Áudio"], id: \.self) { tab in
                    Button(tab) { selectedInspectorTab = tab }
                        .buttonStyle(.plain)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(selectedInspectorTab == tab ? Color.primary : .secondary)
                        .padding(.vertical, 13)
                        .overlay(alignment: .bottom) {
                            if selectedInspectorTab == tab {
                                Rectangle().fill(Color.accentColor).frame(height: 2)
                            }
                        }
                }
            }
            .frame(maxWidth: .infinity)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("FERRAMENTAS DE IA")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)

                    HStack(spacing: 10) {
                        inspectorTool("Auto-Cut", symbol: "wand.and.stars")
                        inspectorTool("AI Voice", symbol: "waveform.badge.mic")
                    }

                    HStack {
                        Text("MÍDIA DO PROJETO")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("+ Importar", action: openVideo)
                            .buttonStyle(.plain)
                            .font(.caption.weight(.semibold))
                    }

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        mediaThumbnail
                        Button(action: openVideo) {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(Color.primary.opacity(0.045))
                                .aspectRatio(1.5, contentMode: .fit)
                                .overlay(Image(systemName: "plus").foregroundStyle(.secondary))
                        }
                        .buttonStyle(.plain)
                    }

                    Divider()
                    Text("CORTE")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                    labeledSlider("Início", value: $trimStart, range: 0...max(trimEnd - 0.1, 0.1))
                    labeledSlider("Fim", value: $trimEnd, range: min(trimStart + 0.1, duration)...max(duration, 0.1))

                    if let status {
                        Label(status, systemImage: exporting ? "sparkles" : "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(16)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.42))
    }

    private var timeline: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Image(systemName: "scissors")
                Image(systemName: "crop")
                Image(systemName: "trash")
                    .foregroundStyle(.red)
                Divider().frame(height: 20)
                Label("Transições", systemImage: "circle.grid.cross")
                Spacer()
                Text(format(trimStart, includeFrames: true))
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Image(systemName: "minus.magnifyingglass")
                Slider(value: $timelineZoom, in: 0.7...2.4)
                    .frame(width: 120)
                Image(systemName: "plus.magnifyingglass")
            }
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)
            .frame(height: 42)

            Divider()

            GeometryReader { proxy in
                let trackLabelWidth: CGFloat = 44
                let trackWidth = max((proxy.size.width - trackLabelWidth - 22) * timelineZoom, 1)
                ScrollView(.horizontal) {
                    VStack(spacing: 6) {
                        timelineRuler(width: trackWidth)
                        timelineTrack(symbol: "textformat", tint: .yellow, width: trackWidth) {
                            timelineTextClip("Intro Title Sequence", tint: .yellow)
                        }
                        timelineTrack(symbol: "square.stack.3d.up", tint: .purple, width: trackWidth) {
                            timelineTextClip("Overlay 01", tint: .purple)
                        }
                        timelineTrack(symbol: "film", tint: .blue, width: trackWidth) {
                            TimelineVideoClip(thumbnails: thumbnails)
                        }
                        timelineTrack(symbol: "waveform", tint: .indigo, width: trackWidth) {
                            TimelineAudioClip(samples: waveform, tint: .indigo)
                        }
                        timelineTrack(symbol: "music.note", tint: .mint, width: trackWidth) {
                            TimelineAudioClip(samples: waveform.reversed(), tint: .mint)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(width: trackWidth + trackLabelWidth + 12, alignment: .leading)
                    .overlay(alignment: .topLeading) {
                        Rectangle()
                            .fill(Color.accentColor)
                            .frame(width: 1.5)
                            .padding(.top, 8)
                            .offset(x: trackLabelWidth + CGFloat(trimStart / max(duration, 0.1)) * trackWidth)
                    }
                }
                .scrollIndicators(.visible)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func inspectorTool(_ title: String, symbol: String) -> some View {
        Button { status = "\(title) pronto para configurar." } label: {
            VStack(spacing: 9) {
                Image(systemName: symbol).font(.title3).foregroundStyle(Color.accentColor)
                Text(title).font(.caption.weight(.medium))
            }
            .frame(maxWidth: .infinity, minHeight: 66)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.primary.opacity(0.09)))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var mediaThumbnail: some View {
        if let first = thumbnails.first {
            Image(nsImage: first)
                .resizable()
                .aspectRatio(1.5, contentMode: .fill)
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.accentColor.opacity(0.45)))
        } else {
            RoundedRectangle(cornerRadius: 7)
                .fill(Color.primary.opacity(0.045))
                .aspectRatio(1.5, contentMode: .fit)
                .overlay(Image(systemName: "film").foregroundStyle(.secondary))
        }
    }

    private func labeledSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title).font(.caption)
                Spacer()
                Text(format(value.wrappedValue)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            Slider(value: value, in: range)
        }
    }

    private func timelineRuler(width: CGFloat) -> some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: 44)
            HStack {
                ForEach(0..<7, id: \.self) { index in
                    Text(format(duration * Double(index) / 6))
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    if index < 6 { Spacer() }
                }
            }
            .frame(width: width)
        }
        .frame(height: 16)
    }

    private func timelineTrack<Content: View>(symbol: String, tint: Color, width: CGFloat, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 36)
            content()
                .frame(width: width, height: 34)
        }
        .frame(height: 38)
    }

    private func timelineTextClip(_ title: String, tint: Color) -> some View {
        HStack {
            Text(title).font(.system(size: 9, weight: .medium)).lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 9)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(tint.opacity(0.6)))
    }

    private func openVideo() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.movie]
        guard panel.runModal() == .OK, let url = panel.url else { return }; load(url)
    }

    private func load(_ url: URL) {
        videoURL = url
        player = AVPlayer(url: url)
        thumbnails = []
        waveform = []
        preparingMedia = true
        status = "Analisando frames e áudio…"
        Task {
            let asset = AVURLAsset(url: url)
            if let loaded = try? await asset.load(.duration) {
                duration = max(loaded.seconds, 0.1); trimStart = 0; trimEnd = duration
            }
            async let generatedThumbnails = MediaTimelinePreviewBuilder.thumbnails(for: url, count: 12)
            async let generatedWaveform = MediaTimelinePreviewBuilder.waveform(for: url, sampleCount: 180)
            thumbnails = await generatedThumbnails
            waveform = await generatedWaveform
            preparingMedia = false
            status = "Mídia pronta para edição."
        }
    }

    private func togglePlayback() {
        guard let player else { return }
        if player.timeControlStatus == .playing { player.pause() } else { player.play() }
    }

    private func seek(to seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    private func exportVideo() {
        guard let videoURL else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.mpeg4Movie, .quickTimeMovie]; panel.nameFieldStringValue = "video-editado.mp4"
        guard panel.runModal() == .OK, let output = panel.url else { return }
        try? FileManager.default.removeItem(at: output)
        exporting = true; status = "Preparando exportação…"
        Task {
            let asset = AVURLAsset(url: videoURL)
            guard let session = AVAssetExportSession(asset: asset, presetName: exportPreset) else { exporting = false; status = "Preset não suportado."; return }
            session.outputURL = output
            session.outputFileType = output.pathExtension.lowercased() == "mov" ? .mov : .mp4
            session.timeRange = CMTimeRange(start: CMTime(seconds: trimStart, preferredTimescale: 600), end: CMTime(seconds: trimEnd, preferredTimescale: 600))
            do { try await session.export(to: output, as: session.outputFileType ?? .mp4); status = "Exportação concluída." }
            catch { status = "Falha na exportação: \(error.localizedDescription)" }
            exporting = false
        }
    }

    private func format(_ seconds: Double, includeFrames: Bool = false) -> String {
        let safe = max(seconds, 0)
        let hours = Int(safe) / 3600
        let minutes = (Int(safe) % 3600) / 60
        let secs = Int(safe) % 60
        if includeFrames {
            let frames = Int((safe - floor(safe)) * 60)
            return String(format: "%02d:%02d:%02d:%02d", hours, minutes, secs, frames)
        }
        return hours > 0 ? String(format: "%02d:%02d:%02d", hours, minutes, secs) : String(format: "%02d:%02d", minutes, secs)
    }
}

private struct TimelineVideoClip: View {
    var thumbnails: [NSImage]

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 1) {
                if thumbnails.isEmpty {
                    RoundedRectangle(cornerRadius: 5)
                        .fill(Color.blue.opacity(0.22))
                        .overlay(Image(systemName: "film").foregroundStyle(.secondary))
                } else {
                    ForEach(Array(thumbnails.enumerated()), id: \.offset) { _, image in
                        Image(nsImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: max(proxy.size.width / CGFloat(thumbnails.count), 1), height: proxy.size.height)
                            .clipped()
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Color.accentColor, lineWidth: 1.2))
        }
    }
}

private struct TimelineAudioClip<Samples: Collection>: View where Samples.Element == CGFloat {
    var samples: Samples
    var tint: Color

    var body: some View {
        Canvas { context, size in
            let values = Array(samples)
            guard !values.isEmpty else { return }
            let step = size.width / CGFloat(max(values.count - 1, 1))
            var shape = Path()
            shape.move(to: CGPoint(x: 0, y: size.height / 2))
            for (index, value) in values.enumerated() {
                let amplitude = max(1, value * size.height * 0.46)
                let x = CGFloat(index) * step
                shape.addLine(to: CGPoint(x: x, y: size.height / 2 - amplitude))
            }
            shape.addLine(to: CGPoint(x: size.width, y: size.height / 2))
            for index in values.indices.reversed() {
                let value = values[index]
                let amplitude = max(1, value * size.height * 0.46)
                let x = CGFloat(index) * step
                shape.addLine(to: CGPoint(x: x, y: size.height / 2 + amplitude))
            }
            shape.closeSubpath()
            context.fill(shape, with: .color(tint.opacity(0.74)))
            var centerLine = Path()
            centerLine.move(to: CGPoint(x: 0, y: size.height / 2))
            centerLine.addLine(to: CGPoint(x: size.width, y: size.height / 2))
            context.stroke(centerLine, with: .color(tint.opacity(0.9)))
        }
        .background(tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(tint.opacity(0.62)))
    }
}

private enum MediaTimelinePreviewBuilder {
    static func thumbnails(for url: URL, count: Int) async -> [NSImage] {
        await Task.detached(priority: .userInitiated) {
            let asset = AVURLAsset(url: url)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 240, height: 140)
            let duration = max(CMTimeGetSeconds(asset.duration), 0.1)
            return (0..<count).compactMap { index in
                let seconds = duration * Double(index) / Double(max(count - 1, 1))
                let time = CMTime(seconds: seconds, preferredTimescale: 600)
                guard let image = try? generator.copyCGImage(at: time, actualTime: nil) else { return nil }
                return NSImage(cgImage: image, size: CGSize(width: image.width, height: image.height))
            }
        }.value
    }

    static func waveform(for url: URL, sampleCount: Int) async -> [CGFloat] {
        await Task.detached(priority: .userInitiated) {
            let asset = AVURLAsset(url: url)
            guard let track = asset.tracks(withMediaType: .audio).first,
                  let reader = try? AVAssetReader(asset: asset) else { return [] }
            let output = AVAssetReaderTrackOutput(
                track: track,
                outputSettings: [
                    AVFormatIDKey: kAudioFormatLinearPCM,
                    AVLinearPCMBitDepthKey: 16,
                    AVLinearPCMIsFloatKey: false,
                    AVLinearPCMIsBigEndianKey: false
                ]
            )
            guard reader.canAdd(output) else { return [] }
            reader.add(output)
            guard reader.startReading() else { return [] }

            var raw: [CGFloat] = []
            while reader.status == .reading, let sample = output.copyNextSampleBuffer(),
                  let block = CMSampleBufferGetDataBuffer(sample) {
                let length = CMBlockBufferGetDataLength(block)
                guard length > 1 else { continue }
                var bytes = [Int16](repeating: 0, count: length / MemoryLayout<Int16>.size)
                bytes.withUnsafeMutableBytes { destination in
                    if let baseAddress = destination.baseAddress {
                        CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: baseAddress)
                    }
                }
                for index in stride(from: 0, to: bytes.count, by: 128) {
                    let magnitude = min(abs(Int(bytes[index])), Int(Int16.max))
                    raw.append(CGFloat(magnitude) / CGFloat(Int16.max))
                }
            }
            guard !raw.isEmpty else { return [] }
            let bucketSize = max(raw.count / max(sampleCount, 1), 1)
            return stride(from: 0, to: raw.count, by: bucketSize).prefix(sampleCount).map { start in
                let end = min(start + bucketSize, raw.count)
                return max(raw[start..<end].max() ?? 0, 0.035)
            }
        }.value
    }
}

private struct DynamicAssistantScreenLayout {
    var notchWidth: CGFloat
    var notchHeight: CGFloat
    var hasNotch: Bool

    static func current(for screen: NSScreen?) -> DynamicAssistantScreenLayout {
        guard let screen = screen ?? NSScreen.main else {
            return DynamicAssistantScreenLayout(notchWidth: 0, notchHeight: 28, hasNotch: false)
        }
        let left = screen.auxiliaryTopLeftArea
        let right = screen.auxiliaryTopRightArea
        let measuredNotch: CGFloat = if let left, let right {
            max(right.minX - left.maxX, 0)
        } else {
            0
        }
        let topInset = max(screen.safeAreaInsets.top, 28)
        return DynamicAssistantScreenLayout(
            notchWidth: measuredNotch > 48 ? measuredNotch : 0,
            notchHeight: topInset,
            hasNotch: measuredNotch > 48
        )
    }
}

private struct DynamicAssistantView: View {
    @EnvironmentObject private var store: AssistantStore
    @Environment(\.colorScheme) private var colorScheme
    @State private var input = ""
    @State private var isExpanded = false
    @FocusState private var inputFocused: Bool
    var screenLayout: DynamicAssistantScreenLayout
    var onExpansionChanged: (Bool) -> Void = { _ in }
    var onMoveToMenuBar: () -> Void = { }

    private var lastReply: String {
        store.activeChat.messages.last(where: { $0.sender == .assistant })?.text ?? "Pronto para ajudar."
    }

    private var isBusy: Bool {
        !store.generatingChatIds.isEmpty || store.voiceState != .idle
    }

    private var statusText: String {
        switch store.voiceState {
        case .listening: "Ouvindo"
        case .processing: "Pensando"
        case .speaking: "Falando"
        case .error: "Atenção"
        case .idle: store.generatingChatIds.isEmpty ? "Pronto" : "Trabalhando"
        }
    }

    private var taskProgress: Double {
        switch store.voiceState {
        case .listening: 0.22
        case .processing: 0.58
        case .speaking: 0.84
        case .error: 1
        case .idle: store.generatingChatIds.isEmpty ? 1 : 0.42
        }
    }

    var body: some View {
        Group {
            if isExpanded {
                expandedAssistant
                    .transition(.opacity.combined(with: .scale(scale: 0.9, anchor: .top)))
            } else {
                miniAssistant
                    .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.spring(response: 0.46, dampingFraction: 0.72, blendDuration: 0.15), value: isExpanded)
        .onAppear { onExpansionChanged(isExpanded) }
        .onChange(of: isExpanded) { _, expanded in onExpansionChanged(expanded) }
    }

    @ViewBuilder
    private var miniAssistant: some View {
        if screenLayout.hasNotch {
            HStack(spacing: 0) {
                miniWing(alignment: .trailing) {
                    HStack(spacing: 7) {
                        DynamicAssistantProgressRing(progress: taskProgress, isBusy: isBusy)
                        Text(store.activeChat.title).lineLimit(1)
                    }
                }

                Color.black
                    .frame(width: screenLayout.notchWidth, height: screenLayout.notchHeight)
                    .allowsHitTesting(false)

                miniWing(alignment: .leading) {
                    HStack(spacing: 7) {
                        Image(systemName: "robotic.vacuum")
                            .font(.system(size: 12, weight: .semibold))
                        Text(statusText).lineLimit(1)
                    }
                }
            }
            .frame(width: screenLayout.notchWidth + 330, height: screenLayout.notchHeight)
        } else {
            Button { isExpanded = true } label: {
                HStack(spacing: 8) {
                    Circle().fill(isBusy ? Color.accentColor : Color.green).frame(width: 6, height: 6)
                    Text(statusText)
                    Spacer()
                    Text(shortReply).foregroundStyle(.secondary).lineLimit(1)
                }
                .font(.system(size: 10.5, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(width: 330, height: 30)
                .dynamicAssistantSurface(colorScheme: colorScheme, corners: 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func miniWing<Content: View>(alignment: Alignment, @ViewBuilder content: () -> Content) -> some View {
        Button { isExpanded = true } label: {
            content()
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundStyle(colorScheme == .dark ? Color.white : Color.primary)
                .padding(.horizontal, 10)
                .frame(width: 165, height: screenLayout.notchHeight, alignment: alignment)
                .background(dynamicSurfaceColor)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Abrir Dynamic Assistant")
    }

    private var expandedAssistant: some View {
        VStack(spacing: 0) {
            expandedTopBar

            VStack(alignment: .leading, spacing: 0) {
            if store.voiceState == .listening || store.voiceState == .speaking {
                VoiceWaveform(level: store.speechService.audioLevel, isActive: true, color: .accentColor)
                    .padding(.horizontal, 14)
                    .frame(height: 54)
            }

            Text(lastReply)
                .font(.system(size: 12.5))
                .foregroundStyle(.primary)
                .lineLimit(store.settings.appearance.floatingAssistantCompact ? 3 : 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                TextField("Responder…", text: $input)
                    .textFieldStyle(.plain)
                    .focused($inputFocused)
                    .onSubmit(send)
                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 19))
                }
                .buttonStyle(.plain)
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 11)
            .frame(height: 36)
            .background(Color.primary.opacity(0.075), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .padding(12)
            }
            .frame(
                width: 620,
                height: (store.settings.appearance.floatingAssistantCompact ? 220 : 290) - (screenLayout.hasNotch ? 0 : 40)
            )
            .dynamicAssistantSurface(colorScheme: colorScheme, corners: 18)
            .overlay {
                UnevenRoundedRectangle(bottomLeadingRadius: 18, bottomTrailingRadius: 18)
                    .strokeBorder(Color.primary.opacity(0.13), lineWidth: 0.8)
            }
            .shadow(color: .black.opacity(0.3), radius: 20, y: 12)
        }
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                inputFocused = true
            }
        }
    }

    @ViewBuilder
    private var expandedTopBar: some View {
        if screenLayout.hasNotch {
            let wingWidth = max((620 - screenLayout.notchWidth) / 2, 120)
            HStack(spacing: 0) {
                dynamicAssistantStatus
                    .padding(.horizontal, 14)
                    .frame(width: wingWidth, height: screenLayout.notchHeight, alignment: .leading)

                Color.black
                    .frame(width: screenLayout.notchWidth, height: screenLayout.notchHeight)
                    .allowsHitTesting(false)

                dynamicAssistantControls
                    .padding(.horizontal, 10)
                    .frame(width: wingWidth, height: screenLayout.notchHeight, alignment: .trailing)
            }
            .frame(width: 620, height: screenLayout.notchHeight)
            .background(Color.black)
        } else {
            HStack(spacing: 9) {
                dynamicAssistantStatus
                Spacer()
                dynamicAssistantControls
            }
            .padding(.horizontal, 14)
            .frame(width: 620, height: 40)
            .background(Color.black)
        }
    }

    private var dynamicAssistantStatus: some View {
        HStack(spacing: 8) {
            DynamicAssistantProgressRing(progress: taskProgress, isBusy: isBusy)
            Text(store.activeChat.title)
                .font(.system(size: 12, weight: .bold))
                .lineLimit(1)
            Text(statusText)
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.62))
                .lineLimit(1)
        }
        .foregroundStyle(Color.white)
    }

    private var dynamicAssistantControls: some View {
        HStack(spacing: 2) {
            Image(systemName: "robotic.vacuum")
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 24, height: 24)
            Button { NSApp.activate(ignoringOtherApps: true) } label: {
                Image(systemName: "arrow.up.right").frame(width: 24, height: 24)
            }
            .buttonStyle(.plain).help("Abrir app")
            Button { onMoveToMenuBar() } label: {
                Image(systemName: "menubar.rectangle").frame(width: 24, height: 24)
            }
            .buttonStyle(.plain).help("Mover para a barra de menus")
            Button { isExpanded = false } label: {
                Image(systemName: "chevron.up").frame(width: 24, height: 24)
            }
            .buttonStyle(.plain).help("Recolher")
        }
        .foregroundStyle(Color.white.opacity(0.88))
    }

    private var shortReply: String {
        let normalized = lastReply.replacingOccurrences(of: "\n", with: " ")
        return normalized.count > 34 ? String(normalized.prefix(34)) + "…" : normalized
    }

    private var dynamicSurfaceColor: Color {
        colorScheme == .dark ? Color.black.opacity(0.98) : Color(nsColor: .controlBackgroundColor).opacity(0.9)
    }

    private func send() { let text = input.trimmingCharacters(in: .whitespacesAndNewlines); guard !text.isEmpty else { return }; input = ""; store.sendMessage(text) }
}

private struct DynamicAssistantProgressRing: View {
    var progress: Double
    var isBusy: Bool

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.18), lineWidth: 1.6)
            Circle()
                .trim(from: 0, to: max(0.04, min(progress, 1)))
                .stroke(isBusy ? Color.accentColor : Color.green, style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 12, height: 12)
        .animation(.easeOut(duration: 0.3), value: progress)
    }
}

private final class DynamicAssistantPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class DynamicAssistantPanelController: NSObject {
    static let shared = DynamicAssistantPanelController()
    private var panel: NSPanel?
    private var statusItem: NSStatusItem?
    private weak var store: AssistantStore?
    private var screenLayout = DynamicAssistantScreenLayout(notchWidth: 0, notchHeight: 28, hasNotch: false)

    func update(store: AssistantStore) {
        self.store = store
        guard store.settings.appearance.floatingAssistantEnabled else {
            panel?.orderOut(nil)
            statusItem?.isVisible = false
            return
        }
        if panel == nil {
            let targetScreen = NSScreen.main
            screenLayout = .current(for: targetScreen)
            let panel = DynamicAssistantPanel(contentRect: NSRect(x: 0, y: 0, width: 500, height: screenLayout.notchHeight), styleMask: [.borderless, .fullSizeContentView], backing: .buffered, defer: false)
            panel.isFloatingPanel = true; panel.level = .statusBar; panel.backgroundColor = .black; panel.isOpaque = false; panel.hasShadow = false
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.hidesOnDeactivate = false; panel.isMovableByWindowBackground = false
            panel.contentView?.wantsLayer = true
            panel.contentView = NSHostingView(rootView: DynamicAssistantView(
                screenLayout: screenLayout,
                onExpansionChanged: { [weak self] expanded in
                self?.resizeIsland(expanded: expanded, compact: store.settings.appearance.floatingAssistantCompact)
                },
                onMoveToMenuBar: { [weak self] in self?.moveToMenuBar() }
            ).environmentObject(store))
            self.panel = panel
            resizeIsland(expanded: false, compact: store.settings.appearance.floatingAssistantCompact, animated: false)
        }
        statusItem?.isVisible = false
        panel?.alphaValue = store.settings.appearance.floatingAssistantOpacity
        panel?.orderFrontRegardless()
    }

    private func resizeIsland(expanded: Bool, compact: Bool, animated: Bool = true) {
        guard let panel, let screen = panel.screen ?? NSScreen.main else { return }
        let expandedHeight: CGFloat = compact ? 220 : 290
        let size = expanded
            ? NSSize(width: 620, height: expandedHeight + (screenLayout.hasNotch ? screenLayout.notchHeight : 0))
            : NSSize(width: screenLayout.hasNotch ? screenLayout.notchWidth + 330 : 330, height: screenLayout.notchHeight)
        let frame = NSRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height
        )
        if animated {
            if expanded {
                panel.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
                let overshoot = frame.insetBy(dx: -9, dy: -4)
                    .offsetBy(dx: 0, dy: 4)
                NSAnimationContext.runAnimationGroup({ context in
                    context.duration = 0.28
                    context.timingFunction = CAMediaTimingFunction(name: .easeOut)
                    panel.animator().setFrame(overshoot, display: true)
                }, completionHandler: {
                    NSAnimationContext.runAnimationGroup { context in
                        context.duration = 0.16
                        context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                        panel.animator().setFrame(frame, display: true)
                    }
                })
            } else {
                NSAnimationContext.runAnimationGroup { context in
                    context.duration = 0.24
                    context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                    panel.animator().setFrame(frame, display: true)
                }
            }
        } else {
            panel.setFrame(frame, display: true)
        }
        panel.contentView?.layer?.cornerRadius = expanded ? 18 : screenLayout.notchHeight / 2
        panel.contentView?.layer?.masksToBounds = true
    }

    private func moveToMenuBar() {
        panel?.orderOut(nil)
        if statusItem == nil {
            let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
            item.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Dynamic Assistant")
            item.button?.target = self
            item.button?.action = #selector(restoreFromMenuBar)
            item.button?.toolTip = "Dynamic Assistant"
            statusItem = item
        }
        statusItem?.isVisible = true
    }

    @objc private func restoreFromMenuBar() {
        guard let store else { return }
        statusItem?.isVisible = false
        resizeIsland(expanded: false, compact: store.settings.appearance.floatingAssistantCompact, animated: false)
        panel?.orderFrontRegardless()
    }
}

private extension View {
    func dynamicAssistantSurface(colorScheme: ColorScheme, corners: CGFloat) -> some View {
        background {
            if colorScheme == .dark {
                UnevenRoundedRectangle(bottomLeadingRadius: corners, bottomTrailingRadius: corners)
                    .fill(Color.black.opacity(0.98))
            } else {
                UnevenRoundedRectangle(bottomLeadingRadius: corners, bottomTrailingRadius: corners)
                    .fill(.regularMaterial)
                    .overlay {
                        UnevenRoundedRectangle(bottomLeadingRadius: corners, bottomTrailingRadius: corners)
                            .fill(Color.gray.opacity(0.08))
                    }
            }
        }
    }
}
