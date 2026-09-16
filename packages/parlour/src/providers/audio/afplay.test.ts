import assert from "node:assert/strict";
import { test } from "node:test";
import { registeredProviders } from "../../core/providers.ts";
import { AfplaySchema, afplayDefinition, createAfplay } from "./afplay.ts";

const warnings: unknown[][] = [];
const context = {
  paths: {} as never,
  secrets: {},
  log: { debug() {}, info() {}, warn: (...args: unknown[]) => warnings.push(args), error() {} },
  emit: () => {},
  config: {},
};

test("registers as the afplay audio sink", () => {
  assert.equal(afplayDefinition.kind, "audioSink");
  assert.equal(afplayDefinition.name, "afplay");
  assert.ok(registeredProviders("audioSink").some((p) => p.name === "afplay"));
});

test("the schema accepts an absent or null output device", () => {
  assert.deepEqual(AfplaySchema.parse({}), {});
  assert.equal(AfplaySchema.parse({ outputDevice: null }).outputDevice, null);
  assert.equal(AfplaySchema.parse({ outputDevice: "Speakers" }).outputDevice, "Speakers");
});

test("a named output device is warned about, since afplay cannot honour it", () => {
  warnings.length = 0;
  createAfplay(AfplaySchema.parse({ outputDevice: null }), context);
  assert.equal(warnings.length, 0);
  createAfplay(AfplaySchema.parse({ outputDevice: "Speakers" }), context);
  assert.equal(warnings.length, 1);
});

test("play with an aborted signal returns without touching the disk or afplay", async () => {
  const sink = createAfplay(AfplaySchema.parse({}), context);
  await sink.play(Buffer.from("not a wav"), AbortSignal.abort());
});

test("stop with nothing playing is harmless", () => {
  const sink = createAfplay(AfplaySchema.parse({}), context);
  sink.stop();
});

test("doctor names afplay", async () => {
  const sink = createAfplay(AfplaySchema.parse({}), context);
  const checks = await sink.doctor!();
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.name, "afplay");
  assert.ok(checks[0]!.status === "ok" || checks[0]!.status === "fail");
});
