import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAudioInputs } from "./init.ts";

/** What `ffmpeg -f avfoundation -list_devices true -i ""` puts on stderr. */
const LISTING = [
  "[AVFoundation indev @ 0x14be04080] AVFoundation video devices:",
  "[AVFoundation indev @ 0x14be04080] [0] FaceTime HD Camera",
  "[AVFoundation indev @ 0x14be04080] [1] Capture screen 0",
  "[AVFoundation indev @ 0x14be04080] AVFoundation audio devices:",
  "[AVFoundation indev @ 0x14be04080] [0] MacBook Pro Microphone",
  "[AVFoundation indev @ 0x14be04080] [1] Scarlett Solo USB",
  ": Input/output error",
  "",
].join("\n");

test("the microphones are read out of ffmpeg's list, and the cameras above them are not", () => {
  assert.deepEqual(parseAudioInputs(LISTING), [
    { index: ":0", name: "MacBook Pro Microphone" },
    { index: ":1", name: "Scarlett Solo USB" },
  ]);
});

test("nothing that is not a device listing reads as a device", () => {
  assert.deepEqual(parseAudioInputs(""), []);
  assert.deepEqual(parseAudioInputs("ffmpeg: command not found"), []);
  // The heading with nothing under it: a Mac that has refused the microphone.
  assert.deepEqual(parseAudioInputs("[AVFoundation indev @ 0x1] AVFoundation audio devices:\n"), []);
});
