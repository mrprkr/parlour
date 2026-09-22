import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeDecisionModel, triageAnswers } from "../testing/index.ts";
import type { ChatModel, DecisionModel } from "./ports.ts";
import { ESCALATE_TOOL } from "./prompt.ts";
import { defineTool, ToolRegistry } from "./registry.ts";
import { type Answer, CONTEXT_TTL_MS, Router, type RouterOptions } from "./router.ts";
import type { Completion, Message, ToolSpec } from "./types.ts";

/** Answers from a script and remembers what it was asked, so a test can read both sides. */
class FakeChatModel implements ChatModel {
  readonly label: string;
  readonly calls: { messages: Message[]; tools: string[] }[] = [];
  readonly #script: Completion[];

  constructor(script: Completion[], label = "fake") {
    this.label = label;
    this.#script = [...script];
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    // A copy: the loop keeps appending to the array it handed over.
    this.calls.push({ messages: [...messages], tools: tools.map((tool) => tool.name) });
    const next = this.#script.shift();
    if (!next) throw new Error("script exhausted");
    return next;
  }
}

/** A model that is down, as a local server that has not been started is. */
class BrokenChatModel implements ChatModel {
  readonly label = "broken";
  async complete(): Promise<Completion> {
    throw new Error("connection refused");
  }
}

const say = (text: string): Completion => ({ text, toolCalls: [] });
const escalate = (question: string): Completion => ({
  text: "",
  toolCalls: [{ id: "1", name: ESCALATE_TOOL, args: { question } }],
});

/** A stand-in for the house's tools, so a test can see who was offered them. */
const houseTool = defineTool("ha_call_service", "", { type: "object" }, async () => "ok");

const router = (options: Partial<RouterOptions> & { local: ChatModel }) =>
  new Router({
    name: "Test",
    cloud: null,
    registry: new ToolRegistry().add(houseTool),
    maxToolRounds: 3,
    onLocalFailure: true,
    ...options,
  });

/** What was answered, without the per-task detail a few of these tests do not care about. */
const answered = (answer: Answer) => ({ text: answer.text, via: answer.via });

/** The conversation as the model saw it, without the system prompt. */
const turns = (call: { messages: Message[] } | undefined) =>
  (call?.messages ?? [])
    .filter((m) => m.role !== "system")
    .map((m) => [m.role, (m as { content: string }).content]);

test("Router answers locally and remembers history per session", async () => {
  const local = new FakeChatModel([say("one"), say("two"), say("three")]);
  const r = router({ local });

  assert.deepEqual(answered(await r.ask("first", { session: "a" })), { text: "one", via: "local" });
  await r.ask("second", { session: "a" });
  await r.ask("third", { session: "b" });

  const system = local.calls[0]?.messages[0];
  assert.equal(system?.role, "system");
  assert.match((system as { content: string }).content, /You are Test, the assistant for this house/);
  assert.deepEqual(turns(local.calls[1]), [
    ["user", "first"],
    ["assistant", "one"],
    ["user", "second"],
  ]);
  // Another session starts from nothing.
  assert.deepEqual(turns(local.calls[2]), [["user", "third"]]);
});

test("Router passes the locale through to the persona", async () => {
  const local = new FakeChatModel([say("x")]);
  await router({ local, locale: "en-US" }).ask("hi");
  const system = local.calls[0]?.messages[0] as { content: string };
  assert.match(system.content, /American English/);
});

test("Router offers the escalation tool only when there is a cloud model", async () => {
  const alone = new FakeChatModel([say("x")]);
  await router({ local: alone }).ask("hi");
  assert.equal(alone.calls[0]?.tools.includes(ESCALATE_TOOL), false);

  const paired = new FakeChatModel([say("x")]);
  await router({ local: paired, cloud: new FakeChatModel([]) }).ask("hi");
  assert.equal(paired.calls[0]?.tools.includes(ESCALATE_TOOL), true);
});

test("Router escalates to the cloud model with the rewritten question", async () => {
  const local = new FakeChatModel([escalate("What is the capital of Peru?"), say("local again")]);
  const cloud = new FakeChatModel([say("Lima.")], "cloud");
  const r = router({ local, cloud });

  assert.deepEqual(answered(await r.ask("capital of peru", { session: "a" })), {
    text: "Lima.",
    via: "cloud",
  });
  assert.deepEqual(turns(cloud.calls[0]), [["user", "What is the capital of Peru?"]]);
  // The local model had the house tools; the cloud model gets none of them.
  assert.equal(local.calls[0]?.tools.includes(houseTool.name), true);
  assert.deepEqual(cloud.calls[0]?.tools, []);

  // History keeps what was actually said, not the rewritten hand-over.
  await r.ask("thanks", { session: "a" });
  assert.deepEqual(turns(local.calls[1]), [
    ["user", "capital of peru"],
    ["assistant", "Lima."],
    ["user", "thanks"],
  ]);
});

test("Router falls back to cloud when local throws and onLocalFailure", async () => {
  const cloud = new FakeChatModel([say("from the cloud")], "cloud");
  const r = router({ local: new BrokenChatModel(), cloud, onLocalFailure: true });
  assert.deepEqual(answered(await r.ask("hello")), { text: "from the cloud", via: "cloud" });
  assert.deepEqual(turns(cloud.calls[0]), [["user", "hello"]]);
  // Falling over is not a reason to hand the house to the cloud either.
  assert.deepEqual(cloud.calls[0]?.tools, []);
});

test("Router says so when local throws and there is no cloud", async () => {
  const r = router({ local: new BrokenChatModel(), cloud: null });
  const answer = await r.ask("hello");
  assert.equal(answer.via, "local");
  assert.match(answer.text, /local model is not answering/);
});

test("Router does not fall back when onLocalFailure is off", async () => {
  const cloud = new FakeChatModel([say("should not be asked")], "cloud");
  const r = router({ local: new BrokenChatModel(), cloud, onLocalFailure: false });
  assert.match((await r.ask("hello")).text, /local model is not answering/);
  assert.equal(cloud.calls.length, 0);
});

test("Router says so when the cloud model fails too", async () => {
  const r = router({ local: new FakeChatModel([escalate("q")]), cloud: new BrokenChatModel() });
  const answer = await r.ask("hello");
  assert.equal(answer.via, "cloud");
  assert.match(answer.text, /could not reach the cloud model/);
});

test("Router forgets a session after CONTEXT_TTL", async () => {
  let clock = 1_000_000;
  const local = new FakeChatModel([say("one"), say("two"), say("three")]);
  const r = router({ local, now: () => clock });

  await r.ask("first", { session: "a" });
  clock += CONTEXT_TTL_MS;
  await r.ask("second", { session: "a" });
  assert.deepEqual(turns(local.calls[1]), [
    ["user", "first"],
    ["assistant", "one"],
    ["user", "second"],
  ]);

  clock += CONTEXT_TTL_MS + 1;
  await r.ask("third", { session: "a" });
  assert.deepEqual(turns(local.calls[2]), [["user", "third"]]);
});

test("Router reset forgets one session or all of them", async () => {
  const local = new FakeChatModel([say("1"), say("2"), say("3"), say("4")]);
  const r = router({ local });
  await r.ask("a1", { session: "a" });
  await r.ask("b1", { session: "b" });
  r.reset("a");
  await r.ask("a2", { session: "a" });
  await r.ask("b2", { session: "b" });
  assert.deepEqual(turns(local.calls[2]), [["user", "a2"]]);
  assert.equal(turns(local.calls[3]).length, 3);
});

test("Router puts the room and the integrations' context in the prompt", async () => {
  const local = new FakeChatModel([say("x")]);
  const r = router({ local, promptContext: () => ["The house is controlled through tools."] });
  await r.ask("hi", { room: "kitchen" });
  const system = local.calls[0]?.messages[0] as { content: string } | undefined;
  assert.match(system?.content ?? "", /The house is controlled through tools\./);
  assert.match(system?.content ?? "", /spoken to from the kitchen/);
});

test("Router says Done. when the model says nothing", async () => {
  const r = router({ local: new FakeChatModel([say("")]) });
  assert.equal((await r.ask("turn it off")).text, "Done.");
});

test("Router in triage mode escalates before the local model when needsCloud is high", async () => {
  const local = new FakeChatModel([say("should not run")]);
  const cloud = new FakeChatModel([say("Lima.")], "cloud");
  const decision = new FakeDecisionModel(
    triageAnswers({ needsCloud: 0.95, needsWeb: 0.1, intent: "search", intentConfidence: 0.9 }),
  );
  const r = router({
    local,
    cloud,
    decision,
    decisionMode: "triage",
    escalateThreshold: 0.85,
  });
  assert.deepEqual(answered(await r.ask("capital of peru")), { text: "Lima.", via: "cloud" });
  assert.equal(local.calls.length, 0);
  assert.equal(decision.calls.length, 1);
  assert.deepEqual(turns(cloud.calls[0]), [["user", "capital of peru"]]);
});

test("Router in triage mode keeps clear house intents local without escalate", async () => {
  const local = new FakeChatModel([say("Done.")]);
  const cloud = new FakeChatModel([say("should not run")], "cloud");
  const decision = new FakeDecisionModel(
    triageAnswers({ needsCloud: 0.1, intent: "house", intentConfidence: 0.9 }),
  );
  const r = router({
    local,
    cloud,
    decision,
    decisionMode: "triage",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
  });
  assert.deepEqual(answered(await r.ask("turn the lights off")), { text: "Done.", via: "local" });
  assert.equal(local.calls[0]?.tools.includes(ESCALATE_TOOL), false);
  assert.equal(cloud.calls.length, 0);
});

test("Router in shadow mode still lets the local model escalate", async () => {
  const local = new FakeChatModel([escalate("What is the capital of Peru?")]);
  const cloud = new FakeChatModel([say("Lima.")], "cloud");
  const decision = new FakeDecisionModel(
    triageAnswers({ needsCloud: 0.95, intent: "search", intentConfidence: 0.9 }),
  );
  const r = router({
    local,
    cloud,
    decision,
    decisionMode: "shadow",
    escalateThreshold: 0.85,
  });
  assert.deepEqual(answered(await r.ask("capital of peru")), { text: "Lima.", via: "cloud" });
  assert.equal(local.calls.length, 1);
  assert.equal(local.calls[0]?.tools.includes(ESCALATE_TOOL), true);
});

test("Router continues locally when the decision model throws", async () => {
  const local = new FakeChatModel([say("ok")]);
  const decision: DecisionModel = {
    label: "broken",
    async evaluate() {
      throw new Error("timeout");
    },
  };
  const r = router({ local, decision, decisionMode: "triage" });
  assert.deepEqual(answered(await r.ask("hi")), { text: "ok", via: "local" });
});

test("the persona stops naming the escalation tool when there is no cloud model", async () => {
  const alone = new FakeChatModel([say("x")]);
  await router({ local: alone }).ask("hi");
  const system = alone.calls[0]?.messages[0] as { content: string };
  assert.doesNotMatch(system.content, new RegExp(ESCALATE_TOOL));
  assert.match(system.content, /only model in this house/);

  const paired = new FakeChatModel([say("x")]);
  await router({ local: paired, cloud: new FakeChatModel([]) }).ask("hi");
  const withCloud = paired.calls[0]?.messages[0] as { content: string };
  assert.match(withCloud.content, new RegExp(ESCALATE_TOOL));
});

test("a local-only house still runs its tools when the model reaches for the clever one", async () => {
  // The escalation call is answered rather than refused, so the round after
  // it is the model doing the job with what it has.
  const local = new FakeChatModel([
    escalate("who can do this"),
    { text: "", toolCalls: [{ id: "2", name: houseTool.name, args: {} }] },
    say("Done."),
  ]);
  const answer = await router({ local }).ask("turn the hall light off");
  assert.deepEqual(answered(answer), { text: "Done.", via: "local" });
  const told = local.calls[1]?.messages.at(-1) as { role: string; content: string };
  assert.equal(told.role, "tool");
  assert.match(told.content, /no other model/);
});

// ------------------------------------------------------------- the pipeline

const triaged = (...items: { text: string; kind?: string; clever?: boolean }[]): Completion => ({
  text: JSON.stringify({ items: items.map((item) => ({ kind: "action", ...item })) }),
  toolCalls: [],
});

/** A model that answers when the test lets it, so two clients can be in flight at once. */
class HeldChatModel implements ChatModel {
  readonly label = "held";
  readonly asked: string[] = [];
  readonly #gates = new Map<string, () => void>();

  async complete(messages: Message[]): Promise<Completion> {
    const asked = [...messages].reverse().find((m) => m.role === "user");
    const text = (asked as { content: string } | undefined)?.content ?? "";
    this.asked.push(text);
    await new Promise<void>((resolve) => this.#gates.set(text, resolve));
    return say(`answered ${text}`);
  }

  /** Let one request finish, and give the queue a turn to start the next. */
  async release(text: string): Promise<void> {
    this.#gates.get(text)?.();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

test("a request with two things in it is done as two tasks, each seeing the last", async () => {
  const local = new FakeChatModel([
    triaged({ text: "turn the kitchen light off" }, { text: "set a timer for ten minutes" }),
    say("The kitchen light is off"),
    say("Timer set for ten minutes."),
  ]);
  const r = router({ local, triage: "always" });
  const answer = await r.ask("turn of the lite and set a timer for ten minutes", { session: "a" });

  assert.equal(answer.text, "The kitchen light is off. Timer set for ten minutes.");
  assert.deepEqual(
    answer.tasks?.map((task) => [task.text, task.status]),
    [
      ["turn the kitchen light off", "done"],
      ["set a timer for ten minutes", "done"],
    ],
  );
  // The second task is asked with the first one's question and answer in front
  // of it, so "and tell me if it worked" has something to work with.
  assert.deepEqual(turns(local.calls[2]), [
    ["user", "turn the kitchen light off"],
    ["assistant", "The kitchen light is off"],
    ["user", "set a timer for ten minutes"],
  ]);
  // What was said is what the conversation remembers, not the tidied version.
  assert.deepEqual(turns(local.calls[1]), [["user", "turn the kitchen light off"]]);
});

test("small talk is answered with no tools at all", async () => {
  const local = new FakeChatModel([triaged({ text: "thank you", kind: "chat" }), say("Any time.")]);
  const answer = await router({ local, cloud: new FakeChatModel([]), triage: "always" }).ask("thanks");

  assert.equal(answer.text, "Any time.");
  // Neither the house's tools nor the escalation tool: a small model given
  // either will use one, and nothing here needs doing.
  assert.deepEqual(local.calls[1]?.tools, []);
});

test("a question triage was sure about does not go to the local model first", async () => {
  const local = new FakeChatModel([triaged({ text: "why is the sky blue", kind: "question", clever: true })]);
  const cloud = new FakeChatModel([say("Rayleigh scattering.")], "cloud");
  const answer = await router({ local, cloud, triage: "always" }).ask("why is the sky blue", {});

  assert.deepEqual(answered(answer), { text: "Rayleigh scattering.", via: "cloud" });
  // Triage, and then nothing: the local round trip that would only have ended
  // in ask_the_clever_one is skipped.
  assert.equal(local.calls.length, 1);
  assert.deepEqual(turns(cloud.calls[0]), [["user", "why is the sky blue"]]);
});

test("two satellites asking at once are answered at once, each from its own conversation", async () => {
  const local = new HeldChatModel();
  const r = router({ local });
  const kitchen = r.ask("kitchen lights off", { session: "kitchen" });
  const study = r.ask("study lights off", { session: "study" });
  await settled();

  assert.deepEqual(local.asked, ["kitchen lights off", "study lights off"], "neither waits for the other");
  await local.release("study lights off");
  assert.equal((await study).text, "answered study lights off");
  await local.release("kitchen lights off");
  assert.equal((await kitchen).text, "answered kitchen lights off");
});

test("a request the same client replaced while it waited is dropped, not answered late", async () => {
  const local = new HeldChatModel();
  const r = router({ local, concurrency: 1, queueDepth: 1 });
  const first = r.ask("lights off", { session: "kitchen" });
  const second = r.ask("no, the lamp", { session: "kitchen" });
  await settled();
  const third = r.ask("no, the kettle", { session: "kitchen" });

  // Nothing to say rather than an answer to a question that has moved on.
  assert.deepEqual(await second, { text: "", via: "local", tasks: [] });
  await local.release("lights off");
  assert.equal((await first).text, "answered lights off");
  await local.release("no, the kettle");
  assert.equal((await third).text, "answered no, the kettle");
  assert.deepEqual(local.asked, ["lights off", "no, the kettle"]);
});

test("load says what is in flight and what is waiting", async () => {
  const local = new HeldChatModel();
  const r = router({ local, concurrency: 1, queueDepth: 2 });
  const first = r.ask("one", { session: "kitchen" });
  const second = r.ask("two", { session: "kitchen" });
  await settled();

  assert.deepEqual(r.load(), { running: 1, waiting: 1 });
  await local.release("one");
  await first;
  await local.release("two");
  await second;
  assert.deepEqual(r.load(), { running: 0, waiting: 0 });
});

test("a request that runs out of time says what it managed and what it did not", async () => {
  const local = new FakeChatModel([say("The lamp is off.")]);
  let clock = 0;
  const r = router({
    local,
    triage: "never",
    timeoutMs: 100,
    now: () => (clock += 50),
  });
  const answer = await r.ask("turn the lamp off and then run the bath", { session: "a" });

  assert.equal(answer.text, "The lamp is off. I ran out of time before the rest of that.");
  assert.deepEqual(
    answer.tasks?.map((task) => task.status),
    ["done", "skipped"],
  );
  // The second task is never asked for, rather than asked for too late.
  assert.equal(local.calls.length, 1);
});
