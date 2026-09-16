import assert from "node:assert/strict";
import { test } from "node:test";
import { registeredProviders } from "../../core/providers.ts";
import { createFfmpeg, FfmpegSchema, ffmpegDefinition } from "./ffmpeg.ts";

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
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.name, "ffmpeg");
  if (checks[0]!.status === "fail") assert.match(checks[0]!.detail, /brew install ffmpeg/);
  else assert.equal(checks[0]!.status, "ok");
});

test("close before frames is harmless", () => {
  const source = createFfmpeg(FfmpegSchema.parse({}), context);
  source.close();
});
