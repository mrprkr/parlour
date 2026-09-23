import assert from "node:assert/strict";
import { test } from "node:test";
import { parakeetMlxSchema, parseWorkerLine } from "./parakeet-mlx.ts";

test("parakeet defaults to v2 through the python on the PATH", () => {
  const options = parakeetMlxSchema.parse({});
  assert.equal(options.model, "mlx-community/parakeet-tdt-0.6b-v2");
  assert.equal(options.python, "python3");
});

test("the worker's ready line and its failure are told apart", () => {
  assert.deepEqual(parseWorkerLine('{"ready": true, "model": "m"}'), { kind: "ready", model: "m" });
  assert.deepEqual(parseWorkerLine('{"ready": false, "error": "no module"}'), {
    kind: "failed",
    error: "no module",
  });
});

test("a reply carries its id and a trimmed transcript", () => {
  assert.deepEqual(parseWorkerLine('{"id": "3", "ok": true, "text": " Turn on the lights. "}'), {
    kind: "reply",
    id: "3",
    ok: true,
    text: "Turn on the lights.",
  });
  assert.deepEqual(parseWorkerLine('{"id": 4, "ok": false, "error": "bad wav"}'), {
    kind: "reply",
    id: "4",
    ok: false,
    error: "bad wav",
  });
});

test("anything outside the protocol is ignored", () => {
  assert.equal(parseWorkerLine("Fetching 5 files"), null);
  assert.equal(parseWorkerLine('{"id": null, "ok": false}'), null);
});
