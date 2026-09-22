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
  /// The server address, set by pairing or typed manually. Empty means no
  /// server is configured: discovered servers are never used automatically.
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

  /// Whether the setup has been finished or skipped. Until it has, the app
  /// opens on it rather than on a talk button with nothing behind it.
  var onboarded: Bool {
    didSet { defaults.set(onboarded, forKey: Key.onboarded) }
  }

  /// The server the last pairing code named, for this run only: it is what
  /// Settings says it is now paired with, and what it checks straight away.
  private(set) var pairedWith: String?

  /// Whether the setup is on screen, for this run only. A pairing link that
  /// arrives then is the setup's to ask about, not the tab bar's, which is
  /// underneath it and cannot put a dialog up.
  var inSetup = false

  private let defaults: UserDefaults

  private enum Key {
    static let serverURL = "serverURL"
    static let room = "room"
    static let preferOnDevice = "preferOnDevice"
    static let onboarded = "onboarded"
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    serverURL = defaults.string(forKey: Key.serverURL) ?? ""
    room = defaults.string(forKey: Key.room) ?? ""
    preferOnDevice = defaults.bool(forKey: Key.preferOnDevice)
    token = TokenStore.read() ?? ""
    // A phone that was already pointed at a server before there was a setup
    // to go through has, in effect, been through it.
    onboarded =
      defaults.object(forKey: Key.onboarded) == nil
      ? !serverURL.isEmpty || !token.isEmpty
      : defaults.bool(forKey: Key.onboarded)
  }

  /// Everything a pairing code carries, taken at once.
  func pair(with link: PairingLink) {
    serverURL = link.server.absoluteString
    token = link.token
    pairedWith = link.name
  }

  /// What the client should talk to, if anything. Bonjour discoveries are
  /// never used automatically: a server must be paired (QR code) or typed
  /// manually to prevent an attacker from advertising a rogue service and
  /// capturing the bearer token.
  func endpoint(found: URL?) -> URL? {
    let typed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
    if typed.isEmpty { return nil }
    // A bare host is the common thing to type, so fill in the rest.
    let text = typed.contains("://") ? typed : "http://\(typed)"
    return URL(string: text)
  }
}
