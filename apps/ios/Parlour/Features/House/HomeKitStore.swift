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

/// One controllable thing, flattened out of HomeKit's object graph so a view
/// never has to walk services and characteristics. Which controls a view
/// offers follows from which fields are present: a plain switch has only
/// `on`, a dimmer adds `brightness`, a colour light adds `hue` and
/// `saturation`, a thermostat has a `targetTemperature`.
struct Accessory: Identifiable, Hashable, Sendable {
  let id: UUID
  let name: String
  let room: String
  /// The SF Symbol for the accessory's HomeKit category.
  let icon: String
  /// nil when the accessory has no power state to read, such as a sensor.
  var on: Bool?
  /// 0 to 100, when the accessory dims.
  var brightness: Double?
  /// 0 to 360 and 0 to 100, when the accessory does colour.
  var hue: Double?
  var saturation: Double?
  /// Degrees Celsius, when the accessory holds a temperature.
  var targetTemperature: Double?
  var temperatureRange: ClosedRange<Double>?
  var temperatureStep: Double?
  var currentTemperature: Double?
  let reachable: Bool
}

/// A room and what is in it, in the order the accessories already sorted.
struct Room: Identifiable, Hashable, Sendable {
  let name: String
  let accessories: [Accessory]
  /// How many accessories are switched on, for the overview card.
  let lit: Int

  var id: String { name }
}

@Observable
@MainActor
final class HomeKitStore: NSObject, HMHomeManagerDelegate {
  private(set) var homeName: String?
  private(set) var rooms: [Room] = []
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

  // MARK: - Controls

  func set(_ accessory: Accessory, on wanted: Bool) async {
    amend(accessory.id) { $0.on = wanted }
    await write(wanted, to: accessory.id, as: HMCharacteristicTypePowerState)
  }

  func set(_ accessory: Accessory, brightness: Double) async {
    amend(accessory.id) { $0.brightness = brightness }
    await write(Int(brightness.rounded()), to: accessory.id, as: HMCharacteristicTypeBrightness)
  }

  func set(_ accessory: Accessory, hue: Double, saturation: Double) async {
    amend(accessory.id) {
      $0.hue = hue
      $0.saturation = saturation
    }
    await write(hue, to: accessory.id, as: HMCharacteristicTypeHue)
    await write(saturation, to: accessory.id, as: HMCharacteristicTypeSaturation)
  }

  func set(_ accessory: Accessory, targetTemperature: Double) async {
    amend(accessory.id) { $0.targetTemperature = targetTemperature }
    await write(targetTemperature, to: accessory.id, as: HMCharacteristicTypeTargetTemperature)
  }

  /// A binding for the power switch, so a Toggle answers the finger straight
  /// away while the write goes through HomeKit behind it.
  subscript(power accessory: Accessory) -> Bool {
    get { accessory.on ?? false }
    set { Task { await set(accessory, on: newValue) } }
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

  // MARK: - Reading the house

  private func reload() {
    guard let manager else { return }
    ready = true
    authorised = manager.authorizationStatus.contains(.authorized)

    let home = manager.homes.first
    homeName = home?.name

    // Rooms in order, then accessories in order, so nothing moves about.
    let accessories = (home?.accessories ?? [])
      .map(flatten)
      .sorted { ($0.room, $0.name) < ($1.room, $1.name) }

    var order: [String] = []
    var grouped: [String: [Accessory]] = [:]
    for accessory in accessories {
      if grouped[accessory.room] == nil { order.append(accessory.room) }
      grouped[accessory.room, default: []].append(accessory)
    }
    rooms = order.map { name in
      let inRoom = grouped[name] ?? []
      return Room(name: name, accessories: inRoom, lit: inRoom.filter { $0.on == true }.count)
    }
  }

  private func flatten(_ accessory: HMAccessory) -> Accessory {
    let target = characteristic(HMCharacteristicTypeTargetTemperature, of: accessory)
    return Accessory(
      id: accessory.uniqueIdentifier,
      name: accessory.name,
      room: accessory.room?.name ?? "No room",
      icon: Self.icon(for: accessory.category.categoryType),
      on: value(HMCharacteristicTypePowerState, of: accessory) as? Bool,
      brightness: (value(HMCharacteristicTypeBrightness, of: accessory) as? NSNumber)?.doubleValue,
      hue: (value(HMCharacteristicTypeHue, of: accessory) as? NSNumber)?.doubleValue,
      saturation: (value(HMCharacteristicTypeSaturation, of: accessory) as? NSNumber)?.doubleValue,
      targetTemperature: (target?.value as? NSNumber)?.doubleValue,
      temperatureRange: target.map { characteristic in
        let low = characteristic.metadata?.minimumValue?.doubleValue ?? 10
        let high = characteristic.metadata?.maximumValue?.doubleValue ?? 38
        return low...max(low, high)
      },
      temperatureStep: target?.metadata?.stepValue?.doubleValue ?? 0.5,
      currentTemperature: (value(HMCharacteristicTypeCurrentTemperature, of: accessory) as? NSNumber)?
        .doubleValue,
      reachable: accessory.isReachable
    )
  }

  /// Change the local copy straight away, so a control follows the finger
  /// rather than waiting for the round trip through HomeKit.
  private func amend(_ id: UUID, _ change: (inout Accessory) -> Void) {
    rooms = rooms.map { room in
      guard let index = room.accessories.firstIndex(where: { $0.id == id }) else { return room }
      var accessories = room.accessories
      change(&accessories[index])
      return Room(
        name: room.name,
        accessories: accessories,
        lit: accessories.filter { $0.on == true }.count
      )
    }
  }

  private func write(_ value: some Sendable, to id: UUID, as type: String) async {
    guard
      let target = manager?.homes.first?.accessories
        .first(where: { $0.uniqueIdentifier == id }),
      let characteristic = characteristic(type, of: target)
    else { return }
    try? await characteristic.writeValue(value)
    reload()
  }

  private func characteristic(_ type: String, of accessory: HMAccessory) -> HMCharacteristic? {
    accessory.services
      .flatMap(\.characteristics)
      .first { $0.characteristicType == type }
  }

  private func value(_ type: String, of accessory: HMAccessory) -> Any? {
    characteristic(type, of: accessory)?.value
  }

  /// The mark for the accessory's category, so a row says lamp or lock at a
  /// glance rather than only in words.
  private static func icon(for category: String) -> String {
    switch category {
    case HMAccessoryCategoryTypeLightbulb: return "lightbulb"
    case HMAccessoryCategoryTypeOutlet: return "powerplug"
    case HMAccessoryCategoryTypeSwitch, HMAccessoryCategoryTypeProgrammableSwitch:
      return "lightswitch.on"
    case HMAccessoryCategoryTypeFan: return "fan.desk"
    case HMAccessoryCategoryTypeThermostat: return "thermometer.medium"
    case HMAccessoryCategoryTypeSensor: return "sensor"
    case HMAccessoryCategoryTypeDoorLock: return "lock"
    case HMAccessoryCategoryTypeGarageDoorOpener: return "door.garage.closed"
    case HMAccessoryCategoryTypeWindowCovering: return "blinds.horizontal.closed"
    case HMAccessoryCategoryTypeSecuritySystem: return "shield"
    case HMAccessoryCategoryTypeTelevision: return "tv"
    default: return "homekit"
    }
  }
}
