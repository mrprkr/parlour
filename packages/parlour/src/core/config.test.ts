import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadConfig, parseConfig, updateConfig, writeConfig } from "./config.ts";
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
  assert.deepEqual(Object.keys(c.integrations), ["home-assistant", "connectors"]);
});

test("skills are on with no plugins, which is a house that has written nothing yet", () => {
  const config = parseConfig({});
  assert.deepEqual(config.skills, { enabled: true, dir: "" });
  assert.deepEqual(config.plugins, []);
  assert.equal(parseConfig({ skills: { dir: "/house/rules" } }).skills.dir, "/house/rules");
});

test("locale must be a tag ICU can parse, so a bad one fails here and not mid-turn", () => {
  assert.equal(parseConfig({ locale: "en-US" }).locale, "en-US");
  assert.throws(() => parseConfig({ locale: "en_GB" }), /locale: must be a BCP 47 language tag/);
});

test("connectors are on by default, since parlour connectors add never touches config.json", () => {
  assert.deepEqual(parseConfig({}).integrations.connectors, {});
  // A block the person wrote is theirs: the default fills a missing key, not a present one.
  assert.deepEqual(Object.keys(parseConfig({ integrations: {} }).integrations), []);
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
  assert.throws(() => parseConfig({ wake: { threshold: 2 } }), /wake\.threshold/);
});

test("core fills in no provider options, so a tts engine is not handed Kokoro's voice", () => {
  // The same slice reaches the primary and the fallback, and a third-party
  // engine that also calls its option `voice` would otherwise get "bf_emma".
  assert.deepEqual(parseConfig({}).tts, { provider: "kokoro", fallback: "macos-say" });
  assert.deepEqual(parseConfig({ tts: { provider: "piper", model: "alba" } }).tts, {
    provider: "piper",
    fallback: "macos-say",
    model: "alba",
  });
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

test("updateConfig changes one key and leaves the rest of the file as it was written", () => {
  const dir = mkdtempSync(join(home, "update-"));
  const paths = pathsIn(dir);
  writeFileSync(paths.configFile, '{\n  "name": "Test"\n}\n');

  updateConfig(paths, (raw) => {
    raw.plugins = ["parlour-plugin-car"];
  });
  const written = JSON.parse(readFileSync(paths.configFile, "utf8"));
  assert.deepEqual(written, { name: "Test", plugins: ["parlour-plugin-car"] });
  // No default is frozen into the file by passing through the schema.
  assert.ok(!("tts" in written));

  // A change the schema refuses leaves the file alone.
  assert.throws(() =>
    updateConfig(paths, (raw) => {
      raw.role = "bogus";
    }),
  );
  assert.deepEqual(JSON.parse(readFileSync(paths.configFile, "utf8")), {
    name: "Test",
    plugins: ["parlour-plugin-car"],
  });
});
