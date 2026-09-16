import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { z } from "zod";
import {
  FakeAudioSink,
  FakeAudioSource,
  FakeChatModel,
  FakeIntegration,
  FakeSpeechToText,
  FakeTextToSpeech,
  FakeWakeWordEngine,
} from "../testing/index.ts";
import { buildAgent } from "./agent.ts";
import { parseConfig } from "./config.ts";
import { resolvePaths } from "./paths.ts";
import type { SearchProvider, TextToSpeech } from "./ports.ts";
import { clearProviders, defineProvider, registerProvider, UnknownProviderError } from "./providers.ts";
import { defineTool } from "./registry.ts";
import type { Completion } from "./types.ts";

const say = (text: string): Completion => ({ text, toolCalls: [] });

/** Everything the fakes made, so a test can reach past the Agent to the instance. */
const made = {
  sources: [] as FakeAudioSource[],
  wakes: [] as FakeWakeWordEngine[],
  voices: [] as { voice: string; tts: FakeTextToSpeech }[],
  models: [] as FakeChatModel[],
  integrations: [] as FakeIntegration[],
};

/**
 * The fakes are registered under names no built-in uses, so the built-ins that
 * `agent.ts` loads for the CLI are never resolved here. Each schema takes a
 * key that a real provider of that kind would, which is how the test can see
 * that the assembly handed over the right slice of config.
 */
function registerFakes(): void {
  clearProviders();
  for (const list of Object.values(made)) list.length = 0;

  registerProvider(
    defineProvider({
      kind: "audioSource",
      name: "fake",
      description: "",
      schema: z.object({ inputDevice: z.string() }),
      create: () => {
        const source = new FakeAudioSource();
        made.sources.push(source);
        return source;
      },
    }),
  );
  registerProvider(
    defineProvider({
      kind: "audioSink",
      name: "fake",
      description: "",
      schema: z.object({ outputDevice: z.string().nullish() }),
      create: () => new FakeAudioSink(),
    }),
  );
  registerProvider(
    defineProvider({
      kind: "wake",
      name: "fake",
      description: "",
      schema: z.object({ words: z.array(z.string()) }),
      create: (options) => {
        const wake = new FakeWakeWordEngine((options as { words: string[] }).words[0]);
        made.wakes.push(wake);
        return wake;
      },
    }),
  );
  registerProvider(
    defineProvider({
      kind: "stt",
      name: "fake",
      description: "",
      schema: z.object({ text: z.string().default("hello") }),
      create: (options) => new FakeSpeechToText((options as { text: string }).text),
    }),
  );
  registerProvider(
    defineProvider({
      kind: "tts",
      name: "fake",
      description: "",
      schema: z.object({ voice: z.string() }),
      create: (options) => {
        const tts = new FakeTextToSpeech();
        made.voices.push({ voice: (options as { voice: string }).voice, tts });
        return tts;
      },
    }),
  );
  registerProvider(
    defineProvider<TextToSpeech>({
      kind: "tts",
      name: "fake-silent",
      description: "",
      create: () => ({
        warm: async () => {},
        render: async () => {
          throw new Error("no model");
        },
      }),
    }),
  );
  registerProvider(
    defineProvider({
      kind: "llm",
      name: "fake",
      description: "",
      schema: z.object({ model: z.string().default("fake"), replies: z.array(z.string()).default(["ok"]) }),
      create: (options) => {
        const { model, replies } = options as { model: string; replies: string[] };
        const chat = new FakeChatModel(replies.map(say), model);
        made.models.push(chat);
        return chat;
      },
    }),
  );
  registerProvider(
    defineProvider({
      kind: "llm",
      name: "fake-keyless",
      description: "",
      create: () => {
        throw new Error("FAKE_API_KEY is not set");
      },
    }),
  );
  registerProvider(
    defineProvider<SearchProvider>({
      kind: "search",
      name: "fake",
      description: "",
      schema: z.object({ url: z.string().default("http://fake") }),
      create: () => ({
        search: async () => [{ title: "A result", url: "http://example.test", snippet: "Found it." }],
        doctor: async () => [{ name: "fake search", status: "ok", detail: "always" }],
      }),
    }),
  );
  registerProvider(
    defineProvider({
      kind: "integration",
      name: "fake",
      description: "",
      schema: z.object({ tool: z.string().optional(), context: z.array(z.string()).default([]) }),
      create: (options) => {
        const { tool, context } = options as { tool?: string; context: string[] };
        const integration = new FakeIntegration({
          name: "fake",
          tools: tool ? [defineTool(tool, "", { type: "object" }, async () => "ran")] : [],
          promptContext: context,
          checks: [{ name: "fake integration", status: "warn", detail: "pretend" }],
        });
        made.integrations.push(integration);
        return integration;
      },
    }),
  );
}

const paths = resolvePaths({ HOME: mkdtempSync(join(tmpdir(), "parlour-agent-")) }, "darwin");

/** A config that names the fakes everywhere, with room for a test to change one slot. */
const fakeConfig = (raw: Record<string, unknown> = {}) =>
  parseConfig({
    audio: { source: "fake", sink: "fake" },
    wake: { provider: "fake", words: ["hey_test"] },
    stt: { provider: "fake", text: "turn on the light" },
    tts: { provider: "fake", fallback: null, voice: "test_voice" },
    llm: {
      local: { provider: "fake", model: "local-fake", replies: ["from local"] },
      cloud: { provider: "fake", model: "cloud-fake", replies: ["from cloud"] },
    },
    search: { provider: "fake" },
    integrations: { fake: { tool: "fake_tool", context: ["The house is pretend."] } },
    ...raw,
  });

/** The same, with only the cloud slot changed: `llm` is one key, so it cannot be spread over. */
const withCloud = (cloud: Record<string, unknown>) =>
  fakeConfig({ llm: { local: { provider: "fake", model: "local-fake", replies: ["from local"] }, cloud } });

beforeEach(registerFakes);

test("buildAgent with fake providers registered wires the registry and the gate", async () => {
  const agent = await buildAgent(fakeConfig(), {}, paths);

  const names = agent.registry.specs().map((tool) => tool.name);
  assert.ok(names.includes("fake_tool"));
  assert.ok(names.includes("web_search"));
  assert.ok(names.includes("set_timer"));
  assert.deepEqual(agent.status(), { tools: names.length, cloud: true });
  assert.equal(agent.integrations.length, 1);

  const integration = made.integrations[0]!;
  assert.equal(await agent.gate(), false);
  integration.muted = true;
  assert.equal(await agent.gate(), true);

  await agent.close();
});

test("buildAgent hands each provider its own slice of config", async () => {
  const agent = await buildAgent(fakeConfig(), {}, paths);

  assert.equal(await agent.stt.transcribe(Buffer.alloc(0)), "turn on the light");
  assert.equal(await agent.wake.detector("x").push(new Int16Array([-1])), "hey_test");
  assert.deepEqual(
    made.voices.map((v) => v.voice),
    ["test_voice"],
  );
  assert.deepEqual(
    made.models.map((m) => m.label),
    ["local-fake", "cloud-fake"],
  );
  assert.equal((await agent.router.ask("hi")).text, "from local");
  assert.equal(
    await agent.registry.run("web_search", { query: "x" }),
    "1. A result (http://example.test)\nFound it.",
  );
  await agent.close();
});

test("buildAgent loads the wake word and warms the voice, unless audio is off", async () => {
  const listening = await buildAgent(fakeConfig(), {}, paths);
  assert.equal(made.wakes[0]?.loaded, true);
  assert.equal(made.voices[0]?.tts.warmed, true);
  await listening.close();

  registerFakes();
  const text = await buildAgent(fakeConfig(), {}, paths, { audio: false });
  assert.equal(made.wakes[0]?.loaded, false);
  assert.equal(made.voices[0]?.tts.warmed, false);
  // Still there, so `parlour doctor` can report on them.
  assert.ok(text.source);
  assert.ok(text.wake);
  await text.close();
});

test("the integrations' prompt context reaches the local model", async () => {
  const agent = await buildAgent(fakeConfig(), {}, paths);
  await agent.router.ask("hi");
  const system = made.models[0]?.calls[0]?.messages[0];
  assert.equal(system?.role, "system");
  assert.match(system?.content ?? "", /The house is pretend\./);
  await agent.close();
});

test("the cloud model is optional: disabled, unable to start, or missing", async () => {
  const disabled = await buildAgent(withCloud({ provider: "fake", enabled: false }), {}, paths);
  assert.equal(disabled.status().cloud, false);
  assert.equal(made.models.length, 1);
  await disabled.close();

  registerFakes();
  const keyless = await buildAgent(withCloud({ provider: "fake-keyless" }), {}, paths);
  assert.equal(keyless.status().cloud, false);
  const check = (await keyless.doctor()).find((c) => c.name === "cloud model");
  assert.equal(check?.status, "warn");
  assert.match(check?.detail ?? "", /FAKE_API_KEY is not set/);
  await keyless.close();

  // A typo is not a missing key: it must be said out loud, not worked around.
  registerFakes();
  await assert.rejects(
    buildAgent(withCloud({ provider: "nope-not-a-package" }), {}, paths),
    (error: unknown) => error instanceof UnknownProviderError && error.providerName === "nope-not-a-package",
  );
});

test("search is left out when the provider is none or cannot be created", async () => {
  const none = await buildAgent(fakeConfig({ search: { provider: "none" } }), {}, paths);
  assert.ok(!none.registry.specs().some((tool) => tool.name === "web_search"));
  await none.close();

  registerFakes();
  registerProvider(
    defineProvider({
      kind: "search",
      name: "fake-keyless",
      description: "",
      create: () => {
        throw new Error("FAKE_SEARCH_KEY is not set");
      },
    }),
  );
  const keyless = await buildAgent(fakeConfig({ search: { provider: "fake-keyless" } }), {}, paths);
  assert.ok(!keyless.registry.specs().some((tool) => tool.name === "web_search"));
  await keyless.close();
});

test("tts.fallback puts a second voice under the first", async () => {
  const agent = await buildAgent(
    fakeConfig({ tts: { provider: "fake-silent", fallback: "fake", voice: "v" } }),
    {},
    paths,
  );
  assert.equal((await agent.tts.render("still heard")).toString(), "still heard");
  assert.deepEqual(made.voices[0]?.tts.rendered, ["still heard"]);
  await agent.close();
});

test("doctor concatenates every provider's checks", async () => {
  const agent = await buildAgent(fakeConfig(), {}, paths, { audio: false });
  const checks = await agent.doctor();
  assert.deepEqual(
    checks.map((c) => c.name),
    ["fake search", "fake integration"],
  );
  await agent.close();
});

test("close closes the integrations and the microphone", async () => {
  const agent = await buildAgent(fakeConfig(), {}, paths);
  await agent.close();
  assert.equal(made.integrations[0]?.closed, true);
  assert.equal(made.sources[0]?.closed, true);
});

test("context.config is the whole config", async () => {
  let seen: unknown;
  registerProvider(
    defineProvider({
      kind: "integration",
      name: "nosy",
      description: "",
      create: (_options, context) => {
        seen = context.config;
        return new FakeIntegration({ name: "nosy" });
      },
    }),
  );
  const config = fakeConfig({ integrations: { nosy: {} } });
  const agent = await buildAgent(config, {}, paths, { audio: false });
  assert.equal(seen, config);
  await agent.close();
});
