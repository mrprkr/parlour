/**
 * Writes the tokens into every surface. Run `pnpm exec nx run design:emit`
 * after editing tokens.ts and commit what it writes; `--check` fails instead
 * of writing, which is what `design:test` does so CI catches a stale file.
 *
 * The CSS is copied rather than imported across packages on purpose: the phone
 * page is served as three static files off the CLI with no build step, and the
 * site and the app have build steps that should not need to reach into another
 * package to find a stylesheet.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { emitAccentColour } from "./assets.ts";
import { emitCss } from "./css.ts";
import { emitSwift } from "./swift.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface Target {
  /** Path from the repository root. */
  path: string;
  contents: () => string;
}

export const targets: Target[] = [
  { path: "apps/site/app/tokens.css", contents: emitCss },
  { path: "apps/desktop/src/tokens.css", contents: emitCss },
  { path: "packages/parlour/src/server/web/tokens.css", contents: emitCss },
  { path: "apps/ios/Parlour/DesignSystem/Tokens.swift", contents: emitSwift },
  {
    path: "apps/ios/Parlour/Resources/Assets.xcassets/AccentColor.colorset/Contents.json",
    contents: emitAccentColour,
  },
];

/** The targets whose file on disk is not what the emitters would write. */
export async function stale(): Promise<string[]> {
  const drifted: string[] = [];
  for (const target of targets) {
    const wanted = target.contents();
    const found = await readFile(join(root, target.path), "utf8").catch(() => null);
    if (found !== wanted) drifted.push(target.path);
  }
  return drifted;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  if (check) {
    const drifted = await stale();
    if (drifted.length === 0) {
      console.log(`Every surface is up to date (${targets.length} files).`);
      return;
    }
    console.error(`Stale, run \`pnpm exec nx run design:emit\`:\n  ${drifted.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }

  for (const target of targets) {
    const path = join(root, target.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, target.contents());
    console.log(`wrote ${relative(root, path)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
