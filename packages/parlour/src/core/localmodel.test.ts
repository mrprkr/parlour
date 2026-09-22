import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  installedLocalModel,
  LOCAL_MODELS,
  localModel,
  localModelUrl,
  suggestLocalModel,
} from "./localmodel.ts";

let models = "";

beforeEach(() => {
  models = mkdtempSync(join(tmpdir(), "parlour-llm-"));
});

afterEach(() => rmSync(models, { recursive: true, force: true }));

function withFile(name: string): string {
  const dir = join(models, "llm");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), "");
  return join(dir, name);
}

test("the catalogue is in size order and every entry is fetchable", () => {
  // suggestLocalModel takes the last one that fits, so the order is not
  // decoration: a catalogue sorted the other way would suggest the smallest
  // model to every machine.
  const sizes = LOCAL_MODELS.map((model) => model.needsGb);
  assert.deepEqual(
    sizes,
    [...sizes].sort((a, b) => a - b),
  );
  for (const model of LOCAL_MODELS) {
    assert.equal(localModel(model.id)?.file, model.file, `${model.id} is findable by id`);
    assert.match(model.file, /\.gguf$/);
    assert.match(localModelUrl(model), /^https:\/\/huggingface\.co\/.+\/resolve\/main\/.+\.gguf$/);
  }
});

test("the suggestion is the largest model the machine can hold", () => {
  assert.equal(suggestLocalModel({ memoryGb: 8, arch: "arm64" }).id, "qwen3.5-4b");
  assert.equal(suggestLocalModel({ memoryGb: 16, arch: "arm64" }).id, "qwen3.5-9b");
  assert.equal(suggestLocalModel({ memoryGb: 32, arch: "arm64" }).id, "gemma-4-26b-a4b");
  assert.equal(suggestLocalModel({ memoryGb: 128, arch: "arm64" }).id, "qwen3.6-35b-a3b");
  // An Intel Mac runs these on the CPU, where the same model takes long
  // enough that a person stops asking, so it is given one size down.
  assert.equal(suggestLocalModel({ memoryGb: 16, arch: "x64" }).id, "qwen3.5-4b");
  // Too small for anything on the list still gets something: the alternative
  // is a house with no local model at all.
  assert.equal(suggestLocalModel({ memoryGb: 2, arch: "arm64" }).id, LOCAL_MODELS[0]?.id);
});

test("a retired model is still known by its id and its file, but never suggested", () => {
  const retired = localModel("qwen2.5-7b-instruct");
  assert.equal(retired?.file, "Qwen2.5-7B-Instruct-Q4_K_M.gguf");
  assert.ok(!LOCAL_MODELS.some((model) => model.id === retired?.id));
  const file = withFile("Qwen2.5-7B-Instruct-Q4_K_M.gguf");
  assert.deepEqual(installedLocalModel(models, "qwen3.5-9b"), { id: "qwen2.5-7b-instruct", file });
});

test("the installed model is the one config names, and otherwise whatever is there", () => {
  assert.equal(installedLocalModel(models, "qwen3.5-9b"), null, "nothing fetched yet");

  const file = withFile("Qwen3.5-4B-Q4_K_M.gguf");
  // Config names 9B and only 4B was fetched: the server is started under the
  // id of the file it is actually holding, so the mismatch shows up in
  // parlour doctor rather than as a server lying about what it serves.
  assert.deepEqual(installedLocalModel(models, "qwen3.5-9b"), {
    id: "qwen3.5-4b",
    file,
  });

  // A file dropped in by hand is served under its own name.
  rmSync(join(models, "llm"), { recursive: true, force: true });
  const mine = withFile("something-of-my-own.gguf");
  assert.deepEqual(installedLocalModel(models), { id: "something-of-my-own", file: mine });
});
