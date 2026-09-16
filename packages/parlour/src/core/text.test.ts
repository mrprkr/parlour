import assert from "node:assert/strict";
import { test } from "node:test";
import { isNoise, sentences, speakable } from "./text.ts";

test("sentences glues short fragments", () => {
  assert.deepEqual(sentences("Yes. The kitchen light is on and the heating is set to twenty one."), [
    "Yes. The kitchen light is on and the heating is set to twenty one.",
  ]);
});

test("sentences splits long replies", () => {
  assert.equal(
    sentences(
      "First sentence that is comfortably long enough on its own. Second sentence that is also long enough to stand.",
    ).length,
    2,
  );
});

test("sentences of nothing is nothing", () => {
  assert.deepEqual(sentences("   "), []);
  assert.deepEqual(sentences("```\ncode only\n```"), ["code only"]);
});

test("speakable strips markdown", () => {
  assert.equal(speakable("**Done.** See `light.kitchen`"), "Done. See light.kitchen");
  assert.equal(speakable("# Heading\n- one\n- [two](http://x)"), "Heading one two");
});

test("isNoise catches whisper hallucinations", () => {
  assert.ok(isNoise("[BLANK_AUDIO]"));
  assert.ok(isNoise(" Thank you. "));
  assert.ok(isNoise(""));
  assert.ok(!isNoise("turn on the light"));
});
