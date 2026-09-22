//
//  TokenStore.swift
//  PARLOUR_TOKEN opens every door in the house, so it lives in the keychain
//  rather than in UserDefaults with the room name and the server address.
//

import Foundation
import Security

enum TokenStore {
  private static let service = "app.heyparlour.Parlour"
  private static let account = "PARLOUR_TOKEN"

  static func read() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let token = String(data: data, encoding: .utf8)
    else { return nil }
    return token
  }

  static func write(_ token: String) {
    guard !token.isEmpty else { return clear() }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let attributes: [String: Any] = [
      kSecValueData as String: Data(token.utf8),
      // The phone is the client, not the server: it only needs the token while
      // someone is holding it, and it should never ride a backup to a new one.
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
      SecItemAdd(query.merging(attributes) { current, _ in current } as CFDictionary, nil)
    }
  }

  static func clear() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
