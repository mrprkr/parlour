//
//  TalkView.swift
//  Hold the button, say something, let go. The same gesture and the same
//  round trip as the phone page, in an app that can also find the server by
//  itself and answer some things without it.
//

import AVFoundation
import SwiftUI

struct TalkView: View {
  @Environment(AppSettings.self) private var settings
  @Environment(ServerDiscovery.self) private var discovery
  @Environment(LocalIntelligence.self) private var intelligence

  @State private var state: ParlourTokens.SessionState = .idle
  @State private var heard = ""
  @State private var reply = ""
  @State private var via = ""
  @State private var failure: String?
  @State private var recorder = Recorder()
  @State private var speaker = Speaker()
  @State private var holding = false
  @State private var starting: Task<Void, Never>?

  var body: some View {
    Wall {
      VStack(alignment: .leading, spacing: Space.xl) {
        header

        VStack(alignment: .leading, spacing: Space.md) {
          Text(heard.isEmpty ? " " : heard)
            .font(Ramp.body)
            .foregroundStyle(Palette.bracken)
          Text(reply.isEmpty ? "Hold the button and say something." : reply)
            .font(Ramp.serif(ParlourTokens.Text.heading))
            .foregroundStyle(Palette.ink)
            .fixedSize(horizontal: false, vertical: true)
          if !via.isEmpty {
            Text(viaLabel)
              .font(Ramp.micro)
              .foregroundStyle(Palette.bracken)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Spacer(minLength: Space.lg)

        if let failure {
          Panel {
            Text(failure)
              .font(Ramp.small)
              .foregroundStyle(Palette.alarm)
          }
        }

        talkButton
      }
      .padding(.horizontal, Space.xl)
      .padding(.vertical, Space.lg)
    }
  }

  /// Where the answer came from, which is the thing the router exists to make
  /// visible: at home unless it had to go further.
  private var viaLabel: String {
    switch via {
    case "cloud": return "answered by the clever one"
    case "phone": return "answered on this phone"
    default: return "answered at home"
    }
  }

  private var header: some View {
    HStack {
      Text("Parlour")
        .font(Ramp.title)
        .foregroundStyle(Palette.ink)
      Spacer()
      StateRow(state: state)
    }
  }

  private var talkButton: some View {
    Button {
      // The gesture below does the work; the button is here for VoiceOver,
      // which cannot hold anything down.
      Task { await accessibleTurn() }
    } label: {
      Text(holding ? "Listening, let go to send" : "Hold to talk")
    }
    .buttonStyle(.hearth)
    .scaleEffect(holding ? 0.98 : 1)
    .animation(.easeOut(duration: ParlourTokens.Motion.quick), value: holding)
    .simultaneousGesture(
      DragGesture(minimumDistance: 0)
        .onChanged { _ in if !holding { begin() } }
        .onEnded { _ in Task { await end() } }
    )
    .disabled(state == .thinking)
    .accessibilityLabel("Talk to the house")
    .accessibilityHint("Records one request and sends it to your server.")
  }

  // MARK: - The turn

  private func begin() {
    guard !holding else { return }
    failure = nil
    speaker.stop()
    // Claimed before the recorder is ready, because the gesture fires again
    // for every movement of the finger and must not start twice.
    holding = true
    state = .listening
    starting = Task {
      do {
        try await recorder.start()
      } catch RecorderError.denied {
        holding = false
        state = .idle
        await askForMicrophone()
      } catch {
        holding = false
        state = .idle
        failure = error.localizedDescription
      }
    }
  }

  private func end() async {
    guard holding else { return }
    holding = false
    // A quick tap lets go before the recorder has finished starting; it can
    // only be stopped once the start has settled.
    await starting?.value
    starting = nil
    do {
      let wav = try recorder.finish()
      state = .thinking
      try await send(wav)
    } catch RecorderError.tooShort {
      state = .idle
    } catch {
      state = .idle
      failure = error.localizedDescription
    }
  }

  /// VoiceOver cannot hold a button down, so a plain activation records a
  /// fixed two seconds instead of nothing at all.
  private func accessibleTurn() async {
    guard !holding else { return }
    begin()
    guard holding else { return }
    try? await Task.sleep(for: .seconds(2))
    await end()
  }

  private func send(_ wav: Data) async throws {
    guard let client = makeClient() else {
      state = .idle
      failure = ClientError.noServer.localizedDescription
      return
    }
    do {
      let answer = try await client.voice(wav: wav)
      heard = answer.heard
      via = answer.via
      reply = answer.reply.isEmpty ? "Nothing was heard." : answer.reply
      if let audio = answer.audio {
        state = .speaking
        await speaker.play(audio)
      }
      state = .idle
    } catch {
      // The phone's own model is the fallback, not the first stop: it has no
      // tools, so it can only help with what needs nothing from the house. The
      // recording is transcribed here too, because the server that would
      // normally do it is the thing that just failed.
      if settings.preferOnDevice, await answerOnThisPhone(wav) { return }
      state = .idle
      failure = error.localizedDescription
    }
  }

  /// True when the phone managed the whole turn by itself.
  private func answerOnThisPhone(_ wav: Data) async -> Bool {
    guard intelligence.state.usable else { return false }
    guard let text = try? await OnDeviceSpeech.transcribe(wav: wav) else { return false }
    guard let local = await intelligence.answer(text) else { return false }
    heard = text
    reply = local
    via = "phone"
    state = .idle
    return true
  }

  private func makeClient() -> ParlourClient? {
    guard let base = settings.endpoint(found: nil) else { return nil }
    return ParlourClient(base: base, token: settings.token)
  }

  private func askForMicrophone() async {
    let granted = await Recorder.requestPermission()
    if !granted { failure = RecorderError.denied.localizedDescription }
  }
}

/// Plays the WAV the server sends back. Small enough to live here.
@MainActor
@Observable
final class Speaker {
  private var player: AVAudioPlayer?

  func play(_ wav: Data) async {
    stop()
    do {
      try await SharedAudioSession.activate { session in
        try session.setCategory(.playback, mode: .spokenAudio)
      }
      let player = try AVAudioPlayer(data: wav)
      self.player = player
      player.play()
      // The reply is a sentence or two, so waiting it out beats a delegate.
      try await Task.sleep(for: .seconds(player.duration))
    } catch {
      // A reply that cannot be played is not worth interrupting anyone over;
      // the text of it is already on the screen.
    }
    stop()
  }

  func stop() {
    player?.stop()
    player = nil
    SharedAudioSession.deactivate()
  }
}

#Preview {
  TalkView()
    .environment(AppSettings())
    .environment(ServerDiscovery())
    .environment(LocalIntelligence())
}
