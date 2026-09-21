//
//  HomeKitStore.swift
//  What HomeKit already knows about the house, read on the phone rather than
//  asked for over the network. Parlour's own tools go through Home Assistant
//  on the server; this is the second opinion in your pocket, and the thing
//  that still works when the server is off.
//
//  HomeKit is annotated for the main thread but not for strict concurrency,
//  hence the @preconcurrency import.
//

import Foundation
import Observation
@preconcurrency import HomeKit

/// One switchable thing, flattened out of HomeKit's object graph so a view
/// never has to walk services and characteristics.
struct Accessory: Identifiable, Hashable, Sendable {
  let id: UUID
  let name: String
  let room: String
  /// nil when the accessory has no power state to read, such as a sensor.
  let on: Bool?
  let reachable: Bool
}

@Observable
@MainActor
final class HomeKitStore: NSObject, HMHomeManagerDelegate {
  private(set) var homeName: String?
  private(set) var accessories: [Accessory] = []
  private(set) var authorised = false
  /// nil until the manager has had its first say, which is what tells the
  /// interface to wait rather than to claim there is no home.
  private(set) var ready = false

  private var manager: HMHomeManager?

  /// Creating the manager is what raises the HomeKit prompt, so it does not
  /// happen until someone opens the House tab.
  func start() {
    guard manager == nil else { return }
    let manager = HMHomeManager()
    manager.delegate = self
    self.manager = manager
  }

  /// Flip an accessory's power state. Anything without one is left alone.
  func toggle(_ accessory: Accessory) async {
    guard let home = manager?.primaryHome ?? manager?.homes.first else { return }
    guard let target = home.accessories.first(where: { $0.uniqueIdentifier == accessory.id }) else { return }
    guard let characteristic = power(of: target) else { return }
    let wanted = !((characteristic.value as? Bool) ?? false)
    try? await characteristic.writeValue(wanted)
    reload()
  }

  // MARK: - HMHomeManagerDelegate

  nonisolated func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
    Task { @MainActor in self.reload() }
  }

  nonisolated func homeManager(
    _ manager: HMHomeManager,
    didUpdate status: HMHomeManagerAuthorizationStatus
  ) {
    Task { @MainActor in self.reload() }
  }

  private func reload() {
    guard let manager else { return }
    ready = true
    authorised = manager.authorizationStatus.contains(.authorized)

    let home = manager.primaryHome ?? manager.homes.first
    homeName = home?.name

    accessories = (home?.accessories ?? [])
      .map { accessory in
        Accessory(
          id: accessory.uniqueIdentifier,
          name: accessory.name,
          room: accessory.room?.name ?? "No room",
          on: power(of: accessory)?.value as? Bool,
          reachable: accessory.isReachable
        )
      }
      // Rooms in order, then accessories in order, so the list stops moving.
      .sorted { ($0.room, $0.name) < ($1.room, $1.name) }
  }

  /// The one characteristic this app knows how to write.
  private func power(of accessory: HMAccessory) -> HMCharacteristic? {
    accessory.services
      .flatMap(\.characteristics)
      .first { $0.characteristicType == HMCharacteristicTypePowerState }
  }
}

extension Array where Element == Accessory {
  /// The accessories grouped by room, in the order the list already sorted.
  var byRoom: [(room: String, accessories: [Accessory])] {
    var order: [String] = []
    var grouped: [String: [Accessory]] = [:]
    for accessory in self {
      if grouped[accessory.room] == nil { order.append(accessory.room) }
      grouped[accessory.room, default: []].append(accessory)
    }
    return order.map { (room: $0, accessories: grouped[$0] ?? []) }
  }
}
