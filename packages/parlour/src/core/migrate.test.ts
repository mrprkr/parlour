import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "./config.ts";
import { isLegacyConfig, migrateLegacyConfig, migrateLegacyEnv } from "./migrate.ts";

test("isLegacyConfig spots the old shape and nothing else", () => {
  assert.ok(isLegacyConfig({ homeAssistant: {} }));
  assert.ok(isLegacyConfig({ mcpServers: {} }));
  assert.ok(isLegacyConfig({ connectorsFile: "connectors.json" }));
  assert.ok(isLegacyConfig({ tts: { engine: "say" } }));
  assert.equal(isLegacyConfig({}), false);
  assert.equal(isLegacyConfig({ tts: { provider: "kokoro" } }), false);
  assert.equal(isLegacyConfig(null), false);
  assert.equal(isLegacyConfig("nope"), false);
});

test("migrateLegacyConfig moves the house into an integration", () => {
  const out = migrateLegacyConfig({
    homeAssistant: { baseUrl: "http://h:8123", useMcp: false },
    muteEntity: "input_boolean.m",
    mcpServers: { a: { transport: "stdio", command: "x" } },
    search: { provider: "searxng", searxngUrl: "http://s" },
    tts: { engine: "say", voice: "Daniel" },
    connectorsFile: "connectors.json",
  });
  assert.deepEqual(out.integrations, {
    "home-assistant": { url: "http://h:8123", mcp: false, muteEntity: "input_boolean.m" },
    mcp: { servers: { a: { transport: "stdio", command: "x" } } },
  });
  assert.equal((out.search as { url: string }).url, "http://s");
  assert.equal("searxngUrl" in (out.search as object), false);
  assert.equal((out.tts as { provider: string }).provider, "macos-say");
  assert.equal((out.tts as { voice: string }).voice, "Daniel");
  assert.equal("engine" in (out.tts as object), false);
  assert.equal("connectorsFile" in out, false);
  assert.equal("homeAssistant" in out, false);
  assert.equal("mcpServers" in out, false);
  assert.equal("muteEntity" in out, false);
  assert.doesNotThrow(() => parseConfig(out));
});

test("migrateLegacyConfig keeps an integrations block that already exists without losing the house", () => {
  const out = migrateLegacyConfig({
    integrations: { "home-assistant": { rest: false }, other: { on: true } },
    homeAssistant: { baseUrl: "http://h" },
    muteEntity: "input_boolean.m",
  });
  assert.deepEqual(out.integrations, {
    "home-assistant": { rest: false, url: "http://h", muteEntity: "input_boolean.m" },
    other: { on: true },
  });
});

test("migrateLegacyConfig gives every present slice its default provider and drops wake.modelDir", () => {
  const out = migrateLegacyConfig({
    wake: { modelDir: "models/openwakeword", words: ["alexa"] },
    stt: { url: "http://127.0.0.1:8910/inference" },
    tts: { engine: "kokoro" },
    llm: { local: { model: "m" }, cloud: { enabled: false }, maxToolRounds: 3 },
  });
  assert.deepEqual(out.wake, { provider: "openwakeword", words: ["alexa"] });
  assert.deepEqual(out.stt, { provider: "whisper-cpp", url: "http://127.0.0.1:8910/inference" });
  assert.deepEqual(out.tts, { provider: "kokoro" });
  assert.deepEqual(out.llm, {
    local: { provider: "openai-compatible", model: "m" },
    cloud: { provider: "anthropic", enabled: false },
    maxToolRounds: 3,
  });
  assert.doesNotThrow(() => parseConfig(out));
});

test("migrateLegacyConfig leaves keys it does not know alone and does not mutate its input", () => {
  const input = { name: "House", server: { port: 1 }, homeAssistant: { baseUrl: "http://h" } };
  const out = migrateLegacyConfig(input);
  assert.equal(out.name, "House");
  assert.deepEqual(out.server, { port: 1 });
  assert.deepEqual(input, { name: "House", server: { port: 1 }, homeAssistant: { baseUrl: "http://h" } });
});

test("migrateLegacyEnv renames the token", () => {
  assert.equal(migrateLegacyEnv("AGENT_TOKEN=abc\nHA_TOKEN=x\n"), "PARLOUR_TOKEN=abc\nHA_TOKEN=x\n");
  assert.equal(
    migrateLegacyEnv("# AGENT_TOKEN=abc\nPARLOUR_TOKEN=y\n"),
    "# AGENT_TOKEN=abc\nPARLOUR_TOKEN=y\n",
  );
});
