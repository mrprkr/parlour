//
//  LocalIntelligence.swift
//  The model on the phone. Parlour is local first on the server for the same
//  reason it is local first here: most of what you ask does not need to leave
//  the building, and the things that do are better asked by the machine that
//  holds the tools and the tokens.
//
//  So this is deliberately small. It answers the questions that need nothing
//  from the house, and hands everything else to the server, which still has
//  the lights, the calendar and the cloud model behind it.
//

import Foundation
import Observation

#if canImport(FoundationModels)
  import FoundationModels
#endif

/// Why the on-device model cannot answer, in words a person can act on.
enum LocalIntelligenceState: Equatable, Sendable {
  case ready
  case unsupportedOS
  case unsupportedDevice
  case notEnabled
  case modelNotReady
  case failed(String)

  var explanation: String {
    switch self {
    case .ready:
      return "Answering on this phone when it can."
    case .unsupportedOS:
      return "This iOS is too old for on-device answers."
    case .unsupportedDevice:
      return "This phone has no on-device model."
    case .notEnabled:
      return "Turn Apple Intelligence on in Settings to answer without the server."
    case .modelNotReady:
      return "The model is still downloading."
    case .failed(let reason):
      return reason
    }
  }

  var usable: Bool { self == .ready }
}

@Observable
@MainActor
final class LocalIntelligence {
  private(set) var state: LocalIntelligenceState = .unsupportedOS

  /// What the phone is allowed to answer on its own. It has no tools, so it is
  /// told plainly not to pretend it can reach the house.
  private static let instructions = """
    You are Parlour, answering on someone's phone rather than on the machine at \
    home. Keep answers to a sentence or two, in British English, spoken aloud \
    rather than written down. You cannot switch anything on, read any sensor or \
    look anything up: if the question needs the house or the internet, say so in \
    one short sentence and nothing else.
    """

  #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private var session: LanguageModelSession? {
      get { _session as? LanguageModelSession }
      set { _session = newValue }
    }
  #endif

  private var _session: AnyObject?

  func refresh() {
    #if canImport(FoundationModels)
      guard #available(iOS 26.0, *) else {
        state = .unsupportedOS
        return
      }
      switch SystemLanguageModel.default.availability {
      case .available:
        state = .ready
      case .unavailable(.deviceNotEligible):
        state = .unsupportedDevice
      case .unavailable(.appleIntelligenceNotEnabled):
        state = .notEnabled
      case .unavailable(.modelNotReady):
        state = .modelNotReady
      case .unavailable(let other):
        state = .failed("The on-device model is unavailable: \(other).")
      @unknown default:
        state = .failed("The on-device model is unavailable.")
      }
    #else
      state = .unsupportedOS
    #endif
  }

  /// An answer from this phone, or nil if it cannot give one. Nil is not an
  /// error: the caller falls through to the server, which is the better answer
  /// nearly every time.
  func answer(_ question: String) async -> String? {
    #if canImport(FoundationModels)
      guard #available(iOS 26.0, *), state.usable else { return nil }
      do {
        let session = self.session ?? LanguageModelSession(instructions: Self.instructions)
        self.session = session
        let response = try await session.respond(to: question)
        let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
      } catch {
        state = .failed(error.localizedDescription)
        return nil
      }
    #else
      return nil
    #endif
  }

  /// A new turn with no memory of the last one, to match the server's sessions.
  func forget() {
    _session = nil
  }
}
