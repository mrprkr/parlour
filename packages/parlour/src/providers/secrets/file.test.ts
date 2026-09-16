import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { resolvePaths } from "../../core/paths.ts";
import { createFileStore, fileStore } from "./file.ts";

let home = "";
let paths = resolvePaths({ HOME: "/nowhere" }, "darwin");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-secrets-"));
  paths = resolvePaths({ HOME: "/nowhere", PARLOUR_HOME: home }, "darwin");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

test("a missing key is null", async () => {
  assert.equal(await createFileStore(paths).get("calendar"), null);
});

test("set, get and delete round trip, mode 600 in a 700 directory", async () => {
  const store = createFileStore(paths);
  await store.set("calendar", '{"tokens":1}');
  assert.equal(await store.get("calendar"), '{"tokens":1}');
  assert.equal(statSync(join(home, "connector-secrets", "calendar")).mode & 0o777, 0o600);
  assert.equal(statSync(join(home, "connector-secrets")).mode & 0o777, 0o700);
  await store.delete("calendar");
  assert.equal(await store.get("calendar"), null);
  await store.delete("calendar");
});

test("a key that is not a plain name is refused", async () => {
  const store = createFileStore(paths);
  await assert.rejects(store.set("../etc", "x"), /not a valid secret name/);
  await assert.rejects(store.get("a/b"), /not a valid secret name/);
});

test("the definition is a secrets provider", () => {
  assert.equal(fileStore.kind, "secrets");
  assert.equal(fileStore.name, "file");
});
