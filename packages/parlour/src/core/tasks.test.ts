import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskList, type TaskRequest } from "./tasks.ts";

const action = (text: string): TaskRequest => ({ text, kind: "action" });

test("TaskList hands out its tasks in order, once each", async () => {
  const list = new TaskList([action("light off"), action("set a timer")]);
  const first = list.next();
  assert.equal(first?.text, "light off");
  assert.equal(first?.status, "running");
  // Nothing else is handed out until the one in hand is finished or not.
  assert.equal(list.next()?.text, "set a timer");
  assert.equal(list.next(), undefined);
});

test("what an earlier task did is what a later one sees", () => {
  const list = new TaskList([action("turn the lamp on"), action("say whether it worked")]);
  const first = list.next();
  assert.ok(first);
  list.finish(first, { reply: "The lamp is on.", via: "local", ms: 20 });

  assert.deepEqual(list.transcript(), [
    { role: "user", content: "turn the lamp on" },
    { role: "assistant", content: "The lamp is on." },
  ]);
});

test("the replies become one thing to say, without saying Done twice", () => {
  const list = new TaskList([action("one"), action("two"), action("three")]);
  for (let task = list.next(); task; task = list.next()) {
    list.finish(task, { reply: task.text === "three" ? "Done" : "Done.", via: "local", ms: 1 });
  }
  assert.equal(list.reply(), "Done.");
});

test("two answers are joined as sentences, and one is left exactly as it was", () => {
  const list = new TaskList([action("one"), action("two")]);
  const first = list.next();
  const second = list.next();
  assert.ok(first && second);
  list.finish(first, { reply: "The kitchen light is off", via: "local", ms: 1 });
  list.finish(second, { reply: "Timer set for ten minutes.", via: "cloud", ms: 2 });

  assert.equal(list.reply(), "The kitchen light is off. Timer set for ten minutes.");
  // Cloud if any part of it needed the cloud, which is what the client shows.
  assert.equal(list.via, "cloud");

  const alone = new TaskList([action("one")]);
  const only = alone.next();
  assert.ok(only);
  alone.finish(only, { reply: "It is raining in Hobart", via: "local", ms: 1 });
  assert.equal(alone.reply(), "It is raining in Hobart");
});

test("a failure abandons the rest, and says so once", () => {
  const list = new TaskList([action("one"), action("two"), action("three")]);
  const first = list.next();
  assert.ok(first);
  list.fail(first, "My local model is not answering.");
  list.abandon();

  assert.equal(list.reply(), "My local model is not answering.");
  assert.deepEqual(
    list.outcomes().map((outcome) => outcome.status),
    ["failed", "skipped", "skipped"],
  );
  assert.equal(list.next(), undefined);
});
