import assert from "node:assert/strict";
import { test } from "node:test";
import { VERSION } from "./version.ts";

test("VERSION is the package version", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});
