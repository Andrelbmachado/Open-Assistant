import SwiftUI

struct FilesView: View {
    @EnvironmentObject private var store: AssistantStore

    var body: some View {
        HStack(spacing: 0) {
            fileList
                .frame(width: 340)

            fileDetail
        }
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.58))
    }

    private var fileList: some View {
        VStack(spacing: 0) {
            HStack {
                Label("Sandbox Files", systemImage: "folder")
                    .font(.caption.weight(.bold))
                    .textCase(.uppercase)
                Spacer()
                Text("/Desktop/design-trends")
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.tint)
            }
            .padding(.horizontal, 18)
            .frame(height: 58)
            .background(.ultraThinMaterial)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.primary.opacity(0.07)).frame(height: 1)
            }

            ScrollView {
                LazyVStack(spacing: 7) {
                    ForEach(store.files) { file in
                        FileRow(file: file)
                    }
                }
                .padding(12)
            }
        }
        .background(.regularMaterial)
        .overlay(alignment: .trailing) {
            Rectangle().fill(Color.primary.opacity(0.08)).frame(width: 1)
        }
    }

    private var fileDetail: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.selectedFile.name)
                        .font(.headline)
                    Text(store.selectedFile.path)
                        .font(.system(size: 16, design: .monospaced))
                        .foregroundStyle(.tint)
                }
                Spacer()

                Button {
                    store.copyToClipboard(store.selectedFile.content)
                } label: {
                    Label("Copiar Código", systemImage: "doc.on.doc")
                }
            }
            .padding(.horizontal, 24)
            .frame(height: 58)
            .background(.ultraThinMaterial)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.primary.opacity(0.07)).frame(height: 1)
            }

            ScrollView {
                SourceViewer(text: store.selectedFile.content)
            }
        }
    }
}

private struct FileRow: View {
    @EnvironmentObject private var store: AssistantStore
    var file: FileArtifact

    var body: some View {
        Button {
            store.selectedFileId = file.id
        } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundStyle(file.type == .html || file.type == .css || file.type == .json ? Color.accentColor : Color.blue)
                    .frame(width: 22, height: 22)
                    .padding(7)
                    .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 3) {
                    Text(file.name)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                    Text("\(file.size) • \(file.createdBy)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(11)
            .background(store.selectedFileId == file.id ? Color.accentColor.opacity(0.15) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
            .overlay {
                if store.selectedFileId == file.id {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.accentColor.opacity(0.35), lineWidth: 0.8)
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Abrir") {
                store.selectedFileId = file.id
            }
            Button("Copiar Conteúdo") {
                store.copyToClipboard(file.content)
            }
        }
    }

    private var symbol: String {
        switch file.type {
        case .html, .css, .json: "chevron.left.forwardslash.chevron.right"
        case .txt, .md, .report: "doc.text"
        case .log: "list.bullet.rectangle"
        }
    }
}

private struct SourceViewer: View {
    var text: String

    var body: some View {
        ScrollView(.horizontal) {
            Text(text)
                .font(.caption.monospaced())
                .textSelection(.enabled)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.72))
    }
}
