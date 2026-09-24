//
//  ServerAdmin.swift
//  What the Server tab reads and changes on the Mac: the shapes of the
//  /admin routes, and the bounds the server holds a change to. The server
//  checks every change itself; the bounds are here so the steppers never
//  offer a number it would refuse.
//

import Foundation

/// The pipeline's settings, as `config.json` names them.
struct Pipeline: Codable, Sendable, Equatable {
  var concurrency: Int
  var queueDepth: Int
  var triage: String
  var maxTasks: Int
  var timeoutMs: Int

  /// The same limits as `PipelinePatch` in packages/parlour/src/core/admin.ts.
  enum Limits {
    static let concurrency = 1...4
    static let queueDepth = 1...10
    static let maxTasks = 1...10
    static let timeoutSeconds = 5...300
    static let triage = ["auto", "always", "never"]
  }
}

/// Only what changed, so a save never writes a default into the file.
struct PipelineChange: Encodable, Sendable, Equatable {
  var concurrency: Int?
  var queueDepth: Int?
  var triage: String?
  var maxTasks: Int?
  var timeoutMs: Int?

  init(from old: Pipeline, to new: Pipeline) {
    concurrency = old.concurrency == new.concurrency ? nil : new.concurrency
    queueDepth = old.queueDepth == new.queueDepth ? nil : new.queueDepth
    triage = old.triage == new.triage ? nil : new.triage
    maxTasks = old.maxTasks == new.maxTasks ? nil : new.maxTasks
    timeoutMs = old.timeoutMs == new.timeoutMs ? nil : new.timeoutMs
  }

  var isEmpty: Bool {
    concurrency == nil && queueDepth == nil && triage == nil && maxTasks == nil && timeoutMs == nil
  }
}

struct PipelineResult: Decodable, Sendable {
  let pipeline: Pipeline
  /// "scheduled", "needed" or "none".
  let restart: String
}

struct RestartResult: Decodable, Sendable {
  let restart: String
}

enum ServiceAction: String, Sendable, CaseIterable {
  case start, stop, restart
}

/// One of the model servers the Mac keeps warm: "llm" or "whisper".
struct ManagedService: Decodable, Sendable, Identifiable, Equatable {
  let name: String
  let what: String
  /// Whether the server's config runs it at all.
  let configured: Bool
  let installed: Bool
  let running: Bool
  let pid: Int?
  let lastExit: Int?
  /// Stopped by a client, or left down after crashing too often.
  let held: Bool

  var id: String { name }

  var title: String { name == "llm" ? "Local model" : "Whisper" }

  var summary: String {
    if !configured { return "Not run by this server." }
    if running { return "Running." }
    if held { return "Stopped, and staying stopped until it is started." }
    if !installed { return "Not installed as a service on the Mac." }
    if let lastExit, lastExit != 0 { return "Stopped. It last exited with \(lastExit)." }
    return "Stopped."
  }
}

struct AdminStatus: Decodable, Sendable {
  let version: String
  let role: String
  /// "automatic" when the agent comes back on its own after a restart.
  let restart: String
  /// What the agent is running with now.
  let pipeline: Pipeline
  /// What the config file says, which differs until the next restart.
  let saved: Pipeline
  let services: [ManagedService]
  let memory: Memory

  struct Memory: Decodable, Sendable {
    let totalGb: Double
    let freeGb: Double
  }
}

struct ServerCheck: Decodable, Sendable, Identifiable {
  let name: String
  /// "ok", "warn" or "fail".
  let status: String
  let detail: String

  var id: String { "\(name) \(detail)" }
}
