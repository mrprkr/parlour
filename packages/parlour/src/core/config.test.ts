import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadConfig, parseConfig, writeConfig } from "./config.ts";
import { resolvePaths } from "./paths.ts";

const home = mkdtempSync(join(tmpdir(), "parlour-config-"));
after(() => rmSync(home, { recursive: true, force: true }));

const pathsIn = (dir: string) => resolvePaths({ HOME: dir, PARLOUR_HOME: dir });

test("an empty object is a complete config", () => {
  const c = parseConfig({});
  assert.equal(c.name, "Parlour");
  assert.equal(c.role, "server");
  assert.equal(c.tts.provider, "kokoro");
  assert.equal(c.tts.fallback, "macos-say");
  assert.equal(c.wake.provider, "openwakeword");
  assert.equal(c.stt.provider, "whisper-cpp");
  assert.equal(c.llm.local.provider, "openai-compatible");
  assert.equal(c.llm.cloud.provider, "anthropic");
  assert.equal(c.search.provider, "searxng");
  assert.equal(c.audio.source, "ffmpeg");
  assert.equal(c.audio.sink, "afplay");
  assert.deepEqual(Object.keys(c.integrations), ["home-assistant"]);
});

test("provider slices keep unknown keys", () => {
  assert.equal((parseConfig({ stt: { url: "http://x" } }).stt as { url?: string }).url, "http://x");
  const llm = parseConfig({ llm: { local: { model: "m" } } }).llm.local as { model?: string };
  assert.equal(llm.model, "m");
});

test("outputDevice accepts null, which is how JSON says no explicit device", () => {
  assert.equal(parseConfig({ audio: { outputDevice: null } }).audio.outputDevice, null);
  assert.equal(parseConfig({}).audio.outputDevice, undefined);
});

test("a bad value is rejected with the path in the message", () => {
  assert.throws(() => parseConfig({ role: "bogus" }), /role/);
  assert.throws(() => parseConfig({ tts: { speed: -1 } }), /tts\.speed/);
});

test("loadConfig without a file returns defaults and exists=false", () => {
  const paths = pathsIn(join(home, "missing"));
  const loaded = loadConfig(paths);
  assert.equal(loaded.exists, false);
  assert.deepEqual(loaded.raw, {});
  assert.equal(loaded.config.name, "Parlour");
});

test("writeConfig creates the directory and loadConfig reads it back", () => {
  const paths = pathsIn(join(home, "nested", "deeper"));
  writeConfig(paths, { name: "Test", tts: { voice: "af_heart" } });
  assert.ok(existsSync(paths.configFile));
  assert.ok(readFileSync(paths.configFile, "utf8").endsWith("}\n"));
  const loaded = loadConfig(paths);
  assert.equal(loaded.exists, true);
  assert.deepEqual(loaded.raw, { name: "Test", tts: { voice: "af_heart" } });
  assert.equal(loaded.config.name, "Test");
  assert.equal((loaded.config.tts as { voice?: string }).voice, "af_heart");
});

test("loadConfig rejects a file that is not a JSON object", () => {
  const paths = pathsIn(join(home, "list"));
  writeConfig(paths, {});
  writeFileSync(paths.configFile, "[1, 2]\n");
  assert.throws(() => loadConfig(paths), /object/);
});

test("loadConfig names the file when it is not valid JSON", () => {
  const paths = pathsIn(join(home, "broken"));
  writeConfig(paths, {});
  writeFileSync(paths.configFile, '{ "name": "Test", }\n');
  assert.throws(
    () => loadConfig(paths),
    (error: Error) => error.message.includes(paths.configFile),
  );
});

test("the shipped example config parses", () => {
  const example = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "config.example.json"), "utf8"),
  );
  const c = parseConfig(example);
  assert.equal(c.search.provider, "searxng");
  assert.equal((c.search as { url?: string }).url, "http://searxng.local:8080");
  assert.ok("home-assistant" in c.integrations);
});
