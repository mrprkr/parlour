import assert from "node:assert/strict";
import { test } from "node:test";
import { runTurn } from "./loop.ts";
import type { ChatModel } from "./ports.ts";
import { ESCALATE_TOOL } from "./prompt.ts";
import { defineTool, ToolRegistry } from "./registry.ts";
import type { Completion, Message, ToolSpec } from "./types.ts";

/** Answers from a script and remembers what it was asked, so a test can read both sides. */
class FakeChatModel implements ChatModel {
  readonly label = "fake";
  readonly calls: { messages: Message[]; tools: string[] }[] = [];
  readonly #script: Completion[];

  constructor(script: Completion[]) {
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

const call = (name: string, args: Record<string, unknown> = {}, id = "1") => ({ id, name, args });
const registryWith = (...names: string[]) =>
  new ToolRegistry().add(
    ...names.map((name) => defineTool(name, "", { type: "object" }, async () => `${name} ran`)),
  );

test("runTurn runs tools until the model stops calling them", async () => {
  const registry = registryWith("t");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("t")] },
    { text: "done", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });
  assert.equal(result.text, "done");
  assert.equal(result.messages.filter((m) => m.role === "tool").length, 1);
  // The second ask sees the assistant's call and the tool's answer.
  assert.deepEqual(
    model.calls[1]?.messages.map((m) => m.role),
    ["assistant", "tool"],
  );
  const answer = model.calls[1]?.messages[1] as { content: string } | undefined;
  assert.equal(answer?.content, "t ran");
});

test("runTurn stops at the round limit with the apology", async () => {
  const registry = registryWith("t");
  const forever = { text: "", toolCalls: [call("t")] };
  const model = new FakeChatModel([forever, forever, forever, forever]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [],
    registry,
    maxRounds: 2,
    allowEscalation: false,
  });
  assert.match(result.text, /taking longer than it should/);
  assert.equal(model.calls.length, 2);
});

test("runTurn returns escalateTo when the local model asks", async () => {
  const registry = registryWith("t");
  const original: Message[] = [{ role: "user", content: "what is the weather" }];
  const model = new FakeChatModel([
    { text: "", toolCalls: [call(ESCALATE_TOOL, { question: "What is the weather in Hobart today?" })] },
  ]);
  const result = await runTurn({
    model,
    messages: original,
    tools: [],
    registry,
    maxRounds: 3,
    allowEscalation: true,
  });
  assert.equal(result.escalateTo, "What is the weather in Hobart today?");
  // The hand-over starts from the messages as they were: the cloud model gets
  // the question, not the local model's decision to give up.
  assert.deepEqual(result.messages, original);
});

test("runTurn does not escalate when escalation is not allowed", async () => {
  const registry = registryWith("t");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call(ESCALATE_TOOL, { question: "anything" })] },
    { text: "fine", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });
  assert.equal(result.escalateTo, undefined);
  assert.equal(result.text, "fine");
  // The call went to the registry like any other, which does not know it.
  const answer = result.messages.find((m) => m.role === "tool") as { content: string };
  assert.match(answer.content, /No tool called/);
});
