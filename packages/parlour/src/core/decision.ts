import type { DecisionModel, DecisionQuestion } from "./ports.ts";

/**
 * Pre-router judgment for one utterance. Laya MLX (or any DecisionModel)
 * answers these in parallel; `planDecision` turns the probabilities into a
 * branch the Router owns. The generative models still write the spoken reply.
 */

export const DECISION_INTENTS = ["house", "timer", "search", "chat", "unclear"] as const;
export type DecisionIntent = (typeof DECISION_INTENTS)[number];

export interface DecisionInput {
  transcript: string;
  room?: string;
  /** Short names of available tools, so the model can tell house from chat. */
  tools: string[];
}

export interface DecisionVerdict {
  needsCloud: number;
  needsWeb: number;
  intent: DecisionIntent;
  intentConfidence: number;
  roomAmbiguous: number;
  /** Versioned model id that answered, for logs and threshold pinning. */
  model: string;
}

export type DecisionMode = "shadow" | "triage";

export interface DecisionPlan {
  /**
   * What the Router should do next. `shadow` always yields `local` so the
   * existing ask_the_clever_one path stays in charge while we compare.
   */
  path: "local" | "cloud";
  /** When path is local, whether to offer ask_the_clever_one. */
  offerEscalate: boolean;
  /** Logged next to the local model's later escalate decision in shadow mode. */
  shadow: boolean;
  verdict: DecisionVerdict;
}

export interface PlanDecisionOptions {
  mode: DecisionMode;
  /** Noul above this, with a cloud model present, skips local and escalates. */
  escalateThreshold: number;
  /**
   * Intent Choice confidence above this, with intent house|timer and a low
   * needsCloud, drops the escalate tool so the local model stays on-box.
   */
  localConfidence: number;
  hasCloud: boolean;
}

/** The fixed question set every DecisionModel sees for Parlour triage. */
export function decisionQuestions(state: DecisionInput): Record<string, DecisionQuestion> {
  const roomLine = state.room
    ? `The listener is in the ${state.room}.`
    : "No room was supplied with this request.";
  return {
    needs_cloud: {
      type: "noul",
      instructions: {
        question:
          "Does `transcript` need a larger reasoning model or knowledge beyond controlling this house?",
        transcript: state.transcript,
        guidance: roomLine,
      },
      criteria: {
        true: "Open questions, current events, multi-step reasoning, or knowledge the house tools cannot answer",
        false: "A house control, timer, short local fact, or chitchat the local model can handle",
      },
    },
    needs_web: {
      type: "noul",
      instructions: {
        question: "Does answering `transcript` require looking something up on the web right now?",
        transcript: state.transcript,
      },
      criteria: {
        true: "Weather, news, sports scores, prices, or other changing facts",
        false: "House control, timers, or knowledge that does not need a live lookup",
      },
    },
    intent: {
      type: "choice",
      instructions: {
        question: "What is the primary intent of `transcript`?",
        transcript: state.transcript,
        available_tools: state.tools,
      },
      criteria: {
        house: "Control lights, climate, locks, scenes, or other home devices",
        timer: "Set, cancel, or ask about a timer or reminder",
        search: "Look something up or ask about the world outside the house",
        chat: "Greeting, thanks, or conversation that needs no tool",
        unclear: "Ambiguous or not enough to choose confidently",
      },
    },
    room_ambiguous: {
      type: "noul",
      instructions: {
        question:
          "Is `transcript` a house request that needs a room named, given the listener room in `guidance`?",
        transcript: state.transcript,
        guidance: roomLine,
      },
      criteria: {
        true: "A device action with no room and several rooms possible",
        false: "Room is clear, not a house request, or the room is already implied",
      },
    },
  };
}

export async function runDecision(model: DecisionModel, state: DecisionInput): Promise<DecisionVerdict> {
  const result = await model.evaluate(
    {
      transcript: state.transcript,
      ...(state.room ? { room: state.room } : {}),
      tools: state.tools,
    },
    decisionQuestions(state),
  );
  const needsCloud = noulOf(result.answers.needs_cloud);
  const needsWeb = noulOf(result.answers.needs_web);
  const roomAmbiguous = noulOf(result.answers.room_ambiguous);
  const intentAnswer = result.answers.intent;
  if (intentAnswer?.type !== "choice") {
    throw new Error("triage response missing intent choice");
  }
  const intent = parseIntent(intentAnswer.choice);
  return {
    needsCloud,
    needsWeb,
    intent,
    intentConfidence: intentAnswer.confidence,
    roomAmbiguous,
    model: result.model,
  };
}

export function planDecision(verdict: DecisionVerdict, options: PlanDecisionOptions): DecisionPlan {
  const shadow = options.mode === "shadow";
  if (shadow || !options.hasCloud) {
    return {
      path: "local",
      offerEscalate: options.hasCloud,
      shadow,
      verdict,
    };
  }

  const escalateScore = Math.max(verdict.needsCloud, verdict.needsWeb);
  if (escalateScore >= options.escalateThreshold) {
    return { path: "cloud", offerEscalate: false, shadow: false, verdict };
  }

  const keepLocal =
    (verdict.intent === "house" || verdict.intent === "timer") &&
    verdict.intentConfidence >= options.localConfidence &&
    escalateScore < options.escalateThreshold;

  return {
    path: "local",
    offerEscalate: !keepLocal,
    shadow: false,
    verdict,
  };
}

function noulOf(answer: { type: string; noul?: number } | undefined): number {
  if (answer?.type !== "noul" || typeof answer.noul !== "number") {
    throw new Error("triage response missing a noul answer");
  }
  return answer.noul;
}

function parseIntent(choice: string): DecisionIntent {
  if ((DECISION_INTENTS as readonly string[]).includes(choice)) return choice as DecisionIntent;
  return "unclear";
}
