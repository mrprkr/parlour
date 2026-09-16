import assert from "node:assert/strict";
import { test } from "node:test";
import { Timers } from "./timers.ts";

/** A clock that only moves when the test says so. */
function fakeClock() {
  let now = 1_000_000;
  const pending = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle: unknown) => {
      pending.delete(handle as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at > now) continue;
        pending.delete(id);
        timer.fn();
      }
    },
    get size() {
      return pending.size;
    },
  };
}

function setUp() {
  const clock = fakeClock();
  const announced: string[] = [];
  const timers = new Timers((text) => announced.push(text), clock);
  const tools = new Map(timers.tools().map((tool) => [tool.name, tool]));
  const run = (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.run(args);
  };
  return { clock, announced, run };
}

test("set_timer announces the label when the clock reaches it", async () => {
  const { clock, announced, run } = setUp();
  assert.equal(await run("set_timer", { seconds: 90, label: "the pasta" }), "Timer 1 set for 2 minutes.");
  clock.advance(89_000);
  assert.deepEqual(announced, []);
  clock.advance(1_000);
  assert.deepEqual(announced, ["Your the pasta is up."]);
  assert.equal(await run("list_timers"), "No timers running.");
});

test("list_timers reports what is left on each", async () => {
  const { clock, run } = setUp();
  await run("set_timer", { seconds: 30, label: "eggs" });
  await run("set_timer", { seconds: 600 });
  clock.advance(10_000);
  assert.equal(await run("list_timers"), "1: eggs, 20 seconds left; 2: timer, 10 minutes left");
});

test("cancel_timer by id, and all at once", async () => {
  const { clock, announced, run } = setUp();
  await run("set_timer", { seconds: 10, label: "one" });
  await run("set_timer", { seconds: 10, label: "two" });
  await run("set_timer", { seconds: 10, label: "three" });
  assert.equal(await run("cancel_timer", { id: 2 }), "Cancelled two.");
  assert.equal(await run("cancel_timer", { id: 2 }), "No timer 2.");
  assert.equal(await run("cancel_timer", { all: true }), "All timers cancelled.");
  assert.equal(clock.size, 0);
  clock.advance(60_000);
  assert.deepEqual(announced, []);
});

test("a duration below a second still sets a timer", async () => {
  const { clock, announced, run } = setUp();
  assert.equal(await run("set_timer", { seconds: 0 }), "Timer 1 set for 1 seconds.");
  clock.advance(1_000);
  assert.deepEqual(announced, ["Your timer is up."]);
});
