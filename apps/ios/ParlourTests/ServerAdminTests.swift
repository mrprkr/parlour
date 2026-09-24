//
//  ServerAdminTests.swift
//  The /admin shapes the Server tab reads, and the change it sends back.
//

import Foundation
import Testing

@testable import Parlour

@Suite("Server admin")
struct ServerAdminTests {
  private let pipeline = Pipeline(concurrency: 2, queueDepth: 2, triage: "auto", maxTasks: 4, timeoutMs: 45000)

  @Test("the status decodes, services and all")
  func decodesStatus() throws {
    let json = """
      {"version":"0.6.0","role":"server","restart":"automatic",\
      "pipeline":{"concurrency":2,"queueDepth":2,"triage":"auto","maxTasks":4,"timeoutMs":45000},\
      "saved":{"concurrency":1,"queueDepth":2,"triage":"auto","maxTasks":4,"timeoutMs":45000},\
      "services":[{"name":"llm","what":"the local model","configured":true,"installed":true,\
      "running":false,"pid":null,"lastExit":1,"held":true}],\
      "memory":{"totalGb":16,"freeGb":3.2}}
      """
    let status = try JSONDecoder().decode(AdminStatus.self, from: Data(json.utf8))
    #expect(status.saved != status.pipeline)
    #expect(status.services.first?.title == "Local model")
    #expect(status.services.first?.summary == "Stopped, and staying stopped until it is started.")
    #expect(status.memory.freeGb == 3.2)
  }

  @Test("a change carries only what moved, so no default is written into the file")
  func sendsOnlyTheChange() throws {
    var next = pipeline
    next.triage = "always"
    let change = PipelineChange(from: pipeline, to: next)
    let json = String(decoding: try JSONEncoder().encode(change), as: UTF8.self)
    #expect(json == #"{"triage":"always"}"#)
    #expect(PipelineChange(from: pipeline, to: pipeline).isEmpty)
  }

  @Test("the steppers stop where the server would refuse")
  func boundsMatchTheServer() {
    #expect(Pipeline.Limits.concurrency == 1...4)
    #expect(Pipeline.Limits.timeoutSeconds.lowerBound * 1000 == 5000)
    #expect(Pipeline.Limits.timeoutSeconds.upperBound * 1000 == 300_000)
  }

  @Test("a refusal reads as the server's own sentence")
  func refusalIsReadable() {
    let error = ClientError.refused("that was done a moment ago; try again in 9s")
    #expect(error.localizedDescription == "that was done a moment ago; try again in 9s")
  }
}
