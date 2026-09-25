//
//  OnboardingView.swift
//  The first run, one question at a time, in the same order and the same
//  words as the setup in the menu bar app: pair with the Mac, say how the
//  phone hears, the optional extras, then a look over what was set. Anything
//  only sometimes needed (typing an address by hand, the servers Bonjour
//  found) stays folded away until asked for, and a step with nothing to ask
//  on this phone is left out altogether.
//

import AVFoundation
import SwiftUI

struct OnboardingView: View {
  /// Opened again from Settings, which skips the welcome: whoever is doing
  /// that already knows what Parlour is.
  let again: Bool
  let onDone: () -> Void

  @Environment(AppSettings.self) private var settings
  @Environment(ServerDiscovery.self) private var discovery
  @Environment(LocalIntelligence.self) private var intelligence
  @Environment(\.openURL) private var openURL
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var step: Step
  /// The furthest step shown so far, which is how far the bar along the top lets a tap go.
  @State private var reached: Step
  /// Which way the last move went, so a page slides in from the side it belongs on.
  @State private var forward = true
  /// Finding the Mac and pairing with it are two looks at the one Connect step.
  @State private var stage = ConnectStage.find
  @State private var stageForward = true
  /// The discovered server the person put their finger on, before pairing.
  @State private var chosen: FoundServer?
  @State private var connection = Connection.untried
  @State private var scanning = false
  @State private var byHand = false
  @State private var byToken = false
  @State private var microphone = Recorder.permission
  /// A link from outside the app, held until the person says it is theirs.
  @State private var offered: PairingLink?

  enum Step: Int, Comparable {
    case welcome, connect, voice, extras, finish

    var label: String {
      switch self {
      case .welcome: return "Welcome"
      case .connect: return "Connect"
      case .voice: return "Voice"
      case .extras: return "Extras"
      case .finish: return "Finish"
      }
    }

    static func < (lhs: Step, rhs: Step) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  enum Connection {
    case untried
    case checking
    case connected(Health)
    case failed(String)
  }

  enum ConnectStage {
    case find, pair
  }

  init(again: Bool = false, onDone: @escaping () -> Void) {
    self.again = again
    self.onDone = onDone
    let first: Step = again ? .connect : .welcome
    _step = State(initialValue: first)
    // Someone running it again has been everywhere already.
    _reached = State(initialValue: again ? .finish : first)
  }

  /// The steps this phone has something to ask about. The model on the phone
  /// is the only extra, so a phone that cannot run it skips the page.
  private var steps: [Step] {
    var all: [Step] = [.connect, .voice]
    if intelligence.state.usable { all.append(.extras) }
    all.append(.finish)
    return all
  }

  var body: some View {
    Wall {
      VStack(spacing: 0) {
        header
        if step != .welcome {
          StepBar(steps: steps, current: step, reached: reached) { go($0) }
            .padding(.horizontal, Space.xl)
            .padding(.bottom, Space.md)
          Rule()
        }
        // The ZStack is what lets the outgoing and incoming pages overlap
        // while they slide, rather than stack up in the column.
        ZStack {
          ScrollView {
            content
              .padding(.horizontal, Space.xl)
              .padding(.vertical, Space.xl)
              .frame(maxWidth: 560)
              .frame(maxWidth: .infinity)
          }
          .scrollDismissesKeyboard(.interactively)
          .id(step)
          .transition(reduceMotion ? .opacity : .push(from: forward ? .trailing : .leading))
        }
        Rule()
        footer
          .padding(.horizontal, Space.xl)
          .padding(.vertical, Space.lg)
      }
    }
    .sheet(isPresented: $scanning) {
      PairingScanner { link in settings.pair(with: link) }
    }
    .task(id: settings.pairedWith) {
      // A code was just scanned, or handed over by the Camera app: move to the
      // pairing look and run the handshake without waiting to be asked.
      guard settings.pairedWith != nil else { return }
      goStage(.pair)
      await check()
    }
    .task {
      // Browsing raises the local network prompt, and it is better raised here,
      // under a page about finding the Mac, than in the middle of a question.
      discovery.start()
      intelligence.refresh()
      microphone = Recorder.permission
      // A phone already pointed at a server has been through the finding.
      if settings.endpoint(found: nil) != nil { stage = .pair }
      // Already set up and opened again: say straight away whether it still works.
      if again, settings.endpoint(found: nil) != nil { await check() }
    }
    .onChange(of: discovery.found) { _, found in
      // A server that went away cannot stay picked.
      if let picked = chosen, !found.contains(picked) { chosen = nil }
    }
    .onAppear { settings.inSetup = true }
    .onDisappear { settings.inSetup = false }
    .sensoryFeedback(.selection, trigger: step)
    .onOpenURL { url in
      // Any web page can open a parlour:// link, so, as on the tab bar, nothing
      // is taken until the person has seen which server it names.
      offered = PairingLink(url: url)
    }
    .confirmationDialog(
      "Pair with \(offered?.name ?? "this server")?",
      isPresented: Binding(get: { offered != nil }, set: { if !$0 { offered = nil } }),
      titleVisibility: .visible,
      presenting: offered
    ) { link in
      Button("Pair") {
        settings.pair(with: link)
        if step < .connect { go(.connect) }
      }
      Button("Cancel", role: .cancel) {}
    } message: { link in
      Text(
        "Everything you ask will go to \(link.server.absoluteString). "
          + "Only pair with a code your own Parlour server showed you."
      )
    }
  }

  // MARK: - Frame

  private var header: some View {
    HStack {
      Text("Set up Parlour")
        .font(Ramp.sans(ParlourTokens.Text.body, weight: .semibold))
        .foregroundStyle(Palette.ink)
      Spacer()
      Button(step == .welcome ? "Not now" : "Finish later") { finish() }
        .font(Ramp.small)
    }
    .padding(.horizontal, Space.xl)
    .padding(.vertical, Space.md)
  }

  @ViewBuilder
  private var content: some View {
    switch step {
    case .welcome: welcome
    case .connect: connect
    case .voice: voice
    case .extras: extras
    case .finish: summary
    }
  }

  private var footer: some View {
    VStack(spacing: Space.sm) {
      primary
      HStack {
        if let back = neighbour(-1), step != .welcome, !(again && back == .welcome) {
          Button {
            go(back)
          } label: {
            Label("Back", systemImage: "chevron.left")
          }
        }
        Spacer()
        if step == .connect, !connected {
          Button("Skip for now") { go(.voice) }
        }
      }
      .font(Ramp.small)
      .frame(minHeight: 22)
    }
  }

  @ViewBuilder
  private var primary: some View {
    switch step {
    case .welcome:
      Button("Get started") { go(.connect) }
        .buttonStyle(.hearth)
    case .connect:
      if connected, stage == .pair {
        Button("Continue") { next() }
          .buttonStyle(.hearth)
      } else if stage == .find, let chosen {
        Button("Pair with \(chosen.name)") { pick(chosen) }
          .buttonStyle(.hearth)
      } else {
        Button {
          scanning = true
        } label: {
          Label("Scan pairing code", systemImage: "qrcode.viewfinder")
        }
        .buttonStyle(.hearth)
      }
    case .voice:
      Button(microphone == .denied ? "Continue without it" : "Continue") { next() }
        .buttonStyle(.hearth)
    case .extras:
      Button("Continue") { next() }
        .buttonStyle(.hearth)
    case .finish:
      Button("Start talking") { finish() }
        .buttonStyle(.hearth)
    }
  }

  // MARK: - Welcome

  private var welcome: some View {
    VStack(spacing: Space.xl) {
      VStack(spacing: Space.md) {
        StateMark(state: .idle, size: 18)
          .padding(.top, Space.xl)
        Text("Welcome to Parlour")
          .font(Ramp.heading)
          .foregroundStyle(Palette.ink)
        Text(
          "Talk to the house from anywhere in it. The phone records and plays the answer; "
            + "the thinking happens on the Mac at home."
        )
        .font(Ramp.body)
        .foregroundStyle(Palette.bracken)
        .multilineTextAlignment(.center)
      }

      VStack(spacing: Space.sm) {
        outline(1, "Connect", "Find the Parlour running on your Mac, then pair with it.")
        outline(2, "Voice", "Allow the microphone, so the phone can hear you.")
        if intelligence.state.usable {
          outline(3, "Extras", "Answers on this phone for when home is out of reach.")
        }
      }

      Text("It takes a minute. You will need the Mac nearby.")
        .font(Ramp.small)
        .foregroundStyle(Palette.bracken)
    }
  }

  private func outline(_ number: Int, _ name: String, _ what: String) -> some View {
    Panel {
      HStack(alignment: .top, spacing: Space.md) {
        Text("\(number)")
          .font(Ramp.micro)
          .monospacedDigit()
          .foregroundStyle(Palette.ink)
          .frame(width: 22, height: 22)
          .background(Palette.inset, in: Circle())
        VStack(alignment: .leading, spacing: 2) {
          Text(name)
            .font(Ramp.body.weight(.semibold))
            .foregroundStyle(Palette.ink)
          Text(what)
            .font(Ramp.small)
            .foregroundStyle(Palette.bracken)
        }
      }
    }
  }

  // MARK: - Connect

  /// Finding and pairing are two looks at the one step: first the servers
  /// Bonjour can see, so it is plain whether there is anything to pair with,
  /// then the handshake with the one that was picked.
  private var connect: some View {
    ZStack {
      switch stage {
      case .find:
        find
          .transition(stageTransition)
      case .pair:
        pair
          .transition(stageTransition)
      }
    }
  }

  private var stageTransition: AnyTransition {
    reduceMotion ? .opacity : .push(from: stageForward ? .trailing : .leading)
  }

  // MARK: - Connect, finding

  private var find: some View {
    VStack(alignment: .leading, spacing: Space.xl) {
      Heading(
        "Find your Mac",
        detail:
          "Parlour announces itself on the home network. Open it on the Mac "
          + "and it appears here; pick it, then pair."
      )

      Panel {
        VStack(alignment: .leading, spacing: 0) {
          if discovery.found.isEmpty {
            HStack(alignment: .top, spacing: Space.md) {
              ProgressView()
                .tint(Palette.bracken)
              VStack(alignment: .leading, spacing: 2) {
                Text(discovery.browsing ? "Looking on this network" : "Not looking yet")
                  .font(Ramp.body)
                  .foregroundStyle(Palette.ink)
                Text("Nothing seen so far. The Mac needs to be awake, on the same network, with Parlour running.")
                  .font(Ramp.small)
                  .foregroundStyle(Palette.bracken)
              }
              Spacer(minLength: 0)
            }
            .padding(.vertical, Space.sm)
          } else {
            ForEach(discovery.found) { server in
              found(server)
              if server.id != discovery.found.last?.id { Rule() }
            }
          }
          if let failure = discovery.failure {
            Text(failure)
              .font(Ramp.small)
              .foregroundStyle(Palette.alarm)
              .padding(.top, Space.sm)
            if discovery.denied {
              Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
              }
              .font(Ramp.small)
              .padding(.top, Space.xs)
            }
          }
        }
      }
      .animation(.smooth(duration: ParlourTokens.Motion.settle), value: discovery.found)

      Reveal("Set it up by hand", isOpen: $byHand) {
        byHandFields
      }
    }
  }

  /// One discovered server, picked with the native mark rather than taken
  /// automatically: a server must be chosen before anything is sent its way.
  private func found(_ server: FoundServer) -> some View {
    Button {
      withAnimation(.snappy(duration: ParlourTokens.Motion.quick)) {
        chosen = chosen == server ? nil : server
      }
    } label: {
      HStack(spacing: Space.md) {
        Image(systemName: chosen == server ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 20))
          .foregroundStyle(chosen == server ? Palette.hearth : Palette.rule)
          .contentTransition(.symbolEffect(.replace))
        VStack(alignment: .leading, spacing: 2) {
          Text(server.name)
            .font(Ramp.body)
            .foregroundStyle(Palette.ink)
          Text(server.url.absoluteString)
            .font(Ramp.mono(ParlourTokens.Text.micro))
            .foregroundStyle(Palette.bracken)
        }
        Spacer(minLength: 0)
      }
      .padding(.vertical, Space.sm)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(chosen == server ? .isSelected : [])
  }

  private var byHandFields: some View {
    @Bindable var settings = settings
    return VStack(alignment: .leading, spacing: Space.lg) {
      VStack(alignment: .leading, spacing: Space.xs) {
        caption("Address")
        TextField("den.local:8765", text: $settings.serverURL)
          .font(Ramp.body)
          .textFieldStyle(.plain)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.URL)
        Rule()
      }

      VStack(alignment: .leading, spacing: Space.xs) {
        caption("Token")
        SecureField("PARLOUR_TOKEN, from parlour secrets", text: $settings.token)
          .font(Ramp.mono(ParlourTokens.Text.body))
          .textFieldStyle(.plain)
        Rule()
        Text("Kept in the keychain on this phone, never in a backup.")
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
      }

      if case .failed(let reason) = connection {
        Text(reason)
          .font(Ramp.small)
          .foregroundStyle(Palette.alarm)
      }

      Button("Pair") { Task { await check() } }
        .font(Ramp.small)
        .disabled(isChecking)
    }
  }

  // MARK: - Connect, pairing

  private var pair: some View {
    VStack(alignment: .leading, spacing: Space.xl) {
      Heading(
        "Pair with \(serverName)",
        detail:
          "On the Mac, look under On the network on the Status tab, or run "
          + "parlour pair. Scan the code it shows: it carries the address and "
          + "the token in one go."
      )

      Panel { handshake }

      Reveal("Enter the token by hand", isOpen: $byToken) {
        tokenField
      }

      Button {
        goStage(.find)
      } label: {
        Label("Choose a different server", systemImage: "chevron.left")
      }
      .font(Ramp.small)
    }
  }

  /// Where the handshake stands, in pairing words rather than checking ones.
  @ViewBuilder
  private var handshake: some View {
    switch connection {
    case .untried:
      row(.stopped, serverName, "Not paired yet. Scan the code, and the handshake runs by itself.")
    case .checking:
      HStack(alignment: .top, spacing: Space.md) {
        ProgressView()
          .tint(Palette.bracken)
        VStack(alignment: .leading, spacing: 2) {
          Text("Pairing with \(serverName)")
            .font(Ramp.body)
            .foregroundStyle(Palette.ink)
          Text("Shaking hands, and checking the token opens the door.")
            .font(Ramp.small)
            .foregroundStyle(Palette.bracken)
        }
        Spacer(minLength: 0)
      }
      .padding(.vertical, Space.sm)
      .accessibilityElement(children: .combine)
    case .connected(let health):
      row(
        .idle,
        "Paired with \(serverName)",
        "\(health.tools) tools, \(health.cloud ? "with the cloud behind it" : "local only")."
      )
    case .failed(let reason):
      VStack(alignment: .leading, spacing: Space.sm) {
        row(.stopped, "Could not pair", reason)
        Button("Try again") { Task { await check() } }
          .font(Ramp.small)
      }
    }
  }

  private var tokenField: some View {
    @Bindable var settings = settings
    return VStack(alignment: .leading, spacing: Space.lg) {
      VStack(alignment: .leading, spacing: Space.xs) {
        caption("Token")
        SecureField("PARLOUR_TOKEN, from parlour secrets", text: $settings.token)
          .font(Ramp.mono(ParlourTokens.Text.body))
          .textFieldStyle(.plain)
        Rule()
        Text("Kept in the keychain on this phone, never in a backup.")
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
      }
      Button("Pair") { Task { await check() } }
        .font(Ramp.small)
        .disabled(isChecking)
    }
  }

  // MARK: - Voice

  private var voice: some View {
    VStack(alignment: .leading, spacing: Space.xl) {
      Heading(
        "How it hears you",
        detail: "Hold the talk button and speak. The phone only listens while the button is held."
      )

      Panel {
        switch microphone {
        case .granted:
          row(.idle, "Microphone allowed", "Parlour can hear you while you hold the button.")
        case .denied:
          VStack(alignment: .leading, spacing: Space.sm) {
            row(.stopped, "Microphone off", "Turn it on in Settings, Parlour, Microphone. Typing still works.")
            Button("Open Settings") {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
            .font(Ramp.small)
          }
        default:
          VStack(alignment: .leading, spacing: Space.md) {
            VStack(alignment: .leading, spacing: Space.xs) {
              Text("Allow the microphone")
                .font(Ramp.body.weight(.semibold))
                .foregroundStyle(Palette.ink)
              Text("iOS asks once. Saying no means typing instead, until it is changed in Settings.")
                .font(Ramp.small)
                .foregroundStyle(Palette.bracken)
            }
            Button {
              Task { microphone = (await Recorder.requestPermission()) ? .granted : .denied }
            } label: {
              Label("Allow microphone", systemImage: "mic")
                .font(Ramp.body)
            }
          }
        }
      }
    }
  }

  // MARK: - Extras

  private var extras: some View {
    @Bindable var settings = settings
    return VStack(alignment: .leading, spacing: Space.xl) {
      Heading("Extras", detail: "Optional, and in Settings later.")

      Panel {
        VStack(alignment: .leading, spacing: Space.sm) {
          Toggle(isOn: $settings.preferOnDevice) {
            Text("Answer on this phone when home is out of reach")
              .font(Ramp.body)
              .foregroundStyle(Palette.ink)
          }
          Text(
            "Uses Apple's model on the phone. It can answer a question, but it cannot "
              + "switch anything on, read a sensor or look anything up."
          )
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
        }
      }
    }
  }

  // MARK: - Finish

  private var summary: some View {
    VStack(alignment: .leading, spacing: Space.xl) {
      Heading(
        connected ? "All set" : "Nearly there",
        detail: connected
          ? "Hold the button on the Talk tab and ask what the time is."
          : "The phone is not talking to a server yet. Go back to Connect, or pair later in Settings."
      )

      VStack(alignment: .leading, spacing: 0) {
        switch connection {
        case .connected:
          row(.idle, "Server", serverName)
        case .checking:
          row(.thinking, "Server", "Pairing.")
        default:
          row(.stopped, "Server", "Not paired.")
        }
        Rule()
        row(
          microphone == .granted ? .idle : .stopped,
          "Microphone",
          microphone == .granted ? "Allowed." : "Not allowed. Typing still works."
        )
        if intelligence.state.usable {
          Rule()
          row(
            settings.preferOnDevice ? .idle : .stopped,
            "On this phone",
            settings.preferOnDevice ? "Answers when home is out of reach." : "Off."
          )
        }
      }

      Text("Everything here is in Settings, with Run setup again at the bottom.")
        .font(Ramp.small)
        .foregroundStyle(Palette.bracken)
    }
  }

  // MARK: - Pieces

  private func row(_ state: ParlourTokens.SessionState, _ name: String, _ detail: String) -> some View {
    HStack(alignment: .top, spacing: Space.md) {
      StateMark(state: state)
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 2) {
        Text(name)
          .font(Ramp.body)
          .foregroundStyle(Palette.ink)
        Text(detail)
          .font(Ramp.small)
          .foregroundStyle(Palette.bracken)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, Space.sm)
    .accessibilityElement(children: .combine)
  }

  private func caption(_ text: String) -> some View {
    Text(text.uppercased())
      .font(Ramp.micro)
      .tracking(0.6)
      .foregroundStyle(Palette.bracken)
  }

  // MARK: - Moving about

  private var connected: Bool {
    if case .connected = connection { return true }
    return false
  }

  private var isChecking: Bool {
    if case .checking = connection { return true }
    return false
  }

  private var serverName: String {
    settings.pairedWith
      ?? chosen?.name
      ?? settings.endpoint(found: nil)?.host()
      ?? "your Mac"
  }

  /// Point the phone at the picked server, then move on to the handshake.
  /// The address alone is not a pairing: that still takes the code or the token.
  private func pick(_ server: FoundServer) {
    settings.serverURL = server.url.absoluteString
    connection = .untried
    goStage(.pair)
  }

  private func goStage(_ next: ConnectStage) {
    guard stage != next else { return }
    stageForward = next == .pair
    withAnimation(
      reduceMotion
        ? .easeInOut(duration: ParlourTokens.Motion.quick)
        : .snappy(duration: ParlourTokens.Motion.settle * 2, extraBounce: 0)
    ) {
      stage = next
    }
  }

  /// The step before or after this one, among the ones this phone shows.
  private func neighbour(_ offset: Int) -> Step? {
    if step == .welcome { return offset > 0 ? steps.first : nil }
    guard let here = steps.firstIndex(of: step) else { return nil }
    let there = here + offset
    if there < 0 { return .welcome }
    return there < steps.count ? steps[there] : nil
  }

  private func next() {
    if let after = neighbour(1) { go(after) }
  }

  private func go(_ next: Step) {
    forward = next > step
    withAnimation(
      reduceMotion
        ? .easeInOut(duration: ParlourTokens.Motion.quick)
        : .snappy(duration: ParlourTokens.Motion.settle * 2, extraBounce: 0)
    ) {
      step = next
      if next > reached { reached = next }
    }
  }

  private func finish() {
    settings.onboarded = true
    onDone()
  }

  private func check() async {
    guard let base = settings.endpoint(found: nil) else {
      connection = .failed(ClientError.noServer.localizedDescription)
      byHand = true
      return
    }
    connection = .checking
    do {
      connection = .connected(try await ParlourClient(base: base, token: settings.token).connect())
      // A handshake that worked from the finding look, by hand, still deserves
      // the paired page.
      if stage == .find { goStage(.pair) }
    } catch {
      connection = .failed(error.localizedDescription)
    }
  }
}

/// The steps along the top. One already reached can be gone back to; one not
/// reached yet cannot be jumped to, since each needs the one before it.
private struct StepBar: View {
  let steps: [OnboardingView.Step]
  let current: OnboardingView.Step
  let reached: OnboardingView.Step
  let pick: (OnboardingView.Step) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      HStack(spacing: Space.xs) {
        ForEach(steps, id: \.self) { step in
          Button {
            pick(step)
          } label: {
            Capsule()
              .fill(step <= current ? Palette.hearth : Palette.rule)
              .frame(height: 4)
              .frame(maxWidth: .infinity)
              .padding(.vertical, Space.sm)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .disabled(step > reached || step == current)
          .accessibilityLabel(step.label)
          .accessibilityAddTraits(step == current ? .isSelected : [])
        }
      }
      if let index = steps.firstIndex(of: current) {
        Text("Step \(index + 1) of \(steps.count), \(current.label)")
          .font(Ramp.micro)
          .foregroundStyle(Palette.bracken)
      }
    }
  }
}

/// Detail nobody needs until they do, behind one line with a chevron.
private struct Reveal<Content: View>: View {
  let label: String
  @Binding var isOpen: Bool
  @ViewBuilder var content: Content

  init(_ label: String, isOpen: Binding<Bool>, @ViewBuilder content: () -> Content) {
    self.label = label
    _isOpen = isOpen
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.md) {
      Button {
        withAnimation(.easeInOut(duration: ParlourTokens.Motion.quick)) { isOpen.toggle() }
      } label: {
        HStack(spacing: Space.xs) {
          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .rotationEffect(.degrees(isOpen ? 90 : 0))
          Text(label)
        }
        .font(Ramp.small)
        .foregroundStyle(Palette.bracken)
      }
      .buttonStyle(.plain)
      .accessibilityValue(isOpen ? "open" : "closed")
      if isOpen { content }
    }
  }
}

#Preview {
  OnboardingView {}
    .environment(AppSettings())
    .environment(ServerDiscovery())
    .environment(LocalIntelligence())
}
