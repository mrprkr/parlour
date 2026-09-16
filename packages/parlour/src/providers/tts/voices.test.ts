import assert from "node:assert/strict";
import { test } from "node:test";
import { isKokoroVoiceId } from "./voices.ts";

test("isKokoroVoiceId tells Kokoro ids from macOS voice names", () => {
  assert.ok(isKokoroVoiceId("af_heart"));
  assert.ok(isKokoroVoiceId("bm_george"));
  assert.ok(!isKokoroVoiceId("Daniel"));
  assert.ok(!isKokoroVoiceId("Samantha (Enhanced)"));
  assert.ok(!isKokoroVoiceId(""));
});
