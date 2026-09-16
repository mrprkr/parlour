import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { resolvePaths } from "../../core/paths.ts";
import { pickSecretStore } from "./index.ts";

const paths = resolvePaths({ HOME: "/nowhere" }, "darwin");

// A PATH of our own, so the choice depends on the code and not on whether the
// machine running the tests happens to be a Mac.
let bin = "";

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "parlour-bin-"));
  writeFileSync(join(bin, "security"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "security"), 0o755);
});

afterEach(() => rmSync(bin, { recursive: true, force: true }));

test("the Keychain is picked on macOS when security is on the PATH", () => {
  assert.equal(pickSecretStore(paths, { PATH: bin }, "darwin").name, "macos-keychain");
});

test("the file store is picked elsewhere, or when security is missing", () => {
  assert.equal(pickSecretStore(paths, { PATH: bin }, "linux").name, "file");
  assert.equal(pickSecretStore(paths, { PATH: join(bin, "empty") }, "darwin").name, "file");
  assert.equal(pickSecretStore(paths, {}, "darwin").name, "file");
});
