//
//  ParlourClient.swift
//  The three routes a client needs, and nothing else. The shapes here are the
//  ones in apps/site/content/docs/clients.mdx; keep them in step.
//

import Foundation

struct Health: Decodable, Sendable {
  let ok: Bool
  let tools: Int
  let cloud: Bool
}

struct Answer: Decodable, Sendable {
  /// What the server heard. Empty when nothing was said.
  let heard: String
  let reply: String
  /// "local" or "cloud", which is the whole point of the router.
  let via: String
  /// A WAV of the reply, base64, or nil when there was nothing to say.
  let audio: Data?
}

enum ClientError: LocalizedError {
  case noServer
  case unauthorised
  case server(status: Int)

  var errorDescription: String? {
    switch self {
    case .noServer:
      return "No server configured. Scan a pairing code or type an address in Settings."
    case .unauthorised:
      return "The server refused the token. Check PARLOUR_TOKEN in Settings."
    case .server(let status):
      return "The server answered \(status)."
    }
  }
}

/// Talks to one Parlour server. Held by the views for the life of a screen.
struct ParlourClient: Sendable {
  let base: URL
  let token: String

  /// One session for the whole app. The house is on the other side of the
  /// room, not the other side of the world, so it fails fast: a moved server
  /// should show up as an error rather than as a spinner.
  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 15
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  /// `/health` needs no token, which makes it the right thing to probe with.
  func health() async throws -> Health {
    try await decode(request(path: "/health", method: "GET"))
  }

  /// `/health`, then `/v1/models`, the cheapest route behind the token. The
  /// first says there is a server at the address; the second that it lets
  /// this phone in, which the health check alone never would.
  func connect() async throws -> Health {
    let health = try await health()
    struct Models: Decodable {}
    let _: Models = try await decode(request(path: "/v1/models", method: "GET"))
    return health
  }

  /// Text in, text out. The same route automations and scripts use.
  func ask(_ text: String) async throws -> Answer {
    let body: [String: String] = ["text": text, "client": "ios"]
    var call = request(path: "/ask", method: "POST")
    call.setValue("application/json", forHTTPHeaderField: "content-type")
    call.httpBody = try JSONSerialization.data(withJSONObject: body)
    // /ask answers with reply and via only, so fill in the rest.
    struct Spoken: Decodable { let reply: String; let via: String }
    let spoken: Spoken = try await decode(call)
    return Answer(heard: text, reply: spoken.reply, via: spoken.via, audio: nil)
  }

  /// One recording in, the transcript, the reply and the spoken reply out.
  func voice(wav: Data) async throws -> Answer {
    let items = [URLQueryItem(name: "client", value: "ios")]
    var call = request(path: "/voice", method: "POST", query: items)
    call.setValue("audio/wav", forHTTPHeaderField: "content-type")
    call.httpBody = wav
    return try await decode(call)
  }

  private func request(path: String, method: String, query: [URLQueryItem] = []) -> URLRequest {
    var components = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    var call = URLRequest(url: components.url!)
    call.httpMethod = method
    if !token.isEmpty { call.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
    return call
  }

  private func decode<T: Decodable>(_ call: URLRequest) async throws -> T {
    let (data, response) = try await Self.session.data(for: call)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 { throw ClientError.unauthorised }
    guard (200..<300).contains(status) else { throw ClientError.server(status: status) }
    let decoder = JSONDecoder()
    // `audio` comes back as base64, which is what Data's default strategy wants.
    return try decoder.decode(T.self, from: data)
  }
}
