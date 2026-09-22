//
//  Theme.swift
//  The generated tokens, resolved into the types SwiftUI wants. This is the
//  only file in the app allowed to name a colour or a font, and it names them
//  by reaching into ParlourTokens rather than by writing one down.
//

import SwiftUI

extension Color {
  /// A token colour that follows the trait collection, so the whole app changes
  /// with the system rather than reading the scheme in twenty different views.
  init(_ tone: ParlourTokens.Duotone) {
    self.init(
      UIColor { traits in
        let dark = traits.userInterfaceStyle == .dark
        return UIColor(
          rgb: dark ? tone.dark : tone.light,
          alpha: dark ? tone.darkOpacity : tone.lightOpacity
        )
      })
  }
}

extension UIColor {
  fileprivate convenience init(rgb: UInt32, alpha: Double) {
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: CGFloat(alpha)
    )
  }
}

/// The palette by role. Ink on a limewashed wall, with one lit thing.
enum Palette {
  static let paper = Color(ParlourTokens.Colour.paper)
  static let surface = Color(ParlourTokens.Colour.surface)
  static let ink = Color(ParlourTokens.Colour.ink)
  static let bracken = Color(ParlourTokens.Colour.bracken)
  static let rule = Color(ParlourTokens.Colour.rule)
  static let inset = Color(ParlourTokens.Colour.inset)
  static let hearth = Color(ParlourTokens.Colour.hearth)
  static let hearthInk = Color(ParlourTokens.Colour.hearthInk)
  static let lamp = Color(ParlourTokens.Colour.lamp)
  static let lampText = Color(ParlourTokens.Colour.lampText)
  static let lampInk = Color(ParlourTokens.Colour.lampInk)
  static let lampGlow = Color(ParlourTokens.Colour.lampGlow)
  static let alarm = Color(ParlourTokens.Colour.alarm)
  static let alarmInk = Color(ParlourTokens.Colour.alarmInk)

  /// A state mark's colour. The three roles are the only ones a mark can take.
  static func role(_ role: ParlourTokens.ColourRole) -> Color {
    switch role {
    case .hearth: return hearth
    case .lamp: return lamp
    case .bracken: return bracken
    }
  }

  /// The same role as text. Amber is a dot, not a word, so the lamp darkens.
  static func roleText(_ role: ParlourTokens.ColourRole) -> Color {
    role == .lamp ? lampText : Palette.role(role)
  }
}

/// The type ramp. Serif for anything that should sound like the house, the
/// system face for everything else, and the ramp scales with Dynamic Type.
enum Ramp {
  static func serif(_ size: CGFloat) -> Font {
    .system(size: size, weight: .regular, design: .serif).leading(.tight)
  }

  static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight)
  }

  static func mono(_ size: CGFloat) -> Font {
    .system(size: size, design: .monospaced)
  }

  static let display = serif(ParlourTokens.Text.display)
  static let heading = serif(ParlourTokens.Text.heading)
  static let title = serif(ParlourTokens.Text.title)
  static let lede = sans(ParlourTokens.Text.lede)
  static let body = sans(ParlourTokens.Text.body)
  static let small = sans(ParlourTokens.Text.small)
  static let micro = sans(ParlourTokens.Text.micro, weight: .medium)
}

/// Shorthands so a view reads `Space.lg` rather than a number nobody can place.
enum Space {
  static let xs = ParlourTokens.Space.xs
  static let sm = ParlourTokens.Space.sm
  static let md = ParlourTokens.Space.md
  static let lg = ParlourTokens.Space.lg
  static let xl = ParlourTokens.Space.xl
  static let xxl = ParlourTokens.Space.xxl
  static let xxxl = ParlourTokens.Space.xxxl
}

enum Radius {
  static let sm = ParlourTokens.Radius.sm
  static let md = ParlourTokens.Radius.md
  static let lg = ParlourTokens.Radius.lg
}
