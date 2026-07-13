import AppKit
import SwiftUI

struct ExpandedCodeEditorView: View {
    @EnvironmentObject private var store: AssistantStore
    @State private var draft = ""
    @State private var drafts: [String: String] = [:]
    @State private var originals: [String: String] = [:]
    @State private var showNavigator = true
    @State private var showTerminal = false
    @State private var fileSearch = ""
    @State private var saveMessage: String?

    private var file: CodeFileReference? { store.selectedCodeFile }
    private var currentPath: String { file?.path ?? "" }
    private var isDirty: Bool { draft != (originals[currentPath] ?? file?.content ?? "") }

    var body: some View {
        VStack(spacing: 0) {
            editorToolbar
            Divider()

            HStack(spacing: 0) {
                if showNavigator {
                    projectNavigator
                        .frame(width: 245)
                    Divider()
                }

                VStack(spacing: 0) {
                    tabBar
                    Divider()

                    if file != nil {
                        CodeEditingTextView(text: $draft, fontSize: CGFloat(store.settings.fontSize.code), onSave: save)
                    } else {
                        ContentUnavailableView("Nenhum arquivo aberto", systemImage: "chevron.left.forwardslash.chevron.right")
                    }

                    if showTerminal {
                        Divider()
                        ShellTerminalPane(shell: store.sidebarShell)
                            .frame(height: 190)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    statusBar
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            if store.selectedCodeFile == nil {
                store.openSandboxFile(store.selectedFile)
            }
            loadSelectedFile()
        }
        .onChange(of: store.selectedCodeFile?.path) { oldPath, _ in
            if let oldPath, !oldPath.isEmpty { drafts[oldPath] = draft }
            loadSelectedFile()
        }
    }

    private var editorToolbar: some View {
        HStack(spacing: 10) {
            Button {
                withAnimation(.snappy(duration: 0.18)) { store.codeEditorExpanded = false }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .help("Fechar editor")

            Button { withAnimation(.snappy) { showNavigator.toggle() } } label: {
                Image(systemName: "sidebar.left")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .foregroundStyle(showNavigator ? Color.primary : Color.secondary)
            .help(showNavigator ? "Ocultar navegador" : "Mostrar navegador")

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(file?.name ?? "Editor")
                        .font(.system(size: 13, weight: .semibold))
                    if isDirty {
                        Circle().fill(Color.orange).frame(width: 6, height: 6)
                    }
                }
                Text(file?.path ?? "Abra um arquivo no navegador do projeto")
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Button { withAnimation(.snappy) { showTerminal.toggle() } } label: {
                Label("Terminal", systemImage: "terminal")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 9)
                    .frame(height: 28)
            }
            .buttonStyle(.plain)
            .background(showTerminal ? Color.primary.opacity(0.09) : Color.clear, in: RoundedRectangle(cornerRadius: 7))

            Button(action: save) {
                Label("Salvar", systemImage: "square.and.arrow.down")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10)
                    .frame(height: 28)
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut("s", modifiers: .command)
            .disabled(file == nil || !isDirty)
            .popover(isPresented: saveNoticeIsPresented, arrowEdge: .top) {
                if let saveMessage {
                    Text(saveMessage)
                        .font(.system(size: 12, weight: .medium))
                        .padding(12)
                        .frame(width: 260, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 48)
        .background(.regularMaterial)
    }

    private var projectNavigator: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Filtrar arquivos", text: $fileSearch)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
            .padding(8)

            Divider()

            ScrollView {
                if fileSearch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    IDEProjectTreeRow(url: store.projectRootURL, level: 0)
                } else {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(matchingFiles, id: \.path) { url in
                            IDEFileSearchResult(url: url)
                        }
                    }
                    .padding(8)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.72))
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 1) {
                if let file {
                    editorTab(name: file.name, path: file.path, isActive: true) { }
                }
                ForEach(store.files.filter { $0.path != file?.path }) { sandboxFile in
                    editorTab(name: sandboxFile.name, path: sandboxFile.path, isActive: false) {
                        drafts[currentPath] = draft
                        store.openSandboxFile(sandboxFile)
                    }
                }
            }
            .padding(.horizontal, 8)
        }
        .frame(height: 34)
        .background(Color.primary.opacity(0.035))
    }

    private func editorTab(name: String, path: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: codeIcon(for: name)).font(.system(size: 10, weight: .semibold))
                Text(name).lineLimit(1)
                if isActive && isDirty { Circle().fill(Color.orange).frame(width: 5, height: 5) }
            }
            .font(.system(size: 11.5, weight: isActive ? .semibold : .regular))
            .foregroundStyle(isActive ? Color.primary : Color.secondary)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(isActive ? Color.primary.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 7))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(path)
    }

    private var statusBar: some View {
        HStack(spacing: 14) {
            Text(isDirty ? "Alterações não salvas" : "Salvo")
                .foregroundStyle(isDirty ? Color.orange : Color.secondary)
            Spacer()
            Text("\(draft.components(separatedBy: .newlines).count) linhas")
            Text((file?.language?.isEmpty == false ? file?.language : URL(fileURLWithPath: file?.name ?? "").pathExtension)?.uppercased() ?? "TEXT")
            Text("UTF-8")
        }
        .font(.system(size: 10.5, weight: .medium))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 10)
        .frame(height: 24)
        .background(.regularMaterial)
    }

    private var matchingFiles: [URL] {
        let query = fileSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty,
              let enumerator = FileManager.default.enumerator(
                at: store.projectRootURL,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
              ) else { return [] }
        var results: [URL] = []
        for case let url as URL in enumerator {
            if ["DerivedData", "Build", ".git"].contains(url.lastPathComponent) {
                enumerator.skipDescendants()
                continue
            }
            if url.lastPathComponent.localizedCaseInsensitiveContains(query),
               (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true {
                results.append(url)
                if results.count == 80 { break }
            }
        }
        return results
    }

    private func loadSelectedFile() {
        guard let file else {
            draft = ""
            return
        }
        if originals[file.path] == nil { originals[file.path] = file.content }
        draft = drafts[file.path] ?? file.content
    }

    private func save() {
        do {
            saveMessage = try store.saveSelectedCodeFile(content: draft)
            originals[currentPath] = draft
            drafts[currentPath] = draft
        } catch {
            saveMessage = "Não foi possível salvar: \(error.localizedDescription)"
        }
    }

    private var saveNoticeIsPresented: Binding<Bool> {
        Binding(get: { saveMessage != nil }, set: { if !$0 { saveMessage = nil } })
    }
}

private struct IDEProjectTreeRow: View {
    @EnvironmentObject private var store: AssistantStore
    var url: URL
    var level: Int
    @State private var isExpanded = true

    private var isDirectory: Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Button {
                if isDirectory {
                    withAnimation(.snappy(duration: 0.14)) { isExpanded.toggle() }
                } else {
                    store.openCodeReference(filePath: url.path, line: nil)
                }
            } label: {
                HStack(spacing: 6) {
                    Spacer().frame(width: CGFloat(level) * 14)
                    Image(systemName: isDirectory ? (isExpanded ? "chevron.down" : "chevron.right") : "")
                        .font(.system(size: 8, weight: .bold))
                        .frame(width: 10)
                    Image(systemName: isDirectory ? "folder" : codeIcon(for: url.lastPathComponent))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(isDirectory ? Color.secondary : Color.accentColor)
                        .frame(width: 15)
                    Text(url.lastPathComponent)
                        .font(.system(size: 11.5, weight: .medium))
                        .lineLimit(1)
                    Spacer()
                }
                .padding(.horizontal, 7)
                .frame(height: 25)
                .background(store.selectedCodeFile?.path == url.path ? Color.primary.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isDirectory && isExpanded {
                ForEach(children, id: \.path) { child in
                    IDEProjectTreeRow(url: child, level: level + 1)
                }
            }
        }
        .padding(.horizontal, 5)
    }

    private var children: [URL] {
        guard isDirectory, ![".git", "DerivedData", "Build"].contains(url.lastPathComponent) else { return [] }
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        )) ?? []
        return urls.sorted { lhs, rhs in
            let lhsDirectory = (try? lhs.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            let rhsDirectory = (try? rhs.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            if lhsDirectory != rhsDirectory { return lhsDirectory && !rhsDirectory }
            return lhs.lastPathComponent.localizedCaseInsensitiveCompare(rhs.lastPathComponent) == .orderedAscending
        }
    }
}

private struct IDEFileSearchResult: View {
    @EnvironmentObject private var store: AssistantStore
    var url: URL

    var body: some View {
        Button { store.openCodeReference(filePath: url.path, line: nil) } label: {
            HStack(spacing: 7) {
                Image(systemName: codeIcon(for: url.lastPathComponent)).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 1) {
                    Text(url.lastPathComponent).font(.system(size: 11.5, weight: .semibold))
                    Text(url.deletingLastPathComponent().path)
                        .font(.system(size: 9.5, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private func codeIcon(for name: String) -> String {
    switch URL(fileURLWithPath: name).pathExtension.lowercased() {
    case "swift": "swift"
    case "json", "js", "ts", "tsx", "jsx", "py", "html", "css": "chevron.left.forwardslash.chevron.right"
    case "md", "txt": "doc.text"
    default: "doc"
    }
}
