/**
 * Rasterises the icons in `icon.ts` into every file a platform wants a bitmap
 * for. Run `pnpm exec nx run design:icons` after changing the mark or the
 * palette and commit what it writes. The SVGs are text and go through
 * `design:emit` with its drift check; these are binary, so they are written
 * here and looked at, not diffed.
 *
 * The desktop app's .icns and every size under src-tauri/icons come from the
 * one PNG written here, by `tauri icon`, which its build runs first.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import { type IconShape, iconSvg, shapes } from "./icon.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Raster {
  /** Path from the repository root. */
  path: string;
  contents: () => Buffer;
}

export const rasters: Raster[] = [
  { path: "apps/site/app/favicon.ico", contents: () => ico(shapes.favicon, [16, 32, 48]) },
  { path: "apps/site/app/apple-icon.png", contents: () => png(shapes.square, 180, { opaque: true }) },
  { path: "packages/parlour/src/server/web/apple-touch-icon.png", contents: () => png(shapes.square, 180) },
  { path: "packages/parlour/src/server/web/icon-192.png", contents: () => png(shapes.square, 192) },
  { path: "packages/parlour/src/server/web/icon-512.png", contents: () => png(shapes.square, 512) },
  // App Store Connect turns away an app icon with an alpha channel, even an
  // opaque one, so this is written as plain RGB.
  {
    path: "apps/ios/Parlour/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
    contents: () => png(shapes.square, 1024, { opaque: true }),
  },
  { path: "apps/desktop/src-tauri/icon.png", contents: () => png(shapes.macos, 1024) },
  // 22 points is the menu bar's height; 44 pixels covers a Retina display.
  { path: "apps/desktop/src-tauri/tray.png", contents: () => png(shapes.tray, 44) },
];

/** Straight RGBA pixels of the shape drawn `size` pixels square. */
function render(shape: IconShape, size: number): Uint8Array {
  const resvg = new Resvg(iconSvg(shape), { fitTo: { mode: "width", value: size } });
  const pixels = resvg.render().pixels;
  // resvg hands back premultiplied alpha and PNG wants it straight, or every
  // antialiased edge comes out darker than the colour it belongs to.
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3]!;
    if (alpha === 0 || alpha === 255) continue;
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round((pixels[i + c]! * 255) / alpha));
  }
  return pixels;
}

/**
 * Encodes the pixels by hand rather than taking resvg's own PNG, so an icon
 * that has to be opaque can drop its alpha channel instead of carrying one
 * that is all 255.
 */
function png(shape: IconShape, size: number, options: { opaque?: boolean } = {}): Buffer {
  const rgba = render(shape, size);
  const channels = options.opaque ? 3 : 4;
  const stride = size * channels + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // no filter on this row
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = y * stride + 1 + x * channels;
      for (let c = 0; c < channels; c++) raw[to + c] = rgba[from + c]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = options.opaque ? 2 : 6; // RGB or RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An .ico of PNG images, which every browser that still asks for one reads. */
function ico(shape: IconShape, sizes: number[]): Buffer {
  const images = sizes.map((size) => png(shape, size));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // an icon, not a cursor
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + 16 * index;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[index]!.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index]!.length;
  });
  return Buffer.concat([header, ...images]);
}

async function main(): Promise<void> {
  for (const raster of rasters) {
    const path = join(root, raster.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, raster.contents());
    console.log(`wrote ${relative(root, path)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
