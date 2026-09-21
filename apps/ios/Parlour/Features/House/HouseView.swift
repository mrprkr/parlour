//
//  HouseView.swift
//  The rooms and the accessories HomeKit already knows about, read straight
//  off the phone. No server, no token, no network: this is the one screen that
//  still works when the Mac at home is switched off.
//

import SwiftUI

struct HouseView: View {
  @State private var homeKit = HomeKitStore()

  var body: some View {
    Wall {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.xl) {
          Heading(homeKit.homeName ?? "Your home", detail: "From HomeKit, on this phone")

          if !homeKit.ready {
            Text("Asking HomeKit.")
              .font(Ramp.small)
              .foregroundStyle(Palette.bracken)
          } else if !homeKit.authorised {
            Panel {
              VStack(alignment: .leading, spacing: Space.sm) {
                Text("Parlour has not been let into HomeKit.")
                  .font(Ramp.body)
                  .foregroundStyle(Palette.ink)
                Text("Settings, Privacy and Security, HomeKit.")
                  .font(Ramp.small)
                  .foregroundStyle(Palette.bracken)
              }
            }
          } else if homeKit.accessories.isEmpty {
            Text("No accessories in this home yet.")
              .font(Ramp.small)
              .foregroundStyle(Palette.bracken)
          } else {
            ForEach(homeKit.accessories.byRoom, id: \.room) { group in
              room(group.room, group.accessories)
            }
          }
        }
        .padding(.horizontal, Space.xl)
        .padding(.vertical, Space.lg)
      }
    }
    // Creating the home manager is what raises the HomeKit prompt, so it waits
    // until someone actually opens this tab.
    .task { homeKit.start() }
  }

  private func room(_ name: String, _ accessories: [Accessory]) -> some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text(name.uppercased())
        .font(Ramp.micro)
        .tracking(0.6)
        .foregroundStyle(Palette.bracken)
      Rule()
      ForEach(accessories) { accessory in
        row(accessory)
        Rule()
      }
    }
  }

  private func row(_ accessory: Accessory) -> some View {
    HStack(spacing: Space.md) {
      // The same mark as everywhere else: lit when it is on, an outline when
      // there is nothing there to switch.
      StateMark(state: accessory.on == true ? .idle : .stopped)
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
      if let on = accessory.on {
        // HomeKit is the source of truth, so the binding writes through it and
        // waits for the reload rather than flipping the switch optimistically.
        Toggle(
          accessory.name,
          isOn: Binding(get: { on }, set: { _ in Task { await homeKit.toggle(accessory) } })
        )
        .labelsHidden()
        .disabled(!accessory.reachable)
      }
    }
    .padding(.vertical, Space.sm)
    .accessibilityElement(children: .combine)
  }
}

#Preview {
  HouseView()
}
