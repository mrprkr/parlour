import assert from "node:assert/strict";
import { test } from "node:test";
import { pickServiceManager } from "./index.ts";

test("macOS gets launchd", () => {
  const manager = pickServiceManager("darwin");
  assert.equal(typeof manager.install, "function");
  assert.equal(typeof manager.tail, "function");
});

test("anywhere else every method names the gap rather than failing later", async () => {
  const manager = pickServiceManager("linux");
  const expected = /only supported on macOS so far/;
  await assert.rejects(manager.install([]), expected);
  await assert.rejects(manager.uninstall([]), expected);
  await assert.rejects(manager.restart([]), expected);
  await assert.rejects(manager.status([]), expected);
  await assert.rejects(manager.tail("/nowhere", 10), expected);
});
