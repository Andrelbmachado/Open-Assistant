import Foundation

struct AIConversationMessage: Sendable {
    let role: String
    let content: String
}

struct AIProviderReply: Sendable {
    var text: String
    var blocks: [AIProviderBlock] = []
    var voiceText: String? = nil
    var usage: TokenUsage? = nil
    var generatedImageData: Data? = nil
    var generatedImageMimeType: String? = nil
}

private struct AIProviderRawReply: Sendable {
    var text: String
    var inputTokens: Int?
    var outputTokens: Int?
}

struct AIProviderBlock: Codable, Sendable {
    var type: String
    var title: String?
    var language: String?
    var code: String?
    var previousCode: String?
    var filePath: String?
    var command: String?
    var steps: [String]?
    var dashboard: AIProviderDashboard?
}

struct AIProviderDashboard: Codable, Sendable {
    var title: String
    var subtitle: String?
    var metrics: [AIProviderMetric]?
    var points: [AIProviderPoint]?
}

struct AIProviderMetric: Codable, Sendable {
    var title: String
    var value: Double
    var unit: String?
    var change: Double?
}

struct AIProviderPoint: Codable, Sendable {
    var label: String
    var value: Double
}

enum AIProviderError: LocalizedError {
    case missingCredential(String)
    case invalidEndpoint(String)
    case invalidResponse
    case api(status: Int, message: String)
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .missingCredential(let provider):
            return "Adicione uma chave válida de \(provider) em Ajustes > Chaves API."
        case .invalidEndpoint(let endpoint):
            return "Endpoint inválido: \(endpoint)"
        case .invalidResponse:
            return "O provedor retornou uma resposta em formato inesperado."
        case .api(let status, let message):
            return "O provedor recusou a solicitação (HTTP \(status)): \(message)"
        case .emptyResponse:
            return "O modelo respondeu sem conteúdo de texto."
        }
    }
}

actor AIProviderService {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func reply(
        model: ModelConfig,
        messages: [AIConversationMessage],
        credential: String?,
        localPort: Int
    ) async throws -> AIProviderReply {
        if model.provider == .openai,
           let prompt = messages.last(where: { $0.role == "user" })?.content,
           Self.looksLikeImageGenerationRequest(prompt) {
            guard let credential, !credential.isEmpty else {
                throw AIProviderError.missingCredential("OpenAI")
            }
            return try await generateOpenAIImage(prompt: prompt, key: credential)
        }

        let contextualMessages = [AIConversationMessage(role: "system", content: Self.responseContract)] + messages.filter { $0.role != "system" }
        let raw: AIProviderRawReply
        switch model.provider {
        case .openai:
            guard let credential, !credential.isEmpty else { throw AIProviderError.missingCredential("OpenAI") }
            raw = try await openAI(model: model.apiModel, messages: contextualMessages, key: credential)
        case .anthropic:
            guard let credential, !credential.isEmpty else { throw AIProviderError.missingCredential("Anthropic") }
            raw = try await anthropic(model: model.apiModel, messages: contextualMessages, key: credential)
        case .local:
            raw = try await ollama(model: model.apiModel, messages: contextualMessages, port: localPort)
        case .together, .deepseek, .perplexity, .fireworks:
            guard let credential, !credential.isEmpty else {
                throw AIProviderError.missingCredential(model.provider.displayName)
            }
            raw = try await openAICompatible(
                endpoint: model.provider.endpoint,
                model: model.apiModel,
                messages: contextualMessages,
                key: credential,
                extraHeaders: model.provider.extraHeaders
            )
        }
        var parsed = Self.parseReply(raw.text)
        if let input = raw.inputTokens, let output = raw.outputTokens {
            parsed.usage = TokenUsage(inputTokens: input, outputTokens: output, contextLimit: model.contextWindow, isEstimated: false)
        }
        return parsed
    }

    nonisolated static func looksLikeImageGenerationRequest(_ text: String) -> Bool {
        let normalized = text
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pt_BR"))
            .lowercased()
        let actions = ["gere", "gerar", "crie", "criar", "faca", "desenhe", "produza", "generate", "create", "draw", "make"]
        let media = ["imagem", "foto", "ilustracao", "arte", "image", "picture", "photo", "illustration", "artwork"]
        return actions.contains(where: normalized.contains) && media.contains(where: normalized.contains)
    }

    nonisolated static func parseReply(_ raw: String) -> AIProviderReply {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let json = trimmed
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let data = json.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let text = object["text"] as? String,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let blocks = (object["blocks"] as? [[String: Any]] ?? []).map { item in
                let dashboardObject = item["dashboard"] as? [String: Any]
                let dashboard = dashboardObject.flatMap { value -> AIProviderDashboard? in
                    guard let title = value["title"] as? String else { return nil }
                    let metrics = (value["metrics"] as? [[String: Any]] ?? []).compactMap { metric -> AIProviderMetric? in
                        guard let title = metric["title"] as? String, let value = metric["value"] as? Double else { return nil }
                        return AIProviderMetric(title: title, value: value, unit: metric["unit"] as? String, change: metric["change"] as? Double)
                    }
                    let points = (value["points"] as? [[String: Any]] ?? []).compactMap { point -> AIProviderPoint? in
                        guard let label = point["label"] as? String, let value = point["value"] as? Double else { return nil }
                        return AIProviderPoint(label: label, value: value)
                    }
                    return AIProviderDashboard(title: title, subtitle: value["subtitle"] as? String, metrics: metrics, points: points)
                }
                return AIProviderBlock(
                    type: item["type"] as? String ?? "text",
                    title: item["title"] as? String,
                    language: item["language"] as? String,
                    code: item["code"] as? String,
                    previousCode: item["previousCode"] as? String,
                    filePath: item["filePath"] as? String,
                    command: item["command"] as? String,
                    steps: item["steps"] as? [String],
                    dashboard: dashboard
                )
            }
            return AIProviderReply(text: text, blocks: blocks, voiceText: object["voiceText"] as? String)
        }
        if let markdownReply = parseMarkdownCodeBlocks(trimmed) {
            return markdownReply
        }
        return AIProviderReply(text: trimmed)
    }

    nonisolated private static func parseMarkdownCodeBlocks(_ text: String) -> AIProviderReply? {
        guard let regex = try? NSRegularExpression(pattern: #"```([A-Za-z0-9_+.-]*)\s*\n([\s\S]*?)```"#) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = regex.matches(in: text, range: range)
        guard !matches.isEmpty else { return nil }
        let blocks = matches.compactMap { match -> AIProviderBlock? in
            guard let codeRange = Range(match.range(at: 2), in: text) else { return nil }
            let language = Range(match.range(at: 1), in: text).map { String(text[$0]) }
            return AIProviderBlock(
                type: "code",
                title: "Código",
                language: language?.isEmpty == false ? language : nil,
                code: String(text[codeRange]).trimmingCharacters(in: .newlines),
                previousCode: nil,
                filePath: nil,
                command: nil,
                steps: nil,
                dashboard: nil
            )
        }
        let narrative = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return AIProviderReply(text: narrative.isEmpty ? "Código solicitado:" : narrative, blocks: blocks)
    }

    private static let responseContract = """
    Você é o assistente dentro de um app macOS. Responda sempre de acordo com a conversa e nunca invente ações executadas, arquivos alterados, fontes ou resultados. Use texto direto para perguntas comuns. Use plano somente para tarefas realmente compostas. Se houver código útil, inclua apenas o trecho necessário. Se o usuário pedir análise visual, financeira ou temporal, você pode gerar um dashboard.

    Retorne JSON válido, sem markdown externo, no formato:
    {"text":"resposta principal","voiceText":"versão curta opcional para fala","blocks":[{"type":"code|action-plan|command-run|dashboard","title":"título","language":"swift","filePath":"arquivo opcional","previousCode":"código antes da alteração, quando aplicável","code":"código novo","command":"...","steps":["etapa"],"dashboard":{"title":"...","subtitle":"...","metrics":[{"title":"...","value":0,"unit":"","change":0}],"points":[{"label":"...","value":0}]}}]}
    Omita blocks quando não forem necessários. Nunca use file-diff sem receber do runtime um diff real.
    """

    func verify(provider: ModelConfig.Provider, credential: String) async throws {
        switch provider {
        case .openai:
            _ = try await request(url: URL(string: "https://api.openai.com/v1/models")!, method: "GET", headers: ["Authorization": "Bearer \(credential)"], body: nil)
        case .anthropic:
            _ = try await request(
                url: URL(string: "https://api.anthropic.com/v1/models")!,
                method: "GET",
                headers: ["x-api-key": credential, "anthropic-version": "2023-06-01"],
                body: nil
            )
        case .local:
            guard let url = URL(string: "http://127.0.0.1:11434/api/tags") else { return }
            _ = try await request(url: url, method: "GET", headers: [:], body: nil)
        case .together, .deepseek, .perplexity, .fireworks:
            let messages = [AIConversationMessage(role: "user", content: "Reply only OK.")]
            let model = Self.defaultModel(for: provider)
            _ = try await openAICompatible(endpoint: provider.endpoint, model: model, messages: messages, key: credential, extraHeaders: provider.extraHeaders, maxTokens: 8)
        }
    }

    private func openAI(model: String, messages: [AIConversationMessage], key: String) async throws -> AIProviderRawReply {
        let input = messages.map { ["role": $0.role, "content": $0.content] }
        let body = try JSONSerialization.data(withJSONObject: ["model": model, "input": input])
        let data = try await request(
            url: URL(string: "https://api.openai.com/v1/responses")!,
            method: "POST",
            headers: ["Authorization": "Bearer \(key)"],
            body: body
        )
        let root = try jsonObject(data)
        let output = root["output"] as? [[String: Any]] ?? []
        let text = output
            .flatMap { $0["content"] as? [[String: Any]] ?? [] }
            .compactMap { $0["text"] as? String }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw AIProviderError.emptyResponse }
        let usage = root["usage"] as? [String: Any]
        return AIProviderRawReply(
            text: text,
            inputTokens: usage?["input_tokens"] as? Int,
            outputTokens: usage?["output_tokens"] as? Int
        )
    }

    private func generateOpenAIImage(prompt: String, key: String) async throws -> AIProviderReply {
        let gptImageBody = try JSONSerialization.data(withJSONObject: [
            "model": "gpt-image-2",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "auto",
            "output_format": "png"
        ])
        let endpoint = URL(string: "https://api.openai.com/v1/images/generations")!
        let responseData: Data
        do {
            responseData = try await request(
                url: endpoint,
                method: "POST",
                headers: ["Authorization": "Bearer \(key)"],
                body: gptImageBody,
                timeout: 180
            )
        } catch AIProviderError.api(let status, _) where status == 403 || status == 404 {
            // Some API organizations have not enabled GPT Image yet. DALL·E 3
            // remains a supported generation model and returns the same base64
            // response shape when response_format is requested explicitly.
            let fallbackBody = try JSONSerialization.data(withJSONObject: [
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "quality": "standard",
                "response_format": "b64_json"
            ])
            responseData = try await request(
                url: endpoint,
                method: "POST",
                headers: ["Authorization": "Bearer \(key)"],
                body: fallbackBody,
                timeout: 180
            )
        }
        let root = try jsonObject(responseData)
        let items = root["data"] as? [[String: Any]] ?? []
        guard let encoded = items.first?["b64_json"] as? String,
              let imageData = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters),
              !imageData.isEmpty else {
            throw AIProviderError.invalidResponse
        }
        return AIProviderReply(
            text: "Imagem gerada com OpenAI.",
            voiceText: "A imagem está pronta.",
            generatedImageData: imageData,
            generatedImageMimeType: "image/png"
        )
    }

    private func anthropic(model: String, messages: [AIConversationMessage], key: String, maxTokens: Int = 4096) async throws -> AIProviderRawReply {
        let filtered = messages.filter { $0.role != "system" }.map { ["role": $0.role, "content": $0.content] }
        var payload: [String: Any] = ["model": model, "max_tokens": maxTokens, "messages": filtered]
        if let system = messages.first(where: { $0.role == "system" })?.content {
            payload["system"] = system
        }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await request(
            url: URL(string: "https://api.anthropic.com/v1/messages")!,
            method: "POST",
            headers: ["x-api-key": key, "anthropic-version": "2023-06-01"],
            body: body
        )
        let root = try jsonObject(data)
        let content = root["content"] as? [[String: Any]] ?? []
        let text = content.compactMap { $0["text"] as? String }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw AIProviderError.emptyResponse }
        let usage = root["usage"] as? [String: Any]
        return AIProviderRawReply(
            text: text,
            inputTokens: usage?["input_tokens"] as? Int,
            outputTokens: usage?["output_tokens"] as? Int
        )
    }

    private func ollama(model: String, messages: [AIConversationMessage], port: Int) async throws -> AIProviderRawReply {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/chat") else {
            throw AIProviderError.invalidEndpoint("Ollama localhost")
        }
        let mapped = messages.map { ["role": $0.role, "content": $0.content] }
        let body = try JSONSerialization.data(withJSONObject: ["model": model, "messages": mapped, "stream": false])
        let data = try await request(url: url, method: "POST", headers: [:], body: body)
        let root = try jsonObject(data)
        let message = root["message"] as? [String: Any]
        guard let text = message?["content"] as? String, !text.isEmpty else { throw AIProviderError.emptyResponse }
        return AIProviderRawReply(
            text: text,
            inputTokens: root["prompt_eval_count"] as? Int,
            outputTokens: root["eval_count"] as? Int
        )
    }

    private func openAICompatible(
        endpoint: String,
        model: String,
        messages: [AIConversationMessage],
        key: String,
        extraHeaders: [String: String],
        maxTokens: Int = 4096
    ) async throws -> AIProviderRawReply {
        guard let url = URL(string: endpoint) else { throw AIProviderError.invalidEndpoint(endpoint) }
        let mapped = messages.map { ["role": $0.role, "content": $0.content] }
        let body = try JSONSerialization.data(withJSONObject: ["model": model, "messages": mapped, "max_tokens": maxTokens, "stream": false])
        var headers = extraHeaders
        headers["Authorization"] = "Bearer \(key)"
        let data = try await request(url: url, method: "POST", headers: headers, body: body)
        let root = try jsonObject(data)
        let choices = root["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        guard let text = message?["content"] as? String, !text.isEmpty else { throw AIProviderError.emptyResponse }
        let usage = root["usage"] as? [String: Any]
        return AIProviderRawReply(
            text: text,
            inputTokens: usage?["prompt_tokens"] as? Int,
            outputTokens: usage?["completion_tokens"] as? Int
        )
    }

    private func request(url: URL, method: String, headers: [String: String], body: Data?, timeout: TimeInterval = 90) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AIProviderError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let root = try? jsonObject(data)
            let nested = root?["error"] as? [String: Any]
            let message = (nested?["message"] as? String) ?? (root?["message"] as? String) ?? String(data: data, encoding: .utf8) ?? "Erro desconhecido"
            throw AIProviderError.api(status: http.statusCode, message: message)
        }
        return data
    }

    private func jsonObject(_ data: Data) throws -> [String: Any] {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AIProviderError.invalidResponse
        }
        return root
    }

    nonisolated static func defaultModel(for provider: ModelConfig.Provider) -> String {
        switch provider {
        case .openai: "gpt-5.5"
        case .anthropic: "claude-sonnet-4-5"
        case .local: "llama3.2:3b"
        case .together: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
        case .deepseek: "deepseek-chat"
        case .perplexity: "sonar"
        case .fireworks: "accounts/fireworks/models/llama-v3p3-70b-instruct"
        }
    }
}
