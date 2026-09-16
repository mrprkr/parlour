import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadConfig, writeConfig } from "../core/config.ts";
import { resolvePaths } from "../core/paths.ts";
import type { Found } from "./discovery.ts";
import { serverLocator } from "./satellite.ts";

const home = mkdtempSync(join(tmpdir(), "parlour-satellite-"));
after(() => rmSync(home, { recursive: true, force: true }));

const found = (host: string): Found => ({
  name: host,
  host,
  port: 7777,
  url: `http://${host}:7777`,
  needsToken: true,
});

/** A fresh config directory with a satellite that has nothing pinned. */
function setUp(name: string, extra: Record<string, unknown> = {}) {
  const dir = join(home, name);
  const paths = resolvePaths({ HOME: dir, PARLOUR_HOME: dir });
  writeConfig(paths, { role: "satellite", satellite: { room: "kitchen", ...extra } });
  return { paths, config: loadConfig(paths).config };
}

test("the first server that lets the satellite in is pinned, and discovery stops", async () => {
  const { paths, config } = setUp("pins");
  const answers = [found("real.local"), found("rogue.local")];
  let looked = 0;
  const server = serverLocator(config, paths, async () => answers[looked++] ?? null);

  const first = await server.url();
  assert.equal(first, "http://real.local:7777");
  server.connected(first as string);

  // A reconnect goes straight back to the pinned address without asking
  // Bonjour, so a faster answer from something else never sees the token.
  assert.equal(await server.url(), "http://real.local:7777");
  assert.equal(looked, 1);

  // The pin survives a restart: it is the same key an operator sets by hand,
  // and the room is still there beside it.
  const saved = loadConfig(paths);
  assert.equal(saved.config.satellite.serverUrl, "http://real.local:7777");
  assert.equal(saved.config.satellite.room, "kitchen");
});

test("an address set by hand is never replaced and never discovered", async () => {
  const { paths, config } = setUp("byhand", { serverUrl: "http://mine.local:7777" });
  let looked = 0;
  const server = serverLocator(config, paths, async () => {
    looked++;
    return found("rogue.local");
  });

  assert.equal(await server.url(), "http://mine.local:7777");
  server.connected("http://mine.local:7777");
  assert.equal(looked, 0);
  assert.equal(loadConfig(paths).config.satellite.serverUrl, "http://mine.local:7777");
});

test("a different advertiser while the pinned server is down is reported, not joined", async (t) => {
  const { paths, config } = setUp("moved", { serverUrl: "http://real.local:7777" });
  const errors = t.mock.method(console, "error", () => {});
  const server = serverLocator(config, paths, async () => found("rogue.local"));

  await server.failed("http://real.local:7777");
  await server.failed("http://real.local:7777"); // Said once per advertiser, not once per retry.
  const said = errors.mock.calls.map((call) => call.arguments.join(" "));
  assert.equal(said.length, 1);
  assert.match(said[0] as string, /rogue\.local:7777/);
  assert.match(said[0] as string, /Not connecting/);

  // And the next attempt still goes to the pinned server.
  assert.equal(await server.url(), "http://real.local:7777");
});

test("nothing is said when the advertiser is the pinned server itself", async (t) => {
  const { paths, config } = setUp("same", { serverUrl: "http://real.local:7777" });
  const errors = t.mock.method(console, "error", () => {});
  const server = serverLocator(config, paths, async () => found("real.local"));

  await server.failed("http://real.local:7777");
  assert.equal(errors.mock.callCount(), 0);
});

test("the pin holds for the run even when the config file cannot be written", async (t) => {
  const { paths, config } = setUp("readonly");
  const errors = t.mock.method(console, "error", () => {});
  // A file where the config directory should be makes the write fail.
  writeFileSync(join(paths.home, "blocker"), "");
  const unwritable = { ...paths, configFile: join(paths.home, "blocker", "config.json") };
  const server = serverLocator(config, unwritable, async () => found("real.local"));

  server.connected("http://real.local:7777");
  assert.equal(await server.url(), "http://real.local:7777");
  assert.equal(errors.mock.callCount(), 1);
});
