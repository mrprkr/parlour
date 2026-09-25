//
//  DiscoveryTests.swift
//  A refused local network permission has to read as a refusal, whichever of
//  its two shapes it arrives in, or the app asks again when iOS never will.
//

import Network
import Testing
import dnssd

@testable import Parlour

@Suite("Discovery")
struct DiscoveryTests {
  @Test("PolicyDenied from the DNS service is the permission being refused")
  func policyDeniedIsARefusal() {
    let error = NWError.dns(DNSServiceErrorType(kDNSServiceErr_PolicyDenied))
    #expect(ServerDiscovery.isRefusal(error))
    #expect(ServerDiscovery.explain(error).contains("Local Network"))
  }

  @Test("a POSIX permission error is the same refusal")
  func posixIsARefusal() {
    #expect(ServerDiscovery.isRefusal(.posix(.EPERM)))
    #expect(ServerDiscovery.isRefusal(.posix(.EACCES)))
  }

  @Test("anything else is a failure, not a refusal")
  func otherErrorsAreNot() {
    #expect(!ServerDiscovery.isRefusal(.dns(DNSServiceErrorType(kDNSServiceErr_NoSuchName))))
    #expect(!ServerDiscovery.isRefusal(.posix(.ENETDOWN)))
    #expect(ServerDiscovery.explain(.posix(.ENETDOWN)).hasPrefix("Could not look for a server"))
  }
}
