import Foundation

struct RuntimePersistedState: Codable, Hashable {
    var runtimeVersion: String
    var statuses: [RuntimeStatus]
    var lastHealthCheck: Date?
}

final class RuntimeStateStore {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func defaultStateURL() -> URL {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return support
            .appendingPathComponent("Open Assistant", isDirectory: true)
            .appendingPathComponent("runtime-state.json")
    }

    func save(statuses: [RuntimeComponent: RuntimeStatus], to path: String? = nil) throws {
        let url = resolvedURL(path: path)
        let directory = url.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
        let payload = RuntimePersistedState(
            runtimeVersion: "1.0.0",
            statuses: RuntimeComponent.allCases.compactMap { statuses[$0] },
            lastHealthCheck: Date()
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(payload).write(to: url, options: [.atomic])
    }

    func load(from path: String? = nil) -> RuntimePersistedState? {
        let url = resolvedURL(path: path)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(RuntimePersistedState.self, from: data)
    }

    private func resolvedURL(path: String?) -> URL {
        guard let path, !path.isEmpty else { return defaultStateURL() }
        let expanded = NSString(string: path).expandingTildeInPath
        return URL(fileURLWithPath: expanded)
    }
}

final class RuntimeLogStore {
    private(set) var entries: [RuntimeLogEntry] = []

    func append(_ entry: RuntimeLogEntry) {
        entries.append(redacted(entry))
        if entries.count > 1200 {
            entries.removeFirst(entries.count - 1200)
        }
    }

    func all() -> [RuntimeLogEntry] {
        entries
    }

    func clear() {
        entries.removeAll()
    }

    private func redacted(_ entry: RuntimeLogEntry) -> RuntimeLogEntry {
        var copy = entry
        copy.message = redactSecrets(copy.message)
        return copy
    }

    private func redactSecrets(_ text: String) -> String {
        let secretPatterns = [
            #"sk-[A-Za-z0-9_\-]{12,}"#,
            #"sk-ant-[A-Za-z0-9_\-]{12,}"#,
            #"AIza[A-Za-z0-9_\-]{20,}"#
        ]
        let withoutInlineSecrets = secretPatterns.reduce(text) { current, pattern in
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return current }
            let range = NSRange(current.startIndex..., in: current)
            return regex.stringByReplacingMatches(in: current, range: range, withTemplate: "REDACTED")
        }
        guard let assignmentRegex = try? NSRegularExpression(pattern: #"(?i)(token|api[_-]?key|secret)=([^\s]+)"#) else {
            return withoutInlineSecrets
        }
        let range = NSRange(withoutInlineSecrets.startIndex..., in: withoutInlineSecrets)
        return assignmentRegex.stringByReplacingMatches(in: withoutInlineSecrets, range: range, withTemplate: "$1=REDACTED")
    }
}
