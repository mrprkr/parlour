import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  memoryVerdict,
  modelFileOf,
  programMemoryVerdict,
  RestartBackoff,
  threadBudget,
} from "./guardrails.ts";

const GB = 1024 ** 3;

test("a model is refused when its weights would leave macOS too little", () => {
  assert.equal(memoryVerdict(4 * GB, 16 * GB).status, "ok");
  assert.equal(memoryVerdict(10 * GB, 16 * GB).status, "warn");
  assert.equal(memoryVerdict(12 * GB, 16 * GB).status, "refuse");
  assert.match(memoryVerdict(12 * GB, 16 * GB).detail, /12\.0 GB of weights on a Mac with 16\.0 GB/);
});

test("the model file is read from a server's --model argument", () => {
  assert.equal(modelFileOf(["llama-server", "--model", "/m.gguf", "--jinja"]), "/m.gguf");
  assert.equal(modelFileOf(["parlour", "start"]), undefined);

  const dir = mkdtempSync(join(tmpdir(), "parlour-guardrails-"));
  const file = join(dir, "m.gguf");
  writeFileSync(file, Buffer.alloc(1024));
  try {
    assert.equal(programMemoryVerdict(["x", "--model", file], 1024 * 1024)?.status, "ok");
    assert.equal(programMemoryVerdict(["x", "--model", file], 1200)?.status, "refuse");
    assert.equal(programMemoryVerdict(["x", "--model", join(dir, "missing")]), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a model server always leaves cores for the person at the Mac", () => {
  assert.equal(threadBudget(1), 1);
  assert.equal(threadBudget(4), 2);
  assert.equal(threadBudget(12), 6);
});

test("crashes back off and then give up, and a deliberate start forgives them", () => {
  let now = 0;
  const backoff = new RestartBackoff({ delaysMs: [5, 15], windowMs: 100, limit: 3, now: () => now });
  assert.equal(backoff.crashed(), 5);
  assert.equal(backoff.crashed(), 15);
  assert.equal(backoff.crashed(), null);
  backoff.reset();
  assert.equal(backoff.crashed(), 5);
  // Crashes outside the window are forgotten on their own.
  now = 1_000;
  assert.equal(backoff.crashed(), 5);
});
