//
//  HouseView.swift
//  The rooms HomeKit already knows about, read straight off the phone. No
//  server, no token, no network: this is the one screen that still works when
//  the Mac at home is switched off. An overview of the rooms first, then a
//  page per room with the right control for each accessory.
//

import SwiftUI

struct HouseView: View {
  @State private var homeKit = HomeKitStore()
  /// Ties each room card to its detail page for the zoom transition.
  @Namespace private var zoom

  private let columns = [GridItem(.adaptive(minimum: 150), spacing: Space.md)]

  var body: some View {
    NavigationStack {
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
            } else if homeKit.rooms.isEmpty {
              Text("No accessories in this home yet.")
                .font(Ramp.small)
                .foregroundStyle(Palette.bracken)
            } else {
              LazyVGrid(columns: columns, alignment: .leading, spacing: Space.md) {
                ForEach(homeKit.rooms) { room in
                  NavigationLink(value: room.name) {
                    RoomCard(name: room.name, count: room.accessories.count, lit: room.lit)
                  }
                  .buttonStyle(.plain)
                  .matchedTransitionSource(id: room.name, in: zoom)
                }
              }
              .animation(.smooth(duration: ParlourTokens.Motion.settle), value: homeKit.rooms)
            }
          }
          .padding(.horizontal, Space.xl)
          .padding(.vertical, Space.lg)
        }
      }
      .toolbar(.hidden, for: .navigationBar)
      .navigationDestination(for: String.self) { name in
        RoomView(store: homeKit, name: name)
          .navigationTransition(.zoom(sourceID: name, in: zoom))
      }
    }
    // Creating the home manager is what raises the HomeKit prompt, so it waits
    // until someone actually opens this tab.
    .task { homeKit.start() }
  }
}

/// One room on the overview: the shared state mark, the name, and how much of
/// the room is on right now.
private struct RoomCard: View {
  let name: String
  let count: Int
  let lit: Int

  var body: some View {
    Panel {
      VStack(alignment: .leading, spacing: Space.sm) {
        StateMark(state: lit > 0 ? .idle : .stopped)
        Text(name)
          .font(Ramp.title)
          .foregroundStyle(Palette.ink)
          .lineLimit(2, reservesSpace: true)
        Text(summary)
          .font(Ramp.small)
          .foregroundStyle(Palette.bracken)
          .contentTransition(.numericText())
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(name), \(summary)")
  }

  private var summary: String {
    if lit > 0 { return "\(lit) of \(count) on" }
    return count == 1 ? "1 device" : "\(count) devices"
  }
}

#Preview {
  HouseView()
}
