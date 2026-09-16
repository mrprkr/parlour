import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fetchModels } from "./models.ts";
import type { Reporter } from "./output.ts";

const quiet: Reporter = {
  step() {},
  ok() {},
  warn() {},
  fail() {},
  log() {},
  done() {},
  porcelain: false,
};

let dir = "";
const realFetch = globalThis.fetch;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "parlour-models-"));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

/** Answers every download with one status and counts the attempts. */
function answerWith(status: number): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = (async () => {
    counter.calls += 1;
    return new Response("nope", { status });
  }) as typeof fetch;
  return counter;
}

test("a 404 is not retried: the file is simply not there", async () => {
  const counter = answerWith(404);
  await assert.rejects(fetchModels({ modelsDir: dir, wake: [], whisper: null, report: quiet }), /404/);
  assert.equal(counter.calls, 1);
});

test("a server error is retried before giving up", async () => {
  const counter = answerWith(503);
  await assert.rejects(fetchModels({ modelsDir: dir, wake: [], whisper: null, report: quiet }), /503/);
  assert.equal(counter.calls, 3);
});
