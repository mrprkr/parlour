import assert from "node:assert/strict";
import { test } from "node:test";
import { pickServiceManager } from "./index.ts";

test("macOS gets launchd", () => {
  const manager = pickServiceManager("darwin");
  assert.equal(typeof manager.install, "function");
  assert.equal(typeof manager.tail, "function");
});

test("PARLOUR_LAUNCHCTL swaps the launchctl the manager runs", async () => {
  // A path to nothing: the status call fails, which the manager reads as
  // "not loaded", so the job is reported as not running rather than the
  // real launchd being asked.
  const manager = pickServiceManager("darwin", { PARLOUR_LAUNCHCTL: "/nonexistent/launchctl" });
  const [state] = await manager.status([
    { label: "io.parlour.agent", what: "the agent", logPath: "/nowhere.log" },
  ]);
  assert.equal(state?.running, false);
  assert.equal(state?.pid, null);
  // The empty string counts as unset, as the other PARLOUR_ variables do.
  const fallback = pickServiceManager("darwin", { PARLOUR_LAUNCHCTL: "" });
  assert.equal(typeof fallback.status, "function");
});

test("anywhere else every method names the gap rather than failing later", async () => {
  const manager = pickServiceManager("linux");
  const expected = /only supported on macOS so far/;
  await assert.rejects(manager.install([]), expected);
  await assert.rejects(manager.uninstall([]), expected);
  await assert.rejects(manager.stop([]), expected);
  await assert.rejects(manager.restart([]), expected);
  await assert.rejects(manager.status([]), expected);
  await assert.rejects(manager.tail("/nowhere", 10), expected);
});

test("inside the App Store sandbox nothing is installed and installing says why", async () => {
  const manager = pickServiceManager("darwin", { APP_SANDBOX_CONTAINER_ID: "io.parlour.desktop" });
  const spec = { label: "io.parlour.agent", what: "the agent", logPath: "/nowhere.log" };
  const [state] = await manager.status([spec]);
  assert.equal(state?.installed, false);
  assert.equal(state?.running, false);
  assert.deepEqual(await manager.uninstall(["io.parlour.agent"]), []);
  await assert.rejects(manager.install([{ ...spec, program: ["parlour"], env: {} }]), /sandbox/);
  assert.match(await manager.tail("/nowhere.log", 5), /Nothing logged yet/);
});
