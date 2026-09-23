//
//  ServerDiscovery.swift
//  Nobody should have to type an address. The server advertises _parlour._tcp
//  and this goes looking for it, which is also what raises the local network
//  prompt: iOS asks the first time something on the device browses the LAN.
//

import Foundation
import Network
import Observation
import dnssd

/// One server seen on the network.
struct FoundServer: Identifiable, Hashable, Sendable {
  /// The Bonjour instance name, which is `discovery.name` on the server.
  let name: String
  let url: URL

  var id: String { name }
}

@Observable
@MainActor
final class ServerDiscovery {
  private(set) var found: [FoundServer] = []
  private(set) var browsing = false
  /// Set when the browser itself fails, which on iOS almost always means the
  /// local network permission was refused.
  private(set) var failure: String?

  private var browser: NWBrowser?
  private var resolvers: [String: NWConnection] = [:]

  func start() {
    guard browser == nil else { return }
    let parameters = NWParameters()
    parameters.includePeerToPeer = false
    let browser = NWBrowser(
      for: .bonjour(type: "_parlour._tcp", domain: nil),
      using: parameters
    )

    browser.stateUpdateHandler = { [weak self, weak browser] state in
      Task { @MainActor in
        // A browser being replaced still reports its own cancellation; only
        // the current one may speak for the discovery state.
        guard let self, let browser, self.browser === browser else { return }
        switch state {
        case .ready:
          self.browsing = true
          self.failure = nil
        case .failed(let error), .waiting(let error):
          if case .dns(let code) = error, code == DNSServiceErrorType(kDNSServiceErr_DefunctConnection) {
            // iOS severs the browser's connection to the Bonjour daemon when
            // it suspends the app mid-browse. A defunct browser never
            // recovers, so a fresh one takes its place rather than an error
            // nobody can act on.
            self.stop()
            self.start()
          } else {
            self.browsing = false
            self.failure = Self.explain(error)
          }
        case .cancelled:
          self.browsing = false
        default:
          break
        }
      }
    }

    browser.browseResultsChangedHandler = { [weak self] results, _ in
      Task { @MainActor in self?.resolve(results) }
    }

    self.browser = browser
    browser.start(queue: .main)
  }

  func stop() {
    browser?.cancel()
    browser = nil
    for connection in resolvers.values { connection.cancel() }
    resolvers.removeAll()
    browsing = false
  }

  /// Bonjour hands back a service, not an address. Opening a connection to it
  /// and reading the path back is the supported way to learn the host and port.
  private func resolve(_ results: Set<NWBrowser.Result>) {
    let names = Set(
      results.compactMap { result -> String? in
        guard case .service(let name, _, _, _) = result.endpoint else { return nil }
        return name
      })

    // Something switched off stops being offered.
    found.removeAll { !names.contains($0.name) }
    for (name, connection) in resolvers where !names.contains(name) {
      connection.cancel()
      resolvers[name] = nil
    }

    for result in results {
      guard case .service(let name, _, _, _) = result.endpoint else { continue }
      guard resolvers[name] == nil, !found.contains(where: { $0.name == name }) else { continue }

      let connection = NWConnection(to: result.endpoint, using: .tcp)
      resolvers[name] = connection
      connection.stateUpdateHandler = { [weak self, weak connection] state in
        guard case .ready = state, let connection else { return }
        let endpoint = connection.currentPath?.remoteEndpoint
        connection.cancel()
        Task { @MainActor in
          guard let self else { return }
          self.resolvers[name] = nil
          guard case .hostPort(let host, let port) = endpoint else { return }
          guard let url = URL(string: "http://\(Self.literal(host)):\(port.rawValue)") else { return }
          guard !self.found.contains(where: { $0.name == name }) else { return }
          self.found.append(FoundServer(name: name, url: url))
        }
      }
      connection.start(queue: .main)
    }
  }

  /// An IPv6 literal needs its brackets back, and a link-local one its zone.
  private static func literal(_ host: NWEndpoint.Host) -> String {
    switch host {
    case .name(let name, _):
      return name
    case .ipv4(let address):
      return "\(address)"
    case .ipv6(let address):
      return "[\(address)]"
    @unknown default:
      return "\(host)"
    }
  }

  private static func explain(_ error: NWError) -> String {
    if case .posix(let code) = error, code == .EPERM || code == .EACCES {
      return "iOS is not letting Parlour onto the local network. Turn it on in Settings, Privacy, Local Network."
    }
    return "Could not look for a server: \(error.localizedDescription)"
  }
}
