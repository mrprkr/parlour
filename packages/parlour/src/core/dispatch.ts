import { type DecisionMode, type DecisionPlan, planDecision, runDecision } from "./decision.ts";
import { logger } from "./logger.ts";
import { runTurn } from "./loop.ts";
import type { ChatModel, DecisionModel } from "./ports.ts";
import { escalateSpec } from "./prompt.ts";
import type { ToolRegistry } from "./registry.ts";
import type { Task } from "./tasks.ts";
import type { Message } from "./types.ts";

const log = logger("dispatch");

/**
 * The action agent: one triaged task, the tools it needs, and an answer.
 *
 * Which model answers is decided here rather than by the model itself where
 * triage was sure. A question triage marked as needing the clever one goes
 * straight to the cloud, saving the local round trip that would only have
 * ended in `ask_the_clever_one`; everything else starts local, with the house
 * tools and the option to hand over. Small talk gets no tools at all, which
 * is both faster and the only reliable way to stop a small model calling one.
 *
 * With a decision model configured, each remaining task is also scored before
 * the local model sees it: in triage mode a high needs_cloud sends it out, and
 * a clear house or timer intent keeps it in without offering the handover. In
 * shadow mode the scores are only logged next to what the local model did.
 */
export interface ActionAgent {
  local: ChatModel;
  /** Null runs local only: no escalation tool is offered and failures are final. */
  cloud: ChatModel | null;
  registry: ToolRegistry;
  maxToolRounds: number;
  /** Hand over to the cloud model when the local one throws, rather than apologise. */
  onLocalFailure: boolean;
  /** Optional escalate-vs-local judgment before the local model's turn. */
  decision?: DecisionSettings | null;
  /** The room the request came from, for the decision model. */
  room?: string;
}

export interface DecisionSettings {
  model: DecisionModel;
  mode: DecisionMode;
  escalateThreshold: number;
  localConfidence: number;
}

export interface Dispatched {
  text: string;
  via: "local" | "cloud";
  /** Set when nothing was done and the text is an apology, so the rest is abandoned. */
  failed?: boolean;
}

export const LOCAL_DOWN = "My local model is not answering. Try again in a moment.";
export const CLOUD_DOWN = "I could not reach the cloud model, and I did not want to guess.";

export async function dispatch(
  task: Task,
  messages: Message[],
  agent: ActionAgent,
  deadline?: number,
): Promise<Dispatched> {
  const { local, cloud, registry, maxToolRounds } = agent;

  // Triage was sure, so skip the local model's turn at being sure too. The
  // cloud gets no house tools: the house stays local, and the cloud brings
  // its own web search.
  if (task.clever && cloud) return await cloudTurn(cloud, messages, agent, deadline);

  const tools = task.kind === "chat" ? [] : registry.specs();
  const plan = task.kind === "chat" ? null : await decide(task.text, agent, tools);
  if (plan?.path === "cloud" && cloud) return await cloudTurn(cloud, messages, agent, deadline);

  const escalation = cloud !== null && task.kind !== "chat" && (plan ? plan.offerEscalate : true);
  const offered = escalation ? [...tools, escalateSpec] : tools;

  let result: Awaited<ReturnType<typeof runTurn>>;
  try {
    result = await runTurn({
      model: local,
      messages,
      tools: offered,
      registry,
      maxRounds: maxToolRounds,
      allowEscalation: escalation,
      deadline,
    });
  } catch (error) {
    log.warn(`${local.label} failed:`, error instanceof Error ? error.message : error);
    if (!cloud || !agent.onLocalFailure) return { text: LOCAL_DOWN, via: "local", failed: true };
    return await cloudTurn(cloud, messages, agent, deadline);
  }

  if (plan?.shadow) {
    const verdict = plan.verdict;
    log.info(
      `shadow decision: needs_cloud=${verdict.needsCloud.toFixed(2)} needs_web=${verdict.needsWeb.toFixed(2)}` +
        ` intent=${verdict.intent} conf=${verdict.intentConfidence.toFixed(2)} via ${verdict.model};` +
        ` local ${result.escalateTo ? "escalated" : "answered"}`,
    );
  }

  if (result.escalateTo && cloud) {
    // The cloud model is asked the question as the local one rewrote it, in
    // place of what was said, and never sees its decision to give up.
    const handover = [...messages.slice(0, -1), { role: "user" as const, content: result.escalateTo }];
    return await cloudTurn(cloud, handover, agent, deadline);
  }

  return { text: result.text, via: "local" };
}

/** The decision model's plan for one task, or null to carry on as if there were none. */
async function decide(
  text: string,
  agent: ActionAgent,
  tools: { name: string }[],
): Promise<DecisionPlan | null> {
  const decision = agent.decision;
  if (!decision) return null;
  try {
    const verdict = await runDecision(decision.model, {
      transcript: text,
      room: agent.room,
      tools: tools.map((tool) => tool.name),
    });
    const plan = planDecision(verdict, {
      mode: decision.mode,
      escalateThreshold: decision.escalateThreshold,
      localConfidence: decision.localConfidence,
      hasCloud: agent.cloud !== null,
    });
    if (!plan.shadow) {
      log.info(
        `decision ${plan.path}: needs_cloud=${verdict.needsCloud.toFixed(2)}` +
          ` intent=${verdict.intent} conf=${verdict.intentConfidence.toFixed(2)} via ${verdict.model}`,
      );
    }
    return plan;
  } catch (error) {
    // An optimisation, like triage: a decision model that is down leaves the
    // local model and ask_the_clever_one to decide, as they did before.
    log.warn("decision failed, continuing locally:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function cloudTurn(
  cloud: ChatModel,
  messages: Message[],
  agent: ActionAgent,
  deadline?: number,
): Promise<Dispatched> {
  try {
    const result = await runTurn({
      model: cloud,
      messages,
      tools: [],
      registry: agent.registry,
      maxRounds: agent.maxToolRounds,
      allowEscalation: false,
      deadline,
    });
    return { text: result.text, via: "cloud" };
  } catch (error) {
    log.error(`${cloud.label} failed:`, error instanceof Error ? error.message : error);
    return { text: CLOUD_DOWN, via: "cloud", failed: true };
  }
}
