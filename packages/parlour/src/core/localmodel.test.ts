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
  assert.equal(suggestLocalModel({ memoryGb: 8, arch: "arm64" }).id, "qwen2.5-3b-instruct");
  assert.equal(suggestLocalModel({ memoryGb: 16, arch: "arm64" }).id, "qwen2.5-7b-instruct");
  assert.equal(suggestLocalModel({ memoryGb: 64, arch: "arm64" }).id, "qwen2.5-14b-instruct");
  // An Intel Mac runs these on the CPU, where the same model takes long
  // enough that a person stops asking, so it is given one size down.
  assert.equal(suggestLocalModel({ memoryGb: 16, arch: "x64" }).id, "qwen2.5-3b-instruct");
  // Too small for anything on the list still gets something: the alternative
  // is a house with no local model at all.
  assert.equal(suggestLocalModel({ memoryGb: 2, arch: "arm64" }).id, LOCAL_MODELS[0]?.id);
});

test("the installed model is the one config names, and otherwise whatever is there", () => {
  assert.equal(installedLocalModel(models, "qwen2.5-7b-instruct"), null, "nothing fetched yet");

  const file = withFile("Qwen2.5-3B-Instruct-Q4_K_M.gguf");
  // Config names 7B and only 3B was fetched: the server is started under the
  // id of the file it is actually holding, so the mismatch shows up in
  // parlour doctor rather than as a server lying about what it serves.
  assert.deepEqual(installedLocalModel(models, "qwen2.5-7b-instruct"), {
    id: "qwen2.5-3b-instruct",
    file,
  });

  // A file dropped in by hand is served under its own name.
  rmSync(join(models, "llm"), { recursive: true, force: true });
  const mine = withFile("something-of-my-own.gguf");
  assert.deepEqual(installedLocalModel(models), { id: "something-of-my-own", file: mine });
});
