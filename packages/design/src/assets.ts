/**
 * The bits of the design system Xcode reads rather than Swift: the asset
 * catalogue colour the system tints controls, the home screen label and the
 * share sheet with. It is the hearth green, so an iOS control the app never
 * styles still comes out the right colour.
 */
import { palette } from "./tokens.ts";

interface Components {
  red: string;
  green: string;
  blue: string;
  alpha: string;
}

function components(hex: string): Components {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (!match) throw new Error(`Cannot express ${hex} in an asset catalogue`);
  return {
    red: `0x${match[1]!.toUpperCase()}`,
    green: `0x${match[2]!.toUpperCase()}`,
    blue: `0x${match[3]!.toUpperCase()}`,
    alpha: "1.000",
  };
}

export function emitAccentColour(): string {
  const colourSet = {
    colors: [
      {
        color: { "color-space": "srgb", components: components(palette.hearth.light) },
        idiom: "universal",
      },
      {
        appearances: [{ appearance: "luminosity", value: "dark" }],
        color: { "color-space": "srgb", components: components(palette.hearth.dark) },
        idiom: "universal",
      },
    ],
    info: { author: "@parlour/design", version: 1 },
  };
  return `${JSON.stringify(colourSet, null, 2)}\n`;
}
