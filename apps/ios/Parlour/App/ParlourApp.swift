//
//  ParlourApp.swift
//  The app is a client and nothing more: it records, it posts, it plays the
//  answer back. Everything that thinks, holds a key or touches the house runs
//  on the Mac at home, which is the whole shape of the project.
//

import SwiftUI

@main
struct ParlourApp: App {
  @State private var settings = AppSettings()
  @State private var discovery = ServerDiscovery()
  @State private var intelligence = LocalIntelligence()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(settings)
        .environment(discovery)
        .environment(intelligence)
    }
  }
}
