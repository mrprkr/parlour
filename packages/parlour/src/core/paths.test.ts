import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePaths } from "./paths.ts";

test("defaults on darwin", () => {
  const p = resolvePaths({ HOME: "/Users/x" }, "darwin");
  assert.equal(p.home, "/Users/x/.config/parlour");
  assert.equal(p.configFile, "/Users/x/.config/parlour/config.json");
  assert.equal(p.secretsFile, "/Users/x/.config/parlour/secrets.env");
  assert.equal(p.connectorsFile, "/Users/x/.config/parlour/connectors.json");
  assert.equal(p.cacheDir, "/Users/x/Library/Caches/parlour");
  assert.equal(p.modelsDir, "/Users/x/Library/Caches/parlour/models");
  assert.equal(p.logsDir, "/Users/x/Library/Logs/parlour");
});

test("PARLOUR_HOME moves config, secrets and connectors but not the cache", () => {
  const p = resolvePaths({ HOME: "/Users/x", PARLOUR_HOME: "/srv/parlour" }, "darwin");
  assert.equal(p.configFile, "/srv/parlour/config.json");
  assert.equal(p.secretsFile, "/srv/parlour/secrets.env");
  assert.equal(p.connectorsFile, "/srv/parlour/connectors.json");
  assert.equal(p.cacheDir, "/Users/x/Library/Caches/parlour");
});

test("PARLOUR_CONFIG overrides only the config file", () => {
  const p = resolvePaths({ HOME: "/Users/x", PARLOUR_CONFIG: "/tmp/c.json" }, "darwin");
  assert.equal(p.configFile, "/tmp/c.json");
  assert.equal(p.secretsFile, "/Users/x/.config/parlour/secrets.env");
});

test("linux follows XDG", () => {
  const p = resolvePaths({ HOME: "/home/x", XDG_CACHE_HOME: "/c", XDG_STATE_HOME: "/s" }, "linux");
  assert.equal(p.modelsDir, "/c/parlour/models");
  assert.equal(p.logsDir, "/s/parlour/logs");
});

test("linux falls back to the XDG defaults under HOME", () => {
  const p = resolvePaths({ HOME: "/home/x" }, "linux");
  assert.equal(p.cacheDir, "/home/x/.cache/parlour");
  assert.equal(p.logsDir, "/home/x/.local/state/parlour/logs");
});

test("empty PARLOUR_HOME, PARLOUR_CONFIG and XDG variables count as unset", () => {
  const p = resolvePaths({ HOME: "/Users/x", PARLOUR_HOME: "", PARLOUR_CONFIG: "" }, "darwin");
  assert.equal(p.home, "/Users/x/.config/parlour");
  assert.equal(p.configFile, "/Users/x/.config/parlour/config.json");
  const l = resolvePaths({ HOME: "/home/x", XDG_CACHE_HOME: "", XDG_STATE_HOME: "" }, "linux");
  assert.equal(l.cacheDir, "/home/x/.cache/parlour");
  assert.equal(l.logsDir, "/home/x/.local/state/parlour/logs");
});
