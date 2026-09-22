//
//  OnboardingTests.swift
//  Whether the app opens on the setup. A phone pointed at a server before the
//  setup existed must not be sent through it again; one that has been through
//  it, or put it off, must not see it at every launch.
//

import Foundation
import Testing

@testable import Parlour

@Suite("Onboarding")
@MainActor
struct OnboardingTests {
  private func defaults() -> UserDefaults {
    UserDefaults(suiteName: "parlour.tests.\(UUID().uuidString)")!
  }

  @Test("a phone already given an address counts as set up")
  func existingAddressIsOnboarded() {
    let store = defaults()
    store.set("den.local:8765", forKey: "serverURL")
    #expect(AppSettings(defaults: store).onboarded)
  }

  @Test("the answer, once given, is what is remembered")
  func rememberedEitherWay() {
    let store = defaults()
    store.set("den.local:8765", forKey: "serverURL")
    store.set(false, forKey: "onboarded")
    let settings = AppSettings(defaults: store)
    #expect(!settings.onboarded)

    settings.onboarded = true
    #expect(AppSettings(defaults: store).onboarded)
  }
}
