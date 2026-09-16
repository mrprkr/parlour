import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { SecretStore } from "../../core/ports.ts";
import { ConnectorStore } from "./store.ts";

let home = "";
let secrets = new Map<string, string>();

const memory = (): SecretStore => ({
  get: async (key) => secrets.get(key) ?? null,
  set: async (key, value) => void secrets.set(key, value),
  delete: async (key) => void secrets.delete(key),
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-connectors-"));
  secrets = new Map();
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

test("an absent file is an empty list", async () => {
  assert.deepEqual(await new ConnectorStore(join(home, "connectors.json"), memory()).list(), []);
});

test("add replaces by name and writes readable JSON", async () => {
  const store = new ConnectorStore(join(home, "connectors.json"), memory());
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  await store.add({ name: "cal", url: "https://b/", addedAt: "2" });
  assert.deepEqual(await store.list(), [{ name: "cal", url: "https://b/", addedAt: "2" }]);
  assert.match(readFileSync(join(home, "connectors.json"), "utf8"), /\n {2}/);
});

test("secrets go through the secret store and are removed with the connector", async () => {
  const store = new ConnectorStore(join(home, "connectors.json"), memory());
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  await store.saveSecrets("cal", { tokens: { access_token: "x" } });
  assert.deepEqual(await store.secrets("cal"), { tokens: { access_token: "x" } });
  assert.equal(await store.remove("cal"), true);
  assert.equal(await store.remove("cal"), false);
  assert.deepEqual(await store.secrets("cal"), {});
  assert.equal(secrets.size, 0);
});

test("unreadable secrets read as empty", async () => {
  secrets.set("cal", "not json");
  const store = new ConnectorStore(join(home, "connectors.json"), memory());
  assert.deepEqual(await store.secrets("cal"), {});
});

test("add creates the directory when it does not exist yet", async () => {
  const file = join(home, "not-yet", "connectors.json");
  const store = new ConnectorStore(file, memory());
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  assert.deepEqual(await store.list(), [{ name: "cal", url: "https://a/", addedAt: "1" }]);
});
