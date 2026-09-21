//
//  DesignSystemTests.swift
//  The tokens are generated from packages/design, so these do not re-check the
//  values. They check that the vocabulary the app draws with is the one the
//  other surfaces have: the same states, in the same order, at the same pace.
//

import Testing

@testable import Parlour

@Suite("Design system")
struct DesignSystemTests {
  @Test("every session state has a mark")
  func everyStateHasAMark() {
    for state in ParlourTokens.SessionState.allCases {
      let mark = ParlourTokens.mark(for: state)
      #expect(!mark.label.isEmpty)
    }
  }

  @Test("the pulse quickens as the turn approaches its answer")
  func pulseQuickens() throws {
    let listening = try #require(ParlourTokens.mark(for: .listening).pulse)
    let thinking = try #require(ParlourTokens.mark(for: .thinking).pulse)
    let speaking = try #require(ParlourTokens.mark(for: .speaking).pulse)
    #expect(listening > thinking)
    #expect(thinking > speaking)
  }

  @Test("only the working states are lit")
  func onlyWorkingStatesAreLit() {
    #expect(ParlourTokens.mark(for: .idle).glow == false)
    #expect(ParlourTokens.mark(for: .stopped).filled == false)
    #expect(ParlourTokens.mark(for: .thinking).glow)
  }

  @Test("thinking is the lamp, and the lamp is readable as text")
  func thinkingIsTheLamp() {
    #expect(ParlourTokens.mark(for: .thinking).colour == .lamp)
    // Amber on a pale wall does not carry words, so the text value differs.
    #expect(ParlourTokens.Colour.lampText.light != ParlourTokens.Colour.lamp.light)
    // In the dark the lamp is already readable, so it is itself.
    #expect(ParlourTokens.Colour.lampText.dark == ParlourTokens.Colour.lamp.dark)
  }
}
