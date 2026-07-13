import Combine
import Darwin
import Foundation

struct ShellLine: Identifiable, Hashable {
    let id = UUID()
    var text: String
    var isInput: Bool
}

/// A real interactive shell session backed by /bin/zsh running on a pseudo-terminal.
final class ShellSession: ObservableObject, Identifiable {
    let id: String
    let title: String

    @Published var lines: [ShellLine] = []
    @Published var pendingPrompt: String = ""
    @Published var isRunning = false

    private var process: Process?
    private var masterHandle: FileHandle?
    private var buffer = ""

    private static let controlSequences = try! NSRegularExpression(
        pattern: "\u{1B}\\[[0-9;?]*[a-zA-Z]|\u{1B}\\][^\u{07}\u{1B}]*(\u{07}|\u{1B}\\\\)|\u{1B}[=>]|\u{07}"
    )

    init(title: String) {
        self.id = "shell-\(UUID().uuidString)"
        self.title = title
        start()
    }

    deinit {
        terminate()
    }

    func send(_ command: String) {
        let trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isRunning, let masterHandle else { return }

        if trimmed == "clear" {
            lines.removeAll()
            masterHandle.write(Data("\n".utf8))
            return
        }

        let promptPrefix = pendingPrompt.isEmpty ? "$ " : pendingPrompt
        lines.append(ShellLine(text: promptPrefix + trimmed, isInput: true))
        pendingPrompt = ""
        buffer = ""
        masterHandle.write(Data((trimmed + "\n").utf8))
    }

    func terminate() {
        masterHandle?.readabilityHandler = nil
        process?.terminationHandler = nil
        process?.terminate()
        process = nil
        masterHandle = nil
    }

    private func start() {
        let master = posix_openpt(O_RDWR | O_NOCTTY)
        guard master >= 0, grantpt(master) == 0, unlockpt(master) == 0,
              let slaveName = ptsname(master) else {
            lines.append(ShellLine(text: "Falha ao criar o pseudo-terminal.", isInput: false))
            return
        }
        let slave = open(slaveName, O_RDWR | O_NOCTTY)
        guard slave >= 0 else {
            close(master)
            lines.append(ShellLine(text: "Falha ao abrir o pseudo-terminal.", isInput: false))
            return
        }

        // The UI renders the typed command itself; PTY echo would duplicate every line.
        var attributes = termios()
        tcgetattr(slave, &attributes)
        attributes.c_lflag &= ~tcflag_t(ECHO)
        tcsetattr(slave, TCSANOW, &attributes)

        let masterFile = FileHandle(fileDescriptor: master, closeOnDealloc: true)
        let slaveFile = FileHandle(fileDescriptor: slave, closeOnDealloc: true)

        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
        shell.arguments = ["-i"]
        var environment = ProcessInfo.processInfo.environment
        environment["TERM"] = "dumb"
        environment["CLICOLOR"] = "0"
        environment["NO_COLOR"] = "1"
        shell.environment = environment
        shell.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        shell.standardInput = slaveFile
        shell.standardOutput = slaveFile
        shell.standardError = slaveFile

        masterFile.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async {
                self?.ingest(text)
            }
        }

        shell.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.pendingPrompt = ""
                self?.lines.append(ShellLine(text: "[sessão encerrada]", isInput: false))
            }
        }

        do {
            try shell.run()
            isRunning = true
            process = shell
            masterHandle = masterFile
        } catch {
            lines.append(ShellLine(text: "Não foi possível iniciar /bin/zsh: \(error.localizedDescription)", isInput: false))
        }
    }

    private func ingest(_ raw: String) {
        let normalized = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        buffer += Self.stripped(normalized)

        var parts = buffer.components(separatedBy: "\n")
        let tail = parts.removeLast()
        for part in parts where !part.isEmpty {
            lines.append(ShellLine(text: part, isInput: false))
        }
        if lines.count > 2000 {
            lines.removeFirst(lines.count - 2000)
        }
        pendingPrompt = tail
        buffer = tail
    }

    private static func stripped(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return controlSequences.stringByReplacingMatches(in: text, range: range, withTemplate: "")
    }
}
