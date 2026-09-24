#if os(macOS)
import AppKit
import AVFoundation
import Combine
import Foundation
import Speech

@MainActor
final class SpeechService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var isListening = false
    @Published private(set) var isSpeaking = false
    @Published private(set) var audioLevel: Double = 0
    @Published private(set) var transcript = ""
    @Published private(set) var lastError: String?
    @Published private(set) var permissionIssue: SpeechPermissionKind?

    var onSpeakingStateChange: ((Bool) -> Void)?

    private let synthesizer = AVSpeechSynthesizer()
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var hasInputTap = false
    private var receivedAudioBuffers = 0
    private var captureWatchdog: Task<Void, Never>?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String, profile: AssistantVoiceProfile = .sol) {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: cleaned)
        let installed = AVSpeechSynthesisVoice.speechVoices()
        utterance.voice = profile.nativeVoiceCandidates
            .compactMap { candidate in installed.first { $0.name == candidate } }
            .first ?? AVSpeechSynthesisVoice(language: "pt-BR")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        switch profile {
        case .evee:
            utterance.pitchMultiplier = 1.06
            utterance.rate *= 1.02
        case .sol:
            utterance.pitchMultiplier = 1.0
        case .harvey:
            utterance.pitchMultiplier = 0.88
            utterance.rate *= 0.94
        }
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        synthesizer.stopSpeaking(at: .immediate)
        finishSpeaking()
    }

    func toggleListening(onTranscript: @escaping @MainActor (String) -> Void, onFinal: (@MainActor (String) -> Void)? = nil) async {
        if isListening {
            stopListening()
            return
        }
        lastError = nil
        permissionIssue = nil
        transcript = ""
        do {
            try await startListening(onTranscript: onTranscript, onFinal: onFinal)
        } catch {
            lastError = error.localizedDescription
            if case SpeechServiceError.permissionDenied(let kind) = error { permissionIssue = kind }
            stopListening()
        }
    }

    func stopListening() {
        captureWatchdog?.cancel()
        captureWatchdog = nil
        if audioEngine.isRunning { audioEngine.stop() }
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        receivedAudioBuffers = 0
        isListening = false
        audioLevel = 0
    }

    func openSystemSettings(for kind: SpeechPermissionKind) {
        let anchor = kind == .microphone ? "Privacy_Microphone" : "Privacy_SpeechRecognition"
        let candidates = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?\(anchor)",
            "x-apple.systempreferences:com.apple.preference.security?\(anchor)"
        ]
        for candidate in candidates {
            guard let url = URL(string: candidate) else { continue }
            if NSWorkspace.shared.open(url) { return }
        }
    }

    func currentPermissionIssue() -> SpeechPermissionKind? {
        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        if speechStatus == .denied || speechStatus == .restricted {
            return .speechRecognition
        }
        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        if microphoneStatus == .denied || microphoneStatus == .restricted {
            return .microphone
        }
        return nil
    }

    private func startListening(onTranscript: @escaping @MainActor (String) -> Void, onFinal: (@MainActor (String) -> Void)?) async throws {
        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        let resolvedSpeechStatus: SFSpeechRecognizerAuthorizationStatus = if speechStatus == .authorized {
            speechStatus
        } else {
            await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
            }
        }
        guard resolvedSpeechStatus == .authorized else {
            throw SpeechServiceError.permissionDenied(.speechRecognition)
        }

        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        let microphoneAllowed: Bool
        if microphoneStatus == .authorized {
            microphoneAllowed = true
        } else {
            // Calling the system API on every attempt is intentional. macOS shows
            // the native prompt while status is undetermined and returns false
            // immediately after a denial, when we redirect to Privacy settings.
            microphoneAllowed = await AVCaptureDevice.requestAccess(for: .audio)
        }
        guard microphoneAllowed else {
            throw SpeechServiceError.permissionDenied(.microphone)
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "pt-BR")), recognizer.isAvailable else {
            throw SpeechServiceError.recognizerUnavailable
        }

        stopListening()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.taskHint = .dictation
        request.addsPunctuation = true
        recognitionRequest = request

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                if let result {
                    let liveTranscript = result.bestTranscription.formattedString
                    self?.transcript = liveTranscript
                    onTranscript(liveTranscript)
                    if result.isFinal {
                        onFinal?(liveTranscript)
                        self?.stopListening()
                    }
                }
                if let error {
                    self?.lastError = error.localizedDescription
                    self?.stopListening()
                }
            }
        }

        let input = audioEngine.inputNode
        // Passing nil lets AVAudioEngine negotiate the hardware format. Querying
        // outputFormat(forBus:) first caused kAudioUnitErr_InvalidElement (-10877)
        // with some Mac microphones and left the UI "listening" without samples.
        receivedAudioBuffers = 0
        input.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
            guard buffer.frameLength > 0 else { return }
            request.append(buffer)
            let level = Self.rmsLevel(buffer)
            Task { @MainActor in
                self?.receivedAudioBuffers += 1
                self?.audioLevel = level
            }
        }
        hasInputTap = true
        audioEngine.prepare()
        try audioEngine.start()
        isListening = true
        captureWatchdog = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled, let self, self.isListening, self.receivedAudioBuffers == 0 else { return }
            self.lastError = SpeechServiceError.noAudioBuffers.localizedDescription
            self.stopListening()
        }
    }

    nonisolated private static func rmsLevel(_ buffer: AVAudioPCMBuffer) -> Double {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<count { sum += channel[index] * channel[index] }
        let rms = sqrt(sum / Float(count))
        return min(max(Double(rms) * 12, 0), 1)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in startSpeaking() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in finishSpeaking() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in finishSpeaking() }
    }

    private func startSpeaking() {
        isSpeaking = true
        onSpeakingStateChange?(true)
        audioLevel = 0.64
    }

    private func finishSpeaking() {
        isSpeaking = false
        audioLevel = 0
        onSpeakingStateChange?(false)
    }
}

enum SpeechServiceError: LocalizedError {
    case permissionDenied(SpeechPermissionKind)
    case recognizerUnavailable
    case audioInputUnavailable
    case noAudioBuffers

    var errorDescription: String? {
        switch self {
        case .permissionDenied(let kind): "Permissão negada para \(kind.rawValue). Abra os Ajustes do Sistema para autorizar o acesso."
        case .recognizerUnavailable: "O reconhecimento de fala em português não está disponível."
        case .audioInputUnavailable: "Nenhuma entrada de áudio válida está disponível para o ditado."
        case .noAudioBuffers: "O microfone foi autorizado, mas não entregou áudio. Verifique o dispositivo de entrada selecionado no macOS e tente novamente."
        }
    }
}
#endif
