import assert from "node:assert/strict";
import { test } from "node:test";
import { OUT_OF_TIME, runTurn } from "./loop.ts";
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
    tools: [{ name: "t", description: "", inputSchema: { type: "object" } }],
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
    tools: [{ name: "t", description: "", inputSchema: { type: "object" } }],
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
  // A small model reaches for the escalation tool whether or not it was given
  // one. It is answered with what to do instead, so the next round uses the
  // tools it does have rather than reading "unknown tool" as a dead end.
  const answer = result.messages.find((m) => m.role === "tool") as { content: string };
  assert.match(answer.content, /no other model/);
  assert.match(answer.content, /use the tools you have/);
});

test("the tools in one round run together rather than one after another", async () => {
  const running: string[] = [];
  const slow = (name: string, ms: number) =>
    defineTool(name, "", { type: "object" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      running.push(name);
      return `${name} ran`;
    });
  const registry = new ToolRegistry().add(slow("slow", 30), slow("quick", 1));
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("slow", {}, "1"), call("quick", {}, "2")] },
    { text: "both", toolCalls: [] },
  ]);

  const started = Date.now();
  const result = await runTurn({
    model,
    messages: [],
    tools: [
      { name: "slow", description: "", inputSchema: { type: "object" } },
      { name: "quick", description: "", inputSchema: { type: "object" } },
    ],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  assert.equal(result.text, "both");
  // The quick one finished first, so they were not run in turn.
  assert.deepEqual(running, ["quick", "slow"]);
  assert.ok(Date.now() - started < 60, "two tools cost the slower one, not the sum");
  // The model still reads the answers in the order it asked for them.
  assert.deepEqual(
    result.messages.filter((m) => m.role === "tool").map((m) => (m as { name: string }).name),
    ["slow", "quick"],
  );
});

test("a turn that runs past its deadline stops between rounds", async () => {
  const registry = registryWith("t");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("t")] },
    { text: "never asked", toolCalls: [] },
  ]);
  let clock = 1000;
  const result = await runTurn({
    model,
    messages: [],
    tools: [{ name: "t", description: "", inputSchema: { type: "object" } }],
    registry,
    maxRounds: 4,
    allowEscalation: false,
    deadline: 1500,
    // The first round is always run; the tool it called took us past the end.
    now: () => (clock += 600),
  });

  assert.equal(result.text, OUT_OF_TIME);
  assert.equal(model.calls.length, 1);
});

test("runTurn rejects tool calls not in the allowed list", async () => {
  const registry = registryWith("allowed", "forbidden");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("allowed"), call("forbidden")] },
    { text: "done", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [{ name: "allowed", description: "", inputSchema: { type: "object" } }],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  assert.equal(result.text, "done");
  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 2);
  // The allowed tool ran.
  assert.equal((toolMessages[0] as { content: string }).content, "allowed ran");
  // The forbidden tool was rejected with an explanation.
  assert.match((toolMessages[1] as { content: string }).content, /not available in this context/);
  assert.match((toolMessages[1] as { content: string }).content, /forbidden/);
});

test("empty tools list rejects all tool calls including ha_call_service", async () => {
  // This is the chat/cloud scenario: tools: [] but registry still has integrations.
  const registry = registryWith("ha_call_service", "ha_get_state", "other_tool");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("ha_call_service", { domain: "light", service: "turn_on" })] },
    { text: "I cannot control devices right now", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [], // Empty list: no tools should be allowed
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  assert.equal(result.text, "I cannot control devices right now");
  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 1);
  // The ha_call_service call was rejected.
  assert.match((toolMessages[0] as { content: string }).content, /not available in this context/);
  assert.match((toolMessages[0] as { content: string }).content, /ha_call_service/);
  assert.match((toolMessages[0] as { content: string }).content, /Available tools: none/);
});

test("multiple forbidden tools are all rejected", async () => {
  const registry = registryWith("allowed", "forbidden1", "forbidden2", "forbidden3");
  const model = new FakeChatModel([
    {
      text: "",
      toolCalls: [
        call("forbidden1", {}, "1"),
        call("allowed", {}, "2"),
        call("forbidden2", {}, "3"),
        call("forbidden3", {}, "4"),
      ],
    },
    { text: "done", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [{ name: "allowed", description: "", inputSchema: { type: "object" } }],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  assert.equal(result.text, "done");
  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 4);
  
  // Check that forbidden tools were rejected
  const forbidden1Msg = toolMessages[0] as { content: string };
  assert.match(forbidden1Msg.content, /not available in this context/);
  assert.match(forbidden1Msg.content, /forbidden1/);
  
  // The allowed tool ran
  assert.equal((toolMessages[1] as { content: string }).content, "allowed ran");
  
  // Other forbidden tools were also rejected
  assert.match((toolMessages[2] as { content: string }).content, /not available in this context/);
  assert.match((toolMessages[2] as { content: string }).content, /forbidden2/);
  assert.match((toolMessages[3] as { content: string }).content, /not available in this context/);
  assert.match((toolMessages[3] as { content: string }).content, /forbidden3/);
});

test("rejection message lists available tools when some are allowed", async () => {
  const registry = registryWith("tool_a", "tool_b", "forbidden");
  const model = new FakeChatModel([
    { text: "", toolCalls: [call("forbidden")] },
    { text: "done", toolCalls: [] },
  ]);
  const result = await runTurn({
    model,
    messages: [],
    tools: [
      { name: "tool_a", description: "", inputSchema: { type: "object" } },
      { name: "tool_b", description: "", inputSchema: { type: "object" } },
    ],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 1);
  const rejection = (toolMessages[0] as { content: string }).content;
  assert.match(rejection, /not available in this context/);
  assert.match(rejection, /forbidden/);
  // Should list the available tools
  assert.match(rejection, /tool_a/);
  assert.match(rejection, /tool_b/);
});

test("tool allowlist check happens before registry execution", async () => {
  // Verify that forbidden tools never reach the registry.run() method
  let executedTools: string[] = [];
  const trackingRegistry = new ToolRegistry().add(
    defineTool("allowed", "", { type: "object" }, async () => {
      executedTools.push("allowed");
      return "allowed ran";
    }),
    defineTool("forbidden", "", { type: "object" }, async () => {
      executedTools.push("forbidden");
      return "forbidden ran";
    }),
  );

  const model = new FakeChatModel([
    { text: "", toolCalls: [call("allowed"), call("forbidden")] },
    { text: "done", toolCalls: [] },
  ]);
  
  await runTurn({
    model,
    messages: [],
    tools: [{ name: "allowed", description: "", inputSchema: { type: "object" } }],
    registry: trackingRegistry,
    maxRounds: 3,
    allowEscalation: false,
  });

  // Only the allowed tool should have been executed
  assert.deepEqual(executedTools, ["allowed"]);
});

test("undeclared tool with sensitive parameters is blocked", async () => {
  // Simulate the Home Assistant scenario: ha_call_service in registry but not in tools
  const registry = new ToolRegistry().add(
    defineTool(
      "ha_call_service",
      "Call a Home Assistant service",
      {
        type: "object",
        properties: {
          domain: { type: "string" },
          service: { type: "string" },
          entity_id: { type: "string" },
        },
      },
      async (args) => {
        // This should never be called when tools: [] is passed
        throw new Error(`ha_call_service should not execute: ${JSON.stringify(args)}`);
      },
    ),
  );

  const model = new FakeChatModel([
    {
      text: "",
      toolCalls: [
        call("ha_call_service", {
          domain: "light",
          service: "turn_on",
          entity_id: "light.kitchen",
        }),
      ],
    },
    { text: "I cannot do that", toolCalls: [] },
  ]);

  const result = await runTurn({
    model,
    messages: [],
    tools: [], // Cloud/chat scenario: no tools offered
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });

  assert.equal(result.text, "I cannot do that");
  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 1);
  // The call was rejected, not executed
  assert.match((toolMessages[0] as { content: string }).content, /not available in this context/);
  assert.match((toolMessages[0] as { content: string }).content, /ha_call_service/);
});

test("tool allowlist is checked per-turn not per-registry", async () => {
  // Same registry, different tool lists in different turns
  const registry = registryWith("tool1", "tool2", "tool3");
  
  // First turn: only tool1 allowed
  const model1 = new FakeChatModel([
    { text: "", toolCalls: [call("tool1"), call("tool2")] },
    { text: "first done", toolCalls: [] },
  ]);
  const result1 = await runTurn({
    model: model1,
    messages: [],
    tools: [{ name: "tool1", description: "", inputSchema: { type: "object" } }],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });
  
  const toolMessages1 = result1.messages.filter((m) => m.role === "tool");
  assert.equal((toolMessages1[0] as { content: string }).content, "tool1 ran");
  assert.match((toolMessages1[1] as { content: string }).content, /not available in this context/);
  
  // Second turn: only tool2 allowed (same registry)
  const model2 = new FakeChatModel([
    { text: "", toolCalls: [call("tool1"), call("tool2")] },
    { text: "second done", toolCalls: [] },
  ]);
  const result2 = await runTurn({
    model: model2,
    messages: [],
    tools: [{ name: "tool2", description: "", inputSchema: { type: "object" } }],
    registry,
    maxRounds: 3,
    allowEscalation: false,
  });
  
  const toolMessages2 = result2.messages.filter((m) => m.role === "tool");
  assert.match((toolMessages2[0] as { content: string }).content, /not available in this context/);
  assert.equal((toolMessages2[1] as { content: string }).content, "tool2 ran");
});
