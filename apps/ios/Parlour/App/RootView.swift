//
//  RootView.swift
//  Three tabs, because the app does three things: talk to the house, look at
//  the house, and say which house.
//

import SwiftUI

struct RootView: View {
  @Environment(AppSettings.self) private var settings
  @Environment(ServerDiscovery.self) private var discovery
  @Environment(LocalIntelligence.self) private var intelligence

  @State private var tab = Screen.talk
  /// A link from outside the app, held until the person says it is theirs.
  @State private var offered: PairingLink?

  private enum Screen: Hashable {
    case talk, house, settings
  }

  var body: some View {
    TabView(selection: $tab) {
      Tab("Talk", systemImage: "mic", value: Screen.talk) {
        TalkView()
      }
      Tab("House", systemImage: "house", value: Screen.house) {
        HouseView()
      }
      Tab("Settings", systemImage: "gearshape", value: Screen.settings) {
        SettingsView()
      }
    }
    .tint(Palette.hearth)
    .fullScreenCover(
      isPresented: Binding(get: { !settings.onboarded }, set: { if !$0 { settings.onboarded = true } })
    ) {
      // The first run opens on the setup rather than on a talk button with no
      // server behind it. Finishing it, or putting it off, is remembered.
      OnboardingView { tab = .talk }
    }
    .onOpenURL { url in
      // While the setup is up it asks about the link itself, since a dialog
      // from underneath it would never be seen.
      guard !settings.inSetup else { return }
      // The Camera app found a pairing code and opened it here. So can any
      // web page or message with a parlour:// link in it, so nothing is
      // taken until the person has seen which server it names and agreed:
      // otherwise a link could quietly send everything said to the phone
      // somewhere else.
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
        tab = .settings
      }
      Button("Cancel", role: .cancel) {}
    } message: { link in
      Text(
        "Everything you ask will go to \(link.server.absoluteString). "
          + "Only pair with a code your own Parlour server showed you."
      )
    }
    .task {
      // Browsing is what raises the local network prompt, so it happens as the
      // app opens rather than in the middle of someone trying to say something.
      discovery.start()
      intelligence.refresh()
    }
  }
}

#Preview {
  RootView()
    .environment(AppSettings())
    .environment(ServerDiscovery())
    .environment(LocalIntelligence())
}
