import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { registeredProviders } from "../../core/providers.ts";
import { createOpenWakeWord, OpenWakeWordSchema, openWakeWordDefinition } from "./openwakeword.ts";

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function contextWith(modelsDir: string) {
  return { paths: { modelsDir } as never, secrets: {}, log: silent, emit: () => {}, config: {} };
}

test("registers as the openwakeword wake engine", () => {
  assert.equal(openWakeWordDefinition.kind, "wake");
  assert.equal(openWakeWordDefinition.name, "openwakeword");
  assert.ok(registeredProviders("wake").some((p) => p.name === "openwakeword"));
});

test("the schema fills in the defaults and drops the provider key", () => {
  assert.deepEqual(OpenWakeWordSchema.parse({ provider: "openwakeword" }), {
    words: ["hey_jarvis"],
    threshold: 0.5,
    refractoryMs: 1500,
  });
  assert.throws(() => OpenWakeWordSchema.parse({ threshold: 2 }));
});

test("doctor names every missing model and how to fetch them", async () => {
  const models = mkdtempSync(join(tmpdir(), "parlour-wake-"));
  const engine = createOpenWakeWord(OpenWakeWordSchema.parse({ words: ["alexa"] }), contextWith(models));
  const [check] = await engine.doctor!();
  assert.equal(check!.name, "wake word models");
  assert.equal(check!.status, "fail");
  assert.match(check!.detail, /melspectrogram\.onnx, embedding_model\.onnx, alexa\.onnx/);
  assert.match(check!.detail, /parlour models fetch/);
  assert.ok(check!.detail.includes(join(models, "openwakeword")));
});

test("doctor is ok once the files are there", async () => {
  const models = mkdtempSync(join(tmpdir(), "parlour-wake-"));
  const dir = join(models, "openwakeword");
  mkdirSync(dir);
  for (const file of ["melspectrogram.onnx", "embedding_model.onnx", "hey_jarvis.onnx"]) {
    writeFileSync(join(dir, file), "");
  }
  const engine = createOpenWakeWord(OpenWakeWordSchema.parse({}), contextWith(models));
  const [check] = await engine.doctor!();
  assert.equal(check!.status, "ok");
  assert.equal(check!.detail, dir);
});

test("a detector cannot be made before the models are loaded", () => {
  const engine = createOpenWakeWord(OpenWakeWordSchema.parse({}), contextWith("/nowhere"));
  assert.throws(() => engine.detector("local"), /load/);
});

test("load fails with the missing file named", async () => {
  const models = mkdtempSync(join(tmpdir(), "parlour-wake-"));
  const engine = createOpenWakeWord(OpenWakeWordSchema.parse({}), contextWith(models));
  await assert.rejects(engine.load(), /melspectrogram\.onnx/);
});
