import SwiftUI

extension Color {
    static let appBackground = Color(nsColor: .windowBackgroundColor)
    static let appPanel = Color(nsColor: .controlBackgroundColor)
    static let appSeparator = Color(nsColor: .separatorColor)
}

struct LiquidGlassCard: ViewModifier {
    var cornerRadius: CGFloat = 18
    var interactive = true
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        content
            .background {
                if reduceTransparency {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color(nsColor: .controlBackgroundColor))
                } else {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.regularMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .strokeBorder(.white.opacity(0.14), lineWidth: 0.7)
                        }
                }
            }
            .glassEffect(interactive ? .regular.interactive() : .regular, in: .rect(cornerRadius: cornerRadius))
    }
}

extension View {
    func liquidGlass(cornerRadius: CGFloat = 18, interactive: Bool = true) -> some View {
        modifier(LiquidGlassCard(cornerRadius: cornerRadius, interactive: interactive))
    }

    func subtlePanel(cornerRadius: CGFloat = 14) -> some View {
        background {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.72))
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.8)
                }
        }
    }

    /// A semantic processing state used while the assistant is actively changing
    /// the content below it. The light travels through the surface instead of
    /// replacing the content with an indeterminate spinner.
    func aiProcessingGlow(
        isActive: Bool,
        cornerRadius: CGFloat = 16,
        label: String? = nil,
        style: AIProcessingGlowStyle = .immersive
    ) -> some View {
        overlay {
            if isActive {
                AIProcessingGlow(cornerRadius: cornerRadius, label: label, style: style)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: isActive)
    }
}

enum AIProcessingGlowStyle: Equatable {
    case immersive
    case border
}

struct AIProcessingGlow: View {
    var cornerRadius: CGFloat = 16
    var label: String? = nil
    var style: AIProcessingGlowStyle = .immersive
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { timeline in
            GeometryReader { proxy in
                let progress = reduceMotion ? 0.55 : timeline.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: 2.8) / 2.8
                let travel = proxy.size.width + 260
                let x = -130 + travel * progress

                ZStack(alignment: .bottomLeading) {
                    if style == .immersive {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(Color.black.opacity(0.18))

                        Ellipse()
                            .fill(
                                RadialGradient(
                                    colors: [
                                        Color.cyan.opacity(0.42),
                                        Color.indigo.opacity(0.30),
                                        Color.purple.opacity(0.12),
                                        .clear
                                    ],
                                    center: .center,
                                    startRadius: 0,
                                    endRadius: 130
                                )
                            )
                            .frame(width: 260, height: max(proxy.size.height * 1.4, 150))
                            .blur(radius: 22)
                            .position(x: x, y: proxy.size.height * 0.52)
                            .blendMode(.plusLighter)
                    }

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            AngularGradient(
                                colors: [
                                    Color.indigo.opacity(0.9),
                                    Color.cyan.opacity(0.78),
                                    Color.clear,
                                    Color.purple.opacity(0.72),
                                    Color.indigo.opacity(0.9)
                                ],
                                center: .center,
                                angle: .degrees(progress * 360)
                            ),
                            lineWidth: 1.6
                        )
                        .shadow(color: Color.indigo.opacity(0.5), radius: 8)

                    if let label, style == .immersive {
                        Label(label, systemImage: "sparkles")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.black.opacity(0.48), in: Capsule())
                            .padding(12)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "A inteligência artificial está processando este conteúdo")
    }
}

struct StatusPill: View {
    var title: String
    var tint: Color
    var symbol: String? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.system(size: 8, weight: .bold))
            } else {
                Circle()
                    .fill(tint)
                    .frame(width: 6, height: 6)
            }
            Text(title)
                .font(.caption2.weight(.semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tint.opacity(0.12), in: Capsule())
        .overlay(Capsule().strokeBorder(tint.opacity(0.22), lineWidth: 0.7))
    }
}

struct EmptyStateView: View {
    var symbol: String
    var title: String
    var subtitle: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct SectionHeader: View {
    var title: String
    var subtitle: String?
    var symbol: String?

    var body: some View {
        HStack(spacing: 10) {
            if let symbol {
                Image(systemName: symbol)
                    .foregroundStyle(.tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
    }
}
