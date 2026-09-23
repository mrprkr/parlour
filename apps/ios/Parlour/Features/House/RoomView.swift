//
//  RoomView.swift
//  One room, one page, with the right control for each accessory: a switch
//  where there is only power, a slider where it dims, a colour well where it
//  does colour, and a stepper where it holds a temperature. The store is the
//  source of truth; the controls that follow a finger keep a local copy while
//  the finger is down and hand it to HomeKit on release.
//

import SwiftUI

struct RoomView: View {
  let store: HomeKitStore
  let name: String

  var body: some View {
    Wall {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.md) {
          if let room {
            Heading(room.name, detail: room.lit > 0 ? "\(room.lit) of \(room.accessories.count) on" : "Everything off")
              .padding(.bottom, Space.sm)
            ForEach(room.accessories) { accessory in
              AccessoryCard(accessory: accessory, store: store)
            }
          } else {
            Heading(name, detail: "Nothing in this room any more.")
          }
        }
        .padding(.horizontal, Space.xl)
        .padding(.vertical, Space.lg)
        .animation(.smooth(duration: ParlourTokens.Motion.settle), value: room)
      }
    }
    .navigationTitle(name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
  }

  /// The live room, looked up by name so the page follows the store rather
  /// than a snapshot taken when the card was tapped.
  private var room: Room? {
    store.rooms.first { $0.name == name }
  }
}

/// One accessory and its controls.
private struct AccessoryCard: View {
  let accessory: Accessory
  let store: HomeKitStore

  /// The slider's own copy, so dragging is smooth and HomeKit only hears
  /// about it when the finger lifts.
  @State private var brightness: Double = 100
  @State private var dragging = false
  @State private var colour: Color = .white
  @State private var target: Double = 20

  var body: some View {
    @Bindable var store = store
    return Panel {
      VStack(alignment: .leading, spacing: Space.lg) {
        HStack(spacing: Space.md) {
          Image(systemName: accessory.icon)
            .font(.system(size: 17))
            .symbolVariant(accessory.on == true ? .fill : .none)
            .foregroundStyle(accessory.on == true ? Palette.hearth : Palette.bracken)
            .frame(width: 28)
            .contentTransition(.symbolEffect(.replace))
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(accessory.name)
              .font(Ramp.body)
              .foregroundStyle(Palette.ink)
            if !accessory.reachable {
              Text("not answering")
                .font(Ramp.micro)
                .foregroundStyle(Palette.bracken)
            }
          }
          Spacer()
          if accessory.on != nil {
            Toggle(accessory.name, isOn: $store[power: accessory])
              .labelsHidden()
              .disabled(!accessory.reachable)
          }
        }

        if accessory.brightness != nil {
          VStack(alignment: .leading, spacing: Space.xs) {
            HStack {
              caption("Brightness")
              Spacer()
              Text("\(Int(brightness.rounded()))%")
                .font(Ramp.small)
                .monospacedDigit()
                .foregroundStyle(Palette.bracken)
                .contentTransition(.numericText())
                .animation(.smooth(duration: ParlourTokens.Motion.quick), value: Int(brightness.rounded()))
            }
            Slider(
              value: $brightness,
              in: 1...100,
              step: 1,
              onEditingChanged: { editing in
                dragging = editing
                if !editing {
                  Task { await store.set(accessory, brightness: brightness) }
                }
              }
            )
            .disabled(!accessory.reachable)
            .accessibilityLabel("Brightness of \(accessory.name)")
          }
        }

        if accessory.hue != nil, accessory.saturation != nil {
          ColorPicker(selection: $colour, supportsOpacity: false) {
            caption("Colour")
          }
          .disabled(!accessory.reachable)
          .accessibilityLabel("Colour of \(accessory.name)")
        }

        if accessory.targetTemperature != nil {
          HStack(spacing: Space.md) {
            VStack(alignment: .leading, spacing: 2) {
              caption("Target")
              Text(degrees(target))
                .font(Ramp.body)
                .monospacedDigit()
                .foregroundStyle(Palette.ink)
                .contentTransition(.numericText())
                .animation(.smooth(duration: ParlourTokens.Motion.quick), value: target)
              if let current = accessory.currentTemperature {
                Text("Now \(degrees(current))")
                  .font(Ramp.micro)
                  .foregroundStyle(Palette.bracken)
              }
            }
            Spacer()
            Stepper(
              "Target temperature of \(accessory.name)",
              value: $target,
              in: accessory.temperatureRange ?? 10...38,
              step: accessory.temperatureStep ?? 0.5
            )
            .labelsHidden()
            .disabled(!accessory.reachable)
          }
        }
      }
    }
    .sensoryFeedback(.selection, trigger: accessory.on)
    .animation(.smooth(duration: ParlourTokens.Motion.settle), value: accessory.on)
    .onAppear { seed() }
    .onChange(of: accessory.brightness) { _, new in
      // HomeKit's word wins, except under a finger mid-drag.
      if let new, !dragging { brightness = new }
    }
    .onChange(of: accessory.hue) { seedColour() }
    .onChange(of: accessory.saturation) { seedColour() }
    .onChange(of: accessory.targetTemperature) { _, new in
      if let new { target = new }
    }
    .onChange(of: colour) { _, new in
      guard let (hue, saturation) = components(of: new) else { return }
      // A change that merely echoed HomeKit back needs no write.
      guard
        abs(hue - (accessory.hue ?? -1)) > 0.5 || abs(saturation - (accessory.saturation ?? -1)) > 0.5
      else { return }
      Task { await store.set(accessory, hue: hue, saturation: saturation) }
    }
    .onChange(of: target) { _, new in
      guard abs(new - (accessory.targetTemperature ?? .infinity)) > 0.01 else { return }
      Task { await store.set(accessory, targetTemperature: new) }
    }
  }

  private func seed() {
    if let value = accessory.brightness { brightness = value }
    if let value = accessory.targetTemperature { target = value }
    seedColour()
  }

  private func seedColour() {
    guard let hue = accessory.hue, let saturation = accessory.saturation else { return }
    // Brightness lives on its own slider, so the well shows the hue at full.
    colour = Color(hue: hue / 360, saturation: saturation / 100, brightness: 1)
  }

  /// Hue in degrees and saturation in percent, as HomeKit counts them.
  private func components(of colour: Color) -> (hue: Double, saturation: Double)? {
    var hue: CGFloat = 0
    var saturation: CGFloat = 0
    var brightness: CGFloat = 0
    var alpha: CGFloat = 0
    guard UIColor(colour).getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
    else { return nil }
    return (hue: hue * 360, saturation: saturation * 100)
  }

  private func degrees(_ value: Double) -> String {
    "\(value.formatted(.number.precision(.fractionLength(0...1))))\u{00B0}"
  }

  private func caption(_ text: String) -> some View {
    Text(text.uppercased())
      .font(Ramp.micro)
      .tracking(0.6)
      .foregroundStyle(Palette.bracken)
  }
}
