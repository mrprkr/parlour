//
//  ServerView.swift
//  The Mac, managed from the phone: the model servers it keeps warm, the
//  pipeline's settings, and the maintenance a person would otherwise walk
//  over to the Mac and type. The server decides what is allowed; this only
//  asks, and shows what it said.
//

import SwiftUI

struct ServerView: View {
  @Environment(AppSettings.self) private var settings

  @State private var status: AdminStatus?
  @State private var draft: Pipeline?
  @State private var loading = false
  /// The one thing being done right now, so two taps do not ask twice.
  @State private var working: String?
  @State private var notice: String?
  @State private var failure: String?
  @State private var checks: [ServerCheck]?
  @State private var logService = "agent"
  @State private var logLines: [String]?
  @State private var confirmStop: ManagedService?
  @State private var confirmRestart = false

  var body: some View {
    Wall {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.xxl) {
          Heading("Server", detail: headline)

          if let failure {
            Text(failure)
              .font(Ramp.small)
              .foregroundStyle(Palette.alarm)
          }
          if let notice {
            Text(notice)
              .font(Ramp.small)
              .foregroundStyle(Palette.hearth)
          }

          if let status {
            services(status)
            pipeline(status)
            maintenance(status)
          } else if !loading && failure == nil {
            Text("Pair with a server in Settings to manage it from here.")
              .font(Ramp.small)
              .foregroundStyle(Palette.bracken)
          }
        }
        .padding(.horizontal, Space.xl)
        .padding(.vertical, Space.lg)
      }
      .refreshable { await load() }
    }
    .task(id: settings.serverURL) { await load() }
    .confirmationDialog(
      "Stop \(confirmStop?.title.lowercased() ?? "it")?",
      isPresented: Binding(get: { confirmStop != nil }, set: { if !$0 { confirmStop = nil } }),
      titleVisibility: .visible,
      presenting: confirmStop
    ) { service in
      Button("Stop", role: .destructive) { Task { await control(service, .stop) } }
    } message: { service in
      Text(
        service.name == "llm"
          ? "The house answers through the cloud model, or not at all, until it is started again."
          : "The house cannot make out what is said until it is started again."
      )
    }
    .confirmationDialog("Restart the agent?", isPresented: $confirmRestart, titleVisibility: .visible) {
      Button("Restart") { Task { await restartAgent() } }
    } message: {
      Text("The house stops answering for a few seconds while it starts again.")
    }
  }

  private var headline: String {
    guard let status else { return loading ? "Asking the Mac." : "The Mac that answers." }
    return "Parlour \(status.version), \(status.memory.freeGb.formatted(.number.precision(.fractionLength(1)))) "
      + "of \(status.memory.totalGb.formatted(.number.precision(.fractionLength(0)))) GB free."
  }

  // MARK: - The model servers

  private func services(_ status: AdminStatus) -> some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      section("MODEL SERVERS")
      ForEach(status.services) { service in
        HStack(alignment: .top, spacing: Space.md) {
          StateMark(state: service.running ? .idle : .stopped)
            .padding(.top, 5)
          VStack(alignment: .leading, spacing: 2) {
            Text(service.title)
              .font(Ramp.body)
              .foregroundStyle(Palette.ink)
            Text(service.summary)
              .font(Ramp.micro)
              .foregroundStyle(Palette.bracken)
          }
          Spacer()
          if service.configured {
            HStack(spacing: Space.md) {
              if service.running {
                Button("Restart") { Task { await control(service, .restart) } }
                Button("Stop") { confirmStop = service }
              } else {
                Button("Start") { Task { await control(service, .start) } }
              }
            }
            .font(Ramp.small)
            .disabled(working != nil)
          }
        }
        .padding(.vertical, Space.sm)
        .overlay(alignment: .bottom) { Rule() }
      }
    }
  }

  // MARK: - The pipeline

  private func pipeline(_ status: AdminStatus) -> some View {
    Panel {
      VStack(alignment: .leading, spacing: Space.md) {
        Text("PIPELINE")
          .font(Ramp.micro)
          .tracking(0.6)
          .foregroundStyle(Palette.bracken)

        if let binding = Binding($draft) {
          stepper("At once, across the house", value: binding.concurrency, in: Pipeline.Limits.concurrency)
          stepper("Waiting per room", value: binding.queueDepth, in: Pipeline.Limits.queueDepth)
          stepper("Tasks per request", value: binding.maxTasks, in: Pipeline.Limits.maxTasks)
          Stepper(
            value: Binding(
              get: { binding.wrappedValue.timeoutMs / 1000 },
              set: { binding.wrappedValue.timeoutMs = $0 * 1000 }
            ),
            in: Pipeline.Limits.timeoutSeconds,
            step: 5
          ) {
            row("Give up after", "\(binding.wrappedValue.timeoutMs / 1000)s")
          }
          Picker("Read requests first", selection: binding.triage) {
            ForEach(Pipeline.Limits.triage, id: \.self) { Text($0).tag($0) }
          }
          .pickerStyle(.segmented)
          Text("Reading a request first corrects and splits it: always is more accurate, never is quicker.")
            .font(Ramp.micro)
            .foregroundStyle(Palette.bracken)
        }

        if status.saved != status.pipeline {
          Text("A saved change is waiting for the agent to restart.")
            .font(Ramp.micro)
            .foregroundStyle(Palette.lampText)
        }

        HStack(spacing: Space.lg) {
          Button(status.restart == "automatic" ? "Save and restart" : "Save") {
            Task { await savePipeline(status) }
          }
          .font(Ramp.small)
          .disabled(working != nil || draft == nil || draft == status.saved)
          if draft != status.saved {
            Button("Undo") { draft = status.saved }
              .font(Ramp.small)
          }
        }
      }
    }
  }

  // MARK: - Maintenance

  private func maintenance(_ status: AdminStatus) -> some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      section("MAINTENANCE")

      HStack(spacing: Space.lg) {
        Button("Run the doctor") { Task { await runDoctor() } }
        if status.restart == "automatic" {
          Button("Restart the agent") { confirmRestart = true }
        }
      }
      .font(Ramp.small)
      .disabled(working != nil)

      if let checks {
        ForEach(checks) { check in
          HStack(alignment: .top, spacing: Space.md) {
            StateMark(state: check.status == "ok" ? .idle : check.status == "warn" ? .thinking : .stopped)
              .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
              Text(check.name)
                .font(Ramp.body)
                .foregroundStyle(check.status == "fail" ? Palette.alarm : Palette.ink)
              Text(check.detail)
                .font(Ramp.micro)
                .foregroundStyle(Palette.bracken)
            }
          }
          .padding(.vertical, Space.xs)
        }
      }

      Rule()
      HStack(spacing: Space.lg) {
        Picker("Log", selection: $logService) {
          Text("agent").tag("agent")
          Text("llm").tag("llm")
          Text("whisper").tag("whisper")
        }
        .pickerStyle(.segmented)
        Button("Show") { Task { await showLogs() } }
          .font(Ramp.small)
          .disabled(working != nil)
      }
      if let logLines {
        ScrollView(.horizontal) {
          Text(logLines.joined(separator: "\n"))
            .font(Ramp.mono(ParlourTokens.Text.micro))
            .foregroundStyle(Palette.ink)
            .textSelection(.enabled)
            .padding(Space.md)
        }
        .background(Palette.inset, in: .rect(cornerRadius: Radius.md))
      }
    }
  }

  // MARK: - Pieces

  private func section(_ title: String) -> some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text(title)
        .font(Ramp.micro)
        .tracking(0.6)
        .foregroundStyle(Palette.bracken)
      Rule()
    }
  }

  private func stepper(_ label: String, value: Binding<Int>, in range: ClosedRange<Int>) -> some View {
    Stepper(value: value, in: range) {
      row(label, "\(value.wrappedValue)")
    }
  }

  private func row(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label)
        .font(Ramp.body)
        .foregroundStyle(Palette.ink)
      Spacer()
      Text(value)
        .font(Ramp.mono(ParlourTokens.Text.body))
        .foregroundStyle(Palette.bracken)
    }
  }

  // MARK: - Asking the server

  private var client: ParlourClient? {
    settings.endpoint(found: nil).map { ParlourClient(base: $0, token: settings.token) }
  }

  private func load() async {
    guard let client else {
      status = nil
      return
    }
    loading = true
    defer { loading = false }
    do {
      let next = try await client.adminStatus()
      // A draft being edited is kept across a refresh; otherwise it follows the file.
      if draft == nil || draft == status?.saved { draft = next.saved }
      status = next
      failure = nil
    } catch {
      failure = error.localizedDescription
    }
  }

  /// Runs one action at a time, and says what went wrong in the server's own words.
  private func perform(_ label: String, _ work: (ParlourClient) async throws -> String?) async {
    guard let client, working == nil else { return }
    working = label
    notice = nil
    failure = nil
    defer { working = nil }
    do {
      notice = try await work(client)
    } catch {
      failure = error.localizedDescription
    }
  }

  private func control(_ service: ManagedService, _ action: ServiceAction) async {
    await perform("\(action.rawValue) \(service.name)") { client in
      let state = try await client.control(service.name, action)
      await load()
      return "\(state.title): \(state.summary)"
    }
  }

  private func savePipeline(_ status: AdminStatus) async {
    guard let draft else { return }
    let change = PipelineChange(from: status.saved, to: draft)
    guard !change.isEmpty else { return }
    await perform("pipeline") { client in
      let result = try await client.setPipeline(change)
      switch result.restart {
      case "scheduled":
        // The agent is on its way down; ask again once it is back up.
        try? await Task.sleep(for: .seconds(6))
        await load()
        return "Saved. The agent restarted with the new settings."
      case "needed":
        await load()
        return "Saved. It takes effect when the agent next starts."
      default:
        await load()
        return "Saved."
      }
    }
  }

  private func restartAgent() async {
    await perform("restart") { client in
      _ = try await client.restartAgent()
      try? await Task.sleep(for: .seconds(6))
      await load()
      return "The agent restarted."
    }
  }

  private func runDoctor() async {
    await perform("doctor") { client in
      let found = try await client.doctor()
      checks = found
      let broken = found.filter { $0.status == "fail" }.count
      return broken == 0 ? "Nothing is broken." : "\(broken) thing\(broken == 1 ? "" : "s") to fix."
    }
  }

  private func showLogs() async {
    let service = logService
    await perform("logs") { client in
      logLines = try await client.logs(service)
      return nil
    }
  }
}

#Preview {
  ServerView()
    .environment(AppSettings())
}
