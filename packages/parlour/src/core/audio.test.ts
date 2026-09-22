import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAME_MS, FRAME_SAMPLES, FrameCutter, rms, toWav, wavToFrames } from "./audio.ts";

const ramp = (offset: number) =>
  Int16Array.from({ length: FRAME_SAMPLES }, (_, i) => ((i + offset) % 2000) - 1000);

test("one frame is 80 ms of 16 kHz audio", () => {
  assert.equal(FRAME_SAMPLES, 1280);
  assert.equal(FRAME_MS, 80);
});

test("rms is 0 for silence and near 1 for a full-scale square wave", () => {
  assert.equal(rms(new Int16Array(FRAME_SAMPLES)), 0);
  const square = Int16Array.from({ length: FRAME_SAMPLES }, (_, i) => (i % 2 ? 32767 : -32768));
  assert.ok(rms(square) > 0.999 && rms(square) <= 1);
});

test("toWav writes a canonical 44 byte header", () => {
  const wav = toWav([ramp(0)], 16000);
  assert.equal(wav.length, 44 + FRAME_SAMPLES * 2);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), FRAME_SAMPLES * 2);
});

test("toWav and wavToFrames round-trip", () => {
  const frames = [ramp(0), ramp(7), ramp(300)];
  const back = wavToFrames(toWav(frames, 16000));
  assert.equal(back.length, 3);
  for (let i = 0; i < 3; i++) assert.deepEqual([...back[i]!], [...frames[i]!]);
});

test("wavToFrames pads a short tail frame with silence", () => {
  const partial = ramp(0).subarray(0, 100);
  const back = wavToFrames(toWav([ramp(0), partial], 16000));
  assert.equal(back.length, 2);
  assert.equal(back[1]!.length, FRAME_SAMPLES);
  assert.deepEqual([...back[1]!.subarray(0, 100)], [...partial]);
  assert.ok(back[1]!.subarray(100).every((sample) => sample === 0));
});

test("wavToFrames walks past a LIST chunk to find the data", () => {
  const plain = toWav([ramp(0)], 16000);
  // Splice a 12 byte LIST chunk between "fmt " and "data", as ffmpeg does.
  const list = Buffer.alloc(8 + 12);
  list.write("LIST", 0);
  list.writeUInt32LE(12, 4);
  const wav = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
  const back = wavToFrames(wav);
  assert.equal(back.length, 1);
  assert.deepEqual([...back[0]!], [...ramp(0)]);
});

test("FrameCutter re-cuts whatever a client sends into whole frames", () => {
  const source = [ramp(0), ramp(7)];
  const pcm = Buffer.from(toWav(source, 16000).subarray(44));
  const cutter = new FrameCutter();

  // A chunk and a half, then the rest: what a socket actually hands over.
  const first = cutter.push(pcm.subarray(0, FRAME_SAMPLES * 3));
  const second = cutter.push(pcm.subarray(FRAME_SAMPLES * 3));

  assert.equal(first.length, 1, "one whole frame, with the part frame kept back");
  assert.equal(second.length, 1);
  assert.deepEqual([...(first[0] as Int16Array)], [...(source[0] as Int16Array)]);
  assert.deepEqual([...(second[0] as Int16Array)], [...(source[1] as Int16Array)]);
});

test("FrameCutter copies, so a frame outlives the buffer it came from", () => {
  const pcm = Buffer.from(toWav([ramp(3)], 16000).subarray(44));
  const frames = new FrameCutter().push(pcm);
  const before = [...(frames[0] as Int16Array)];
  // The socket reuses its buffer as soon as the handler returns. The frame is
  // held for the whole utterance, so it cannot be a view of one.
  pcm.fill(0);
  assert.deepEqual([...(frames[0] as Int16Array)], before);
});

test("FrameCutter forgets a part frame when it is reset", () => {
  const pcm = Buffer.from(toWav([ramp(0)], 16000).subarray(44));
  const cutter = new FrameCutter();
  assert.deepEqual(cutter.push(pcm.subarray(0, 100)), []);
  cutter.reset();
  assert.equal(cutter.push(pcm).length, 1);
});
