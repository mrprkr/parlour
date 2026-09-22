//
//  Recorder.swift
//  Hold to talk. Records straight to what the server wants, which is 16 kHz
//  mono signed 16-bit PCM, so nothing has to be transcoded at the other end.
//

import AVFoundation
import Foundation

enum RecorderError: LocalizedError {
  case denied
  case noInput
  case tooShort

  var errorDescription: String? {
    switch self {
    case .denied: return "Parlour cannot hear you until the microphone is allowed in Settings."
    case .noInput: return "No microphone to record from."
    case .tooShort: return "That was too short to send."
    }
  }
}

/// The one audio session, always touched on its own queue: activation can
/// block for long enough to hitch the interface (AVAudioSession warns about
/// exactly this), and the queue keeps a deactivation at the end of one turn
/// ordered before the activation at the start of the next.
enum SharedAudioSession {
  private static let queue = DispatchQueue(label: "app.heyparlour.audio-session", qos: .userInitiated)

  /// Configures and activates the session off the main thread.
  static func activate(_ configure: @escaping @Sendable (AVAudioSession) throws -> Void) async throws {
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
      queue.async {
        do {
          let session = AVAudioSession.sharedInstance()
          try configure(session)
          try session.setActive(true)
          done.resume()
        } catch {
          done.resume(throwing: error)
        }
      }
    }
  }

  /// Fire and forget: nothing downstream depends on deactivation finishing.
  static func deactivate() {
    queue.async {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
}

/// One recording, start to finish. Not an observable: the view owns the state
/// and this owns the audio graph.
@MainActor
final class Recorder {
  /// Shorter than this and it is a mis-tap, not a request.
  private static let shortestSeconds: Double = 0.3

  private let engine = AVAudioEngine()
  private var converter: AVAudioConverter?
  private var samples = Data()
  private var recording = false

  static func requestPermission() async -> Bool {
    await AVAudioApplication.requestRecordPermission()
  }

  static var permission: AVAudioApplication.recordPermission {
    AVAudioApplication.shared.recordPermission
  }

  func start() async throws {
    guard !recording else { return }
    guard Self.permission == .granted else { throw RecorderError.denied }

    // playAndRecord rather than record, because the reply comes straight back
    // and re-activating the session between the two clips the first word.
    try await SharedAudioSession.activate { session in
      try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP])
    }
    guard !recording else { return }

    let input = engine.inputNode
    let hardware = input.outputFormat(forBus: 0)
    guard hardware.sampleRate > 0 else { throw RecorderError.noInput }

    guard
      let wanted = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: WAV.sampleRate,
        channels: 1,
        interleaved: true
      ), let converter = AVAudioConverter(from: hardware, to: wanted)
    else { throw RecorderError.noInput }

    self.converter = converter
    samples.removeAll(keepingCapacity: true)

    input.installTap(onBus: 0, bufferSize: 4096, format: hardware) { [weak self] buffer, _ in
      guard let self else { return }
      let converted = Self.convert(buffer, with: converter, to: wanted)
      guard let converted else { return }
      Task { @MainActor in self.append(converted) }
    }

    engine.prepare()
    try engine.start()
    recording = true
  }

  /// Stops and hands back a WAV ready to post to `/voice`.
  func finish() throws -> Data {
    guard recording else { throw RecorderError.tooShort }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    recording = false
    converter = nil
    SharedAudioSession.deactivate()

    let seconds = Double(samples.count / 2) / WAV.sampleRate
    guard seconds >= Self.shortestSeconds else { throw RecorderError.tooShort }
    return WAV.encode(pcm: samples)
  }

  /// Throws the recording away, for a drag off the button or a cancelled turn.
  func discard() {
    guard recording else { return }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    recording = false
    converter = nil
    samples.removeAll()
    SharedAudioSession.deactivate()
  }

  private func append(_ buffer: AVAudioPCMBuffer) {
    guard let channel = buffer.int16ChannelData else { return }
    let count = Int(buffer.frameLength)
    channel[0].withMemoryRebound(to: UInt8.self, capacity: count * 2) { bytes in
      samples.append(bytes, count: count * 2)
    }
  }

  private nonisolated static func convert(
    _ buffer: AVAudioPCMBuffer,
    with converter: AVAudioConverter,
    to format: AVAudioFormat
  ) -> AVAudioPCMBuffer? {
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }

    var handed = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if handed {
        status.pointee = .noDataNow
        return nil
      }
      handed = true
      status.pointee = .haveData
      return buffer
    }
    guard error == nil, output.frameLength > 0 else { return nil }
    return output
  }

}

/// The container the server's `/voice` route wants. Kept out of the recorder
/// so it can be tested without a microphone.
enum WAV {
  /// Everything downstream of here assumes the server's default sample rate.
  static let sampleRate: Double = 16_000

  /// A 44 byte canonical header, then the samples. No library needed.
  static func encode(pcm: Data, sampleRate: Double = WAV.sampleRate) -> Data {
    let channels: UInt16 = 1
    let bits: UInt16 = 16
    let rate = UInt32(sampleRate)
    let byteRate = rate * UInt32(channels) * UInt32(bits / 8)
    let blockAlign = channels * (bits / 8)

    var wav = Data()
    wav.append(contentsOf: Array("RIFF".utf8))
    wav.append(little: UInt32(36 + pcm.count))
    wav.append(contentsOf: Array("WAVEfmt ".utf8))
    wav.append(little: UInt32(16))
    wav.append(little: UInt16(1))
    wav.append(little: channels)
    wav.append(little: rate)
    wav.append(little: byteRate)
    wav.append(little: blockAlign)
    wav.append(little: bits)
    wav.append(contentsOf: Array("data".utf8))
    wav.append(little: UInt32(pcm.count))
    wav.append(pcm)
    return wav
  }
}

extension Data {
  fileprivate mutating func append<T: FixedWidthInteger>(little value: T) {
    Swift.withUnsafeBytes(of: value.littleEndian) { append(contentsOf: $0) }
  }
}
