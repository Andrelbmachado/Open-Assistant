import Foundation

enum MCPVerificationError: LocalizedError {
    case invalidCommand
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidCommand: "O comando MCP está vazio ou é inválido."
        case .commandFailed(let details): details
        }
    }
}

enum MCPCommandVerifier {
    nonisolated static func verify(_ command: String) -> Result<String, Error> {
        let parts = command.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard let executable = parts.first else {
            return .failure(MCPVerificationError.invalidCommand)
        }

        let package = executable == "npx" ? parts.dropFirst().first(where: { !$0.hasPrefix("-") }) : nil
        let quotedExecutable = shellQuote(executable)
        let check: String
        if let package {
            check = "command -v -- \(quotedExecutable) >/dev/null && npm view \(shellQuote(package)) version --json"
        } else {
            check = "command -v -- \(quotedExecutable)"
        }

        let process = Process()
        let output = Pipe()
        let errors = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", check]
        process.standardOutput = output
        process.standardError = errors

        do {
            try process.run()
            process.waitUntilExit()
            let stdout = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let stderr = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard process.terminationStatus == 0 else {
                let details = stderr.isEmpty ? "Executável ou pacote não encontrado." : stderr
                return .failure(MCPVerificationError.commandFailed(details))
            }
            return .success(stdout.isEmpty ? executable : stdout)
        } catch {
            return .failure(error)
        }
    }

    nonisolated private static func shellQuote(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
    }
}
