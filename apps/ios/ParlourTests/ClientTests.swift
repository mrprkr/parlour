//
//  ClientTests.swift
//  The two things that are easy to get quietly wrong: the address someone
//  typed, and the header on the recording that gets posted to /voice.
//

import Foundation
import Testing

@testable import Parlour

@Suite("Settings")
@MainActor
struct SettingsTests {
  private func settings() -> AppSettings {
    let name = "parlour.tests.\(UUID().uuidString)"
    return AppSettings(defaults: UserDefaults(suiteName: name)!)
  }

  @Test("an empty address with nothing configured is no server at all")
  func nothingConfigured() {
    #expect(settings().endpoint(found: nil) == nil)
  }

  @Test("discovered servers are never used automatically")
  func discoveryNotAutomatic() {
    let found = URL(string: "http://study-mac.local:8765")!
    #expect(settings().endpoint(found: found) == nil)
  }

  @Test("a bare host gets a scheme, because that is what people type")
  func bareHostGetsAScheme() {
    let subject = settings()
    subject.serverURL = "study-mac.local:8765"
    #expect(subject.endpoint(found: nil)?.absoluteString == "http://study-mac.local:8765")
  }

  @Test("a typed address is used regardless of what Bonjour found")
  func typedAddressWins() {
    let subject = settings()
    subject.serverURL = "http://10.0.0.4:8765"
    let found = URL(string: "http://someone-elses-mac.local:8765")!
    #expect(subject.endpoint(found: found)?.host() == "10.0.0.4")
  }
}

@Suite("WAV")
struct WAVTests {
  @Test("the header says what the server's decoder expects")
  func headerIsCanonical() throws {
    let pcm = Data(repeating: 0, count: 3200)
    let wav = WAV.encode(pcm: pcm)

    #expect(wav.count == 44 + pcm.count)
    #expect(wav.prefix(4) == Data("RIFF".utf8))
    #expect(wav[8..<12] == Data("WAVE".utf8))
    #expect(read32(wav, at: 4) == UInt32(36 + pcm.count))
    #expect(read16(wav, at: 20) == 1, "PCM, not a compressed format")
    #expect(read16(wav, at: 22) == 1, "mono")
    #expect(read32(wav, at: 24) == 16_000, "the server's default sample rate")
    #expect(read16(wav, at: 34) == 16, "signed 16 bit")
    #expect(read32(wav, at: 40) == UInt32(pcm.count))
  }

  @Test("an empty recording still produces a valid header")
  func emptyIsStillValid() {
    let wav = WAV.encode(pcm: Data())
    #expect(wav.count == 44)
    #expect(read32(wav, at: 40) == 0)
  }

  private func read16(_ data: Data, at offset: Int) -> UInt16 {
    UInt16(data[offset]) | UInt16(data[offset + 1]) << 8
  }

  private func read32(_ data: Data, at offset: Int) -> UInt32 {
    (0..<4).reduce(into: UInt32(0)) { total, byte in
      total |= UInt32(data[offset + byte]) << (8 * UInt32(byte))
    }
  }
}

@Suite("Answers")
struct AnswerTests {
  @Test("the reply decodes, with the audio as base64")
  func decodesAnAnswer() throws {
    let json = """
      {"heard":"is the washing machine finished","reply":"It finished ten minutes ago.",\
      "via":"local","audio":"UklGRg=="}
      """
    let answer = try JSONDecoder().decode(Answer.self, from: Data(json.utf8))
    #expect(answer.via == "local")
    #expect(answer.audio == Data(base64Encoded: "UklGRg=="))
  }

  @Test("a turn with nothing to say decodes with no audio")
  func decodesSilence() throws {
    let json = #"{"heard":"","reply":"","via":"local","audio":null}"#
    let answer = try JSONDecoder().decode(Answer.self, from: Data(json.utf8))
    #expect(answer.audio == nil)
    #expect(answer.reply.isEmpty)
  }
}
