import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeChatModel } from "../testing/index.ts";
import type { ChatModel } from "./ports.ts";
import { fastTriage, parseTriage, simple, type TriageContext, triage, triagePrompt } from "./triage.ts";
import type { Completion } from "./types.ts";

const json = (payload: unknown): Completion => ({ text: JSON.stringify(payload), toolCalls: [] });

const context = (model: ChatModel, overrides: Partial<TriageContext> = {}): TriageContext => ({
  model,
  mode: "always",
  maxTasks: 4,
  tools: ["ha_call_service", "web_search"],
  history: [],
  ...overrides,
});

test("a plain instruction skips the model, so it is answered as quickly as ever", async () => {
  const model = new FakeChatModel([]);
  const result = await triage("turn the kitchen light off", context(model, { mode: "auto" }));

  assert.equal(result.via, "fast");
  assert.deepEqual(result.tasks, [{ text: "turn the kitchen light off", kind: "action" }]);
  assert.equal(model.calls.length, 0, "nothing worth a round trip was asked of the model");
});

test("a request with two things in it is read by the model", async () => {
  const model = new FakeChatModel([
    json({
      items: [
        { text: "turn the kitchen light off", kind: "action" },
        { text: "set a timer for ten minutes", kind: "action" },
      ],
    }),
  ]);
  const result = await triage("turn the kitchen light off and then set a timer for ten minutes", {
    ...context(model, { mode: "auto" }),
  });

  assert.equal(result.via, "model");
  assert.deepEqual(
    result.tasks.map((task) => task.text),
    ["turn the kitchen light off", "set a timer for ten minutes"],
  );
});

test("triage repairs what was misheard and fills in what was meant", async () => {
  const model = new FakeChatModel([
    json({ items: [{ text: "turn off the light in the kitchen", kind: "action" }] }),
  ]);
  const result = await triage("turn of the lite in there", context(model, { room: "kitchen" }));

  assert.deepEqual(result.tasks, [{ text: "turn off the light in the kitchen", kind: "action" }]);
  const prompt = model.calls[0]?.messages[0] as { content: string };
  assert.match(prompt.content, /speaking from the kitchen/);
  assert.match(prompt.content, /ha_call_service/);
  assert.deepEqual(model.calls[0]?.tools, [], "triage is a reading job, not a doing one");
});

test("a question triage is sure about goes straight to the clever one", async () => {
  const model = new FakeChatModel([
    json({ items: [{ text: "what is the weather in Hobart tomorrow", kind: "question", clever: true }] }),
  ]);
  const result = await triage(
    "whats the weather in hobart tomorrow and should i take a coat",
    context(model),
  );
  assert.deepEqual(result.tasks, [
    { text: "what is the weather in Hobart tomorrow", kind: "question", clever: true },
  ]);
});

test("a model that answers with rubbish loses its say, and the request is taken as it was said", async () => {
  const model = new FakeChatModel([{ text: "I think you want the light off!", toolCalls: [] }]);
  const result = await triage("turn the light off and put the kettle on", context(model));

  assert.equal(result.via, "fallback");
  assert.deepEqual(result.tasks, [{ text: "turn the light off and put the kettle on", kind: "action" }]);
});

test("a model that will not answer at all does not stop the request", async () => {
  const broken: ChatModel = {
    label: "broken",
    complete: async () => {
      throw new Error("connection refused");
    },
  };
  const result = await triage("turn the light off and put the kettle on", context(broken));
  assert.equal(result.via, "fallback");
  assert.equal(result.tasks.length, 1);
});

test("triage that would run past the deadline is not run at all", async () => {
  const model = new FakeChatModel([json({ items: [{ text: "never asked", kind: "action" }] })]);
  const result = await triage("one thing and then another", context(model, { deadline: 10, now: () => 11 }));
  assert.equal(result.via, "fast");
  assert.equal(model.calls.length, 0);
});

test("parseTriage reads what small models actually send back", () => {
  const fenced = '```json\n{"items":[{"text":"lights off","kind":"action"}]}\n```';
  assert.deepEqual(parseTriage(fenced, 4), [{ text: "lights off", kind: "action" }]);

  // A bare array, the key called something else, and prose either side of it.
  assert.deepEqual(parseTriage('Sure! [{"text":"lights off","kind":"action"}] hope that helps', 4), [
    { text: "lights off", kind: "action" },
  ]);
  assert.deepEqual(parseTriage('{"tasks":[{"text":"lights off"}]}', 4), [
    { text: "lights off", kind: "action" },
  ]);
  // A kind it invented is an action, which is what everything was before triage.
  assert.deepEqual(parseTriage('{"items":[{"text":"lights off","kind":"command"}]}', 4), [
    { text: "lights off", kind: "action" },
  ]);
  assert.equal(parseTriage("no json here", 4), null);
  assert.equal(parseTriage('{"items":[]}', 4), null);
  assert.equal(parseTriage('{"items":[{"text":"  "}]}', 4), null);
});

test("one request cannot become more tasks than the cap allows", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ text: `job ${i}`, kind: "action" }));
  assert.equal(parseTriage(JSON.stringify({ items }), 3)?.length, 3);
  assert.equal(fastTriage("a then b then c then d", 2).tasks.length, 2);
});

test("the fast path splits only where a request plainly splits", () => {
  assert.deepEqual(
    fastTriage("turn the lamp off and then set a timer", 4).tasks.map((task) => task.text),
    ["turn the lamp off", "set a timer"],
  );
  // Not on a bare "and", which usually joins two lights rather than two requests.
  assert.deepEqual(
    fastTriage("turn off the lamp and the fan", 4).tasks.map((task) => task.text),
    ["turn off the lamp and the fan"],
  );
});

test("simple is what does not need a second opinion", () => {
  assert.equal(simple("lights off"), true);
  assert.equal(simple("what is the time"), true);
  assert.equal(simple("turn the lamp on and set a timer"), false);
  assert.equal(simple("lights off; kettle on"), false);
  assert.equal(
    simple("tell me everything you know about the history of the parlour in British houses"),
    false,
  );
});

test("the prompt says what the house can do, so triage can tell doing from asking", () => {
  const prompt = triagePrompt(context(new FakeChatModel([]), { maxTasks: 3 }));
  assert.match(prompt, /never more than 3/);
  assert.match(prompt, /The house can: ha_call_service, web_search\./);
  assert.doesNotMatch(prompt, /speaking from/);
});
