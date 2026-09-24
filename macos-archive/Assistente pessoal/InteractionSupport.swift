import AppKit
import SwiftUI

struct ComposerTextView: NSViewRepresentable {
    @Binding var text: String
    var fontSize: CGFloat
    var onCommit: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        let textView = CommitTextView()
        textView.delegate = context.coordinator
        textView.drawsBackground = false
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.textContainerInset = NSSize(width: 2, height: 7)
        textView.font = .systemFont(ofSize: fontSize)
        textView.string = text
        textView.onCommit = onCommit
        textView.minSize = NSSize(width: 0, height: 34)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        scrollView.documentView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? CommitTextView else { return }
        context.coordinator.parent = self
        textView.onCommit = onCommit
        textView.font = .systemFont(ofSize: fontSize)
        if textView.string != text {
            textView.string = text
            textView.setSelectedRange(NSRange(location: text.utf16.count, length: 0))
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ComposerTextView
        init(parent: ComposerTextView) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
        }
    }
}

private final class CommitTextView: NSTextView {
    var onCommit: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        let isReturn = event.keyCode == 36 || event.keyCode == 76
        if isReturn && !event.modifierFlags.contains(.shift) {
            onCommit?()
            return
        }
        super.keyDown(with: event)
    }
}

struct CodeEditingTextView: NSViewRepresentable {
    @Binding var text: String
    var fontSize: CGFloat = 13
    var onSave: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = false
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = true
        scrollView.backgroundColor = NSColor(calibratedWhite: 0.075, alpha: 1)

        let textView = IDETextView()
        textView.delegate = context.coordinator
        textView.string = text
        textView.onSave = onSave
        textView.font = .monospacedSystemFont(ofSize: fontSize, weight: .regular)
        textView.backgroundColor = scrollView.backgroundColor
        textView.textColor = .labelColor
        textView.insertionPointColor = .controlAccentColor
        textView.isRichText = false
        textView.allowsUndo = true
        textView.usesFindPanel = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = true
        textView.autoresizingMask = [.width]
        textView.textContainerInset = NSSize(width: 14, height: 12)
        textView.minSize = .zero
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.containerSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.widthTracksTextView = false
        scrollView.documentView = textView
        context.coordinator.applyHighlight(to: textView)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? IDETextView else { return }
        context.coordinator.parent = self
        textView.onSave = onSave
        textView.font = .monospacedSystemFont(ofSize: fontSize, weight: .regular)
        if textView.string != text {
            let selection = textView.selectedRange()
            textView.string = text
            textView.setSelectedRange(NSRange(location: min(selection.location, text.utf16.count), length: 0))
            context.coordinator.applyHighlight(to: textView)
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: CodeEditingTextView
        private var isApplyingHighlight = false

        init(parent: CodeEditingTextView) { self.parent = parent }

        func textDidChange(_ notification: Notification) {
            guard !isApplyingHighlight, let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
            applyHighlight(to: textView)
        }

        func applyHighlight(to textView: NSTextView) {
            guard !isApplyingHighlight, let storage = textView.textStorage else { return }
            isApplyingHighlight = true
            defer { isApplyingHighlight = false }
            let selection = textView.selectedRange()
            let rendered = NSAttributedString(HighlightedCodeText.attributed(textView.string))
            let fullRange = NSRange(location: 0, length: storage.length)
            storage.beginEditing()
            storage.setAttributes([
                .font: NSFont.monospacedSystemFont(ofSize: parent.fontSize, weight: .regular),
                .foregroundColor: NSColor.labelColor
            ], range: fullRange)
            rendered.enumerateAttribute(.foregroundColor, in: NSRange(location: 0, length: rendered.length)) { value, range, _ in
                if let value { storage.addAttribute(.foregroundColor, value: value, range: range) }
            }
            storage.endEditing()
            textView.setSelectedRange(selection)
        }
    }
}

private final class IDETextView: NSTextView {
    var onSave: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers?.lowercased() == "s" {
            onSave?()
            return
        }
        super.keyDown(with: event)
    }
}

struct VoiceWaveform: View {
    var level: Double
    var isActive: Bool
    var color: Color = .accentColor
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.055, paused: !isActive || reduceMotion)) { timeline in
            let phase = timeline.date.timeIntervalSinceReferenceDate * 7
            HStack(spacing: 3) {
                ForEach(0..<34, id: \.self) { index in
                    let wave = abs(sin(phase + Double(index) * 0.47))
                    let envelope = 0.35 + 0.65 * sin(Double(index) / 33 * .pi)
                    let activity = isActive ? max(level, 0.12) : 0.04
                    Capsule()
                        .fill(color.opacity(0.92))
                        .frame(width: 2, height: 4 + 28 * wave * envelope * activity)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 38, maxHeight: 38)
            .animation(reduceMotion ? nil : .linear(duration: 0.08), value: level)
        }
        .accessibilityLabel(isActive ? "Atividade de voz" : "Voz inativa")
    }
}

struct TokenUsageIndicator: View {
    var usage: TokenUsage

    private var color: Color {
        if usage.fraction >= 0.9 { return .red }
        if usage.fraction >= 0.75 { return .orange }
        return Color(red: 0.22, green: 0.48, blue: 0.98)
    }

    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.18), lineWidth: 2.2)
            Circle()
                .trim(from: 0, to: max(usage.fraction, 0.008))
                .stroke(color, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 17, height: 17)
        .frame(width: 28, height: 28)
        .accessibilityLabel("Uso de contexto")
        .accessibilityValue("\(usage.totalTokens) de \(usage.contextLimit) tokens")
    }
}

struct FlatDropdown: View {
    var title: String
    var values: [String]
    @Binding var selection: String
    var width: CGFloat = 220
    @State private var isOpen = false

    var body: some View {
        Button { isOpen.toggle() } label: {
            HStack(spacing: 8) {
                Text(title).foregroundStyle(.primary)
                Spacer()
                Text(selection).foregroundStyle(.secondary).lineLimit(1)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 11)
            .frame(width: width, height: 32)
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.primary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .popover(isPresented: $isOpen, arrowEdge: .bottom) {
            VStack(spacing: 2) {
                ForEach(values, id: \.self) { value in
                    Button {
                        selection = value
                        isOpen = false
                    } label: {
                        HStack {
                            Text(value).lineLimit(1)
                            Spacer()
                            if value == selection { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                        }
                        .padding(.horizontal, 10)
                        .frame(height: 30)
                        .background(value == selection ? Color.accentColor.opacity(0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 7))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .frame(width: width)
            .background(Color(nsColor: .windowBackgroundColor))
        }
    }
}

struct HighlightedCodeText: View {
    var code: String
    var fontSize: CGFloat

    var body: some View {
        Text(Self.attributed(code))
            .font(.system(size: fontSize, design: .monospaced))
            .textSelection(.enabled)
            .lineSpacing(3)
    }

    static func attributed(_ code: String) -> AttributedString {
        let source = code as NSString
        let result = NSMutableAttributedString(string: code)
        let full = NSRange(location: 0, length: source.length)
        result.addAttribute(.foregroundColor, value: NSColor.labelColor, range: full)
        apply(#"\b(import|from|class|struct|enum|protocol|extension|private|public|internal|static|func|def|let|var|const|if|else|for|while|return|async|await|try|throws|throw|in|as|guard|switch|case|break|continue|true|false|None|nil|self|Self)\b"#, color: .systemPurple, to: result, range: full)
        apply(#"(['\"])(?:(?=(\\?))\2.)*?\1"#, color: .systemGreen, to: result, range: full)
        apply(#"\b\d+(?:\.\d+)?\b"#, color: .systemPink, to: result, range: full)
        apply(#"\b[A-Z][A-Za-z0-9_]*\b"#, color: .systemOrange, to: result, range: full)
        apply(#"(?m)(#|//).*?$"#, color: .secondaryLabelColor, to: result, range: full)
        return AttributedString(result)
    }

    private static func apply(_ pattern: String, color: NSColor, to text: NSMutableAttributedString, range: NSRange) {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
        regex.enumerateMatches(in: text.string, range: range) { match, _, _ in
            guard let match else { return }
            text.addAttribute(.foregroundColor, value: color, range: match.range)
        }
    }
}
