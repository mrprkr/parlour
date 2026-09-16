import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import { findOnPath, killOnExit, onShutdown, parseOrphans, run, withTempWav } from "./process.ts";

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

test("onShutdown listens for Ctrl-C, launchd and a closed terminal alike", () => {
  const before = (signal: NodeJS.Signals) => process.listenerCount(signal);
  const counts = { SIGINT: before("SIGINT"), SIGTERM: before("SIGTERM"), SIGHUP: before("SIGHUP") };
  const seen: string[] = [];
  onShutdown((signal) => seen.push(signal));
  assert.equal(process.listenerCount("SIGINT"), counts.SIGINT + 1);
  assert.equal(process.listenerCount("SIGTERM"), counts.SIGTERM + 1);
  assert.equal(process.listenerCount("SIGHUP"), counts.SIGHUP + 1);

  // Emitting runs the handlers without the signal reaching the process.
  process.emit("SIGTERM");
  assert.deepEqual(seen, ["SIGTERM"]);
  // The first signal stands down the others, so a second one is not handled twice
  // and a stuck shutdown can still be ended with another Ctrl-C.
  assert.equal(process.listenerCount("SIGINT"), counts.SIGINT);
  assert.equal(process.listenerCount("SIGTERM"), counts.SIGTERM);
  assert.equal(process.listenerCount("SIGHUP"), counts.SIGHUP);
});

test("killOnExit kills a child that is still running and lets go once it has gone", async () => {
  const before = process.listenerCount("exit");
  const child = spawn("sleep", ["30"]);
  const gone = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const kill = killOnExit(child);
  assert.equal(process.listenerCount("exit"), before + 1);

  kill();
  await gone;
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(process.listenerCount("exit"), before);
  // A second call finds nothing to kill and does not throw.
  kill();
});

test("parseOrphans picks out the matching processes that launchd has adopted", () => {
  const ps = [
    "    1     0 /sbin/launchd",
    " 3318     1 ffmpeg -hide_banner -loglevel error -f avfoundation -i :0 -ac 1 -ar 16000 -f s16le -",
    " 4000  3999 ffmpeg -hide_banner -loglevel error -f avfoundation -i :0 -ac 1 -ar 16000 -f s16le -",
    " 4100     1 /opt/homebrew/bin/ffmpeg -f avfoundation -i :1 -f s16le -",
    " 4200     1 ffmpeg -i film.mkv out.mp4",
    " 4300     1 grep ffmpeg -f avfoundation",
    "",
  ].join("\n");
  assert.deepEqual(parseOrphans(ps, /^(\S*\/)?ffmpeg\s.*-f avfoundation/), [3318, 4100]);
});
