import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);

/** The directory a package is loaded from, resolved from somewhere in particular. */
function dirOf(name: string, from: string): string {
  return dirname(require.resolve(name, { paths: [from] }));
}

test("Kokoro and the wake word share one onnxruntime, because two copies abort the process", () => {
  // openwakeword imports onnxruntime-node at the top, so every process that
  // registers the built-ins is holding one before anything is asked. kokoro-js
  // brings transformers.js, which pins one of its own. Two builds of the same
  // native library in a single process fight over ONNX Runtime's global state:
  // the second session to run fails with "Preferred output locations must have
  // the same size as output names" and then takes the process down on a mutex
  // that is no longer valid. Resolving to one file is what keeps them apart.
  const ours = require.resolve("onnxruntime-node");
  const transformers = dirOf("@huggingface/transformers", dirname(require.resolve("kokoro-js")));
  const theirs = require.resolve("onnxruntime-node", { paths: [transformers] });
  assert.equal(
    theirs,
    ours,
    "onnxruntime-node must resolve to one file: pin it to the version transformers.js pins",
  );
});
