import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { z } from "zod";
import {
  clearProviders,
  defineProvider,
  type ProviderContext,
  registeredProviders,
  registerProvider,
  resolveProvider,
  UnknownProviderError,
} from "./providers.ts";

const context: ProviderContext = {
  paths: {} as never,
  secrets: {},
  log: console as never,
  emit: () => {},
  config: {},
};

beforeEach(() => clearProviders());

// Third-party providers are plain modules, so a temp directory of small
// `.mjs` files stands in for the npm packages a real config would name.
let fixtures = "";
const fixture = (file: string, source: string) => {
  const path = join(fixtures, file);
  writeFileSync(path, source);
  return path;
};
const definition = (kind: string) =>
  `export default { kind: "${kind}", name: "fake-voice", description: "", create: (o) => ({ ok: true, o }) };\n`;

before(() => {
  fixtures = mkdtempSync(join(tmpdir(), "parlour-providers-"));
});
after(() => rmSync(fixtures, { recursive: true, force: true }));

test("a registered provider is created with parsed options", async () => {
  registerProvider(
    defineProvider({
      kind: "stt",
      name: "fake",
      description: "",
      schema: z.object({ url: z.string().default("x") }),
      create: (o) => ({ options: o }),
    }),
  );
  const made = await resolveProvider<{ options: unknown }>("stt", "fake", {}, context);
  assert.deepEqual(made.options, { url: "x" });
});

test("a provider without a schema gets its options untouched", async () => {
  registerProvider(defineProvider({ kind: "tts", name: "raw", description: "", create: (o) => ({ o }) }));
  const made = await resolveProvider<{ o: unknown }>("tts", "raw", { anything: 1 }, context);
  assert.deepEqual(made.o, { anything: 1 });
});

test("duplicate registration throws", () => {
  const def = defineProvider({ kind: "tts", name: "dup", description: "", create: () => ({}) });
  registerProvider(def);
  assert.throws(() => registerProvider(def), /already registered/);
});

test("an unknown name that is not importable names the alternatives", async () => {
  registerProvider(defineProvider({ kind: "tts", name: "kokoro", description: "", create: () => ({}) }));
  await assert.rejects(
    resolveProvider("tts", "nope-not-a-package", {}, context),
    (e: unknown) => e instanceof UnknownProviderError && /kokoro/.test((e as Error).message),
  );
});

test("an importable module whose default export matches the kind is loaded and remembered", async () => {
  const path = fixture("good.mjs", definition("tts"));
  const made = await resolveProvider<{ ok: boolean; o: unknown }>("tts", path, { voice: "a" }, context);
  assert.deepEqual(made, { ok: true, o: { voice: "a" } });
  assert.deepEqual(
    registeredProviders("tts").map((p) => p.name),
    ["fake-voice"],
  );
});

test("resolving the same module twice reuses the first import", async () => {
  const path = fixture("twice.mjs", definition("tts"));
  await resolveProvider("tts", path, {}, context);
  const again = await resolveProvider<{ ok: boolean }>("tts", path, {}, context);
  assert.equal(again.ok, true);
  assert.equal(registeredProviders("tts").length, 1);
});

test("a module whose default export is for another kind is not accepted", async () => {
  const path = fixture("wrong-kind.mjs", definition("stt"));
  await assert.rejects(
    resolveProvider("tts", path, {}, context),
    (e: unknown) => e instanceof UnknownProviderError,
  );
  assert.equal(registeredProviders().length, 0);
});

test("a module that fails to load reports the failure rather than an unknown name", async () => {
  const path = fixture("broken.mjs", 'throw new Error("boom");\n');
  await assert.rejects(
    resolveProvider("tts", path, {}, context),
    (e: unknown) =>
      !(e instanceof UnknownProviderError) &&
      (e as Error).message.includes(path) &&
      /boom/.test(String((e as Error).cause)),
  );
});

test("a name with path traversal is never imported", async () => {
  // Without the guard this path resolves to the fixture and would load. It is
  // built by hand because path.join would tidy the `..` away.
  const real = fixture("guarded.mjs", definition("tts"));
  const climbing = `${fixtures}/sub/../guarded.mjs`;
  await assert.rejects(
    resolveProvider("tts", climbing, {}, context),
    (e: unknown) => e instanceof UnknownProviderError,
  );
  assert.equal(registeredProviders().length, 0);
  // The same file by its plain path loads, so it was the `..` that was refused.
  await resolveProvider("tts", real, {}, context);
  assert.equal(registeredProviders("tts").length, 1);
});

test("registeredProviders filters by kind", () => {
  registerProvider(defineProvider({ kind: "tts", name: "a", description: "", create: () => ({}) }));
  registerProvider(defineProvider({ kind: "stt", name: "b", description: "", create: () => ({}) }));
  assert.deepEqual(
    registeredProviders("stt").map((p) => p.name),
    ["b"],
  );
  assert.equal(registeredProviders().length, 2);
});
