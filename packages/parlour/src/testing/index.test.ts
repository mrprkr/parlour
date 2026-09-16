import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeSearchProvider, FakeSecretStore, FakeServiceManager } from "./index.ts";

// These three fakes have no pipeline test that exercises them the way
// VoiceSession exercises the audio ones, so they get a test of their own to
// keep the "fakes for every port" promise in the docs honest.

test("FakeSearchProvider trims to the limit and records what was asked", async () => {
  const provider = new FakeSearchProvider([
    { title: "A", url: "http://a", snippet: "first" },
    { title: "B", url: "http://b", snippet: "second" },
  ]);
  const results = await provider.search("hours", 1);
  assert.deepEqual(
    results.map((result) => result.title),
    ["A"],
  );
  assert.deepEqual(provider.asked, [{ query: "hours", max: 1 }]);
});

test("FakeSecretStore behaves like the Keychain it stands in for", async () => {
  const store = new FakeSecretStore({ seeded: "1" });
  assert.equal(await store.get("seeded"), "1");
  assert.equal(await store.get("missing"), null);
  await store.set("token", "abc");
  assert.equal(await store.get("token"), "abc");
  await store.delete("token");
  assert.equal(await store.get("token"), null);
  assert.deepEqual([...store.values.keys()], ["seeded"]);
});

test("FakeServiceManager reports what it installed as running", async () => {
  const manager = new FakeServiceManager();
  const spec = {
    label: "io.parlour.agent",
    what: "agent",
    program: ["node"],
    env: {},
    logPath: "/tmp/agent.log",
  };

  const [before] = await manager.status([spec]);
  assert.equal(before?.installed, false);
  assert.equal(before?.running, false);
  assert.equal(before?.pid, null);

  const [after] = await manager.install([spec]);
  assert.equal(after?.installed, true);
  assert.equal(after?.running, true);
  assert.equal(typeof after?.pid, "number");

  await manager.restart([spec]);
  assert.deepEqual(manager.restarts, [spec.label]);

  manager.logs.set(spec.logPath, "started");
  assert.equal(await manager.tail(spec.logPath, 10), "started");
  assert.deepEqual(manager.tailed, [{ logPath: spec.logPath, lines: 10 }]);

  assert.deepEqual(await manager.uninstall([spec.label, "io.parlour.never"]), [spec.label]);
  assert.equal(manager.installed.size, 0);
});
