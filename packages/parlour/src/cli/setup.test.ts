import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../core/config.ts";
import { formulaeFor, HOMEBREW_FORMULAE, localModelFor, modelsFor } from "./setup.ts";

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

test("llama.cpp is installed only for a house that asked Parlour to run the model", () => {
  // Somebody pointing llm.local.baseUrl at LM Studio, at Ollama or at a box
  // in the cupboard already has a server; a second one is a formula and a
  // gigabyte of weights they did not ask for.
  assert.deepEqual(formulaeFor(parseConfig({})), ["ffmpeg", "whisper-cpp"]);
  assert.equal(localModelFor(parseConfig({})), null);

  const managed = parseConfig({ llm: { local: { managed: true, model: "qwen2.5-7b-instruct" } } });
  assert.ok(formulaeFor(managed).includes("llama.cpp"));
  assert.ok(formulaeFor(parseConfig({ stt: { provider: "yap" } })).includes("yap"));
  assert.ok(!formulaeFor(parseConfig({})).includes("yap"));
  assert.equal(localModelFor(managed)?.file, "Qwen2.5-7B-Instruct-Q4_K_M.gguf");
  assert.equal(modelsFor(managed)?.llm?.id, "qwen2.5-7b-instruct");

  // A satellite has no model server of its own, whatever the llm block says.
  assert.ok(!formulaeFor(parseConfig({ role: "satellite", ...{} })).includes("llama.cpp"));

  // A file dropped in by hand is not ours to re-download.
  const mine = parseConfig({ llm: { local: { managed: true, model: "something-of-my-own" } } });
  assert.equal(localModelFor(mine), null);
});

test("setup fetches no models for a satellite unless the wake word runs there", () => {
  // The clients doc promises a satellite "no models, no keys, no GPU". Local
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
