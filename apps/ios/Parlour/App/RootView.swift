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
    .onOpenURL { url in
      // The Camera app found a pairing code and opened it here. Settings is
      // where the result shows, and where it is checked.
      guard let link = PairingLink(url: url) else { return }
      settings.pair(with: link)
      tab = .settings
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
