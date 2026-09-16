import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parlourBin } from "./service.ts";

let dir = "";
const argv1 = process.argv[1] ?? "";

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "parlour-bin-")));
});

afterEach(() => {
  process.argv[1] = argv1;
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a stand-in for the script node was started with and points argv at it. */
function runningAs(relative: string, mode: number): string {
  const file = join(dir, relative);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, "#!/usr/bin/env node\n");
  chmodSync(file, mode);
  process.argv[1] = file;
  return file;
}

test("an executable parlour runs on its own, by its shebang", () => {
  const bin = runningAs("lib/node_modules/parlour/dist/cli/main.js", 0o755);
  assert.deepEqual(parlourBin(), [bin]);
});

test("a script without the execute bit is run by the node running now", () => {
  // tsc emits dist/cli/main.js as 0644; launchd cannot exec that, so the
  // plist would otherwise name a program that never starts.
  const script = runningAs("dist/cli/main.js", 0o644);
  assert.deepEqual(parlourBin(), [process.execPath, script]);
});

test("a checkout under type stripping hands over to the dev script", () => {
  runningAs("src/cli/main.ts", 0o644);
  assert.deepEqual(parlourBin(), [join(dir, "bin", "parlour-dev")]);
});
