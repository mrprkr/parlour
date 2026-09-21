//
//  Components.swift
//  The shared visual language, as the handful of views every screen is built
//  from. Parlour separates things with a hairline rule and a lot of space, not
//  with boxes and shadows, so there is less here than an app usually needs.
//

import SwiftUI

/// The dot. Colour and cadence come from the generated state vocabulary, which
/// is the same one the menu bar app and the phone page draw from, so a glance
/// at any surface in the house says the same thing.
struct StateMark: View {
  let state: ParlourTokens.SessionState
  var size: CGFloat = 9

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var breathing = false

  private var mark: ParlourTokens.StateMark { ParlourTokens.mark(for: state) }

  var body: some View {
    let colour = Palette.role(mark.colour)
    Circle()
      .fill(mark.filled ? colour : Color.clear)
      .frame(width: size, height: size)
      .overlay(
        Circle().strokeBorder(colour, lineWidth: mark.filled ? 0 : ParlourTokens.hairline)
      )
      // The halo is what "lit" means. Only one thing on a screen should have it.
      .shadow(color: mark.glow ? Palette.lampGlow : .clear, radius: size)
      .opacity(breathing ? 0.45 : 1)
      .animation(pulse, value: breathing)
      .onAppear { breathing = shouldBreathe }
      .onChange(of: state) { _, _ in breathing = shouldBreathe }
      .accessibilityHidden(true)
  }

  /// Reduce Motion turns the breath off; the colour still carries the state.
  private var shouldBreathe: Bool { mark.pulse != nil && !reduceMotion }

  private var pulse: Animation? {
    guard let seconds = mark.pulse, !reduceMotion else { return nil }
    return .easeInOut(duration: seconds / 2).repeatForever(autoreverses: true)
  }
}

/// A state mark with its word next to it, which is how every surface labels
/// what the house is doing.
struct StateRow: View {
  let state: ParlourTokens.SessionState

  var body: some View {
    let mark = ParlourTokens.mark(for: state)
    HStack(spacing: Space.sm) {
      StateMark(state: state)
      Text(mark.label)
        .font(Ramp.small)
        .foregroundStyle(Palette.roleText(mark.colour))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(mark.label)
  }
}

/// The hairline. Parlour's only divider.
struct Rule: View {
  var body: some View {
    Rectangle()
      .fill(Palette.rule)
      .frame(height: ParlourTokens.hairline)
      .accessibilityHidden(true)
  }
}

/// A panel lifted off the wall by a shade and a rule, never by a shadow.
struct Panel<Content: View>: View {
  @ViewBuilder var content: Content

  var body: some View {
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Space.lg)
      .background(Palette.surface, in: .rect(cornerRadius: Radius.lg))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.lg)
          .strokeBorder(Palette.rule, lineWidth: ParlourTokens.hairline)
      )
  }
}

/// A section heading in the house's voice.
struct Heading: View {
  let text: String
  var detail: String?

  init(_ text: String, detail: String? = nil) {
    self.text = text
    self.detail = detail
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text(text)
        .font(Ramp.title)
        .foregroundStyle(Palette.ink)
      if let detail {
        Text(detail)
          .font(Ramp.small)
          .foregroundStyle(Palette.bracken)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The one filled button in the app. Everything else is a word you can tap.
struct HearthButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(Ramp.sans(ParlourTokens.Text.lede, weight: .semibold))
      .foregroundStyle(Palette.hearthInk)
      .frame(maxWidth: .infinity)
      .padding(.vertical, Space.lg)
      .background(Palette.hearth, in: .rect(cornerRadius: Radius.lg))
      .opacity(configuration.isPressed ? 0.85 : 1)
      .animation(.easeOut(duration: ParlourTokens.Motion.quick), value: configuration.isPressed)
  }
}

extension ButtonStyle where Self == HearthButtonStyle {
  static var hearth: HearthButtonStyle { HearthButtonStyle() }
}

/// The wall every screen is drawn on, and the one measure prose is set to.
struct Wall<Content: View>: View {
  @ViewBuilder var content: Content

  var body: some View {
    ZStack {
      Palette.paper.ignoresSafeArea()
      content
    }
    .tint(Palette.hearth)
  }
}
