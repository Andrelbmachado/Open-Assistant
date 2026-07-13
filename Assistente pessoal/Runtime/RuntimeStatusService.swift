import Foundation

protocol RuntimeHTTPClient {
    func get(_ url: URL) async throws -> Data
}

struct URLSessionRuntimeHTTPClient: RuntimeHTTPClient {
    func get(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 4
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<500).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        return data
    }
}

struct RuntimeNodeStatus: Hashable {
    var installed: Bool
    var compatible: Bool
    var version: String?
    var binaryPath: String?
}

protocol RuntimeStatusProviding {
    func checkAll(settings: AppSettings.LocalRuntime) async -> [RuntimeComponent: RuntimeStatus]
    func checkNodeJS() -> RuntimeNodeStatus
    func checkNetwork() async -> Bool
    func binaryPath(for command: String) -> String?
    func portOwner(port: Int) -> String?
}

final class RuntimeStatusService: RuntimeStatusProviding {
    private let httpClient: RuntimeHTTPClient

    init(httpClient: RuntimeHTTPClient = URLSessionRuntimeHTTPClient()) {
        self.httpClient = httpClient
    }

    func checkAll(settings: AppSettings.LocalRuntime) async -> [RuntimeComponent: RuntimeStatus] {
        async let ollama = checkOllama(settings: settings)
        async let openClaw = checkOpenClaw(settings: settings)
        async let mcp = checkMCPBridge(settings: settings)
        let statuses = await [ollama, openClaw, mcp]
        return Dictionary(uniqueKeysWithValues: statuses.map { ($0.component, $0) })
    }

    func checkNodeJS() -> RuntimeNodeStatus {
        guard let path = which("node") else {
            return RuntimeNodeStatus(installed: false, compatible: false, version: nil, binaryPath: nil)
        }
        let output = capture(path, ["--version"])
        return RuntimeNodeStatus(
            installed: true,
            compatible: RuntimeStatusParsers.nodeVersionIsCompatible(output),
            version: RuntimeStatusParsers.parseVersion(from: output),
            binaryPath: path
        )
    }

    func checkNetwork() async -> Bool {
        guard let url = URL(string: "https://ollama.com") else { return false }
        do {
            _ = try await httpClient.get(url)
            return true
        } catch {
            return false
        }
    }

    func binaryPath(for command: String) -> String? {
        which(command)
    }

    func portOwner(port: Int) -> String? {
        let output = capture("/bin/zsh", ["-lc", "/usr/sbin/lsof -nP -iTCP:\(port) -sTCP:LISTEN | tail -n +2 | head -1"])
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func checkOllama(settings: AppSettings.LocalRuntime) async -> RuntimeStatus {
        var status = RuntimeStatus.empty(.ollama)
        status.port = settings.ollamaPort
        status.url = "http://localhost:\(settings.ollamaPort)/api"
        status.lastCheckedAt = Date()

        let binary = which("ollama") ?? "/Applications/Ollama.app/Contents/Resources/ollama"
        guard FileManager.default.isExecutableFile(atPath: binary) else {
            status.state = .notInstalled
            return status
        }

        status.binaryPath = binary
        status.version = RuntimeStatusParsers.parseVersion(from: capture(binary, ["--version"]))

        guard let url = URL(string: "http://localhost:\(settings.ollamaPort)/api/tags") else {
            status.state = .installed
            return status
        }

        do {
            let data = try await httpClient.get(url)
            status.models = RuntimeStatusParsers.parseOllamaModels(from: data)
            status.state = .running
        } catch {
            status.state = .installed
            status.error = "API local sem resposta em localhost:\(settings.ollamaPort)."
        }

        return status
    }

    private func checkOpenClaw(settings: AppSettings.LocalRuntime) async -> RuntimeStatus {
        var status = RuntimeStatus.empty(.openClaw)
        status.port = settings.openClawPort
        status.url = "http://127.0.0.1:\(settings.openClawPort)"
        status.lastCheckedAt = Date()

        guard let binary = which("openclaw") else {
            status.state = .notInstalled
            return status
        }

        status.binaryPath = binary
        status.version = RuntimeStatusParsers.parseVersion(from: capture(binary, ["--version"]))

        let gatewayOutput = capture(binary, ["gateway", "status"])
        if RuntimeStatusParsers.openClawGatewayIsRunning(from: gatewayOutput) {
            status.state = .running
            return status
        }

        if let url = URL(string: "http://127.0.0.1:\(settings.openClawPort)") {
            do {
                _ = try await httpClient.get(url)
                status.state = .running
            } catch {
                status.state = .installed
                status.error = "Gateway local sem resposta em 127.0.0.1:\(settings.openClawPort)."
            }
        } else {
            status.state = .installed
        }

        return status
    }

    private func checkMCPBridge(settings: AppSettings.LocalRuntime) async -> RuntimeStatus {
        var status = RuntimeStatus.empty(.mcpBridge)
        status.url = "internal://openassistant-runtime-mcp"
        status.lastCheckedAt = Date()
        status.state = settings.allowLocalMCPBridge ? .installed : .notInstalled
        if !settings.allowLocalMCPBridge {
            status.error = "MCP local desativado nas preferencias."
        }
        return status
    }

    private func which(_ command: String) -> String? {
        let output = capture("/bin/zsh", ["-lc", "command -v \(RuntimeShellCommand.shellQuoted(command))"])
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func capture(_ executable: String, _ arguments: [String]) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = stdout
        do {
            try process.run()
            process.waitUntilExit()
            let data = stdout.fileHandleForReading.readDataToEndOfFile()
            return String(decoding: data, as: UTF8.self)
        } catch {
            return ""
        }
    }
}
