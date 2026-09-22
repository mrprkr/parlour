import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { Message, ToolSpec } from "../../core/types.ts";
import { silentLogger } from "../../testing/index.ts";
import { AiSdkModel, toModelMessages, toolSet } from "./ai-sdk.ts";

/** Nobody counts tokens here, but the shape has to be filled in. */
const nothingUsed: LanguageModelV3Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const spec: ToolSpec = {
  name: "ha_call_service",
  description: "Turn something on or off",
  inputSchema: { type: "object", properties: { entity: { type: "string" } }, required: ["entity"] },
};

/**
 * A model at the SDK's own seam, so a test can read what it was handed and
 * say what comes back without a network or a key.
 */
function fakeModel(result: Partial<LanguageModelV3GenerateResult>) {
  const calls: LanguageModelV3CallOptions[] = [];
  const model: LanguageModelV3 = {
    specificationVersion: "v3",
    provider: "fake",
    modelId: "fake",
    supportedUrls: {},
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      calls.push(options);
      return {
        content: result.content ?? [],
        finishReason: result.finishReason ?? { unified: "stop", raw: undefined },
        usage: result.usage ?? nothingUsed,
        warnings: [],
      };
    },
    doStream: () => {
      throw new Error("not streamed here");
    },
  };
  return { model, calls };
}

const model = (fake: LanguageModelV3) =>
  new AiSdkModel({
    backend: "openai-compatible",
    model: fake,
    modelId: "fake",
    temperature: 0.3,
    timeoutMs: 5000,
    log: silentLogger,
  });

test("the neutral message shape becomes the SDK's", () => {
  const messages: Message[] = [
    { role: "system", content: "you are Parlour" },
    { role: "user", content: "lights off" },
    { role: "assistant", content: "", toolCalls: [{ id: "1", name: "light", args: { room: "kitchen" } }] },
    { role: "tool", toolCallId: "1", name: "light", content: "off" },
    { role: "tool", toolCallId: "2", name: "light", content: "off too" },
  ];

  assert.deepEqual(toModelMessages(messages), [
    { role: "system", content: "you are Parlour" },
    { role: "user", content: "lights off" },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "1", toolName: "light", input: { room: "kitchen" } }],
    },
    // Two results in a row are one tool message, which is what the wire
    // format underneath wants.
    {
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: "1", toolName: "light", output: { type: "text", value: "off" } },
        {
          type: "tool-result",
          toolCallId: "2",
          toolName: "light",
          output: { type: "text", value: "off too" },
        },
      ],
    },
  ]);
});

test("an assistant turn with nothing in it is left out", () => {
  assert.deepEqual(toModelMessages([{ role: "assistant", content: "" }]), []);
});

test("the tools go over as the JSON Schema they already are, and without an execute", () => {
  const set = toolSet([spec]);
  const tool = set.ha_call_service;
  assert.ok(tool);
  assert.equal(tool.description, "Turn something on or off");
  // No execute is what makes the SDK hand the call back rather than run it,
  // which is what leaves the loop, the escalation and the deadline in core.
  assert.equal("execute" in tool && tool.execute !== undefined, false);
  assert.deepEqual((tool.inputSchema as { jsonSchema: unknown }).jsonSchema, spec.inputSchema);
});

test("a completion comes back as text and calls the registry can run", async () => {
  const { model: fake, calls } = fakeModel({
    content: [
      { type: "text", text: "Turning it off." },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "ha_call_service",
        input: JSON.stringify({ entity: "light.kitchen" }),
      },
    ],
    finishReason: { unified: "tool-calls", raw: undefined },
  });

  const completion = await model(fake).complete([{ role: "user", content: "lights off" }], [spec]);

  assert.deepEqual(completion, {
    text: "Turning it off.",
    toolCalls: [{ id: "call-1", name: "ha_call_service", args: { entity: "light.kitchen" } }],
  });
  assert.deepEqual(
    calls[0]?.tools?.map((sent: { name: string }) => sent.name),
    ["ha_call_service"],
  );
});

test("the reasoning a local model says out loud is not part of the answer", async () => {
  const { model: fake } = fakeModel({
    content: [{ type: "text", text: "<think>the kitchen one</think>Done." }],
  });
  const completion = await model(fake).complete([{ role: "user", content: "lights off" }], []);
  assert.equal(completion.text, "Done.");
});

test("a tool the back end ran itself is not handed to the registry", async () => {
  const { model: fake } = fakeModel({
    content: [
      {
        type: "tool-call",
        toolCallId: "search-1",
        toolName: "web_search",
        input: JSON.stringify({ query: "tide times" }),
        providerExecuted: true,
      },
      { type: "tool-result", toolCallId: "search-1", toolName: "web_search", result: { ok: true } },
      { type: "text", text: "High tide is at four." },
    ],
  });

  const completion = await model(fake).complete([{ role: "user", content: "tide times" }], []);
  assert.equal(completion.text, "High tide is at four.");
  // It is already answered. Running it again would be a different tool of
  // the same name, answering a question nobody asked.
  assert.deepEqual(completion.toolCalls, []);
});
