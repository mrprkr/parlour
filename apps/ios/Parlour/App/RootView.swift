//
//  RootView.swift
//  Three tabs, because the app does three things: talk to the house, look at
//  the house, and say which house.
//

import SwiftUI

struct RootView: View {
  @Environment(ServerDiscovery.self) private var discovery
  @Environment(LocalIntelligence.self) private var intelligence

  var body: some View {
    TabView {
      Tab("Talk", systemImage: "mic") {
        TalkView()
      }
      Tab("House", systemImage: "house") {
        HouseView()
      }
      Tab("Settings", systemImage: "gearshape") {
        SettingsView()
      }
    }
    .tint(Palette.hearth)
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
