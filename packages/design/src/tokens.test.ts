import assert from "node:assert/strict";
import { test } from "node:test";
import { palette, sessionStates, stateMarks } from "./tokens.ts";

/** WCAG relative luminance. Only the opaque tokens are worth measuring. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/**
 * Everything that ever carries text has to clear AA against the wall it is on.
 * `lamp` is exempt because it is only ever a dot or a halo; `lampText` is the
 * one that gets to hold words, and it is in here.
 */
test("text colours clear 4.5:1 against the paper they sit on", () => {
  for (const scheme of ["light", "dark"] as const) {
    const paper = palette.paper[scheme];
    for (const name of ["ink", "bracken", "hearth", "lampText", "alarm"] as const) {
      const ratio = contrast(palette[name][scheme], paper);
      assert.ok(ratio >= 4.5, `${name} on ${scheme} paper is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the ink drawn on a filled colour clears 4.5:1 against it", () => {
  const pairs = [
    ["hearthInk", "hearth"],
    ["lampInk", "lamp"],
    ["alarmInk", "alarm"],
  ] as const;
  for (const scheme of ["light", "dark"] as const) {
    for (const [ink, fill] of pairs) {
      const ratio = contrast(palette[ink][scheme], palette[fill][scheme]);
      assert.ok(ratio >= 4.5, `${ink} on ${fill} in ${scheme} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("a surface is distinguishable from the paper behind it", () => {
  for (const scheme of ["light", "dark"] as const) {
    const ratio = contrast(palette.surface[scheme], palette.paper[scheme]);
    assert.ok(ratio > 1.02 && ratio < 1.6, `surface on ${scheme} paper is ${ratio.toFixed(3)}:1`);
  }
});

test("every colour is a hex triplet or an rgba, so every emitter can express it", () => {
  for (const [name, tone] of Object.entries(palette)) {
    for (const value of [tone.light, tone.dark]) {
      const shaped = /^#[0-9a-f]{6}$/.test(value) || /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(value);
      assert.ok(shaped, `${name} is ${value}`);
    }
  }
});

test("the states quicken as the turn approaches its answer", () => {
  const paced = sessionStates
    .map((state) => stateMarks[state].pulseMs)
    .filter((pulse): pulse is number => pulse !== null);
  const sorted = [...paced].sort((a, b) => b - a);
  assert.deepEqual(paced, sorted, "listening, thinking and speaking should get faster in that order");
});

test("only the states that are doing something are lit", () => {
  for (const state of sessionStates) {
    const mark = stateMarks[state];
    assert.equal(mark.glow, mark.pulseMs !== null, `${state} glows if and only if it pulses`);
  }
  assert.equal(stateMarks.stopped.filled, false, "a stopped agent is an outline, not a mark");
});
