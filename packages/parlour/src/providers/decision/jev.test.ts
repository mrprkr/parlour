import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecisionQuestion, DecisionResult } from "../../core/ports.ts";
import { JevDecisionModel } from "./jev.ts";

test("JevDecisionModel posts state and questions to the systemone endpoint", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const model = new JevDecisionModel({
    apiKey: "test-key",
    model: "jev-1.13.0",
    baseUrl: "https://api.example.test",
    timeoutMs: 1000,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const body: DecisionResult = {
        model: "jev-1.13.0",
        answers: { needs_cloud: { type: "noul", noul: 0.7 } },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });

  const questions: Record<string, DecisionQuestion> = {
    needs_cloud: { type: "noul", instructions: "Needs cloud?" },
  };
  const result = await model.evaluate({ transcript: "hello" }, questions);
  assert.equal(result.model, "jev-1.13.0");
  assert.equal(result.answers.needs_cloud?.type, "noul");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.example.test/v1/systemone");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
  const sent = JSON.parse(String(calls[0]?.init.body)) as {
    model: string;
    state: { transcript: string };
  };
  assert.equal(sent.model, "jev-1.13.0");
  assert.equal(sent.state.transcript, "hello");
});

test("JevDecisionModel surfaces HTTP errors", async () => {
  const model = new JevDecisionModel({
    apiKey: "k",
    model: "jev-latest",
    baseUrl: "https://api.example.test",
    timeoutMs: 1000,
    fetch: async () => new Response("nope", { status: 401 }),
  });
  await assert.rejects(
    () => model.evaluate("x", { q: { type: "noul", instructions: "y" } }),
    /Jev returned 401/,
  );
});
