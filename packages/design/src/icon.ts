/**
 * The house mark as an icon, in every shape a platform asks for. The mark is
 * the one in the site's running head: a roof, the walls, a dado rail and one
 * lit thing in the gable. On an icon the wall is ink rather than paper,
 * because a home screen, a Dock and a browser tab are all busier than a page,
 * and the lit thing is the lamp, so the icon says what the rest of Parlour
 * says: one warm light on in the house.
 *
 * Everything is SVG built from the palette here; `icons.ts` turns it into the
 * PNGs, the .ico and the iOS asset.
 */
import { palette } from "./tokens.ts";

/**
 * The mark is drawn on a 32 unit grid and spans 6 to 26 on both axes. The walls
 * stop on the roof's centre line (13.2 is where it crosses x = 8 and x = 24), so
 * their caps sit inside the roof stroke instead of notching it at icon sizes.
 */
const GRID = 32;
const SPAN = 20;
export const MARK = "M6 15 16 6l10 9M8 13.2V26h16V13.2M8 20h16";
export const LAMP = { cx: 16, cy: 14.5, r: 2.4 };

export interface IconShape {
  /** Side of the square canvas, in pixels at 1x. */
  canvas: number;
  /** The tile behind the mark, or null for the bare mark (the menu bar). */
  tile: { inset: number; radius: number } | null;
  /** How much of the tile's side the mark spans. */
  fill: number;
  /** Stroke width on the 32 unit grid. Small sizes want it heavier to hold. */
  stroke: number;
  /** Draw the lamp's halo. Worth it from a Dock icon up, mud below that. */
  glow: boolean;
  /** Draw in one colour for a template image, which macOS tints itself. */
  template?: boolean;
}

export const shapes = {
  /** The browser tab. A rounded tile, as the old favicon was. */
  favicon: { canvas: 32, tile: { inset: 0, radius: 7 }, fill: 0.66, stroke: 2.4, glow: false },
  /**
   * iOS, the phone page's home screen icon and the web manifest. Full bleed
   * and square: iOS draws its own corners, and a maskable web icon keeps the
   * mark inside the middle 80%, which a fill of 0.56 does.
   */
  square: { canvas: 1024, tile: { inset: 0, radius: 0 }, fill: 0.56, stroke: 2.2, glow: true },
  /**
   * The macOS app. Apple's grid puts an 824 point body on a 1024 canvas, with
   * the rest left clear for the shadow the system does not draw for us.
   */
  macos: { canvas: 1024, tile: { inset: 100, radius: 185 }, fill: 0.58, stroke: 2.2, glow: true },
  /** The menu bar. A template image, so black on clear and nothing else. */
  tray: { canvas: 32, tile: null, fill: 0.84, stroke: 2.6, glow: false, template: true },
} satisfies Record<string, IconShape>;

export function iconSvg(shape: IconShape): string {
  const { canvas, tile } = shape;
  const inset = tile?.inset ?? 0;
  const side = canvas - inset * 2;
  const scale = (side * shape.fill) / SPAN;
  // The mark's centre is the grid's centre, so centring one centres the other.
  const offset = canvas / 2 - (GRID / 2) * scale;
  const ink = shape.template ? "#000000" : palette.paper.light;
  const lamp = shape.template ? "#000000" : palette.lamp.light;
  const round = (value: number) => Number(value.toFixed(3));

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="Parlour">`,
    "  <title>Parlour</title>",
  ];
  if (shape.glow) {
    lines.push(
      "  <defs>",
      '    <radialGradient id="glow">',
      `      <stop offset="0" stop-color="${palette.lamp.light}" stop-opacity="0.45"/>`,
      `      <stop offset="1" stop-color="${palette.lamp.light}" stop-opacity="0"/>`,
      "    </radialGradient>",
      "  </defs>",
    );
  }
  if (tile) {
    lines.push(
      `  <rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${tile.radius}" fill="${palette.ink.light}"/>`,
    );
  }
  lines.push(`  <g transform="translate(${round(offset)} ${round(offset)}) scale(${round(scale)})">`);
  if (shape.glow) {
    lines.push(`    <circle cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r * 3}" fill="url(#glow)"/>`);
  }
  lines.push(
    `    <path d="${MARK}" fill="none" stroke="${ink}" stroke-width="${shape.stroke}" stroke-linejoin="round" stroke-linecap="round"/>`,
    `    <circle cx="${LAMP.cx}" cy="${LAMP.cy}" r="${LAMP.r}" fill="${lamp}"/>`,
    "  </g>",
    "</svg>",
  );
  return `${lines.join("\n")}\n`;
}

/** The favicon as the site and the phone page serve it. */
export function emitFaviconSvg(): string {
  return iconSvg(shapes.favicon);
}

/** The iOS app icon set: one 1024 image, which Xcode scales to every size. */
export function emitAppIconContents(): string {
  const contents = {
    images: [{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
    info: { author: "@parlour/design", version: 1 },
  };
  return `${JSON.stringify(contents, null, 2)}\n`;
}
