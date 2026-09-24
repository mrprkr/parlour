import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultPython, flattenInstructions, prepareQuestions } from "./laya-mlx.ts";

test("flattenInstructions keeps a plain string", () => {
  assert.equal(flattenInstructions("Is this urgent?"), "Is this urgent?");
});

test("flattenInstructions expands a structured question object", () => {
  const text = flattenInstructions({
    question: "Does transcript need the cloud?",
    transcript: "turn the lights off",
    guidance: "Listener is in the kitchen.",
  });
  assert.match(text, /^Does transcript need the cloud\?/);
  assert.match(text, /transcript: turn the lights off/);
  assert.match(text, /guidance: Listener is in the kitchen\./);
});

test("prepareQuestions flattens instructions and keeps criteria by type", () => {
  const prepared = prepareQuestions({
    needs_cloud: {
      type: "noul",
      instructions: { question: "Needs cloud?", transcript: "hi" },
      criteria: { true: "yes", false: "no" },
    },
    intent: {
      type: "choice",
      instructions: "What intent?",
      criteria: { house: "devices", chat: "talk" },
    },
    urgency: {
      type: "score",
      instructions: "How urgent?",
      criteria: ["low", "high"],
    },
  });
  assert.equal(prepared.needs_cloud?.type, "noul");
  assert.match(String(prepared.needs_cloud?.instructions), /Needs cloud\?/);
  assert.deepEqual(prepared.intent?.criteria, { house: "devices", chat: "talk" });
  assert.deepEqual(prepared.urgency?.criteria, ["low", "high"]);
});

test("defaultPython prefers the checkout's packages/laya environment", () => {
  const packages = mkdtempSync(join(tmpdir(), "parlour-laya-"));
  const here = join(packages, "parlour", "src", "providers", "decision");
  mkdirSync(here, { recursive: true });
  assert.equal(defaultPython(here), "python3");

  const bin = join(packages, "laya", ".venv", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "python"), "");
  assert.equal(defaultPython(here), join(bin, "python"));
});
