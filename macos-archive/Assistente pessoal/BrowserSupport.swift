import Combine
import SwiftUI
import WebKit

/// Real browser state shared across sidebar open/close cycles.
final class BrowserModel: NSObject, ObservableObject {
    let webView: WKWebView

    @Published var urlText: String
    @Published var isLoading = false
    @Published var canGoBack = false
    @Published var canGoForward = false

    override init() {
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        urlText = "https://www.google.com"
        super.init()
        webView.navigationDelegate = self
        load(urlText)
    }

    func submit() {
        load(urlText)
    }

    func load(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let candidate: String
        if trimmed.contains("://") {
            candidate = trimmed
        } else if trimmed.contains("."), !trimmed.contains(" ") {
            candidate = "https://\(trimmed)"
        } else {
            let query = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed
            candidate = "https://www.google.com/search?q=\(query)"
        }

        guard let url = URL(string: candidate) else { return }
        webView.load(URLRequest(url: url))
    }

    func goBack() {
        webView.goBack()
    }

    func goForward() {
        webView.goForward()
    }

    func reload() {
        if webView.url == nil {
            load(urlText)
        } else {
            webView.reload()
        }
    }
}

extension BrowserModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        syncNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        if let current = webView.url?.absoluteString {
            urlText = current
        }
        syncNavigationState()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        syncNavigationState()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        syncNavigationState()
    }

    private func syncNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }
}

struct WebView: NSViewRepresentable {
    let webView: WKWebView

    func makeNSView(context: Context) -> WKWebView {
        webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

struct BrowserPane: View {
    @ObservedObject var model: BrowserModel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button {
                    model.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled(!model.canGoBack)
                .help("Voltar")

                Button {
                    model.goForward()
                } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled(!model.canGoForward)
                .help("Avançar")

                Button {
                    model.reload()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Recarregar")

                TextField("Buscar ou digitar URL", text: $model.urlText)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11))
                    .onSubmit {
                        model.submit()
                    }
            }
            .buttonStyle(.borderless)
            .padding(.vertical, 8)
            .padding(.trailing, 8)
            // Abre espaço à esquerda para o botão de tipo de tela flutuante.
            .padding(.leading, 74)
            .background(Color.primary.opacity(0.04))

            Divider()

            WebView(webView: model.webView)

            if model.isLoading {
                ProgressView()
                    .progressViewStyle(.linear)
                    .controlSize(.small)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
            }
        }
    }
}
