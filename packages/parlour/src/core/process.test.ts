import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import { findOnPath, run, withTempWav } from "./process.ts";

test("run resolves when the command exits 0", async () => {
  await run("sh", ["-c", "exit 0"]);
});

test("run rejects with stderr when the command fails", async () => {
  await assert.rejects(run("sh", ["-c", "echo bad >&2; exit 3"]), /bad/);
});

test("run falls back to the exit code when there is no stderr", async () => {
  await assert.rejects(run("sh", ["-c", "exit 3"]), /sh exited 3/);
});

test("run rejects when the command does not exist", async () => {
  await assert.rejects(run("parlour-no-such-command-xyz", []), (error: unknown) => {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  });
});

test("run sends input on stdin", async () => {
  await run("sh", ["-c", 'read line; [ "$line" = hello ]'], { input: "hello\n" });
});

test("run resolves rather than rejects when aborted", async () => {
  const controller = new AbortController();
  const pending = run("sh", ["-c", "sleep 5"], { signal: controller.signal });
  controller.abort();
  await pending;
});

test("run does nothing with a signal that is already aborted", async () => {
  await run("sh", ["-c", "exit 1"], { signal: AbortSignal.abort() });
});

test("withTempWav hands over a .wav path and removes it afterwards", async () => {
  let seen = "";
  const out = await withTempWav(async (file) => {
    seen = file;
    assert.ok(file.endsWith("speech.wav"));
    assert.ok(existsSync(dirname(file)));
    return 42;
  });
  assert.equal(out, 42);
  assert.equal(existsSync(dirname(seen)), false);
});

test("withTempWav cleans up when the work throws", async () => {
  let seen = "";
  await assert.rejects(
    withTempWav(async (file) => {
      seen = file;
      throw new Error("no");
    }),
    /no/,
  );
  assert.equal(existsSync(dirname(seen)), false);
});

test("findOnPath resolves a binary that exists and null for one that does not", async () => {
  const sh = await findOnPath("sh");
  assert.ok(sh?.endsWith("/sh"));
  assert.equal(await findOnPath("parlour-no-such-command-xyz"), null);
});
