import assert from "node:assert/strict";
import { test } from "node:test";
import { Endpointer } from "./endpoint.ts";

const loud = () => new Int16Array(1280).fill(3000);
const quiet = () => new Int16Array(1280);

const options = {
  frameMs: 80,
  silenceMs: 800,
  maxUtteranceMs: 15000,
  silenceThreshold: 0.012,
  leadingSilenceMs: 240,
};

test("gives up on leading silence", () => {
  const e = new Endpointer(options);
  assert.equal(e.push(quiet()), "listening");
  assert.equal(e.push(quiet()), "listening");
  assert.equal(e.push(quiet()), "empty");
});

test("finishes after speech then silence", () => {
  const e = new Endpointer(options);
  assert.equal(e.push(loud()), "listening");
  assert.equal(e.push(loud()), "listening");
  let last: string = "listening";
  for (let i = 0; i < 10; i++) last = e.push(quiet());
  assert.equal(last, "done");
  assert.equal(e.frames.length, 12);
});

test("a pause shorter than silenceMs does not end the utterance", () => {
  const e = new Endpointer(options);
  e.push(loud());
  for (let i = 0; i < 9; i++) assert.equal(e.push(quiet()), "listening");
  assert.equal(e.push(loud()), "listening");
});

test("caps the utterance", () => {
  const e = new Endpointer({ ...options, maxUtteranceMs: 800 });
  let last: string = "listening";
  let pushed = 0;
  while (last === "listening" && pushed < 100) {
    last = e.push(loud());
    pushed += 1;
  }
  assert.equal(last, "done");
  assert.equal(pushed, 10);
});

test("leading silence is not counted once speech has started", () => {
  const e = new Endpointer(options);
  e.push(quiet());
  e.push(quiet());
  assert.equal(e.push(loud()), "listening");
  assert.equal(e.push(quiet()), "listening");
});
