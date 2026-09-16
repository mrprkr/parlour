import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { resolvePaths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { connectorStore, createConnectorsIntegration } from "./index.ts";

let home = "";
let paths = resolvePaths({ HOME: "/nowhere" }, "darwin");
const secrets = new Map<string, string>();
const memory: SecretStore = {
  get: async (key) => secrets.get(key) ?? null,
  set: async (key, value) => void secrets.set(key, value),
  delete: async (key) => void secrets.delete(key),
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-connectors-"));
  paths = resolvePaths({ HOME: "/nowhere", PARLOUR_HOME: home }, "darwin");
  secrets.clear();
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

test("doctor says nothing when there are no connectors", async () => {
  const integration = createConnectorsIntegration(paths, memory);
  assert.deepEqual(await integration.doctor!(), []);
  await integration.close?.();
});

test("doctor counts the connectors that are signed in", async () => {
  const store = connectorStore(paths, memory);
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  await store.saveSecrets("cal", { tokens: { access_token: "x" } });
  const integration = createConnectorsIntegration(paths, memory);
  assert.deepEqual(await integration.doctor!(), [
    { name: "connectors", status: "ok", detail: "1 connected" },
  ]);
  await integration.close?.();
});

test("doctor warns about connectors that are listed but signed out", async () => {
  const store = connectorStore(paths, memory);
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  await store.add({ name: "mail", url: "https://b/", addedAt: "2" });
  const integration = createConnectorsIntegration(paths, memory);
  assert.deepEqual(await integration.doctor!(), [
    {
      name: "connectors",
      status: "warn",
      detail: "signed out: cal, mail. Run parlour connectors add <name> <url> again.",
    },
  ]);
  await integration.close?.();
});
