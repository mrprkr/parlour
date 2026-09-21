//
//  OnDeviceSpeech.swift
//  Turning a recording into words without it leaving the phone. Only used
//  when the server cannot be reached: the server's Whisper is better, and it
//  is the one with the tools behind it.
//

import Foundation
import Speech

enum OnDeviceSpeechError: LocalizedError {
  case notAllowed
  case notAvailable
  case nothingHeard

  var errorDescription: String? {
    switch self {
    case .notAllowed: return "Speech recognition is not allowed on this phone."
    case .notAvailable: return "This phone cannot recognise speech without a network."
    case .nothingHeard: return "Nothing could be made out."
    }
  }
}

enum OnDeviceSpeech {
  static func authorise() async -> Bool {
    if SFSpeechRecognizer.authorizationStatus() == .authorized { return true }
    return await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status == .authorized)
      }
    }
  }

  /// The words in a WAV, recognised on this device and nowhere else.
  static func transcribe(wav: Data) async throws -> String {
    guard await authorise() else { throw OnDeviceSpeechError.notAllowed }
    guard let recogniser = SFSpeechRecognizer(locale: Locale(identifier: "en-GB")) ?? SFSpeechRecognizer(),
      recogniser.isAvailable, recogniser.supportsOnDeviceRecognition
    else { throw OnDeviceSpeechError.notAvailable }

    let file = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).wav")
    try wav.write(to: file)
    defer { try? FileManager.default.removeItem(at: file) }

    let request = SFSpeechURLRecognitionRequest(url: file)
    // The point of this path is that nothing goes anywhere, so this is not a
    // preference: a recogniser that would fall back to the network is refused.
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false

    let text: String = try await withCheckedThrowingContinuation { continuation in
      // The callback can fire more than once even with partials off, so the
      // continuation is guarded rather than trusted.
      let once = OnceBox()
      recogniser.recognitionTask(with: request) { result, error in
        if let error {
          once.resume { continuation.resume(throwing: error) }
          return
        }
        guard let result, result.isFinal else { return }
        once.resume { continuation.resume(returning: result.bestTranscription.formattedString) }
      }
    }

    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw OnDeviceSpeechError.nothingHeard }
    return trimmed
  }
}

/// Lets exactly one of several callbacks resume a continuation.
private final class OnceBox: @unchecked Sendable {
  private let lock = NSLock()
  private var spent = false

  func resume(_ body: () -> Void) {
    lock.lock()
    let first = !spent
    spent = true
    lock.unlock()
    if first { body() }
  }
}
