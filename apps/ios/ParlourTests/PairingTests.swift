//
//  PairingTests.swift
//  The link `parlour pair` draws, read the way the scanner and the Camera app
//  hand it over. The exact text below is what the server's own test expects
//  it to print, so the two sides cannot drift apart unnoticed.
//

import Foundation
import Testing

@testable import Parlour

@Suite("Pairing")
struct PairingTests {
  @Test("the link from parlour pair gives the address, the token and the name")
  func readsTheServersLink() throws {
    let link = try #require(
      PairingLink(
        string: "parlour://pair?url=http%3A%2F%2Fden.local%3A8765&token=abc&name=Parlour%20on%20den"
      ))
    #expect(link.server.absoluteString == "http://den.local:8765")
    #expect(link.token == "abc")
    #expect(link.name == "Parlour on den")
  }

  @Test("without a name, the server's host stands in for one")
  func nameFallsBackToHost() throws {
    let link = try #require(PairingLink(string: "parlour://pair?url=http%3A%2F%2Fden.local%3A8765&token=abc"))
    #expect(link.name == "den.local")
  }

  @Test("anything that is not a whole Parlour pairing link is refused")
  func refusesTheRest() {
    #expect(PairingLink(string: "https://example.com/?url=http%3A%2F%2Fden&token=abc") == nil)
    #expect(PairingLink(string: "parlour://open?url=http%3A%2F%2Fden&token=abc") == nil)
    #expect(PairingLink(string: "parlour://pair?url=http%3A%2F%2Fden.local%3A8765") == nil)
    #expect(PairingLink(string: "parlour://pair?url=http%3A%2F%2Fden.local%3A8765&token=") == nil)
    #expect(PairingLink(string: "parlour://pair?url=tel%3A123&token=abc") == nil)
    #expect(PairingLink(string: "just some text") == nil)
  }
}
