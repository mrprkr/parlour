//
//  AppSettings.swift
//  Which server, which room, and whether to try this phone's own model before
//  asking the house. The token is the one thing not kept here; see TokenStore.
//

import Foundation
import Observation

@Observable
@MainActor
final class AppSettings {
  /// Empty means "find it with Bonjour", the same as a satellite's serverUrl.
  var serverURL: String {
    didSet { defaults.set(serverURL, forKey: Key.serverURL) }
  }

  /// Which room the phone says it is in, so a follow-up lands in the right one.
  var room: String {
    didSet { defaults.set(room, forKey: Key.room) }
  }

  /// Answer on the phone when the model on it can, and only then ask the house.
  /// Off by default: the house has the tools, and a phone that answers by
  /// itself cannot turn the lights on.
  var preferOnDevice: Bool {
    didSet { defaults.set(preferOnDevice, forKey: Key.preferOnDevice) }
  }

  var token: String {
    didSet { TokenStore.write(token) }
  }

  private let defaults: UserDefaults

  private enum Key {
    static let serverURL = "serverURL"
    static let room = "room"
    static let preferOnDevice = "preferOnDevice"
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    serverURL = defaults.string(forKey: Key.serverURL) ?? ""
    room = defaults.string(forKey: Key.room) ?? ""
    preferOnDevice = defaults.bool(forKey: Key.preferOnDevice)
    token = TokenStore.read() ?? ""
  }

  /// What the client should talk to, if anything. `found` is what Bonjour
  /// turned up, which is only used while serverURL is empty.
  func endpoint(found: URL?) -> URL? {
    let typed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
    if typed.isEmpty { return found }
    // A bare host is the common thing to type, so fill in the rest.
    let text = typed.contains("://") ? typed : "http://\(typed)"
    return URL(string: text)
  }
}
