import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAME_SAMPLES } from "../core/audio.ts";
import { levels, utterance } from "./try.ts";

/** A frame at a steady loudness, as a fraction of full scale. */
function frame(level: number): Int16Array {
  return new Int16Array(FRAME_SAMPLES).fill(Math.round(level * 32767));
}

test("levels reports the loudest frame and the average", () => {
  assert.deepEqual(levels([]), { peak: 0, mean: 0 });
  const { peak, mean } = levels([frame(0), frame(0.5)]);
  assert.ok(Math.abs(peak - 0.5) < 0.001);
  assert.ok(Math.abs(mean - 0.25) < 0.001);
});

test("utterance finds the speech between the silences", () => {
  const quiet = frame(0);
  const loud = frame(0.2);
  assert.equal(utterance([quiet, quiet], 0.01, 2), null, "nothing loud is nothing said");
  assert.deepEqual(utterance([quiet, loud, loud, quiet, quiet, quiet], 0.01, 2), { start: 1, end: 3 });
  assert.deepEqual(
    utterance([quiet, loud, quiet, loud], 0.01, 2),
    { start: 1, end: 4 },
    "a short pause is not the end",
  );
});
