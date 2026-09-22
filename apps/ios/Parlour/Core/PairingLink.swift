//
//  PairingLink.swift
//  What `parlour pair` draws as a code on the Mac:
//  parlour://pair?url=http%3A%2F%2Fden.local%3A8765&token=...&name=...
//  Read from the scanner in Settings, or handed over by the Camera app when it
//  opens the link. Either way it is the address and the token at once, so the
//  two can never come from different servers.
//

import Foundation

struct PairingLink: Equatable, Sendable {
  /// The server, as the phone should talk to it.
  let server: URL
  let token: String
  /// What the Mac calls itself, for saying what the phone is now paired with.
  let name: String

  static let scheme = "parlour"

  init?(url link: URL) {
    guard link.scheme?.lowercased() == Self.scheme,
      link.host()?.lowercased() == "pair",
      let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems
    else { return nil }
    func value(_ key: String) -> String? {
      let found = items.first { $0.name == key }?.value?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      return found?.isEmpty == false ? found : nil
    }
    // Only a web address: a code is something anybody can print, and the
    // token should not be handed to a scheme that opens some other app.
    guard let address = value("url"),
      let server = URL(string: address),
      let scheme = server.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      let host = server.host(), !host.isEmpty,
      let token = value("token")
    else { return nil }
    self.server = server
    self.token = token
    self.name = value("name") ?? host
  }

  init?(string: String) {
    guard let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines)) else {
      return nil
    }
    self.init(url: url)
  }
}
