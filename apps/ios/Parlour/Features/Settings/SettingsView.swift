//
//  SettingsView.swift
//  Which server, which token, and an honest account of the four
//  permissions the app asks for. A voice assistant that will not say what it
//  is allowed to do is not one anybody should install.
//

import AVFoundation
import Speech
import SwiftUI

struct SettingsView: View {
  @Environment(AppSettings.self) private var settings
  @Environment(ServerDiscovery.self) private var discovery
  @Environment(LocalIntelligence.self) private var intelligence

  @State private var health: Health?
  @State private var probe: String?
  @State private var checking = false
  @State private var scanning = false
  @State private var setupAgain = false
  @State private var microphone = Recorder.permission
  @State private var speech = SFSpeechRecognizer.authorizationStatus()

  var body: some View {
    Wall {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.xxl) {
          Heading("Settings", detail: "One server, one token.")

          server
          found
          onDevice
          permissions

          Button {
            setupAgain = true
          } label: {
            Label("Run setup again", systemImage: "wand.and.stars")
              .font(Ramp.body)
          }
        }
        .padding(.horizontal, Space.xl)
        .padding(.vertical, Space.lg)
      }
    }
    .task {
      microphone = Recorder.permission
      speech = SFSpeechRecognizer.authorizationStatus()
    }
    .task(id: settings.pairedWith) {
      // A code was just scanned, here or by the Camera app: say whether the
      // server it named answers, without waiting to be asked.
      if settings.pairedWith != nil { await check() }
    }
    .sheet(isPresented: $scanning) {
      PairingScanner { link in settings.pair(with: link) }
    }
    .fullScreenCover(isPresented: $setupAgain) {
      OnboardingView(again: true) { setupAgain = false }
    }
  }

  // MARK: - The server

  private var server: some View {
    @Bindable var settings = settings
    return Panel {
      VStack(alignment: .leading, spacing: Space.md) {
        VStack(alignment: .leading, spacing: Space.xs) {
          Button {
            scanning = true
          } label: {
            Label("Scan pairing code", systemImage: "qrcode.viewfinder")
              .font(Ramp.body)
          }
          Text(
            settings.pairedWith.map { "Paired with \($0)." }
              ?? "Run parlour pair on the Mac and scan the code it shows, or fill these in by hand."
          )
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
        }

        field("Address", placeholder: "found with Bonjour", text: $settings.serverURL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.URL)

        VStack(alignment: .leading, spacing: Space.xs) {
          Text("PARLOUR_TOKEN")
            .font(Ramp.micro)
            .foregroundStyle(Palette.bracken)
          SecureField("from parlour secrets", text: $settings.token)
            .font(Ramp.mono(ParlourTokens.Text.body))
            .textFieldStyle(.plain)
          Rule()
          Text("Kept in the keychain on this phone, never in a backup.")
            .font(Ramp.micro)
            .foregroundStyle(Palette.bracken)
        }

        HStack(spacing: Space.lg) {
          Button("Check") { Task { await check() } }
            .font(Ramp.small)
            .disabled(checking)
          if let health {
            Text("\(health.tools) tools, \(health.cloud ? "cloud behind it" : "local only")")
              .font(Ramp.small)
              .foregroundStyle(Palette.hearth)
          } else if let probe {
            Text(probe)
              .font(Ramp.small)
              .foregroundStyle(Palette.alarm)
          }
        }
      }
    }
  }

  private var found: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text("ON THIS NETWORK")
        .font(Ramp.micro)
        .tracking(0.6)
        .foregroundStyle(Palette.bracken)
      Rule()
      if let failure = discovery.failure {
        Text(failure)
          .font(Ramp.small)
          .foregroundStyle(Palette.alarm)
          .padding(.vertical, Space.sm)
      } else if discovery.found.isEmpty {
        Text(discovery.browsing ? "Looking for a server." : "Not looking yet.")
          .font(Ramp.small)
          .foregroundStyle(Palette.bracken)
          .padding(.vertical, Space.sm)
      } else {
        Text("Tap a server to use it. Pairing with a QR code is safer: it sets the address and token together.")
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
          .padding(.vertical, Space.sm)
      }
      ForEach(discovery.found) { server in
        Button {
          settings.serverURL = server.url.absoluteString
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(server.name)
                .font(Ramp.body)
                .foregroundStyle(Palette.ink)
              Text(server.url.absoluteString)
                .font(Ramp.mono(ParlourTokens.Text.micro))
                .foregroundStyle(Palette.bracken)
            }
            Spacer()
            Text("use")
              .font(Ramp.small)
              .foregroundStyle(Palette.hearth)
          }
          .padding(.vertical, Space.sm)
        }
        .buttonStyle(.plain)
        Rule()
      }
    }
  }

  // MARK: - The model on the phone

  private var onDevice: some View {
    @Bindable var settings = settings
    return Panel {
      VStack(alignment: .leading, spacing: Space.sm) {
        Toggle(isOn: $settings.preferOnDevice) {
          Text("Answer on this phone when the house is unreachable")
            .font(Ramp.body)
            .foregroundStyle(Palette.ink)
        }
        .disabled(!intelligence.state.usable)
        Text(intelligence.state.explanation)
          .font(Ramp.micro)
          .foregroundStyle(intelligence.state.usable ? Palette.bracken : Palette.lampText)
        Text(
          "The phone has no tools. It can answer a question, but it cannot switch "
            + "anything on, read a sensor or look anything up."
        )
        .font(Ramp.micro)
        .foregroundStyle(Palette.bracken)
      }
    }
    .task { intelligence.refresh() }
  }

  // MARK: - What the app is allowed to do

  private var permissions: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text("PERMISSIONS")
        .font(Ramp.micro)
        .tracking(0.6)
        .foregroundStyle(Palette.bracken)
      Rule()
      permission(
        "Microphone",
        why: "Recording while you hold the button.",
        granted: microphone == .granted,
        ask: { microphone = (await Recorder.requestPermission()) ? .granted : .denied }
      )
      permission(
        "Local network",
        why: "Finding your server, and talking to it.",
        granted: discovery.browsing && discovery.failure == nil,
        ask: { discovery.start() }
      )
      permission(
        "HomeKit",
        why: "Showing the rooms and accessories in the House tab.",
        granted: nil,
        ask: nil
      )
      permission(
        "Speech recognition",
        why: "Making out what you said when the server cannot.",
        granted: speech == .authorized,
        ask: { speech = (await OnDeviceSpeech.authorise()) ? .authorized : .denied }
      )
    }
  }

  private func permission(
    _ name: String,
    why: String,
    granted: Bool?,
    ask: (() async -> Void)?
  ) -> some View {
    HStack(alignment: .top, spacing: Space.md) {
      StateMark(state: granted == true ? .idle : .stopped)
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 2) {
        Text(name)
          .font(Ramp.body)
          .foregroundStyle(Palette.ink)
        Text(why)
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
      }
      Spacer()
      if granted != true, let ask {
        Button("Ask") { Task { await ask() } }
          .font(Ramp.small)
      }
    }
    .padding(.vertical, Space.sm)
    .overlay(alignment: .bottom) { Rule() }
  }

  private func check() async {
    checking = true
    defer { checking = false }
    health = nil
    probe = nil
    guard let base = settings.endpoint(found: nil) else {
      probe = ClientError.noServer.localizedDescription
      return
    }
    do {
      health = try await ParlourClient(base: base, token: settings.token).health()
    } catch {
      probe = error.localizedDescription
    }
  }

  private func field(_ label: String, placeholder: String, text: Binding<String>) -> some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text(label.uppercased())
        .font(Ramp.micro)
        .tracking(0.6)
        .foregroundStyle(Palette.bracken)
      TextField(placeholder, text: text)
        .font(Ramp.body)
        .foregroundStyle(Palette.ink)
        .textFieldStyle(.plain)
      Rule()
    }
  }
}

#Preview {
  SettingsView()
    .environment(AppSettings())
    .environment(ServerDiscovery())
    .environment(LocalIntelligence())
}
