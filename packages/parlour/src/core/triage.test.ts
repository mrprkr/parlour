import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecisionModel, DecisionResult } from "./ports.ts";
import { planTriage, runTriage, type TriageVerdict } from "./triage.ts";

const house: TriageVerdict = {
  needsCloud: 0.1,
  needsWeb: 0.05,
  intent: "house",
  intentConfidence: 0.92,
  roomAmbiguous: 0.1,
  model: "fake",
};

const trivia: TriageVerdict = {
  needsCloud: 0.91,
  needsWeb: 0.2,
  intent: "search",
  intentConfidence: 0.8,
  roomAmbiguous: 0.05,
  model: "fake",
};

test("planTriage in shadow mode always stays local and still offers escalate", () => {
  const plan = planTriage(trivia, {
    mode: "shadow",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
    hasCloud: true,
  });
  assert.equal(plan.path, "local");
  assert.equal(plan.offerEscalate, true);
  assert.equal(plan.shadow, true);
});

test("planTriage in triage mode escalates when needsCloud is high", () => {
  const plan = planTriage(trivia, {
    mode: "triage",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
    hasCloud: true,
  });
  assert.equal(plan.path, "cloud");
  assert.equal(plan.offerEscalate, false);
});

test("planTriage in triage mode keeps house intents local without escalate", () => {
  const plan = planTriage(house, {
    mode: "triage",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
    hasCloud: true,
  });
  assert.equal(plan.path, "local");
  assert.equal(plan.offerEscalate, false);
});

test("planTriage without cloud never escalates", () => {
  const plan = planTriage(trivia, {
    mode: "triage",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
    hasCloud: false,
  });
  assert.equal(plan.path, "local");
  assert.equal(plan.offerEscalate, false);
});

test("planTriage escalates on needsWeb even when needsCloud is middling", () => {
  const weather: TriageVerdict = {
    ...trivia,
    needsCloud: 0.4,
    needsWeb: 0.9,
  };
  const plan = planTriage(weather, {
    mode: "triage",
    escalateThreshold: 0.85,
    localConfidence: 0.75,
    hasCloud: true,
  });
  assert.equal(plan.path, "cloud");
});

test("runTriage maps DecisionModel answers into a verdict", async () => {
  const model: DecisionModel = {
    label: "fake",
    async evaluate(): Promise<DecisionResult> {
      return {
        model: "laya-test",
        answers: {
          needs_cloud: { type: "noul", noul: 0.2 },
          needs_web: { type: "noul", noul: 0.1 },
          intent: {
            type: "choice",
            choice: "house",
            probabilities: { house: 0.9, timer: 0.05, search: 0.02, chat: 0.02, unclear: 0.01 },
            confidence: 0.88,
          },
          room_ambiguous: { type: "noul", noul: 0.15 },
        },
      };
    },
  };
  const verdict = await runTriage(model, {
    transcript: "turn the kitchen lights off",
    room: "kitchen",
    tools: ["ha_call_service"],
  });
  assert.equal(verdict.intent, "house");
  assert.equal(verdict.model, "laya-test");
  assert.equal(verdict.needsCloud, 0.2);
  assert.equal(verdict.intentConfidence, 0.88);
});
