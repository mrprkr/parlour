import assert from "node:assert/strict";
import { test } from "node:test";
import { emitCss } from "./css.ts";
import { stale, targets } from "./emit.ts";
import { emitSwift } from "./swift.ts";
import { palette } from "./tokens.ts";

/**
 * The generated files are checked in, so this is the thing that stops one of
 * them going quietly out of step with tokens.ts. It runs in `pnpm check`, so
 * a pull request that edits a token and forgets to emit goes red.
 */
test("every surface's generated file matches the tokens", async () => {
  const drifted = await stale();
  assert.deepEqual(drifted, [], "run `pnpm exec nx run design:emit` and commit the result");
});

test("the emitters cover every surface", () => {
  assert.deepEqual(
    targets.map((target) => target.path).sort(),
    [
      "apps/desktop/src/tokens.css",
      "apps/ios/Parlour/DesignSystem/Tokens.swift",
      "apps/ios/Parlour/Resources/Assets.xcassets/AccentColor.colorset/Contents.json",
      "apps/ios/Parlour/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json",
      "apps/site/app/icon.svg",
      "apps/site/app/tokens.css",
      "packages/parlour/src/server/web/icon.svg",
      "packages/parlour/src/server/web/tokens.css",
    ],
    "a new surface needs a target here, or it will drift",
  );
});

test("the CSS declares every palette entry in both schemes", () => {
  const css = emitCss();
  for (const [name, tone] of Object.entries(palette)) {
    const property = `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    assert.ok(css.includes(`${property}: ${tone.light};`), `${property} is missing its light value`);
    assert.ok(css.includes(`${property}: ${tone.dark};`), `${property} is missing its dark value`);
  }
});

/*
 * The menu bar app loads the generated stylesheet next to Tailwind, which
 * builds its utilities out of theme variables with these prefixes. A shared
 * token in one of those namespaces would quietly redefine a Tailwind utility
 * (--leading-tight is one of Tailwind's own) or, for the font stacks, end up
 * declared in terms of itself.
 */
test("no token lands in a namespace Tailwind builds its utilities from", () => {
  const reserved = ["color", "font", "text", "leading", "tracking", "radius", "spacing", "shadow"];
  const declared = [...emitCss().matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]!);
  for (const property of declared) {
    for (const prefix of reserved) {
      assert.ok(
        property !== `--${prefix}` && !property.startsWith(`--${prefix}-`),
        `${property} is in Tailwind's --${prefix}-* namespace`,
      );
    }
  }
});

test("the Swift is balanced, so a bad emitter fails here rather than in Xcode", () => {
  const swift = emitSwift();
  const opens = (swift.match(/\{/g) ?? []).length;
  const closes = (swift.match(/\}/g) ?? []).length;
  assert.equal(opens, closes, "unbalanced braces in the generated Swift");
  assert.ok(swift.includes("public enum ParlourTokens {"), "the namespace went missing");
});
