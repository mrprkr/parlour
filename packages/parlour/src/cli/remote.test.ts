import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Admin } from "../core/admin.ts";
import { parseConfig } from "../core/config.ts";
import { resolvePaths } from "../core/paths.ts";
import { ToolRegistry } from "../core/registry.ts";
import { Router } from "../core/router.ts";
import { startServer } from "../server/index.ts";
import {
  FakeChatModel,
  FakeServiceManager,
  FakeSpeechToText,
  FakeTextToSpeech,
  FakeWakeWordEngine,
} from "../testing/index.ts";
import { UsageError } from "./args.ts";
import { call, parseSettings, resolveRemote } from "./remote.ts";

test("pipeline settings are typed the way the server checks them", () => {
  assert.deepEqual(parseSettings(["triage=always", "maxTasks=2"]), { triage: "always", maxTasks: 2 });
  assert.throws(() => parseSettings([]), UsageError);
  assert.throws(() => parseSettings(["model=big"]), /not a pipeline setting/);
  assert.throws(() => parseSettings(["timeoutMs=soon"]), /whole number/);
});

test("the server is what was typed, then what the satellite pinned, then this Mac, never Bonjour", () => {
  const config = parseConfig({});
  assert.deepEqual(resolveRemote(config, { url: "http://kitchen:8765/" }, "s"), {
    url: "http://kitchen:8765",
    token: "s",
  });
  const satellite = parseConfig({ satellite: { serverUrl: "http://study:8765" } });
  assert.equal(resolveRemote(satellite, {}, undefined).url, "http://study:8765");
  // With nothing named, the token only ever goes to this machine.
  assert.equal(resolveRemote(config, {}, "saved").url, "http://127.0.0.1:8765");
  assert.equal(resolveRemote(config, { token: "typed" }, "saved").token, "typed");
});

test("a remote call carries the token, and a refusal comes back as the server's sentence", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "parlour-remote-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const base = parseConfig({ server: { host: "127.0.0.1" }, discovery: { enabled: false } });
  const config = { ...base, server: { ...base.server, port: 0 } };
  const admin = new Admin({
    config,
    paths: resolvePaths({ HOME: dir, PARLOUR_HOME: dir }, "darwin"),
    manager: new FakeServiceManager(),
    specs: [],
    companions: null,
    doctor: async () => [],
    restartSelf: null,
  });
  const server = await startServer({
    config,
    token: "secret",
    admin,
    agent: {
      router: new Router({
        name: "Test",
        local: new FakeChatModel([]),
        cloud: null,
        registry: new ToolRegistry(),
        maxToolRounds: 1,
        onLocalFailure: false,
      }),
      wake: new FakeWakeWordEngine(),
      stt: new FakeSpeechToText("hi"),
      tts: new FakeTextToSpeech(),
      gate: async () => false,
      status: () => ({ tools: 0, cloud: false }),
    },
  });
  assert.ok(server);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.port}`;

  const status = await call<{ restart: string }>({ url, token: "secret" }, "GET", "/admin");
  assert.equal(status.restart, "manual");
  await assert.rejects(call({ url, token: undefined }, "GET", "/admin"), /wants the token/);
  await assert.rejects(call({ url, token: "secret" }, "POST", "/admin/restart"), /started in a terminal/);
  const saved = await call<{ restart: string }>({ url, token: "secret" }, "POST", "/admin/pipeline", {
    maxTasks: 2,
  });
  assert.equal(saved.restart, "needed");
});
