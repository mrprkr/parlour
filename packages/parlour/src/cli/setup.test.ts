import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../core/config.ts";
import { HOMEBREW_FORMULAE, modelsFor } from "./setup.ts";

test("setup never asks Homebrew for node", () => {
  // Node 22 is the stated prerequisite, so it is already there by the time
  // init runs. A Homebrew node would shadow it on the LaunchAgent PATH.
  assert.ok(!HOMEBREW_FORMULAE.includes("node" as never), `formulae: ${HOMEBREW_FORMULAE.join(", ")}`);
  assert.deepEqual([...HOMEBREW_FORMULAE], ["ffmpeg", "whisper-cpp"]);
});

test("both READMEs name Homebrew as a prerequisite next to Node", async () => {
  // setup only ever installs the formulae through brew, so a Mac without
  // Homebrew gets no ffmpeg and no whisper. The quick start has to say so, or
  // a new user follows it and ends with no microphone and no speech to text.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const readme of [join(here, "../../README.md"), join(here, "../../../../README.md")]) {
    const text = await readFile(readme, "utf8");
    const prerequisites = text.split("\n").find((line) => line.includes("Node 22"));
    assert.ok(prerequisites, `${readme} states the Node prerequisite`);
    assert.match(prerequisites, /Homebrew/, `${readme} names Homebrew next to Node`);
  }
});

test("setup fetches no models for a satellite unless the wake word runs there", () => {
  // docs/clients.md promises a satellite "no models, no keys, no GPU". Local
  // wake is the one thing that puts the wake word models on that box, and
  // whisper never leaves the server.
  assert.equal(modelsFor(parseConfig({ role: "satellite" })), null);

  const local = modelsFor(parseConfig({ role: "satellite", satellite: { localWake: true } }));
  assert.ok(local);
  assert.equal(local.whisper, null);
  assert.ok(local.wake.includes("hey_jarvis"));

  const server = modelsFor(parseConfig({ role: "server", wake: { words: ["hey_marvin"] } }));
  assert.ok(server);
  assert.equal(server.whisper, "ggml-small.en.bin");
  // The configured word as well as the stock three.
  assert.deepEqual(server.wake, ["hey_jarvis", "alexa", "hey_mycroft", "hey_marvin"]);
});
