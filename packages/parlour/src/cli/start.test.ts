import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudioSource } from "../core/ports.ts";
import { FakeAudioSource } from "../testing/index.ts";
import { keepListening } from "./start.ts";

const frame = () => new Int16Array(1280);

test("a microphone that stops is opened again, and the loop only ends when asked to", async () => {
  // Ends after its frames, as ffmpeg does when the device is gone.
  const source = new FakeAudioSource([frame(), frame()]);
  const abort = new AbortController();
  let pushed = 0;
  const waits: number[] = [];

  await keepListening(
    source,
    async () => {
      pushed += 1;
    },
    abort.signal,
    (wait) => {
      waits.push(wait);
      if (waits.length === 3) abort.abort();
    },
    [0, 1, 2],
  );

  assert.equal(pushed, 6, "three openings of two frames each");
  assert.deepEqual(waits, [0, 1, 2], "backing off each time");
});

test("a microphone that throws is treated as one that stopped", async () => {
  const source: AudioSource = {
    // biome-ignore lint/correctness/useYield: it fails before the first frame, as a missing device does
    async *frames() {
      throw new Error("Invalid audio device index");
    },
    close() {},
  };
  const abort = new AbortController();
  let stops = 0;
  await keepListening(
    source,
    async () => {},
    abort.signal,
    () => {
      stops += 1;
      if (stops === 2) abort.abort();
    },
    [0],
  );
  assert.equal(stops, 2);
});

test("an abort during the wait ends the loop without opening the microphone again", async () => {
  let opened = 0;
  const empty = new FakeAudioSource();
  const source: AudioSource = {
    frames(signal) {
      opened += 1;
      return empty.frames(signal);
    },
    close() {},
  };
  const abort = new AbortController();
  // A minute's wait that the abort has to cut short, or this test takes one.
  const started = Date.now();
  await keepListening(
    source,
    async () => {},
    abort.signal,
    () => setTimeout(() => abort.abort(), 10),
    [60_000],
  );
  assert.equal(opened, 1);
  assert.ok(Date.now() - started < 5_000, "the wait was cut short");
});
