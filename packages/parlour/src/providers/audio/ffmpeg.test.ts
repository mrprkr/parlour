import assert from "node:assert/strict";
import { test } from "node:test";
import { registeredProviders } from "../../core/providers.ts";
import {
  createFfmpeg,
  FfmpegSchema,
  ffmpegDefinition,
  findInput,
  parseAudioInputs,
  STRAY_FFMPEG,
} from "./ffmpeg.ts";

const context = {
  paths: {} as never,
  secrets: {},
  log: { debug() {}, info() {}, warn() {}, error() {} },
  emit: () => {},
  config: {},
};

test("registers as the ffmpeg audio source", () => {
  assert.equal(ffmpegDefinition.kind, "audioSource");
  assert.equal(ffmpegDefinition.name, "ffmpeg");
  assert.ok(registeredProviders("audioSource").some((p) => p.name === "ffmpeg"));
});

test("the schema fills in the defaults and ignores the rest of the audio slice", () => {
  assert.deepEqual(FfmpegSchema.parse({}), { inputDevice: ":0", sampleRate: 16000 });
  const parsed = FfmpegSchema.parse({ inputDevice: ":2", sampleRate: 16000, sink: "afplay", silenceMs: 800 });
  assert.deepEqual(parsed, { inputDevice: ":2", sampleRate: 16000 });
  assert.throws(() => FfmpegSchema.parse({ sampleRate: 44100 }));
});

test("doctor reports on ffmpeg being on the PATH", async () => {
  const source = createFfmpeg(FfmpegSchema.parse({}), context);
  const checks = await source.doctor!();
  assert.equal(checks[0]!.name, "ffmpeg");
  if (checks[0]!.status === "fail") assert.match(checks[0]!.detail, /brew install ffmpeg/);
  else assert.equal(checks[0]!.status, "ok");
  // Whether there are strays depends on the machine; only the shape is fixed.
  for (const check of checks.slice(1).filter((c) => c.name !== "input device")) {
    assert.equal(check.name, "microphone");
    assert.equal(check.status, "warn");
    assert.match(check.detail, /orphaned ffmpeg .* kill -9 \d+/);
  }
});

test("the stray pattern matches the microphone command and nothing else ffmpeg does", () => {
  assert.match(
    "ffmpeg -hide_banner -loglevel error -f avfoundation -i :0 -ac 1 -ar 16000 -f s16le -",
    STRAY_FFMPEG,
  );
  assert.match("/opt/homebrew/bin/ffmpeg -f avfoundation -i :1 -f s16le -", STRAY_FFMPEG);
  assert.doesNotMatch("ffmpeg -i film.mkv out.mp4", STRAY_FFMPEG);
  assert.doesNotMatch("grep ffmpeg -f avfoundation", STRAY_FFMPEG);
});

test("close before frames is harmless", () => {
  const source = createFfmpeg(FfmpegSchema.parse({}), context);
  source.close();
});

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

test("the configured device is found by index or by name, and a stale index is not", () => {
  const inputs = parseAudioInputs(LISTING);
  assert.equal(findInput(":1", inputs)?.name, "Scarlett Solo USB");
  assert.equal(findInput(":MacBook Pro Microphone", inputs)?.index, ":0");
  assert.equal(findInput("none:Scarlett Solo USB", inputs)?.index, ":1");
  assert.equal(findInput(":11", inputs), undefined);
  assert.equal(findInput(":Studio Mic", inputs), undefined);
});
