import Foundation

struct RuntimeShellCommand: Identifiable, Hashable {
    var id = UUID()
    var action: RuntimeAction
    var component: RuntimeComponent?
    var executable: String
    var arguments: [String]
    var environment: [String: String] = [:]
    var workingDirectory: URL? = nil
    var requiresApproval: Bool
    var sourceURL: URL?
    var impact: String

    var displayCommand: String {
        ([executable] + arguments).map(Self.shellQuoted).joined(separator: " ")
    }

    nonisolated static func shellQuoted(_ value: String) -> String {
        guard !value.isEmpty else { return "''" }
        let safe = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_+-./:=,@%")
        if value.unicodeScalars.allSatisfy({ safe.contains($0) }) {
            return value
        }
        return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

struct RuntimeCommandResult: Hashable {
    var exitCode: Int32
    var output: String
    var errorOutput: String

    var succeeded: Bool { exitCode == 0 }
}

protocol RuntimeProcessRunning {
    func run(_ command: RuntimeShellCommand, onOutput: @escaping (String) -> Void) async -> RuntimeCommandResult
}

final class RuntimeProcessRunner: RuntimeProcessRunning {
    func run(_ command: RuntimeShellCommand, onOutput: @escaping (String) -> Void) async -> RuntimeCommandResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: command.executable)
                process.arguments = command.arguments
                process.currentDirectoryURL = command.workingDirectory
                if !command.environment.isEmpty {
                    var environment = ProcessInfo.processInfo.environment
                    command.environment.forEach { environment[$0.key] = $0.value }
                    process.environment = environment
                }

                let stdout = Pipe()
                let stderr = Pipe()
                process.standardOutput = stdout
                process.standardError = stderr

                var output = ""
                var errorOutput = ""
                let lock = NSLock()

                stdout.fileHandleForReading.readabilityHandler = { handle in
                    let data = handle.availableData
                    guard !data.isEmpty else { return }
                    let text = String(decoding: data, as: UTF8.self)
                    lock.lock()
                    output += text
                    lock.unlock()
                    DispatchQueue.main.async { onOutput(text) }
                }

                stderr.fileHandleForReading.readabilityHandler = { handle in
                    let data = handle.availableData
                    guard !data.isEmpty else { return }
                    let text = String(decoding: data, as: UTF8.self)
                    lock.lock()
                    errorOutput += text
                    lock.unlock()
                    DispatchQueue.main.async { onOutput(text) }
                }

                do {
                    try process.run()
                    process.waitUntilExit()
                    stdout.fileHandleForReading.readabilityHandler = nil
                    stderr.fileHandleForReading.readabilityHandler = nil
                    lock.lock()
                    let finalOutput = output
                    let finalError = errorOutput
                    lock.unlock()
                    continuation.resume(returning: RuntimeCommandResult(exitCode: process.terminationStatus, output: finalOutput, errorOutput: finalError))
                } catch {
                    stdout.fileHandleForReading.readabilityHandler = nil
                    stderr.fileHandleForReading.readabilityHandler = nil
                    continuation.resume(returning: RuntimeCommandResult(exitCode: 1, output: output, errorOutput: error.localizedDescription))
                }
            }
        }
    }
}

enum RuntimeStatusParsers {
    nonisolated static func parseOllamaModels(from data: Data) -> [String] {
        struct TagsResponse: Decodable {
            struct Model: Decodable {
                var name: String?
                var model: String?
            }

            var models: [Model]
        }

        guard let decoded = try? JSONDecoder().decode(TagsResponse.self, from: data) else { return [] }
        return decoded.models.compactMap { $0.name ?? $0.model }.sorted()
    }

    nonisolated static func parseVersion(from output: String) -> String? {
        let tokens = output
            .replacingOccurrences(of: "\n", with: " ")
            .split(separator: " ")
            .map(String.init)
        return tokens.first { token in
            token.range(of: #"v?\d+(\.\d+){1,3}"#, options: .regularExpression) != nil
        }?.trimmingCharacters(in: CharacterSet(charactersIn: "v,;()[]"))
    }

    nonisolated static func nodeVersionIsCompatible(_ output: String) -> Bool {
        guard let version = parseVersion(from: output) else { return false }
        let parts = version.split(separator: ".").compactMap { Int($0) }
        guard let major = parts.first else { return false }
        let minor = parts.count > 1 ? parts[1] : 0
        return major >= 24 || major == 23 && minor >= 11 || major == 22 && minor >= 19
    }

    nonisolated static func openClawGatewayIsRunning(from output: String) -> Bool {
        let lower = output.lowercased()
        return lower.contains("18789") || lower.contains("listening") || lower.contains("running")
    }
}
