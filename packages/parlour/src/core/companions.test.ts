import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BoundedLog, startCompanions } from "./companions.ts";
import { logger } from "./logger.ts";

/** Enough of a ChildProcess for the supervisor: it exits when killed. */
function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess & { exitCode: number | null; signalCode: null };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal?: NodeJS.Signals | number) => {
    child.exitCode = 0;
    child.emit("exit", null, signal ?? "SIGTERM");
    return true;
  };
  return child;
}

test("each companion is started with its own program and environment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "parlour-companions-"));
  const calls: [string, string[], Record<string, string>][] = [];
  const companions = startCompanions(
    [
      {
        label: "io.parlour.whisper",
        what: "whisper",
        program: ["/app/whisper-server", "--port", "8910"],
        env: { PATH: "/app" },
        logPath: join(dir, "whisper.log"),
      },
    ],
    {
      log: logger("test"),
      spawn: (command, args, env) => {
        calls.push([command, args, env]);
        return fakeChild();
      },
    },
  );
  companions.stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(calls, [["/app/whisper-server", ["--port", "8910"], { PATH: "/app" }]]);
});

test("a companion that dies is started again, and one that is stopped is not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "parlour-companions-"));
  const children: ChildProcess[] = [];
  const companions = startCompanions(
    [{ label: "l", what: "llm", program: ["llama-server"], env: {}, logPath: join(dir, "llm.log") }],
    {
      log: logger("test"),
      restartMs: 1,
      spawn: () => {
        const child = fakeChild();
        children.push(child);
        return child;
      },
    },
  );
  children[0]?.emit("exit", 1, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(children.length, 2);

  companions.stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(children.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("a companion log is held to its size, with one backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "parlour-companions-"));
  const path = join(dir, "whisper.log");
  const file = new BoundedLog(path, () => {}, 10);
  file.write(Buffer.from("123456"));
  file.write(Buffer.from("7890ab"));
  file.write(Buffer.from("cdef"));
  file.close();
  assert.equal(readFileSync(`${path}.1`, "utf8"), "123456");
  assert.equal(readFileSync(path, "utf8"), "7890abcdef");
  assert.ok(statSync(path).size <= 10);
  rmSync(dir, { recursive: true, force: true });
});

test("a log that cannot be written is said once and does not throw", () => {
  const warnings: string[] = [];
  const file = new BoundedLog("/dev/null/cannot/exist.log", (message) => warnings.push(message));
  file.write(Buffer.from("a"));
  file.write(Buffer.from("b"));
  assert.equal(warnings.length, 1);
  assert.equal(existsSync("/dev/null/cannot"), false);
});

test("a closed log drops what arrives late instead of reopening the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "parlour-companions-"));
  const path = join(dir, "llm.log");
  const file = new BoundedLog(path, () => {});
  file.write(Buffer.from("before"));
  file.close();
  file.write(Buffer.from("after"));
  assert.equal(readFileSync(path, "utf8"), "before");
  rmSync(dir, { recursive: true, force: true });
});
