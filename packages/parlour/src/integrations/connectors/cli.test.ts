import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { resolvePaths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { addConnector, listConnectors, removeConnector } from "./cli.ts";
import { ConnectorStore } from "./store.ts";

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

test("listConnectors reports who is signed in", async () => {
  const store = new ConnectorStore(paths.connectorsFile, memory);
  await store.add({ name: "cal", url: "https://a/", addedAt: "1" });
  await store.add({ name: "mail", url: "https://b/", addedAt: "2" });
  await store.saveSecrets("mail", { tokens: { access_token: "x" } });
  assert.deepEqual(
    (await listConnectors(paths, memory)).map((row) => [row.name, row.signedIn]),
    [
      ["cal", false],
      ["mail", true],
    ],
  );
});

test("addConnector refuses a name that would not make a tool prefix", async () => {
  await assert.rejects(addConnector(paths, "not ok", "https://a/", {}, memory), /letters, digits/);
  await assert.rejects(addConnector(paths, "cal", "nope", {}, memory), /Invalid URL/);
  assert.deepEqual(await listConnectors(paths, memory), []);
});

test("addConnector stores the connector before signing in, so a retry resumes", async () => {
  let authorised: string | undefined;
  await addConnector(paths, "cal", "https://a/mcp", { scope: "s" }, memory, async (_store, connector) => {
    authorised = connector.name;
    assert.deepEqual(
      (await listConnectors(paths, memory)).map((row) => row.name),
      ["cal"],
    );
  });
  assert.equal(authorised, "cal");
  const [row] = await listConnectors(paths, memory);
  assert.equal(row!.url, "https://a/mcp");
  assert.equal(row!.scope, "s");
});

test("removeConnector says whether there was one", async () => {
  await addConnector(paths, "cal", "https://a/", {}, memory, async () => {});
  assert.equal(await removeConnector(paths, "cal", memory), true);
  assert.equal(await removeConnector(paths, "cal", memory), false);
});
