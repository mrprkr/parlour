import assert from "node:assert/strict";
import { test } from "node:test";
import { joinTranscript, yapArgs, yapSchema } from "./yap.ts";

test("yap transcribes to a text file, with the locale only when one is set", () => {
  assert.deepEqual(yapArgs("/t/a.wav", "/t/a.txt", undefined), [
    "transcribe",
    "/t/a.wav",
    "--txt",
    "-o",
    "/t/a.txt",
  ]);
  assert.deepEqual(yapArgs("/t/a.wav", "/t/a.txt", "en-GB").slice(-2), ["--locale", "en-GB"]);
});

test("yap's subtitle-length lines come back as one transcript", () => {
  assert.equal(joinTranscript("Turn on the\nkitchen lights\n\n"), "Turn on the kitchen lights");
  assert.equal(joinTranscript("\n"), "");
});

test("yap needs nothing in config", () => {
  assert.deepEqual(yapSchema.parse({}), { command: "yap", timeoutMs: 20000 });
});
